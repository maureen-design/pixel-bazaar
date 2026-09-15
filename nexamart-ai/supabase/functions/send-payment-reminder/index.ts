import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import nodemailer from 'npm:nodemailer';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const jsonHeaders = { 'Content-Type': 'application/json' };

const transporter = nodemailer.createTransport({
  host: Deno.env.get('SMTP_HOST') || 'smtp.gmail.com',
  port: parseInt(Deno.env.get('SMTP_PORT') || '587'),
  secure: false,
  auth: {
    user: Deno.env.get('EMAIL_USER'),
    pass: Deno.env.get('EMAIL_PASS'),
  },
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: jsonHeaders });
  }

  // Only accept requests with service_role or cron secret
  const authHeader = req.headers.get('Authorization') || '';
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const providedSecret = req.headers.get('x-cron-secret') || '';
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const isServiceRole = authHeader === `Bearer ${serviceRole}`;
  const isCron = cronSecret && providedSecret === cronSecret;
  if (!isServiceRole && !isCron) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 403, headers: jsonHeaders }
    );
  }

  try {
    const { order, customer } = await req.json();

    if (!order || !customer?.email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: order, customer.email' }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: settingsRow } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'site_name')
      .maybeSingle();

    const siteName = settingsRow?.value ?? 'NexaMart AI';

    const deadline = new Date(order.payment_deadline).toLocaleDateString('en-KE', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Payment Reminder</title>
  <style>
    body { font-family: Arial, sans-serif; background-color: #0f172a; color: #e2e8f0; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; padding: 40px; border: 1px solid #334155; }
    .header { border-bottom: 2px solid #334155; padding-bottom: 20px; text-align: center; margin-bottom: 20px; }
    .logo { font-size: 28px; font-weight: bold; color: #60a5fa; }
    .button { display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 16px; }
    .footer { border-top: 2px solid #334155; margin-top: 24px; padding-top: 20px; color: #94a3b8; font-size: 14px; text-align: center; }
    .warning { background-color: #f59e0b10; border: 1px solid #f59e0b33; border-radius: 8px; padding: 16px; margin: 16px 0; color: #fbbf24; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="display:inline-block;width:48px;height:48px;background:#0B1A2B;border-radius:10px;overflow:hidden;vertical-align:middle;">
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
          <rect width="64" height="64" rx="14" fill="#0B1A2B"/>
          <path d="M14 16v32M14 16l22 32M36 16v32" stroke="#2563EB" stroke-width="4.5" stroke-linecap="square"/>
          <path d="M50 16v32M50 16L28 48M36 16v32" stroke="#D4A853" stroke-width="4.5" stroke-linecap="square"/>
          <rect x="33" y="29" width="6" height="6" rx="1" transform="rotate(45 36 32)" fill="#D4A853" opacity="0.5"/>
        </svg>
      </div>
      <h1 style="margin: 12px 0 0; font-size: 24px;">Payment Reminder</h1>
      <p style="font-size: 14px; color: #94a3b8; margin: 4px 0 0;">Order #${order.order_number}</p>
    </div>
    <p>Dear ${customer.full_name || 'Customer'},</p>
    <p>This is a reminder that your order <strong>#${order.order_number}</strong> is awaiting payment.</p>
    <div class="warning">
      <p style="margin: 0;"><strong>Payment Deadline:</strong> ${deadline}</p>
      <p style="margin: 8px 0 0 0;">Please complete your payment before the deadline to avoid order cancellation.</p>
    </div>
    <p><strong>Amount Due:</strong> KES ${order.total_amount?.toLocaleString() || '0'}</p>
    <div style="text-align: center;">
      <a href="${Deno.env.get('APP_URL') || 'http://localhost:5173'}/auth/redirect?to=${encodeURIComponent(`/orders/${order.order_number}`)}" class="button">View Payment Details</a>
    </div>
    <div class="footer">
      <p>If you already made the payment, please ignore this message.</p>
      <p>Thank you for shopping with ${siteName}!</p>
    </div>
  </div>
</body>
</html>`;

    const result = await transporter.sendMail({
      from: `"${siteName}" <${Deno.env.get('EMAIL_USER')}>`,
      to: customer.email,
      subject: `Payment Reminder: Order #${order.order_number}`,
      html,
    });

    console.log('Payment reminder sent:', result.messageId);

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (error: any) {
    console.error('Error sending payment reminder:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
