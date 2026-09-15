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
    const { product_id, product_name, stock_quantity, vendor_id } = await req.json();

    if (!product_id || !vendor_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'product_id and vendor_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch vendor email
    const { data: vendor } = await supabase
      .from('vendors')
      .select('user_id')
      .eq('id', vendor_id)
      .maybeSingle();

    if (!vendor?.user_id) {
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
      return new Response(
        JSON.stringify({ success: false, error: 'Vendor email not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch settings
    const { data: settingsRows } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['site_name']);

    const settingsMap: Record<string, any> = {};
    for (const row of settingsRows ?? []) settingsMap[row.key] = row.value;

    const siteName = settingsMap['site_name'] ?? 'NexaMart AI';
    const siteUrl = Deno.env.get('SITE_URL') || 'https://nexamart.ai';

    const subject = `Low Stock Alert: ${escapeHtml(product_name || 'Product')}`;
    const isOutOfStock = stock_quantity === 0;

    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:600px;margin:40px auto;background:#1e293b;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.3);">
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
            <div style="background:${isOutOfStock ? '#EF4444' : '#F59E0B'};border-radius:8px;padding:24px;margin:0 0 24px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">${isOutOfStock ? 'Out of Stock' : 'Low Stock Alert'}</h1>
            </div>
            <p style="color:#e2e8f0;line-height:1.7;margin:0 0 20px;font-size:16px;">
              Hi ${escapeHtml(profile.full_name?.split(' ')[0] || 'Vendor')},
            </p>
            <p style="color:#e2e8f0;line-height:1.7;margin:0 0 20px;font-size:16px;">
              ${isOutOfStock
                ? `Your product <strong>${escapeHtml(product_name || 'Product')}</strong> is now out of stock. Consider restocking to continue receiving orders.`
                : `Your product <strong>${escapeHtml(product_name || 'Product')}</strong> has only <strong>${stock_quantity}</strong> unit${stock_quantity === 1 ? '' : 's'} remaining.`}
            </p>

            <div style="background:#0f172a;border-radius:8px;padding:20px;margin:24px 0;">
              <p style="color:#94a3b8;font-size:14px;margin:0 0 12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Product Details</p>
              <p style="color:#e2e8f0;font-size:14px;margin:0 0 8px;">Product: <strong>${escapeHtml(product_name || 'Product')}</strong></p>
              <p style="color:#e2e8f0;font-size:14px;margin:0;">Current Stock: <strong style="color:${isOutOfStock ? '#EF4444' : '#F59E0B'}">${stock_quantity}</strong></p>
            </div>

            <div style="text-align:center;margin:32px 0;">
              <a href="${siteUrl}/auth/redirect?to=${encodeURIComponent('/vendor/products')}"
                 style="display:inline-block;padding:14px 32px;background:#2563EB;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">
                Manage Inventory
              </a>
            </div>

            <hr style="border:none;border-top:1px solid #334155;margin:32px 0;">

            <p style="color:#64748b;font-size:13px;text-align:center;margin:0;">
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

    console.log(`Low stock alert sent to ${profile.email}: ${info.messageId}`);

    return new Response(
      JSON.stringify({ success: true, messageId: info.messageId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('send-low-stock-alert error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
