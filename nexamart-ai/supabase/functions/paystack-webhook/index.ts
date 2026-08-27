import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Paystack webhook — server-to-server only (no CORS needed).
// Trust policy mirrors mpesa-callback: the signed payload is the authoritative
// source of truth; the frontend redirect is never trusted on its own.

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function computeSignature(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  return toHex(signature);
}

function signaturesMatch(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Best-effort order confirmation email (same contract as process-card-payment /
// mpesa-callback). Never throws: the payment state has already been committed,
// so an email failure must not alter it.
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
        'Authorization': `Bearer ${serviceRole}`,
      },
      body: JSON.stringify({ order_id: orderId }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`send-order-email failed (HTTP ${res.status}) for order ${orderId}`);
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
    const rawBody = await req.text();
    const signatureHeader = req.headers.get('x-paystack-signature') || '';
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY');

    if (!secretKey) {
      console.error('PAYSTACK_SECRET_KEY is not configured');
      return new Response(JSON.stringify({ received: false }), { status: 500 });
    }

    // HMAC SHA512 of the RAW request body, signed with the secret key.
    const computed = await computeSignature(rawBody, secretKey);
    if (!signaturesMatch(computed, signatureHeader.toLowerCase())) {
      console.error('Paystack webhook signature mismatch');
      return new Response(JSON.stringify({ received: false }), { status: 401 });
    }

    const event = JSON.parse(rawBody);

    if (event?.event !== 'charge.success') {
      // Acknowledge other event types quickly; nothing to do.
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const data = event.data || {};
    const reference: string = data.reference || '';
    const paidAmountSubunit: number = Number(data.amount);
    const currency: string = data.currency || '';

    if (!reference) {
      console.error('charge.success without reference');
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, total_amount, payment_status')
      .eq('payment_ref', reference)
      .maybeSingle();

    if (orderError || !order) {
      // Unknown/stale reference (e.g. an earlier initialize attempt that was
      // superseded). Acknowledge so Paystack stops retrying.
      console.error(`No order found for payment_ref ${reference}`);
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // Integrity check: the paid amount must match the DB total (subunits).
    if (currency !== 'KES' || Math.round(paidAmountSubunit) !== Math.round(Number(order.total_amount) * 100)) {
      console.error(
        `Amount/currency mismatch for order ${order.id}: got ${paidAmountSubunit} ${currency}, expected ${Math.round(Number(order.total_amount) * 100)} KES`
      );
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // Guarded, idempotent transition: pending -> paid only. Only the
    // invocation that performs the transition sends the confirmation email.
    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        status: 'processing',
        paid_at: new Date().toISOString(),
        payment_error: null,
      })
      .eq('id', order.id)
      .eq('payment_status', 'pending')
      .eq('status', 'pending')
      .select('id');

    if (updateError) {
      // DB error — return 500 so Paystack retries. The signature is valid,
      // so this is a transient infra issue, not a bad webhook.
      console.error(`DB update failed for order ${order.id}:`, updateError.message);
      return new Response(JSON.stringify({ received: false, error: 'DB update failed' }), { status: 500 });
    }

    if (updated && updated.length > 0) {
      console.log(`Order ${order.id} card payment confirmed via webhook (${reference})`);
      await sendConfirmationEmail(order.id);
    } else {
      console.log(`Order ${order.id} was already processed; no email sent`);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error: any) {
    console.error('Paystack webhook error:', error?.message || error);
    // Signature-verified processing errors return 500 so Paystack retries.
    // Pre-verification errors (bad JSON, missing secret) return 200 to avoid
    // infinite retries on misconfigured webhooks.
    return new Response(JSON.stringify({ received: false, error: error?.message || 'Processing error' }), { status: 500 });
  }
});
