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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const { vendor_id, action, reason } = await req.json();

    if (!vendor_id || !action) {
      return new Response(
        JSON.stringify({ success: false, error: 'vendor_id and action are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action !== 'approved' && action !== 'rejected') {
      return new Response(
        JSON.stringify({ success: false, error: 'action must be "approved" or "rejected"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id, store_name, user_id')
      .eq('id', vendor_id)
      .maybeSingle();

    if (vendorError || !vendor) {
      return new Response(
        JSON.stringify({ success: false, error: 'Vendor not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', vendor.user_id)
      .maybeSingle();

    if (!profile?.email) {
      console.log(`No email for vendor ${vendor_id}; skipping`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'no email' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: settings } = await supabase
      .from('system_settings')
      .select('site_name')
      .maybeSingle();

    const siteName = settings?.site_name || 'NexaMart AI';
    const vendorName = escapeHtml(vendor.store_name);
    const customerName = escapeHtml(profile.full_name || 'Vendor');

    const isApproved = action === 'approved';
    const subject = isApproved
      ? `Your vendor account has been approved - ${siteName}`
      : `Update on your vendor application - ${siteName}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <div style="text-align:center;padding:32px 32px 0;">
            <div style="display:inline-block;width:48px;height:48px;background:#0B1A2B;border-radius:10px;overflow:hidden;vertical-align:middle;">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
                <rect width="64" height="64" rx="14" fill="#0B1A2B"/>
                <path d="M14 16v32M14 16l22 32M36 16v32" stroke="#2563EB" stroke-width="4.5" stroke-linecap="square"/>
                <path d="M50 16v32M50 16L28 48M36 16v32" stroke="#D4A853" stroke-width="4.5" stroke-linecap="square"/>
                <rect x="33" y="29" width="6" height="6" rx="1" transform="rotate(45 36 32)" fill="#D4A853" opacity="0.5"/>
              </svg>
            </div>
            <p style="color:#94a3b8;font-size:14px;margin:8px 0 0;font-weight:500;letter-spacing:0.5px;">${siteName}</p>
          </div>
          <div style="padding:24px 32px 40px;">
            <div style="background:${isApproved ? '#10B981' : '#EF4444'};border-radius:8px;padding:24px;margin:0 0 24px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">${isApproved ? 'Vendor Approved' : 'Application Update'}</h1>
            </div>
            <h2 style="color:#1e293b;margin:0 0 16px;">Hi ${customerName},</h2>
            ${isApproved ? `
              <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
                Great news! Your vendor account <strong>${vendorName}</strong> has been approved.
                You can now start listing products and receiving orders on ${siteName}.
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${Deno.env.get('SITE_URL') || 'https://nexamart.ai'}/auth/redirect?to=${encodeURIComponent('/vendor/products')}"
                   style="display:inline-block;padding:14px 32px;background:#2563EB;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">
                  Go to Vendor Dashboard
                </a>
              </div>
            ` : `
              <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
                Thank you for your interest in selling on ${siteName}.
                After reviewing your application for <strong>${vendorName}</strong>, we're unable to approve it at this time.
              </p>
              ${reason ? `<p style="color:#475569;line-height:1.6;margin:0 0 16px;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
              <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
                If you believe this was an error, please contact our support team.
              </p>
            `}
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
      to: profile.email,
      subject,
      html,
    });

    console.log(`Vendor ${action} email sent to ${profile.email}: ${info.messageId}`);

    return new Response(
      JSON.stringify({ success: true, messageId: info.messageId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('send-vendor-lifecycle error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
