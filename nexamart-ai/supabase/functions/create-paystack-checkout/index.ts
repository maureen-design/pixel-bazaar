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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const { orderId } = await req.json();

    if (!orderId) {
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

    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!secretKey) {
      console.error('PAYSTACK_SECRET_KEY is not configured');
      return jsonResponse(500, { success: false, error: 'Card payments are not configured' });
    }

    // Customer email: profiles first (same table the app reads elsewhere),
    // falling back to the authoritative auth record.
    let email: string | null = null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', order.user_id)
      .maybeSingle();
    email = profile?.email || null;

    if (!email) {
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(order.user_id);
        email = userData?.user?.email || null;
      } catch (_) {
        // fall through to the guard below
      }
    }

    if (!email) {
      return jsonResponse(400, { success: false, error: 'Could not determine a customer email for this order' });
    }

    // Unique reference tied to the order; persisted on the order so
    // paystack-webhook can resolve charge.success back to it.
    const reference = `PSK-${orderId}-${Date.now()}`;

    const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173';
    const callbackUrl = `${siteUrl.replace(/\/$/, '')}/order-confirmation/${orderId}`;

    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        // Paystack expects the smallest currency unit (cents for KES).
        amount: Math.round(Number(order.total_amount) * 100),
        currency: 'KES',
        reference,
        callback_url: callbackUrl,
        metadata: { order_id: orderId },
      }),
    });

    const paystackBody = await paystackRes.json().catch(() => null);

    if (!paystackRes.ok || !paystackBody?.status || !paystackBody?.data?.authorization_url) {
      console.error('Paystack initialize failed:', paystackRes.status, JSON.stringify(paystackBody));
      return jsonResponse(502, { success: false, error: 'Could not start the card payment. Please try again.' });
    }

    // Persist the reference (guarded: only while still pending).
    const { data: refUpdated, error: refError } = await supabase
      .from('orders')
      .update({ payment_ref: reference })
      .eq('id', orderId)
      .eq('payment_status', 'pending')
      .select('id');

    if (refError || !refUpdated || refUpdated.length === 0) {
      console.error(`Failed to store payment_ref for order ${orderId}:`, refError?.message);
      return jsonResponse(409, { success: false, error: 'Order is no longer awaiting payment' });
    }

    return jsonResponse(200, {
      success: true,
      authorization_url: paystackBody.data.authorization_url,
      reference,
    });
  } catch (error: any) {
    console.error('Create Paystack checkout error:', error?.message || error);
    return jsonResponse(500, { success: false, error: error?.message || 'Unexpected error' });
  }
});
