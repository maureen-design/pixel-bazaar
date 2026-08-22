import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Access-Control-Max-Age': '86400',
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Best-effort order confirmation email (same contract as mpesa-callback). Never
// throws: the payment state has already been committed, so an email failure must
// not alter it. A 12s cap keeps the response fast; a timeout is logged only.
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
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const { orderId, amount } = await req.json();

    if (!orderId || !amount) {
      return jsonResponse(400, { success: false, error: 'Missing required fields' });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Load the authoritative order record. The database total is the source of
    // truth for the amount charged — never trust the client-supplied amount.
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, user_id, total_amount, payment_status')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError || !order) {
      return jsonResponse(404, { success: false, error: 'Order not found' });
    }

    // Where the caller presents a valid session token, require the order to
    // belong to that user (same policy as mpesa-stk-push).
    const authHeader = req.headers.get('Authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: authUser, error: authError } = await userClient.auth.getUser();
      if (authError || !authUser?.user) {
        return jsonResponse(401, { success: false, error: 'Unauthorized' });
      }
      if (order.user_id !== authUser.user.id) {
        return jsonResponse(403, { success: false, error: 'Order does not belong to the current user' });
      }
    }

    // Only an order still awaiting payment may be charged. A retry against an
    // already-failed/cancelled order (whose stock was released) is rejected so
    // it can never be marked paid without stock.
    if (order.payment_status !== 'pending') {
      return jsonResponse(409, { success: false, error: 'Order is not awaiting payment' });
    }

    // Whole-shilling comparison: card charges bill integer KES.
    const expectedAmount = Math.round(Number(order.total_amount));
    if (Math.round(Number(amount)) !== expectedAmount) {
      return jsonResponse(400, { success: false, error: 'Amount does not match the order total' });
    }

    // Server-side toggle: reject new card payments when disabled. Missing
    // setting = enabled (safe default).
    const { data: cardSetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'card_enabled')
      .maybeSingle();

    const cardEnabled = cardSetting ? cardSetting.value !== false : true;

    if (!cardEnabled) {
      await supabase
        .from('orders')
        .update({
          payment_status: 'failed',
          status: 'cancelled',
          payment_error: 'Card payments are currently disabled',
        })
        .eq('id', orderId)
        .eq('payment_status', 'pending')
        .eq('status', 'pending');

      await supabase.rpc('release_stock_for_order', { p_order_id: orderId });

      return jsonResponse(400, { success: false, error: 'Card payments are currently disabled' });
    }

    // Simulated card payment processing.
    await new Promise(r => setTimeout(r, 1500));

    const success = Math.random() > 0.1;

    if (success) {
      // Guarded, idempotent transition: pending -> paid only. Only the
      // invocation that performs the transition sends the confirmation email.
      const { data: updated, error: updateError } = await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          status: 'processing',
          paid_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .eq('payment_status', 'pending')
        .eq('status', 'pending')
        .select('id');

      if (updateError) throw updateError;

      if (updated && updated.length > 0) {
        console.log(`Order ${orderId} card payment confirmed`);
        await sendConfirmationEmail(orderId);
      } else {
        console.log(`Order ${orderId} was already paid; no email sent`);
      }

      return jsonResponse(200, {
        success: true,
        message: 'Card payment successful',
        transactionId: `CARD-${Date.now()}`,
      });
    }

    // Decline: mark the order failed/cancelled, then release the reserved stock
    // exactly once. release_stock_for_order is idempotent (stock_released guard
    // + order-state guard inside the RPC), so retries can never double-release.
    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({
        payment_status: 'failed',
        status: 'cancelled',
        payment_error: 'Card payment declined. Please try another card.',
      })
      .eq('id', orderId)
      .eq('payment_status', 'pending')
      .eq('status', 'pending')
      .select('id');

    if (updateError) throw updateError;

    if (updated && updated.length > 0) {
      const { error: releaseError } = await supabase.rpc('release_stock_for_order', {
        p_order_id: orderId,
      });
      if (releaseError) {
        console.error(`Failed to release stock for order ${orderId}:`, releaseError.message);
      } else {
        console.log(`Order ${orderId} card declined, stock released`);
      }
    } else {
      console.log(`Decline ignored for order ${orderId} (not pending)`);
    }

    return jsonResponse(400, { success: false, error: 'Card payment declined. Please try another card.' });
  } catch (error: any) {
    console.error('Card payment error:', error?.message || error);
    return jsonResponse(500, { success: false, error: error.message });
  }
});
