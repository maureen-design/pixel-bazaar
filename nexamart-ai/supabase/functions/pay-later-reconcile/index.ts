import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// pay-later-reconcile — Scheduled sweep for Pay Later orders (Priority #18C-1)
//
// Three independent, idempotent tasks:
//   A. Send reminders for orders approaching deadline (within 6 hours).
//   B. Expire overdue orders: pending → failed/cancelled + release stock once.
//   C. Retry confirmation emails for Pay Later orders that became paid.
//
// Uses the service-role key. Intended to be invoked on a schedule (cron or
// manual). Each task is independent — a failure in one does not block the others.
// ---------------------------------------------------------------------------

const jsonHeaders = { 'Content-Type': 'application/json' };
const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

// How close to the deadline before we send a reminder (default 6 hours).
function reminderWindowHours(): number {
  const raw = Deno.env.get('PAY_LATER_REMINDER_HOURS');
  const n = raw ? Number(raw) : 6;
  return Number.isFinite(n) && n > 0 ? n : 6;
}

// How far back to look for paid orders needing a retry email (default 24 hours).
function emailRetryWindowHours(): number {
  const raw = Deno.env.get('PAY_LATER_EMAIL_RETRY_HOURS');
  const n = raw ? Number(raw) : 24;
  return Number.isFinite(n) && n > 0 ? n : 24;
}

// fetch wrapper with timeout — must never block the sweep on a stalled call.
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Best-effort invoke: never throws.
async function invokeFunction(
  supabaseUrl: string,
  serviceRole: string,
  functionName: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number }> {
  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRole}`,
          'apikey': serviceRole,
        },
        body: JSON.stringify(body),
      },
      15000,
    );
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: jsonHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const supabase = createClient(supabaseUrl, serviceRole);

    const reminderWindow = reminderWindowHours();
    const emailRetryWindow = emailRetryWindowHours();

    // =====================================================================
    // A. REMINDERS — orders approaching deadline, not yet reminded.
    // =====================================================================
    const reminderCutoff = new Date(Date.now() + reminderWindow * 60 * 60 * 1000).toISOString();

    const { data: reminderOrders, error: reminderError } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, payment_deadline, user_id')
      .eq('payment_type', 'later')
      .eq('payment_status', 'pending')
      .eq('status', 'pending')
      .eq('reminder_sent', false)
      .gt('payment_deadline', new Date().toISOString())
      .lt('payment_deadline', reminderCutoff);

    if (reminderError) throw reminderError;

    let reminderSent = 0;
    let reminderFailed = 0;

    for (const order of reminderOrders ?? []) {
      // Fetch customer profile.
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', order.user_id)
        .maybeSingle();

      if (!profile?.email) {
        console.warn(`Reminder skipped for order ${order.id}: no customer email`);
        continue;
      }

      const result = await invokeFunction(supabaseUrl, serviceRole, 'send-payment-reminder', {
        order: {
          id: order.id,
          order_number: order.order_number,
          total_amount: order.total_amount,
          payment_deadline: order.payment_deadline,
        },
        customer: {
          email: profile.email,
          full_name: profile.full_name || 'Customer',
        },
      });

      if (result.ok) {
        await supabase
          .from('orders')
          .update({ reminder_sent: true })
          .eq('id', order.id)
          .eq('reminder_sent', false);
        reminderSent++;
        console.log(`Reminder sent for order ${order.order_number}`);
      } else {
        reminderFailed++;
        console.error(`Reminder failed for order ${order.order_number} (HTTP ${result.status})`);
      }
    }

    // =====================================================================
    // B. EXPIRY — overdue Pay Later orders that are still pending.
    // =====================================================================
    const { data: expiredOrders, error: expiredError } = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('payment_type', 'later')
      .eq('payment_status', 'pending')
      .eq('status', 'pending')
      .lte('payment_deadline', new Date().toISOString());

    if (expiredError) throw expiredError;

    let expired = 0;
    let releaseSuccess = 0;
    let releaseFailed = 0;

    for (const order of expiredOrders ?? []) {
      // Guarded transition: only succeeds if still pending/pending.
      const { data: updated, error: updateError } = await supabase
        .from('orders')
        .update({
          payment_status: 'failed',
          status: 'cancelled',
          payment_error: 'Pay Later deadline expired',
        })
        .eq('id', order.id)
        .eq('payment_status', 'pending')
        .eq('status', 'pending')
        .select('id');

      if (updateError) {
        console.error(`Expiry update failed for order ${order.order_number}:`, updateError.message);
        continue;
      }

      if (updated && updated.length > 0) {
        expired++;
        // Release stock (idempotent via stock_released guard in the RPC).
        const { error: releaseError } = await supabase.rpc('release_stock_for_order', {
          p_order_id: order.id,
        });
        if (releaseError) {
          releaseFailed++;
          console.error(`Stock release failed for order ${order.order_number}:`, releaseError.message);
        } else {
          releaseSuccess++;
          console.log(`Order ${order.order_number} expired; stock released`);
        }
      } else {
        console.log(`Order ${order.order_number} already transitioned; skipping`);
      }
    }

    // =====================================================================
    // C. PAID EMAIL RETRY — Pay Later orders that are now paid but not emailed.
    // =====================================================================
    const emailCutoff = new Date(Date.now() - emailRetryWindow * 60 * 60 * 1000).toISOString();

    const { data: paidOrders, error: paidError } = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('payment_type', 'later')
      .eq('payment_status', 'paid')
      .eq('email_sent', false)
      .gte('paid_at', emailCutoff);

    if (paidError) throw paidError;

    let emailRetried = 0;

    for (const order of paidOrders ?? []) {
      const result = await invokeFunction(supabaseUrl, serviceRole, 'send-order-email', {
        order_id: order.id,
      });
      if (result.ok) {
        emailRetried++;
        console.log(`Paid email retry succeeded for order ${order.order_number}`);
      } else {
        console.error(`Paid email retry failed for order ${order.order_number} (HTTP ${result.status})`);
      }
    }

    return jsonResponse(200, {
      success: true,
      reminderWindow,
      remindersSent: reminderSent,
      remindersFailed: reminderFailed,
      expired,
      stockReleased: releaseSuccess,
      stockReleaseFailed: releaseFailed,
      emailRetried,
    });
  } catch (error: any) {
    console.error('Pay-later reconcile error:', error?.message || error);
    return jsonResponse(500, { success: false, error: error.message });
  }
});
