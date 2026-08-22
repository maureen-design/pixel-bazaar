import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const jsonHeaders = { 'Content-Type': 'application/json' };

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

// Sandbox Daraja base URL (the environment this project runs against).
const DARAJA_BASE_URL = 'https://sandbox.safaricom.co.ke';

// fetch wrapper with a hard timeout. The reconcile sweep must never block on a
// stalled Daraja request; a timeout leaves the order pending for the next run.
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Same terminal-code policy as mpesa-callback: permanent payment failure only
// for known terminal codes; anything else is left pending.
const TERMINAL_FAILURE_CODES = new Set(['1', '1032', '1037', '1019', '2001']);

// Conservative stale threshold: Daraja callbacks normally arrive within a few
// minutes of the STK prompt resolving; the frontend polls for 150s. 10 minutes
// is ~3.3x the frontend window plus margin for delayed callbacks / retries, and
// keeps production stock reserved far longer than the callback guarantees.
// Override with MPESA_RECONCILE_AFTER_MINUTES (must be > 0).
function staleAfterMinutes(): number {
  const raw = Deno.env.get('MPESA_RECONCILE_AFTER_MINUTES');
  const n = raw ? Number(raw) : 10;
  return Number.isFinite(n) && n > 0 ? n : 10;
}

async function getOAuthToken(): Promise<string> {
  const key = Deno.env.get('MPESA_CONSUMER_KEY')!;
  const secret = Deno.env.get('MPESA_CONSUMER_SECRET')!;
  const credentials = `${key}:${secret}`;
  const auth = btoa(String.fromCharCode(...new TextEncoder().encode(credentials)));

  const res = await fetchWithTimeout(
    `${DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { method: 'GET', headers: { Authorization: `Basic ${auth}` } },
    20000
  );

  if (!res.ok) throw new Error(`Daraja OAuth failed (HTTP ${res.status})`);
  const data = await res.json();
  if (!data?.access_token) throw new Error('Daraja OAuth returned no access token');
  return data.access_token as string;
}

function generateTimestamp(): string {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
}

function generatePassword(timestamp: string): string {
  const shortcode = Deno.env.get('MPESA_SHORTCODE')!;
  const passkey = Deno.env.get('MPESA_PASSKEY')!;
  return btoa(`${shortcode}${passkey}${timestamp}`);
}

interface DarajaStkQueryItem {
  Name?: string;
  Value?: unknown;
}

interface DarajaStkQueryData {
  ResponseCode?: unknown;
  ResponseDescription?: unknown;
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResultCode?: unknown;
  ResultDesc?: string;
  CallbackMetadata?: { Item?: DarajaStkQueryItem[] };
}

interface DarajaQueryResult {
  httpStatus: number;
  data: DarajaStkQueryData;
}

// Server-to-server STK Push Query (identical to mpesa-callback).
async function stkPushQuery(checkoutRequestId: string): Promise<DarajaQueryResult> {
  const token = await getOAuthToken();
  const timestamp = generateTimestamp();
  const shortcode = Deno.env.get('MPESA_SHORTCODE')!;

  const body = {
    BusinessShortCode: shortcode,
    Password: generatePassword(timestamp),
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  const res = await fetchWithTimeout(
    `${DARAJA_BASE_URL}/mpesa/stkpushquery/v1/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    20000
  );

  const data = await res.json();
  return { httpStatus: res.status, data };
}

function resultCodeStr(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

// Best-effort order confirmation email (same contract as mpesa-callback).
// Never throws; email_sent is managed inside send-order-email. A 12s cap avoids
// blocking the sweep; a timeout leaves email_sent=false so the next run retries.
async function sendConfirmationEmail(orderId: string): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const ref = supabaseUrl.replace('https://', '').split('.')[0];
  const url =
    Deno.env.get('SEND_ORDER_EMAIL_URL') ||
    `https://${ref}.functions.supabase.co/send-order-email`;
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Authenticate the internal call explicitly (see mpesa-callback).
        'Authorization': `Bearer ${serviceRole}`,
      },
      body: JSON.stringify({ order_id: orderId }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`send-order-email failed (HTTP ${res.status}):`, text);
    } else {
      console.log(`send-order-email success for order ${orderId}`);
    }
  } catch (error: any) {
    console.error(`send-order-email invocation failed for order ${orderId}:`, error?.message || error);
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: jsonHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const windowMinutes = staleAfterMinutes();
    const cutoff = new Date(Date.now() - windowMinutes * 60_000).toISOString();

    // 1. Stale M-Pesa orders awaiting payment.
    const { data: stale, error: staleError } = await supabase
      .from('orders')
      .select('id, mpesa_checkout_id, total_amount')
      .eq('payment_method', 'mpesa')
      .eq('payment_status', 'pending')
      .eq('status', 'pending')
      .not('mpesa_checkout_id', 'is', null)
      .lt('created_at', cutoff);

    if (staleError) throw staleError;

    let reconciled = 0;
    let paidCount = 0;
    let failedCount = 0;
    let pendingCount = 0;

    for (const order of stale ?? []) {
      let query: DarajaQueryResult;
      try {
        query = await stkPushQuery(order.mpesa_checkout_id);
      } catch (error: any) {
        console.error(`Reconcile query failed for order ${order.id}:`, error?.message || error);
        pendingCount++;
        continue;
      }

      if (query.httpStatus !== 200) {
        console.error(`Reconcile query non-200 for order ${order.id}: HTTP ${query.httpStatus}`);
        pendingCount++;
        continue;
      }

      const q = query.data;
      const qResultCode = resultCodeStr(q?.ResultCode);
      if (qResultCode === '') {
        console.error(`Reconcile unexpected query format for order ${order.id}`);
        pendingCount++;
        continue;
      }

      if (qResultCode !== '0') {
        // Terminal failure: guarded transition + stock release exactly once.
        if (TERMINAL_FAILURE_CODES.has(qResultCode)) {
          const { data: updated, error: updateError } = await supabase
            .from('orders')
            .update({
              payment_status: 'failed',
              status: 'cancelled',
              payment_error: q?.ResultDesc || `Daraja result code ${qResultCode}`,
            })
            .eq('id', order.id)
            .eq('payment_status', 'pending')
            .eq('status', 'pending')
            .select('id');

          if (updateError) throw updateError;

          if (updated && updated.length > 0) {
            const { error: releaseError } = await supabase.rpc('release_stock_for_order', {
              p_order_id: order.id,
            });
            if (releaseError) {
              console.error(`Failed to release stock for order ${order.id}:`, releaseError.message);
            } else {
              console.log(`Order ${order.id} reconciled as failed (${qResultCode}); stock released`);
            }
            failedCount++;
          } else {
            console.log(`Reconcile terminal result ignored for order ${order.id} (not pending)`);
          }
        } else {
          console.warn(`Reconcile pending/unknown for order ${order.id}: ResultCode=${qResultCode} (${q?.ResultDesc})`);
          pendingCount++;
        }
        continue;
      }

      // Success: verify checkout id and exact amount, then guarded transition.
      const queriedId = q?.CheckoutRequestID;
      if (typeof queriedId !== 'string' || queriedId !== order.mpesa_checkout_id) {
        console.warn(`Reconcile CheckoutRequestID mismatch for order ${order.id}`);
        pendingCount++;
        continue;
      }

      const metadataItems = q?.CallbackMetadata?.Item || [];
      const amountItem = metadataItems.find((item) => item?.Name === 'Amount');
      const paidAmount = Number(amountItem?.Value);
      const expectedAmount = Math.round(Number(order.total_amount));
      if (!Number.isFinite(paidAmount) || Math.round(paidAmount) !== expectedAmount) {
        console.warn(
          `Reconcile amount mismatch for order ${order.id}: paid=${paidAmount} expected=${expectedAmount}`
        );
        pendingCount++;
        continue;
      }

      const receiptItem = metadataItems.find((item) => item?.Name === 'MpesaReceiptNumber');

      const { data: updated, error: updateError } = await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          status: 'processing',
          mpesa_transaction_id: receiptItem?.Value ?? null,
          paid_at: new Date().toISOString(),
        })
        .eq('id', order.id)
        .eq('payment_status', 'pending')
        .eq('status', 'pending')
        .select('id');

      if (updateError) throw updateError;

      if (updated && updated.length > 0) {
        console.log(`Order ${order.id} reconciled as paid (KES ${paidAmount})`);
        await sendConfirmationEmail(order.id);
        paidCount++;
      } else {
        console.log(`Order ${order.id} was already paid; no action`);
      }
      reconciled++;
    }

    // 2. Retry confirmation emails for paid M-Pesa orders that never received
    //    one (email sending is retryable independently of payment state). The
    //    send-order-email function flips email_sent after a successful send, so
    //    this sweep is naturally idempotent. Only orders paid within the last
    //    24 hours qualify: older orders predate email_sent (or were already
    //    emailed under the old creation-time flow) and must not be retro-emailed.
    const emailCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: awaitingEmail, error: emailError } = await supabase
      .from('orders')
      .select('id')
      .eq('payment_method', 'mpesa')
      .eq('payment_status', 'paid')
      .eq('email_sent', false)
      .gte('paid_at', emailCutoff);

    if (emailError) throw emailError;

    let emailRetried = 0;
    for (const order of awaitingEmail ?? []) {
      await sendConfirmationEmail(order.id);
      emailRetried++;
    }

    return jsonResponse(200, {
      success: true,
      windowMinutes,
      staleFound: stale?.length ?? 0,
      reconciled,
      paidCount,
      failedCount,
      pendingCount,
      emailRetried,
    });
  } catch (error: any) {
    console.error('Reconcile error:', error?.message || error);
    return jsonResponse(500, { success: false, error: error.message });
  }
});
