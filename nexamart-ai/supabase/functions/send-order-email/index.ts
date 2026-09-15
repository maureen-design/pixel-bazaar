import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import nodemailer from 'npm:nodemailer';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function formatCurrency(amount: number | null | undefined): string {
  const n = Number(amount) || 0;
  return `KES ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

interface AddressParts {
  full_name: string;
  phone: string;
  address: string;
  city: string;
  county: string;
}

// Parse shipping_address (JSON-in-text string, or an already-object value).
// Returns null only when there is no usable structured data.
function parseAddress(value: unknown): AddressParts | null {
  let obj: Record<string, unknown> | null = null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  } else if (value && typeof value === 'object') {
    obj = value as Record<string, unknown>;
  }
  if (!obj) return null;

  const str = (v: unknown): string => (v == null ? '' : String(v).trim());
  return {
    full_name: str(obj.full_name),
    phone: str(obj.phone),
    address: str(obj.address),
    city: str(obj.city),
    county: str(obj.county),
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) return '';
  return method === 'mpesa' ? 'M-Pesa' : method.charAt(0).toUpperCase() + method.slice(1);
}

function deliveryLabel(method: string | null | undefined): string {
  switch (method) {
    case 'standard':
      return 'Standard Delivery';
    case 'express':
      return 'Express Delivery';
    case 'pickup':
      return 'Pickup';
    default:
      return method ? escapeHtml(method) : '';
  }
}

// Human-readable address block. Never renders raw JSON when structured data
// exists; falls back to the raw value (escaped) only for legacy/malformed data.
function buildAddressBlock(order: any, customerEmail?: string): string {
  const addr = parseAddress(order.shipping_address);
  const html: string[] = [];
  const hasData = addr && (addr.full_name || addr.phone || addr.address || addr.city || addr.county);

  if (hasData) {
    html.push('<h3>Customer Details</h3>');
    html.push(`<p><strong>Name:</strong> ${escapeHtml(addr.full_name || 'Customer')}</p>`);
    if (customerEmail) html.push(`<p><strong>Email:</strong> ${escapeHtml(customerEmail)}</p>`);
    if (addr.phone) html.push(`<p><strong>Phone:</strong> ${escapeHtml(addr.phone)}</p>`);

    html.push('<h3>Shipping Address</h3>');
    if (addr.address) html.push(`<p><strong>Address:</strong> ${escapeHtml(addr.address)}</p>`);
    if (addr.city) html.push(`<p><strong>City:</strong> ${escapeHtml(addr.city)}</p>`);
    if (addr.county) html.push(`<p><strong>County:</strong> ${escapeHtml(addr.county)}</p>`);
    if (!addr.address && !addr.city && !addr.county) {
      html.push(`<p>${escapeHtml(addr.full_name || '')}</p>`);
    }
  } else {
    const raw =
      typeof order.shipping_address === 'string'
        ? order.shipping_address
        : JSON.stringify(order.shipping_address ?? '');
    if (raw && raw.trim()) html.push(`<p>${escapeHtml(raw)}</p>`);
  }

  if (order.delivery_method) {
    html.push('<h3>Delivery Method</h3>');
    html.push(`<p><strong>${deliveryLabel(order.delivery_method)}</strong></p>`);
    if (Number(order.delivery_cost) > 0) {
      html.push(`<p>Delivery Cost: ${formatCurrency(order.delivery_cost)}</p>`);
    }
  }

  return html.join('');
}

function paymentStatusLine(order: any): string {
  if (order.payment_status === 'paid') return '<p><strong>Payment Status:</strong> Paid</p>';
  if (order.payment_status) {
    return `<p><strong>Payment Status:</strong> ${escapeHtml(String(order.payment_status))}</p>`;
  }
  return '';
}

function totalsRows(order: any, site: any): string {
  const net = Number(order.total_amount) || 0;
  const ship = Number(order.shipping_cost) || 0;
  const tax = Number(order.tax_amount) || 0;
  const disc = Number(order.discount_amount) || 0;
  const subTotal = net - ship - tax + disc;

  const rows: string[] = [
    `<div style="display: flex; justify-content: space-between; padding: 4px 0; color: #cbd5e1;">
      <span>Subtotal</span>
      <span>${formatCurrency(subTotal)}</span>
    </div>`,
  ];
  if (ship > 0) {
    rows.push(`<div style="display: flex; justify-content: space-between; padding: 4px 0; color: #cbd5e1;">
      <span>Shipping</span>
      <span>${formatCurrency(ship)}</span>
    </div>`);
  }
  if (tax > 0) {
    rows.push(`<div style="display: flex; justify-content: space-between; padding: 4px 0; color: #cbd5e1;">
      <span>Tax${typeof site.taxRate === 'number' ? ` (${site.taxRate}%)` : ''}</span>
      <span>${formatCurrency(tax)}</span>
    </div>`);
  }
  if (disc > 0) {
    rows.push(`<div style="display: flex; justify-content: space-between; padding: 4px 0; color: #4ade80;">
      <span>Discount</span>
      <span>-${formatCurrency(disc)}</span>
    </div>`);
  }
  rows.push(`<div style="display: flex; justify-content: space-between; padding: 8px 0; border-top: 2px solid #334155; margin-top: 8px; font-weight: bold; color: #f1f5f9; font-size: 18px;">
    <span>Total</span>
    <span>${formatCurrency(net)}</span>
  </div>`);
  return rows.join('');
}

function generateCustomerEmail(order: any, customer: any, items: any[], site: any, isCancellation: boolean = false, isPaymentSuccessful: boolean = false) {
  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(item.product_name || 'Product')}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: center;">${escapeHtml(item.quantity)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${formatCurrency(item.total_price)}</td>
      </tr>
    `
    )
    .join('');

  const addressBlock = buildAddressBlock(order, customer.email);
  const paymentMethod = formatPaymentMethod(order.payment_method);
  const paymentStatus = paymentStatusLine(order);

  const isPayLater = order.payment_type === 'later' && order.payment_status !== 'paid';
  const isBankPending = order.payment_method === 'bank' && order.payment_status !== 'paid';
  const headerTitle = isCancellation
    ? 'Order Cancelled'
    : isPaymentSuccessful
    ? 'Payment Received'
    : isBankPending
    ? 'Order Received — Bank Transfer Pending'
    : isPayLater
    ? 'Order Received!'
    : 'Order Confirmed!';
  const deadline = order.payment_deadline
    ? new Date(order.payment_deadline).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  const bodyText = isCancellation
    ? `Your order <strong>#${escapeHtml(order.order_number)}</strong> has been cancelled because payment was not received before the deadline. Your items have been released back to inventory.`
    : isPaymentSuccessful
    ? `We've successfully received your payment for order <strong>#${escapeHtml(order.order_number)}</strong>. The vendor has been notified and will start preparing your order.`
    : isBankPending
    ? `Thank you for your order! Please complete the bank transfer using the details below within <strong>${escapeHtml(deadline)}</strong>.`
    : isPayLater
    ? `Thank you for your order! Your order has been received and payment is due by <strong>${escapeHtml(deadline)}</strong>. Please complete payment before the deadline to avoid cancellation.`
    : 'Thank you for your order! Your payment has been confirmed and we\'re preparing your items for shipment.';

  const deadlineBlock = isPayLater ? `
    <div style="background-color: #f59e0b10; border: 1px solid #f59e0b33; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0; color: #fbbf24;"><strong>Payment Due By:</strong> ${escapeHtml(deadline)}</p>
      <p style="margin: 8px 0 0 0; color: #cbd5e1;">Please complete your payment before this deadline to avoid order cancellation.</p>
    </div>
  ` : '';

  const bankDetailsBlock = isBankPending ? `
    <div style="background-color: #60a5fa10; border: 1px solid #60a5fa33; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0 0 8px; color: #60a5fa; font-weight: bold;">Bank Transfer Details</p>
      ${site.bankName ? `<p style="margin: 4px 0; color: #cbd5e1;"><strong>Bank:</strong> ${escapeHtml(site.bankName)}</p>` : ''}
      ${site.bankAccountName ? `<p style="margin: 4px 0; color: #cbd5e1;"><strong>Account Name:</strong> ${escapeHtml(site.bankAccountName)}</p>` : ''}
      ${site.bankAccountNumber ? `<p style="margin: 4px 0; color: #cbd5e1;"><strong>Account Number:</strong> ${escapeHtml(site.bankAccountNumber)}</p>` : ''}
      ${site.bankBranch ? `<p style="margin: 4px 0; color: #cbd5e1;"><strong>Branch:</strong> ${escapeHtml(site.bankBranch)}</p>` : ''}
      ${site.bankSwiftCode ? `<p style="margin: 4px 0; color: #cbd5e1;"><strong>SWIFT/BIC:</strong> ${escapeHtml(site.bankSwiftCode)}</p>` : ''}
      <p style="margin: 12px 0 4px; color: #fbbf24; font-weight: bold;">Amount: ${formatCurrency(order.total_amount)}</p>
      <p style="margin: 4px 0; color: #fbbf24; font-weight: bold;">Reference: ${escapeHtml(order.order_number)}</p>
      <p style="margin: 12px 0 0; color: #94a3b8; font-size: 13px;">Use your order number as the payment reference. Your order will be cancelled if payment is not received by the deadline.</p>
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${headerTitle}</title>
  <style>
    body { font-family: Arial, sans-serif; background-color: #0f172a; color: #e2e8f0; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; padding: 40px; border: 1px solid #334155; }
    .header { border-bottom: 2px solid #334155; padding-bottom: 20px; margin-bottom: 20px; text-align: center; }
    .logo { font-size: 28px; font-weight: bold; color: #60a5fa; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { background-color: #334155; padding: 10px 12px; text-align: left; font-weight: 600; color: #f1f5f9; }
    td { padding: 8px 12px; border-bottom: 1px solid #334155; }
    .address-block { background-color: #0f172a; padding: 16px; border-radius: 8px; margin: 16px 0; color: #cbd5e1; }
    .footer { border-top: 2px solid #334155; margin-top: 24px; padding-top: 20px; color: #94a3b8; font-size: 14px; }
    .button { display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 16px; }
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
      <h1 style="margin: 12px 0 0; font-size: 24px;">${headerTitle}</h1>
      <p style="font-size: 14px; color: #94a3b8; margin: 4px 0 0;">Order #${escapeHtml(order.order_number)}</p>
    </div>
    <p>Dear ${escapeHtml(customer.full_name || 'Customer')},</p>
    <p>${bodyText}</p>
    ${deadlineBlock}
    ${bankDetailsBlock}
    <h3>Order Summary</h3>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Price</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div>${totalsRows(order, site)}</div>
    <div class="address-block">${addressBlock}</div>
    ${paymentMethod ? `<h3>Payment Method</h3><p style="color: #cbd5e1;">${escapeHtml(paymentMethod)}</p>` : ''}
    ${paymentStatus}
    ${!isCancellation ? `<a href="${Deno.env.get('APP_URL') || 'http://localhost:5173'}/auth/redirect?to=${encodeURIComponent(`/orders/${order.order_number}`)}" class="button">${isPayLater ? 'View Payment Details' : isBankPending ? 'View Payment Instructions' : 'View My Order'}</a>` : ''}
    <div class="footer">
      <p>${isCancellation ? 'If you still want to purchase these items, please place a new order.' : isPaymentSuccessful ? "We'll notify you once your order ships." : isBankPending ? 'Please complete your bank transfer before the deadline.' : isPayLater ? 'Please complete your payment before the deadline to avoid cancellation.' : "We'll notify you once your order ships."}</p>
      <p>Thank you for shopping with ${escapeHtml(site.name)}!</p>
      <p style="font-size: 12px;">Support: ${escapeHtml(site.supportEmail)}</p>
    </div>
  </div>
</body>
</html>
  `;
}

function generateVendorEmail(order: any, customer: any, items: any[], site: any, isCancellation: boolean = false, isPaymentSuccessful: boolean = false) {
  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(item.product_name || 'Product')}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: center;">${escapeHtml(item.quantity)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${formatCurrency(item.total_price)}</td>
      </tr>
    `
    )
    .join('');

  const addressBlock = buildAddressBlock(order, customer.email);
  const paymentMethod = formatPaymentMethod(order.payment_method);
  const paymentStatus = paymentStatusLine(order);

  const isPayLater = order.payment_type === 'later' && order.payment_status !== 'paid';
  const isBankPending = order.payment_method === 'bank' && order.payment_status !== 'paid';
  const headerTitle = isCancellation
    ? 'Order Cancelled'
    : isPaymentSuccessful
    ? 'Payment Received'
    : isBankPending
    ? 'New Bank Transfer Order — Payment Pending'
    : isPayLater
    ? 'New Order Received — Payment Pending'
    : 'New Order Received!';
  const bodyText = isCancellation
    ? `Order #${escapeHtml(order.order_number)} has been cancelled because the customer did not complete bank transfer payment before the deadline. No action required.`
    : isPaymentSuccessful
    ? `Payment has been received for order #${escapeHtml(order.order_number)}. Please prepare the items for shipment.`
    : isBankPending
    ? 'You have received a new order. Payment is pending — the customer must complete a bank transfer. Please hold preparation until payment is confirmed by an admin.'
    : isPayLater
    ? 'You have received a new order. Payment is pending — the customer must complete payment before the deadline. Please hold preparation until payment is confirmed.'
    : 'You have received a new paid order. Please prepare the items for shipment.';

  const cancelNote = isCancellation
    ? `<div style="background-color: #ef444410; border: 1px solid #ef444433; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0; color: #f87171;"><strong>This order has been cancelled.</strong></p>
        <p style="margin: 8px 0 0; color: #cbd5e1;">No action required.</p>
      </div>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${headerTitle}</title>
  <style>
    body { font-family: Arial, sans-serif; background-color: #0f172a; color: #e2e8f0; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; padding: 40px; border: 1px solid #334155; }
    .header { border-bottom: 2px solid #334155; padding-bottom: 20px; margin-bottom: 20px; text-align: center; }
    .logo { font-size: 28px; font-weight: bold; color: #60a5fa; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { background-color: #334155; padding: 10px 12px; text-align: left; font-weight: 600; color: #f1f5f9; }
    td { padding: 8px 12px; border-bottom: 1px solid #334155; }
    .address-block { background-color: #0f172a; padding: 16px; border-radius: 8px; margin: 16px 0; color: #cbd5e1; }
    .footer { border-top: 2px solid #334155; margin-top: 24px; padding-top: 20px; color: #94a3b8; font-size: 14px; text-align: center; }
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
      <h1 style="margin: 12px 0 0; font-size: 24px;">${headerTitle}</h1>
      <p style="font-size: 14px; color: #94a3b8; margin: 4px 0 0;">Order #${escapeHtml(order.order_number)}</p>
    </div>
    <p>Dear Vendor,</p>
    <p>${bodyText}</p>
    ${cancelNote}
    <h3>Order Items</h3>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    ${paymentMethod ? `<p><strong>Payment Method:</strong> ${escapeHtml(paymentMethod)}</p>` : ''}
    ${paymentStatus}
    <div class="address-block">${addressBlock}</div>
    ${!isCancellation ? `<div style="text-align: center; margin: 24px 0;"><a href="${Deno.env.get('APP_URL') || 'http://localhost:5173'}/vendor/orders" style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">View Order</a></div>` : ''}
    <div class="footer">
      <p>${isCancellation ? 'Order has been cancelled.' : isPaymentSuccessful ? 'Please process this order as soon as possible.' : isBankPending ? 'Please wait for admin verification before preparing this order.' : isPayLater ? 'Please wait for payment confirmation before processing this order.' : 'Please process this order as soon as possible.'}</p>
      <p>${escapeHtml(site.name)} Team</p>
    </div>
  </div>
</body>
</html>
  `;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
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

// Authoritative order data for server-triggered (M-Pesa) emails. Uses the
// service-role client so order/order_items/profiles/vendors are readable.
async function fetchOrderData(supabase: any, orderId: string) {
  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (error || !order) throw new Error(`Order not found: ${orderId}`);

  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  let email = '';
  let profileName = '';
  if (order.user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', order.user_id)
      .maybeSingle();
    email = profile?.email ?? '';
    profileName = profile?.full_name ?? '';
  }

  let vendorEmail: string | null = null;
  if (order.vendor_id) {
    const { data: vendor } = await supabase
      .from('vendors')
      .select('user_id')
      .eq('id', order.vendor_id)
      .maybeSingle();
    if (vendor?.user_id) {
      const { data: vendorProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', vendor.user_id)
        .maybeSingle();
      vendorEmail = vendorProfile?.email ?? null;
    }
  }

  const addr = parseAddress(order.shipping_address);

  return {
    order,
    customer: {
      email,
      full_name: addr?.full_name || profileName || 'Customer',
    },
    items: items ?? [],
    vendor: { store_email: vendorEmail },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let order: any;
    let customer: any;
    let items: any[];
    let vendor: any;

    if (!body?.order_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'order_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fetched = await fetchOrderData(supabase, body.order_id);
    order = fetched.order;
    customer = fetched.customer;
    items = fetched.items;
    vendor = fetched.vendor;

    // Idempotency guard: a previously confirmed order must not be emailed
    // again (duplicate callback / reconcile race).
    if (order.email_sent) {
      console.log(`Order ${order.id} already emailed; skipping duplicate`);
      return new Response(
        JSON.stringify({ success: true, skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!order || !customer?.email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: order, customer.email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Sending order confirmation emails...');
    console.log('Order:', order.order_number || order.id);
    console.log('Items:', items.length);

    const { data: settingsRows } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['site_name', 'site_description', 'support_email', 'tax_rate',
        'bank_name', 'bank_account_name', 'bank_account_number', 'bank_branch', 'bank_swift_code',
        'bank_transfer_deadline_hours']);

    const settingsMap: Record<string, any> = {};
    for (const row of settingsRows ?? []) settingsMap[row.key] = row.value;

    const site = {
      name: settingsMap['site_name'] ?? 'NexaMart AI',
      supportEmail: settingsMap['support_email'] ?? 'support@nexamart-ai.com',
      taxRate: typeof settingsMap['tax_rate'] === 'number' ? settingsMap['tax_rate'] : 16,
      bankName: String(settingsMap['bank_name'] || ''),
      bankAccountName: String(settingsMap['bank_account_name'] || ''),
      bankAccountNumber: String(settingsMap['bank_account_number'] || ''),
      bankBranch: String(settingsMap['bank_branch'] || ''),
      bankSwiftCode: String(settingsMap['bank_swift_code'] || ''),
      bankTransferDeadlineHours: typeof settingsMap['bank_transfer_deadline_hours'] === 'number'
        ? settingsMap['bank_transfer_deadline_hours'] : 72,
    };

    const isPayLater = order.payment_type === 'later' && order.payment_status !== 'paid';
    const isBankPending = order.payment_method === 'bank' && order.payment_status !== 'paid';
    const isCancellation = body?.cancellation === true;
    // Payment successful: order was pay-later or bank-pending, now paid
    const isPaymentSuccessful = !isCancellation && order.payment_status === 'paid' && order.email_sent === false && (body?.payment_type === 'later' || body?.payment_method === 'bank');

    const customerSubject = isCancellation
      ? `Order Cancelled — Payment Not Received #${order.order_number}`
      : isPaymentSuccessful
      ? `Payment Received — Order #${order.order_number} Confirmed`
      : isBankPending
      ? `Order Received — Bank Transfer Pending #${order.order_number}`
      : isPayLater
      ? `Order Received — Payment Due #${order.order_number}`
      : `Order Confirmed! #${order.order_number}`;
    const vendorSubject = isCancellation
      ? `Order Cancelled #${order.order_number}`
      : isPaymentSuccessful
      ? `Payment Received — Order #${order.order_number}`
      : isBankPending
      ? `New Bank Transfer Order — Payment Pending #${order.order_number}`
      : isPayLater
      ? `New Order — Payment Pending #${order.order_number}`
      : `New Order Received! #${order.order_number}`;

    const customerEmailResult = await transporter.sendMail({
      from: `"${site.name}" <${Deno.env.get('EMAIL_USER')}>`,
      to: customer.email,
      subject: customerSubject,
      html: generateCustomerEmail(order, customer, items, site, isCancellation, isPaymentSuccessful),
    });

    console.log('Customer email sent:', customerEmailResult.messageId);

    if (vendor?.store_email) {
      const vendorEmailResult = await transporter.sendMail({
        from: `"${site.name}" <${Deno.env.get('EMAIL_USER')}>`,
        to: vendor.store_email,
        subject: vendorSubject,
        html: generateVendorEmail(order, customer, items, site, isCancellation, isPaymentSuccessful),
      });
      console.log('Vendor email sent:', vendorEmailResult.messageId);
    } else {
      console.log('No vendor email provided, skipping vendor notification');
    }

    // Mark confirmed so a duplicate callback / next reconcile run does not
    // resend. Only set after the customer confirmation email succeeded.
    // For Pay Later and Bank Transfer creation emails, do NOT set email_sent=true:
    // the post-payment confirmation email still needs to be sent.
    // For Payment Successful emails, set email_sent=true to prevent future duplicates.
    if (!isPayLater && !isBankPending) {
      await supabase.from('orders').update({ email_sent: true }).eq('id', order.id);
    }

    return new Response(
      JSON.stringify({ success: true, customerMessageId: customerEmailResult.messageId }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Email sending error:', error?.message || error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
