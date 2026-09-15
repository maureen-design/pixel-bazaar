import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import nodemailer from 'npm:nodemailer';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const transporter = nodemailer.createTransport({
  host: Deno.env.get('SMTP_HOST') || 'smtp.gmail.com',
  port: parseInt(Deno.env.get('SMTP_PORT') || '587'),
  secure: false,
  auth: {
    user: Deno.env.get('EMAIL_USER'),
    pass: Deno.env.get('EMAIL_PASS'),
  },
});

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCurrency(amount: number | null | undefined): string {
  const n = Number(amount) || 0;
  return `KES ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

async function verifyAdminAuth(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceKey) return false;

  try {
    const client = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) return false;

    const { data: profile } = await client
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    return profile?.role === 'admin';
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const isAdmin = await verifyAdminAuth(req.headers.get('Authorization'));
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { event, data } = await req.json();

    if (!event) {
      return new Response(
        JSON.stringify({ success: false, error: 'event is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: settings } = await supabase
      .from('system_settings')
      .select('site_name')
      .maybeSingle();

    const siteName = settings?.site_name || 'NexaMart AI';

    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('role', 'admin');

    if (!adminProfiles || adminProfiles.length === 0) {
      console.log('No admin profiles found; skipping notification');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'no admins' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminEmails = adminProfiles
      .map((p: any) => p.email)
      .filter(Boolean);

    if (adminEmails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'no admin emails' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let subject = '';
    let bodyHtml = '';

    switch (event) {
      case 'new_order': {
        const orderNumber = escapeHtml(data?.order_number || 'N/A');
        const total = formatCurrency(data?.total_amount);
        const customerName = escapeHtml(data?.customer_name || 'Customer');
        const itemCount = data?.item_count || 0;
        subject = `New Order ${orderNumber} - ${siteName}`;
        bodyHtml = `
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
            A new order has been placed on ${siteName}.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px 0;color:#94a3b8;">Order Number</td><td style="padding:8px 0;color:#1e293b;font-weight:600;">${orderNumber}</td></tr>
            <tr><td style="padding:8px 0;color:#94a3b8;">Customer</td><td style="padding:8px 0;color:#1e293b;">${customerName}</td></tr>
            <tr><td style="padding:8px 0;color:#94a3b8;">Items</td><td style="padding:8px 0;color:#1e293b;">${itemCount}</td></tr>
            <tr><td style="padding:8px 0;color:#94a3b8;">Total</td><td style="padding:8px 0;color:#1e293b;font-weight:600;">${total}</td></tr>
          </table>
          <div style="text-align:center;margin:32px 0;">
            <a href="${Deno.env.get('SITE_URL') || 'https://nexamart.ai'}/admin/orders"
               style="display:inline-block;padding:14px 32px;background:#2563EB;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">
              View Orders
            </a>
          </div>`;
        break;
      }

      case 'new_vendor_application': {
        const storeName = escapeHtml(data?.store_name || 'Unknown Store');
        const businessName = escapeHtml(data?.business_name || '');
        const applicantName = escapeHtml(data?.applicant_name || 'Vendor');
        subject = `New Vendor Application - ${siteName}`;
        bodyHtml = `
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
            A new vendor has applied to sell on ${siteName}.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px 0;color:#94a3b8;">Store Name</td><td style="padding:8px 0;color:#1e293b;font-weight:600;">${storeName}</td></tr>
            ${businessName ? `<tr><td style="padding:8px 0;color:#94a3b8;">Business Name</td><td style="padding:8px 0;color:#1e293b;">${businessName}</td></tr>` : ''}
            <tr><td style="padding:8px 0;color:#94a3b8;">Applicant</td><td style="padding:8px 0;color:#1e293b;">${applicantName}</td></tr>
          </table>
          <div style="text-align:center;margin:32px 0;">
            <a href="${Deno.env.get('SITE_URL') || 'https://nexamart.ai'}/admin/vendors"
               style="display:inline-block;padding:14px 32px;background:#2563EB;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">
              Review Application
            </a>
          </div>`;
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown event: ${event}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <div style="background:#1e293b;padding:32px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:24px;">${siteName} Admin</h1>
          </div>
          <div style="padding:32px;">
            <h2 style="color:#1e293b;margin:0 0 16px;">${subject}</h2>
            ${bodyHtml}
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
            <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0;">
              &copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>`;

    const info = await transporter.sendMail({
      from: `"${siteName}" <${Deno.env.get('EMAIL_USER')}>`,
      to: adminEmails.join(','),
      subject,
      html,
    });

    console.log(`Admin notification (${event}) sent to ${adminEmails.length} admin(s): ${info.messageId}`);

    return new Response(
      JSON.stringify({ success: true, messageId: info.messageId, recipients: adminEmails.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('send-admin-notification error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
