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
    const { name, email, subject, order_number, message } = await req.json();

    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'name, email, and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: settingsRows } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['site_name', 'support_email']);

    const settingsMap: Record<string, any> = {};
    for (const row of settingsRows ?? []) settingsMap[row.key] = row.value;

    const siteName = settingsMap['site_name'] ?? 'NexaMart AI';
    const supportEmail = settingsMap['support_email'] ?? 'support@nexamart-ai.com';

    const topicLabels: Record<string, string> = {
      order: 'Order Support',
      payment: 'Payment Questions',
      vendor: 'Vendor & Product Issues',
      account: 'Account Assistance',
      other: 'Other',
    };
    const topicLabel = topicLabels[subject] || escapeHtml(subject) || 'General Inquiry';

    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <div style="background:#1e293b;padding:32px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:20px;">New Contact Form Submission</h1>
            <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">${siteName}</p>
          </div>
          <div style="padding:32px;">
            <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:500;width:120px;">From</td>
                <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;color:#1e293b;">${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:500;">Topic</td>
                <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;color:#1e293b;">${topicLabel}</td>
              </tr>
              ${order_number ? `
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:500;">Order #</td>
                <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;color:#1e293b;">${escapeHtml(order_number)}</td>
              </tr>
              ` : ''}
            </table>
            <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:0 0 24px;">
              <p style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Message</p>
              <p style="color:#1e293b;line-height:1.6;margin:0;white-space:pre-wrap;">${escapeHtml(message)}</p>
            </div>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
            <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0;">
              Reply directly to this email to respond to ${escapeHtml(name)}.
            </p>
          </div>
        </div>
      </body>
      </html>`;

    const info = await transporter.sendMail({
      from: `"${siteName}" <${Deno.env.get('EMAIL_USER')}>`,
      to: supportEmail,
      replyTo: email,
      subject: `[${siteName}] ${topicLabel}${order_number ? ` — Order #${order_number}` : ''}`,
      html,
    });

    console.log(`Contact form email sent: ${info.messageId}`);

    return new Response(
      JSON.stringify({ success: true, messageId: info.messageId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('send-contact-form error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
