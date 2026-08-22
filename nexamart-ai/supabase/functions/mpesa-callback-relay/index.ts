import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const jsonHeaders = { 'Content-Type': 'application/json' };

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

// Resolve the authenticated handler (mpesa-callback). An explicit override wins;
// otherwise derive the functions URL from the project ref so no extra secret is
// needed. Deriving from SUPABASE_URL keeps this working with custom domains too.
function getHandlerUrl(): string {
  const explicit = Deno.env.get('MPESA_CALLBACK_HANDLER_URL');
  if (explicit) return explicit;
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is not set');
  }
  const ref = supabaseUrl.replace('https://', '').split('.')[0];
  return `https://${ref}.functions.supabase.co/mpesa-callback`;
}

serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return jsonResponse(405, { ResultCode: 1, ResultDesc: 'Method not allowed' });
    }

    // Fail closed: this relay is the secret injector, so without its own copy of
    // the secret it must not forward anything.
    const secret = Deno.env.get('MPESA_CALLBACK_SECRET');
    if (!secret) {
      console.error('mpesa-callback-relay: MPESA_CALLBACK_SECRET is not configured');
      return jsonResponse(500, { ResultCode: 1, ResultDesc: 'Configuration error' });
    }

    // Forward the raw Daraja body unchanged; re-serialization could alter it.
    const rawBody = await req.text();
    if (!rawBody || !rawBody.trim()) {
      return jsonResponse(400, { ResultCode: 1, ResultDesc: 'Invalid payload' });
    }

    const handlerUrl = getHandlerUrl();

    // Safaricom expects a response within ~30s; cap the upstream call well under
    // that so we can still answer before the timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);

    let upstream: Response;
    try {
      upstream = await fetch(handlerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mpesa-callback-secret': secret,
        },
        body: rawBody,
        signal: controller.signal,
      });
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        console.error('mpesa-callback-relay: handler timed out');
        return jsonResponse(504, { ResultCode: 1, ResultDesc: 'Relay timeout' });
      }
      console.error('mpesa-callback-relay: handler unreachable:', error?.message || error);
      return jsonResponse(502, { ResultCode: 1, ResultDesc: 'Relay error' });
    } finally {
      clearTimeout(timer);
    }

    // Forward the handler's response verbatim: 200 = acked (or replayed),
    // non-200 = let Safaricom's retry mechanism see the real outcome.
    const upstreamText = await upstream.text();
    console.log(`mpesa-callback-relay: forwarded callback -> ${handlerUrl} (${upstream.status})`);
    return new Response(upstreamText, {
      status: upstream.status,
      headers: { ...jsonHeaders },
    });
  } catch (error: any) {
    console.error('mpesa-callback-relay error:', error?.message || error);
    return jsonResponse(500, { ResultCode: 1, ResultDesc: 'Relay error' });
  }
});
