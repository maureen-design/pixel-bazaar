import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const jsonHeaders = { 'Content-Type': 'application/json' };

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

// Sandbox Daraja base URL (the environment this project runs against).
const DARAJA_BASE_URL = 'https://sandbox.safaricom.co.ke';

// fetch wrapper with a hard timeout. Every outbound call in the callback chain
// must be bounded: a stalled Daraja request must not leave the webhook (or the
// browser's STK push call) hanging indefinitely.
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

async function getOAuthToken(): Promise<string> {
  const key = Deno.env.get('MPESA_CONSUMER_KEY')!;
  const secret = Deno.env.get('MPESA_CONSUMER_SECRET')!;
  const credentials = `${key}:${secret}`;
  const auth = btoa(String.fromCharCode(...new TextEncoder().encode(credentials)));

  const res = await fetchWithTimeout(
    `${DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { method: 'GET', headers: { Authorization: `Basic ${auth}` } },
    10000
  );

  if (!res.ok) {
    throw new Error(`Daraja OAuth failed (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (!data?.access_token) {
    throw new Error('Daraja OAuth returned no access token');
  }
  return data.access_token as string;
}

// Current timestamp in the Daraja format YYYYMMDDHHMMSS (matches the STK push).
function generateTimestamp(): string {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
}

// Password = base64(shortcode + passkey + timestamp). The timestamp passed here
// MUST be the same value sent in the request body.
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

// Server-to-server STK Push Query. The response is the authoritative payment
// verdict: ResponseCode only confirms the query was accepted; the transaction
// result is ResultCode.
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
    10000
  );

  const data = await res.json();
  return { httpStatus: res.status, data };
}

interface CallbackPayload {
  Body?: { stkCallback?: { CheckoutRequestID?: unknown } };
}

// Known terminal Daraja result codes -> permanent payment failure. Everything
// else except '0' (success) is treated as pending/unknown and never fails the
// order (Safaricom does not publish an exhaustive code list).
const TERMINAL_FAILURE_CODES = new Set(['1', '1032', '1037', '1019', '2001']);

function resultCodeStr(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

// Best-effort order confirmation email. Must never throw: the payment state has
// already been committed to paid, so an email failure must not alter it. The
// function's own email_sent flag + the guarded pending->paid transition ensure
// a duplicate callback can never produce a duplicate confirmation email. A 12s
// cap keeps the webhook response comfortably inside Safaricom's timeout; a
// timeout leaves email_sent=false so mpesa-reconcile retries independently.
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
        // send-order-email is deployed with verify_jwt=false, but authenticating
        // the internal call explicitly keeps it working even under a
        // JWT-enforcing deployment.
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
  try {
    // 1. Validate the callback payload shape. The callback is a trigger and a
    //    lookup key only; the payment authority is the Daraja STK Push Query
    //    performed below. No callback secret/header is required from Safaricom.
    if (req.method !== 'POST') {
      return jsonResponse(405, { ResultCode: 1, ResultDesc: 'Method not allowed' });
    }

    let callbackData: CallbackPayload;
    try {
      callbackData = await req.json();
    } catch {
      return jsonResponse(400, { ResultCode: 1, ResultDesc: 'Invalid payload' });
    }
    const { Body } = callbackData || {};
    const { stkCallback } = Body || {};
    if (!stkCallback) {
      return jsonResponse(400, { ResultCode: 1, ResultDesc: 'Invalid payload' });
    }
    const { CheckoutRequestID } = stkCallback;
    if (typeof CheckoutRequestID !== 'string' || !CheckoutRequestID.trim()) {
      return jsonResponse(400, { ResultCode: 1, ResultDesc: 'Invalid payload' });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 2. Locate the order by the stored checkout id. Each STK push overwrites
    //    orders.mpesa_checkout_id, so the callback resolves to the latest push.
    const { data: order, error: findError } = await supabase
      .from('orders')
      .select('id, user_id, total_amount, payment_status, status, mpesa_checkout_id')
      .eq('mpesa_checkout_id', CheckoutRequestID)
      .maybeSingle();

    if (findError || !order) {
      console.warn('Callback: order not found for CheckoutRequestID', CheckoutRequestID);
      return jsonResponse(200, { ResultCode: 1, ResultDesc: 'Order not found' });
    }

    // 3. Only an order that is still awaiting payment may progress. Settled and
    //    non-pending states are acknowledged without any mutation.
    if (order.payment_status === 'paid' || order.payment_status === 'refunded') {
      console.log(`Callback replay ignored for ${order.payment_status} order ${order.id}`);
      return jsonResponse(200, { ResultCode: 0, ResultDesc: 'Success' });
    }
    if (order.payment_status !== 'pending' || order.status !== 'pending') {
      console.warn(
        `Callback for non-pending order ${order.id} (payment_status=${order.payment_status}, status=${order.status}); no transition`
      );
      return jsonResponse(200, { ResultCode: 1, ResultDesc: 'Order not awaiting payment' });
    }

    // 4. Ask Daraja for the authoritative transaction result (server-to-server,
    //    authenticated with the existing consumer credentials).
    let query: DarajaQueryResult;
    try {
      query = await stkPushQuery(order.mpesa_checkout_id);
    } catch (error: any) {
      console.error(`Daraja query failed for order ${order.id}:`, error?.message || error);
      return jsonResponse(502, { ResultCode: 1, ResultDesc: 'Verification unavailable' });
    }

    if (query.httpStatus !== 200) {
      console.error(`Daraja query non-200 for order ${order.id}: HTTP ${query.httpStatus}`);
      return jsonResponse(502, { ResultCode: 1, ResultDesc: 'Verification unavailable' });
    }

    const q: DarajaStkQueryData = query.data;
    const qResultCode = resultCodeStr(q?.ResultCode);
    if (qResultCode === '') {
      console.error(`Daraja query unexpected response format for order ${order.id}`);
      return jsonResponse(502, { ResultCode: 1, ResultDesc: 'Verification unavailable' });
    }

    // 5. Interpret the verdict. ResponseCode only confirms the query was
    //    accepted; the transaction result is ResultCode.
    if (qResultCode !== '0') {
      if (TERMINAL_FAILURE_CODES.has(qResultCode)) {
        // Terminal failure: follow the existing failure lifecycle, releasing
        // stock exactly once through the existing idempotent RPC.
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
          const { data: released, error: releaseError } = await supabase.rpc('release_stock_for_order', {
            p_order_id: order.id,
          });
          if (releaseError) {
            console.error(`Failed to release stock for order ${order.id}:`, releaseError.message);
          } else {
            console.log(`Order ${order.id} payment failed, stock released=${released}: ${q?.ResultDesc}`);
          }
        } else {
          console.log(`Terminal failure ignored for order ${order.id} (not pending)`);
        }
        return jsonResponse(200, { ResultCode: 0, ResultDesc: 'Success' });
      }

      // Pending / unknown (e.g. 4999, 1001): do not mark paid or failed, do not
      // release stock. Keep the order pending and acknowledge safely.
      console.warn(
        `Daraja query pending/unknown for order ${order.id}: ResultCode=${qResultCode} (${q?.ResultDesc})`
      );
      return jsonResponse(200, { ResultCode: 1, ResultDesc: 'Payment still pending' });
    }

    // 6. Success (ResultCode = 0): verify the queried checkout id matches the
    //    order's stored one (a stale callback from an earlier re-push must not
    //    mark the order paid).
    const queriedId = q?.CheckoutRequestID;
    if (typeof queriedId !== 'string' || queriedId !== order.mpesa_checkout_id) {
      console.warn(
        `CheckoutRequestID mismatch for order ${order.id}: query=${queriedId} stored=${order.mpesa_checkout_id}`
      );
      return jsonResponse(200, { ResultCode: 1, ResultDesc: 'Verification mismatch' });
    }

    // 7. Verify the actual paid amount equals the order total exactly (same
    //    whole-shilling convention as the STK push).
    const metadataItems = q?.CallbackMetadata?.Item || [];
    const amountItem = metadataItems.find((item) => item?.Name === 'Amount');
    const paidAmount = Number(amountItem?.Value);
    const expectedAmount = Math.round(Number(order.total_amount));
    if (!Number.isFinite(paidAmount) || Math.round(paidAmount) !== expectedAmount) {
      console.warn(
        `Amount mismatch for order ${order.id}: paid=${paidAmount} expected=${expectedAmount}; not marking paid`
      );
      return jsonResponse(200, { ResultCode: 1, ResultDesc: 'Amount mismatch' });
    }

    const receiptItem = metadataItems.find((item) => item?.Name === 'MpesaReceiptNumber');

    // 8. Guarded, idempotent transition: pending -> paid only. Concurrent
    //    callbacks cannot perform this transition twice; only the invocation
    //    that actually performs it sends the confirmation email (exactly once).
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
      console.log(`Order ${order.id} payment confirmed via Daraja query (KES ${paidAmount})`);
      await sendConfirmationEmail(order.id);
    } else {
      console.log(`Order ${order.id} was already paid by another invocation; no email sent`);
    }
    return jsonResponse(200, { ResultCode: 0, ResultDesc: 'Success' });
  } catch (error: any) {
    console.error('Callback error:', error?.message || error);
    return jsonResponse(500, { ResultCode: 1, ResultDesc: 'Error' });
  }
});
