import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// bank-transfer-reconcile — Scheduled sweep for expired Bank Transfer orders
//
// Finds Bank Transfer orders where:
//   payment_method = bank, payment_status = pending, status = pending,
//   payment_deadline <= now()
//
// Transitions them to failed/cancelled and releases stock.
// Sends a cancellation email to the customer.
//
// Idempotent: safe to run on a schedule (every 15 minutes recommended).
// Does NOT touch M-Pesa, Card, or Pay Later orders.
// ---------------------------------------------------------------------------

const jsonHeaders = { 'Content-Type': 'application/json' };
const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

async function invokeFunction(
  supabaseUrl: string,
  serviceRole: string,
  functionName: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number }> {
  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRole}`,
        'apikey': serviceRole,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: jsonHeaders });
  }

  // Accept service_role Bearer token (from pg_cron) OR x-cron-secret header
  const authHeader = req.headers.get('Authorization') || '';
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const providedSecret = req.headers.get('x-cron-secret') || '';
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const isServiceRole = authHeader === `Bearer ${serviceRole}`;
  const isCron = cronSecret && providedSecret === cronSecret;
  if (!isServiceRole && !isCron) {
    return jsonResponse(403, { success: false, error: 'Unauthorized' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, serviceRole);

    // Find expired Bank Transfer orders
    const { data: expiredOrders, error: queryError } = await supabase
      .from('orders')
      .select('id, order_number, user_id, vendor_id, total_amount, shipping_address, payment_method, delivery_method')
      .eq('payment_method', 'bank')
      .eq('payment_status', 'pending')
      .eq('status', 'pending')
      .lte('payment_deadline', new Date().toISOString());

    if (queryError) throw queryError;

    let expired = 0;
    let releaseSuccess = 0;
    let releaseFailed = 0;
    let emailSent = 0;
    let emailFailed = 0;

    for (const order of expiredOrders ?? []) {
      // Guarded transition: only succeeds if still pending/pending
      const { data: updated, error: updateError } = await supabase
        .from('orders')
        .update({
          payment_status: 'failed',
          status: 'cancelled',
          payment_error: 'Bank transfer deadline expired',
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

        // Release stock (idempotent)
        const { error: releaseError } = await supabase.rpc('release_stock_for_order', {
          p_order_id: order.id,
        });
        if (releaseError) {
          releaseFailed++;
          console.error(`Stock release failed for ${order.order_number}:`, releaseError.message);
        } else {
          releaseSuccess++;
          console.log(`Order ${order.order_number} expired; stock released`);
        }

        // Send cancellation email to customer
        if (order.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', order.user_id)
            .maybeSingle();

          if (profile?.email) {
            const emailResult = await invokeFunction(supabaseUrl, serviceRole, 'send-order-email', {
              order_id: order.id,
              cancellation: true,
              cancellation_reason: 'Bank transfer payment was not received before the deadline.',
            });
            if (emailResult.ok) {
              emailSent++;
            } else {
              emailFailed++;
              console.error(`Cancellation email failed for ${order.order_number}`);
            }
          }
        }
      } else {
        console.log(`Order ${order.order_number} already transitioned; skipping`);
      }
    }

    return jsonResponse(200, {
      success: true,
      expired,
      stockReleased: releaseSuccess,
      stockReleaseFailed: releaseFailed,
      emailsSent: emailSent,
      emailsFailed: emailFailed,
    });
  } catch (error: any) {
    console.error('Bank transfer reconcile error:', error?.message || error);
    return jsonResponse(500, { success: false, error: error.message });
  }
});
