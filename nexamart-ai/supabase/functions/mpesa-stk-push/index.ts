import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Access-Control-Max-Age': '86400',
};

// Sandbox Daraja base URL (the environment this project runs against).
const DARAJA_BASE_URL = 'https://sandbox.safaricom.co.ke';

// fetch wrapper with a hard timeout. A stalled Daraja request must never leave
// the browser's STK push call hanging on the "sending" screen indefinitely.
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

async function getOAuthToken() {
  const key = Deno.env.get('MPESA_CONSUMER_KEY')!;
  const secret = Deno.env.get('MPESA_CONSUMER_SECRET')!;
  const credentials = `${key}:${secret}`;
  const auth = btoa(String.fromCharCode(...new TextEncoder().encode(credentials)));
  const res = await fetchWithTimeout(
    `${DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { method: 'GET', headers: { Authorization: `Basic ${auth}` } },
    15000
  );
  if (!res.ok) {
    throw new Error(`Daraja OAuth failed (HTTP ${res.status})`);
  }
  const data = await res.json();
  return data.access_token;
}

// Password = base64(shortcode + passkey + timestamp). The timestamp returned is
// exactly the value that must be sent in the request body.
function generatePassword() {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const shortcode = Deno.env.get('MPESA_SHORTCODE')!;
  const passkey = Deno.env.get('MPESA_PASSKEY')!;
  const password = btoa(`${shortcode}${passkey}${timestamp}`);
  return { password, timestamp };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const { phoneNumber, amount, orderId } = await req.json();

    if (!phoneNumber || !amount || !orderId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Where the caller presents a valid session token, require the order to
    // belong to that user. Requests without a token remain compatible with the
    // current verify_jwt=false deployment (identity is then best-effort).
    const authHeader = req.headers.get('Authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: authUser, error: authError } = await userClient.auth.getUser();
      if (authError || !authUser?.user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (order.user_id !== authUser.user.id) {
        return new Response(
          JSON.stringify({ success: false, error: 'Order does not belong to the current user' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (order.payment_status !== 'pending') {
      return new Response(
        JSON.stringify({ success: false, error: 'Order is not awaiting payment' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Whole-shilling comparison: M-Pesa bills integer KES, so the expected
    // amount is Math.round of the authoritative order total.
    const expectedAmount = Math.round(Number(order.total_amount));
    if (Math.round(Number(amount)) !== expectedAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Amount does not match the order total' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Server-side toggle: reject new M-Pesa payments when disabled. Missing
    // setting = enabled (safe default).
    const { data: mpesaSetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'mpesa_enabled')
      .maybeSingle();

    const mpesaEnabled = mpesaSetting ? mpesaSetting.value !== false : true;

    if (!mpesaEnabled) {
      await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          payment_status: 'failed',
          payment_error: 'M-Pesa payments are currently disabled',
        })
        .eq('id', orderId);

      await supabase.rpc('release_stock_for_order', { p_order_id: orderId });

      return new Response(
        JSON.stringify({ success: false, error: 'M-Pesa payments are currently disabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize the phone to international format (254...). Accepts 0712345678,
    // 712345678, +254712345678 and 254712345678 so a formatting slip cannot
    // silently prevent the prompt from being sent.
    const digits = String(phoneNumber).replace(/\D/g, '');
    let formattedPhone = digits;
    if (formattedPhone.length === 9 && formattedPhone.startsWith('7')) {
      formattedPhone = `254${formattedPhone}`;
    } else if (formattedPhone.startsWith('0')) {
      formattedPhone = `254${formattedPhone.slice(1)}`;
    } else if (formattedPhone.startsWith('254')) {
      formattedPhone = formattedPhone;
    }
    if (formattedPhone.length !== 12 || !formattedPhone.startsWith('254')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid phone number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = await getOAuthToken();
    const { password, timestamp } = generatePassword();
    const shortcode = Deno.env.get('MPESA_SHORTCODE')!;
    const callbackUrl = Deno.env.get('MPESA_CALLBACK_URL')!;

    const stkRequest = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: expectedAmount,
      PartyA: formattedPhone,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: `ORD-${orderId.slice(0, 8)}`,
      TransactionDesc: 'NexaMart AI Order Payment',
    };

    const response = await fetchWithTimeout(
      `${DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(stkRequest),
      },
      15000
    );

    let result: any = null;
    try {
      result = await response.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: `Unexpected response from M-Pesa (HTTP ${response.status})` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (result.ResponseCode === '0') {
      await supabase.from('orders').update({ mpesa_checkout_id: result.CheckoutRequestID }).eq('id', orderId);

      return new Response(
        JSON.stringify({ success: true, checkoutRequestId: result.CheckoutRequestID, message: 'STK Push sent to your phone' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: result.ResponseDescription || 'STK Push failed' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
