import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import nodemailer from 'npm:nodemailer';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEFAULT_SITE_URL = 'https://pixel-bazaar-blue.vercel.app';

function getSiteUrl(): string {
  const configured = Deno.env.get('SITE_URL') || Deno.env.get('APP_URL');
  return (configured || DEFAULT_SITE_URL).trim().replace(/\/+$/, '');
}

function siteRedirect(path: string): string {
  return `${getSiteUrl()}/auth/redirect?to=${encodeURIComponent(path)}`;
}

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const { order_id, status, reason } = await req.json();

    if (!order_id || !status) {
      return new Response(
        JSON.stringify({ success: false, error: 'order_id and status are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .maybeSingle();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch customer profile
    let customerEmail = '';
    let customerName = 'Customer';
    if (order.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', order.user_id)
        .maybeSingle();
      customerEmail = profile?.email ?? '';
      customerName = profile?.full_name ?? 'Customer';
    }

    if (!customerEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'Customer email not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch settings
    const { data: settingsRows } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['site_name', 'support_email']);

    const settingsMap: Record<string, any> = {};
    for (const row of settingsRows ?? []) settingsMap[row.key] = row.value;

    const siteName = settingsMap['site_name'] ?? 'NexaMart AI';
    const supportEmail = settingsMap['support_email'] ?? 'support@nexamart-ai.com';
    

    // Delivery method labels
    const deliveryLabels: Record<string, string> = {
      standard: 'Standard Delivery',
      express: 'Express Delivery',
      pickup: 'Pickup',
    };
    const deliveryMethod = order.delivery_method ? deliveryLabels[order.delivery_method] || order.delivery_method : null;

    // Build email based on status
    let subject = '';
    let headerTitle = '';
    let bodyText = '';
    let footerText = '';
    let headerColor = '#2563EB';

    switch (status) {
      case 'processing':
        subject = `Order #${order.order_number} is being prepared`;
        headerTitle = 'Order Being Prepared';
        bodyText = `Great news! Your order <strong>#${escapeHtml(order.order_number)}</strong> is now being prepared by the vendor.`;
        footerText = "We'll notify you once your order ships.";
        headerColor = '#2563EB';
        break;
      case 'shipped':
        subject = `Order #${order.order_number} has shipped!`;
        headerTitle = 'Order Shipped!';
        bodyText = `Your order <strong>#${escapeHtml(order.order_number)}</strong> is on its way!${deliveryMethod ? ` It's being delivered via <strong>${escapeHtml(deliveryMethod)}</strong>.` : ''} It should arrive soon.`;
        footerText = 'Thank you for shopping with us!';
        headerColor = '#10B981';
        break;
      case 'delivered':
        subject = `Order #${order.order_number} has been delivered`;
        headerTitle = 'Order Delivered';
        bodyText = `Your order <strong>#${escapeHtml(order.order_number)}</strong> has been delivered. We hope you enjoy your purchase!`;
        footerText = 'Thank you for shopping with us!';
        headerColor = '#10B981';
        break;
      case 'cancelled':
        subject = `Order #${order.order_number} has been cancelled`;
        headerTitle = 'Order Cancelled';
        bodyText = `Your order <strong>#${escapeHtml(order.order_number)}</strong> has been cancelled.`;
        if (reason) {
          bodyText += `<br><br><strong>Reason:</strong> ${escapeHtml(reason)}`;
        }
        footerText = 'If you have any questions, please contact support.';
        headerColor = '#EF4444';
        break;
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown status: ${status}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

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
            <div style="background:${headerColor};border-radius:8px;padding:24px;margin:0 0 24px;text-align:center;">
              <h1 style="color:#ffffff;margin:0 0 8px;font-size:24px;font-weight:700;">${headerTitle}</h1>
              <p style="color:rgba(255,255,255,0.9);margin:0;font-size:14px;">Order #${escapeHtml(order.order_number)}</p>
            </div>
            <p style="color:#e2e8f0;line-height:1.7;margin:0 0 20px;font-size:16px;">
              Hi ${escapeHtml(customerName.split(' ')[0])},
            </p>
            <p style="color:#e2e8f0;line-height:1.7;margin:0 0 20px;font-size:16px;">
              ${bodyText}
            </p>

            <div style="background:#0f172a;border-radius:8px;padding:20px;margin:24px 0;">
              <p style="color:#94a3b8;font-size:14px;margin:0 0 12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Order Details</p>
              <p style="color:#e2e8f0;font-size:14px;margin:0 0 8px;">Order Number: <strong>#${escapeHtml(order.order_number)}</strong></p>
              <p style="color:#e2e8f0;font-size:14px;margin:0 0 8px;">Total: <strong>${formatCurrency(order.total_amount)}</strong></p>
              <p style="color:#e2e8f0;font-size:14px;margin:0 0 8px;">Status: <strong>${escapeHtml(status.charAt(0).toUpperCase() + status.slice(1))}</strong></p>
              ${deliveryMethod && status === 'shipped' ? `<p style="color:#e2e8f0;font-size:14px;margin:0;">Delivery: <strong>${escapeHtml(deliveryMethod)}</strong></p>` : ''}
            </div>

            <div style="text-align:center;margin:32px 0;">
              <a href="${siteRedirect(`/orders/${order.order_number}`)}"
                 style="display:inline-block;padding:14px 32px;background:#2563EB;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">
                ${status === 'shipped' ? 'Track My Order' : 'View My Order'}
              </a>
            </div>

            <hr style="border:none;border-top:1px solid #334155;margin:32px 0;">

            <p style="color:#94a3b8;font-size:14px;text-align:center;margin:0 0 8px;">
              ${footerText}
            </p>
            <p style="color:#64748b;font-size:13px;text-align:center;margin:0;">
              Need help? Contact us at <a href="mailto:${supportEmail}" style="color:#60a5fa;">${supportEmail}</a>
            </p>
            <p style="color:#64748b;font-size:13px;text-align:center;margin:8px 0 0;">
              &copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>`;

    const info = await transporter.sendMail({
      from: `"${siteName}" <${Deno.env.get('EMAIL_USER')}>`,
      to: customerEmail,
      subject,
      html,
    });

    console.log(`Order status email (${status}) sent to ${customerEmail}: ${info.messageId}`);

    return new Response(
      JSON.stringify({ success: true, messageId: info.messageId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('send-order-status-email error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
