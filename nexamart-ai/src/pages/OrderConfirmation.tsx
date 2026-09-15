import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Package, Truck, MapPin, Calendar, Smartphone, Clock, XCircle, Zap, Store, AlertTriangle, Phone, CreditCard, Check, Building2, ShoppingBag } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { CardPaymentForm } from '../components/checkout/CardPaymentForm';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { formatShippingAddress, addBusinessDays } from '../utils/formatUtils';
import { SafeImg } from '../components/SafeImg';
import { OrderTimeline, OrderCancelledNotice } from '../components/OrderTimeline';
import { formatBankAccount } from '../lib/formatBankAccount';
import { formatPrice } from '../config/pricing';

interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  total_price: number;
  variant_attributes?: Record<string, string>;
}

interface Order {
  id: string;
  order_number: string;
  total_amount: number;
  shipping_address: string;
  shipping_cost: number;
  tax_amount: number;
  status: string;
  payment_status: string;
  payment_method: string;
  delivery_method: string;
  delivery_cost: number;
  payment_type: string;
  payment_deadline: string;
  created_at: string;
  mpesa_transaction_id?: string;
  mpesa_checkout_id?: string;
  paid_at?: string;
  items: OrderItem[];
}

export function OrderConfirmation() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [bankSettings, setBankSettings] = useState<{ bankName: string; bankAccountName: string; bankAccountNumber: string; bankBranch: string; bankSwiftCode: string; } | null>(null);
  const [productImages, setProductImages] = useState<Record<string, string>>({});

  // Pay Now state for unpaid Pay Later orders
  const [mpesaPhone, setMpesaPhone] = useState(profile?.phone || '');
  const [mpesaStatus, setMpesaStatus] = useState<'idle' | 'sending' | 'sent' | 'success' | 'error' | 'cancelled' | 'failed' | 'pending'>('idle');
  const [paying, setPaying] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  useEffect(() => {
    if (!orderId || !user) {
      navigate('/');
      return;
    }
    fetchOrder();
    fetchBankSettings();
  }, [orderId, user]);

  useEffect(() => {
    if (!order || order.items.length === 0) return;
    const ids = order.items.map((i) => i.product_id).filter(Boolean);
    if (ids.length === 0) return;
    supabase
      .from('products')
      .select('id, images')
      .in('id', ids)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string> = {};
        for (const p of data) {
          if (p.images && p.images.length > 0) map[p.id] = p.images[0];
        }
        setProductImages(map);
      });
  }, [order?.id]);

  const fetchBankSettings = async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['bank_name', 'bank_account_name', 'bank_account_number', 'bank_branch', 'bank_swift_code']);
    if (data) {
      const map: Record<string, string> = {};
      for (const row of data) map[row.key] = String(row.value || '');
      setBankSettings({
        bankName: map['bank_name'] || '',
        bankAccountName: map['bank_account_name'] || '',
        bankAccountNumber: map['bank_account_number'] || '',
        bankBranch: map['bank_branch'] || '',
        bankSwiftCode: map['bank_swift_code'] || '',
      });
    }
  };

  const fetchOrder = async () => {
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('user_id', user.id)
        .single();

      if (orderError) throw orderError;

      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId);

      if (itemsError) throw itemsError;

      setOrder({
        ...orderData,
        items: itemsData || [],
      });
    } catch (error: any) {
      console.error('Error fetching order:', error);
      toast.error('Failed to load order details');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const isPayLater = order?.payment_type === 'later' && order?.payment_status !== 'paid';
  const isBankPending = order?.payment_method === 'bank' && order?.payment_status !== 'paid';

  const handlePayNowMpesa = async () => {
    if (!order || !mpesaPhone.trim()) { toast.error('Please enter your M-Pesa phone number'); return; }
    setPaying(true);
    setMpesaStatus('sending');
    try {
      const { data, error } = await Promise.race([
        supabase.functions.invoke('mpesa-stk-push', {
          body: { phoneNumber: mpesaPhone, amount: Math.round(Number(order.total_amount)), orderId: order.id },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('M-Pesa did not respond. Please try again.')), 40000)),
      ]);
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      setMpesaStatus('sent');
      toast.success('Payment request sent. Check your phone to complete payment.');
      pollOrderStatus(order.id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to initiate M-Pesa payment');
      setMpesaStatus('error');
    } finally {
      setPaying(false);
    }
  };

  const pollOrderStatus = (oid: string) => {
    let attempts = 0;
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      attempts++;
      const { data } = await supabase.from('orders').select('payment_status, status').eq('id', oid).single();
      if (data?.payment_status === 'paid') {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setMpesaStatus('success');
        await clearCart();
        toast.success('Payment successful!');
        fetchOrder();
      } else if (data?.payment_status === 'failed' || data?.status === 'cancelled') {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setMpesaStatus('failed');
        toast.error('Payment failed. Please try again.');
      } else if (attempts >= 30) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setMpesaStatus('pending');
        toast.info('Payment is still being processed. Check back shortly.');
      }
    }, 5000);
  };

  // Card payments return from Paystack's hosted checkout to this page, so the
  // cart is cleared here once the paid state is observed (covers both the
  // checkout entry and the Pay-Later "pay now" path; no-op if already empty).
  const cardCartClearedRef = useRef(false);
  useEffect(() => {
    if (!cardCartClearedRef.current && order?.payment_method === 'card' && order?.payment_status === 'paid') {
      cardCartClearedRef.current = true;
      clearCart();
    }
  }, [order?.payment_method, order?.payment_status, clearCart]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl text-foreground">Order not found</h2>
          <Link to="/" className="text-primary hover:text-primary/80 mt-4 inline-block">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-KE', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const isDeadlineSoon = (order.payment_type === 'later' || isBankPending) && order.payment_deadline &&
    new Date(order.payment_deadline).getTime() - Date.now() < 2 * 60 * 60 * 1000;

  const deliveryLabels: Record<string, string> = {
    standard: 'Standard Delivery',
    express: 'Express Delivery',
    pickup: 'Pickup',
  };

  const deliveryIcons: Record<string, typeof Truck> = {
    standard: Truck,
    express: Zap,
    pickup: Store,
  };

  const DeliveryIcon = deliveryIcons[order.delivery_method] || Truck;

  const formatDateShort = (d: Date) => d.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });

  const getDeliveryDateRange = () => {
    const created = new Date(order.created_at || Date.now());
    switch (order.delivery_method) {
      case 'express':
        return `${formatDateShort(addBusinessDays(created, 1))} - ${formatDateShort(addBusinessDays(created, 2))}`;
      case 'pickup':
        return `Ready by ${formatDateShort(addBusinessDays(created, 1))}`;
      default:
        return `${formatDateShort(addBusinessDays(created, 3))} - ${formatDateShort(addBusinessDays(created, 5))}`;
    }
  };

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <motion.div
        className="max-w-4xl mx-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Success Header */}
        <div className="text-center mb-8">
          <motion.div
            className={`inline-flex items-center justify-center w-20 h-20 rounded-full border mb-4 ${
              isBankPending ? 'bg-accent/10 border-accent/20'
              : order.payment_type === 'later' ? 'bg-warning/10 border-warning/20'
              : 'bg-success/10 border-success/20'
            }`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          >
            {isBankPending ? (
              <Building2 className="h-10 w-10 text-accent" />
            ) : order.payment_type === 'later' ? (
              <Clock className="h-10 w-10 text-warning" />
            ) : (
              <CheckCircle2 className="h-10 w-10 text-success" />
            )}
          </motion.div>
          <h1 className="text-3xl font-bold text-foreground">
            {isBankPending ? 'Order Placed — Bank Transfer Pending' : order.payment_type === 'later' ? 'Order Placed!' : 'Order Confirmed!'}
          </h1>
          <p className="text-muted-foreground mt-2">
            {isBankPending
              ? 'Please complete your bank transfer using the details below.'
              : order.payment_type === 'later'
              ? 'Your order has been placed. Please complete payment within 24 hours.'
              : 'Thank you for your order. We\'ll send you a confirmation email shortly.'}
          </p>
        </div>

        {/* Order progress timeline / cancelled notice */}
        {order.status === 'cancelled' || order.payment_status === 'failed' ? (
          <OrderCancelledNotice />
        ) : (
          <OrderTimeline status={order.status} paymentStatus={order.payment_status || 'pending'} />
        )}

        {/* Deadline Alert — Pay Later and Bank Transfer */}
        {(isPayLater || isBankPending) && order.payment_deadline && (
          <div className={`rounded-xl p-4 mb-6 flex items-start gap-3 ${
            isDeadlineSoon ? 'bg-destructive/5 border border-red-500/20' : 'bg-warning/5 border border-warning/20'
          }`}>
            {isDeadlineSoon ? (
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            ) : (
              <Clock className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`font-medium ${isDeadlineSoon ? 'text-destructive' : 'text-warning'}`}>
                {isDeadlineSoon ? 'Payment deadline approaching!' : 'Payment pending'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Please complete payment by <strong>{formatDate(order.payment_deadline)}</strong>
                {isDeadlineSoon && ' (less than 2 hours remaining!)'}
              </p>
            </div>
          </div>
        )}

        {/* Pay Now Section — unpaid Pay Later orders */}
        {isPayLater && (
          <div className="bg-card border border-border rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Complete Payment
            </h2>

            {mpesaStatus === 'success' ? (
              <div className="text-center py-4">
                <Check className="w-12 h-12 text-success mx-auto mb-2" />
                <p className="text-success font-semibold">Payment successful!</p>
                <p className="text-muted-foreground text-sm mt-1">Refreshing order details...</p>
              </div>
            ) : order.payment_method === 'mpesa' ? (
              <div className="space-y-4">
                {mpesaStatus === 'idle' && (
                  <>
                    <Input
                      label="M-Pesa Phone Number"
                      type="tel"
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value)}
                      placeholder="0712 345 678"
                    />
                    <Button onClick={handlePayNowMpesa} className="w-full" disabled={paying}>
                      <Phone className="w-4 h-4 mr-2" /> Pay {formatPrice(Number(order.total_amount))} with M-Pesa
                    </Button>
                  </>
                )}
                {mpesaStatus === 'sending' && (
                  <div className="text-center py-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-2" />
                    <p className="text-muted-foreground">Sending payment request...</p>
                  </div>
                )}
                {mpesaStatus === 'sent' && (
                  <div className="text-center py-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-success border-t-transparent mx-auto mb-2" />
                    <p className="text-success font-medium">Payment request sent</p>
                    <p className="text-muted-foreground text-sm mt-1">Check your phone to complete payment.</p>
                    <div className="flex gap-3 justify-center mt-4">
                      <Button variant="outline" size="sm" onClick={handlePayNowMpesa} disabled={paying}>Resend STK Push</Button>
                      <Button variant="ghost" size="sm" onClick={() => setMpesaStatus('idle')}>Cancel</Button>
                    </div>
                  </div>
                )}
                {(mpesaStatus === 'error' || mpesaStatus === 'failed') && (
                  <div className="text-center py-4">
                    <XCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                    <p className="text-destructive font-medium">Payment failed</p>
                    <div className="flex gap-3 justify-center mt-4">
                      <Button variant="outline" size="sm" onClick={() => { setMpesaStatus('idle'); setMpesaPhone(''); }}>Try Again</Button>
                    </div>
                  </div>
                )}
                {mpesaStatus === 'cancelled' && (
                  <div className="text-center py-4">
                    <p className="text-foreground font-medium">Payment cancelled.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => setMpesaStatus('idle')}>Try Again</Button>
                  </div>
                )}
                {mpesaStatus === 'pending' && (
                  <div className="text-center py-4">
                    <p className="text-foreground font-medium">Payment is still being processed.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => { if (order) pollOrderStatus(order.id); }}>Check Status</Button>
                  </div>
                )}
              </div>
            ) : order.payment_method === 'card' ? (
              <CardPaymentForm
                amount={order.total_amount}
                orderId={order.id}
                formatPrice={formatPrice}
                onBack={() => {}}
              />
            ) : (
              <p className="text-muted-foreground text-sm">Payment method not available for online payment.</p>
            )}
          </div>
        )}

        {/* Bank Transfer Instructions */}
        {isBankPending && bankSettings && (
          <div className="bg-card border border-accent/30 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-accent" />
              Bank Transfer Instructions
            </h2>
            <div className="space-y-3 text-sm">
              {bankSettings.bankName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bank:</span>
                  <span className="text-foreground font-medium">{bankSettings.bankName}</span>
                </div>
              )}
              {bankSettings.bankAccountName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account Name:</span>
                  <span className="text-foreground font-medium">{bankSettings.bankAccountName}</span>
                </div>
              )}
              {bankSettings.bankAccountNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account Number:</span>
                  <span className="text-foreground font-mono font-medium">{formatBankAccount(bankSettings.bankAccountNumber)}</span>
                </div>
              )}
              {bankSettings.bankBranch && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Branch:</span>
                  <span className="text-foreground font-medium">{bankSettings.bankBranch}</span>
                </div>
              )}
              {bankSettings.bankSwiftCode && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SWIFT/BIC:</span>
                  <span className="text-foreground font-mono font-medium">{bankSettings.bankSwiftCode}</span>
                </div>
              )}
              <div className="border-t border-border pt-3 mt-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount to Transfer:</span>
                  <span className="text-foreground font-bold text-lg">{formatPrice(order.total_amount)}</span>
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-muted-foreground">Payment Reference:</span>
                  <span className="text-accent font-mono font-bold text-lg">{order.order_number}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 p-3 bg-accent/5 border border-accent/20 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Use your order number <strong className="text-accent">{order.order_number}</strong> as the payment reference. Your order will be confirmed after we verify your payment. If payment is not received by the deadline, the order will be automatically cancelled.
              </p>
            </div>
          </div>
        )}

        {/* Order Number */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Order Number</p>
              <p className="text-xl font-bold text-foreground">{order.order_number}</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </Badge>
              <Badge variant={order.payment_status === 'paid' ? 'default' : order.payment_status === 'failed' ? 'destructive' : 'secondary'}>
                {order.payment_status.charAt(0).toUpperCase() + order.payment_status.slice(1)}
              </Badge>
            </div>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {formatDate(order.created_at)}
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {formatShippingAddress(order.shipping_address)}
            </span>
            <span className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              {deliveryLabels[order.delivery_method] || order.delivery_method}
            </span>
          </div>
        </div>

        {/* Delivery Method */}
        {order.delivery_method && (
          <div className="bg-card border border-border rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <DeliveryIcon className="w-5 h-5 text-primary" />
              Delivery Method
            </h2>
            <div className="text-sm">
              <span className="text-muted-foreground">Method: </span>
              <span className="text-foreground font-medium">{deliveryLabels[order.delivery_method] || order.delivery_method}</span>
              {order.delivery_cost > 0 && (
                <span className="text-muted-foreground ml-4">Cost: {formatPrice(order.delivery_cost)}</span>
              )}
              {order.delivery_method !== 'pickup' && (
                <p className="text-foreground font-medium mt-2">Estimated delivery: {getDeliveryDateRange()}</p>
              )}
              {order.delivery_method === 'pickup' && (
                <p className="text-foreground font-medium mt-2">{getDeliveryDateRange()}</p>
              )}
            </div>
          </div>
        )}

        {/* M-Pesa Payment Details */}
        {order.payment_method === 'mpesa' && (
          <div className="bg-card border border-border rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-success" />
              M-Pesa Payment
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Payment Method:</span>
                <span className="text-foreground ml-2 font-medium">M-Pesa</span>
              </div>
              <div>
                <span className="text-muted-foreground">Payment Status:</span>
                <span className="ml-2">
                  {order.payment_status === 'paid' ? (
                    <Badge variant="default" className="bg-success">Paid</Badge>
                  ) : order.payment_status === 'failed' ? (
                    <Badge variant="destructive">Failed</Badge>
                  ) : (
                    <Badge variant="secondary">Pending</Badge>
                  )}
                </span>
              </div>
              {order.mpesa_transaction_id && (
                <div>
                  <span className="text-muted-foreground">Transaction ID:</span>
                  <span className="text-foreground ml-2 font-mono text-xs">{order.mpesa_transaction_id}</span>
                </div>
              )}
              {order.paid_at && (
                <div>
                  <span className="text-muted-foreground">Paid At:</span>
                  <span className="text-foreground ml-2">{new Date(order.paid_at).toLocaleString()}</span>
                </div>
              )}
              {(order.payment_status === 'pending' || order.payment_status === 'failed') && (
                <div className="col-span-2 mt-2 p-3 bg-warning/5 border border-warning/20 rounded-lg flex items-start gap-2">
                  {order.payment_status === 'failed' ? (
                    <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  ) : (
                    <Clock className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  )}
                  <p className="text-sm text-muted-foreground">
                    {order.payment_status === 'failed'
                      ? 'Payment failed. Please contact support to complete your order.'
                      : 'Payment is still being processed. You may need to complete the M-Pesa prompt on your phone.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Order Items */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Order Summary</h2>
          <div className="space-y-4">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-4 py-3 border-b border-border last:border-0">
                {productImages[item.product_id] && (
                  <div className="w-14 h-14 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                    <SafeImg src={productImages[item.product_id]} alt={item.product_name} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-medium truncate">{item.product_name}</p>
                  {item.variant_attributes && (
                    <p className="text-xs text-muted-foreground">
                      {Object.values(item.variant_attributes).join(', ')}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {item.quantity} &times; {formatPrice(item.product_price)}
                  </p>
                </div>
                <p className="text-foreground font-semibold">{formatPrice(item.total_price)}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatPrice(order.total_amount - order.shipping_cost - order.tax_amount)}</span>
            </div>
            {order.shipping_cost > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Shipping</span>
                <span>{formatPrice(order.shipping_cost)}</span>
              </div>
            )}
            {order.tax_amount > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Tax</span>
                <span>{formatPrice(order.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-foreground pt-2 border-t border-border">
              <span>Total</span>
              <span>{formatPrice(order.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Shipping Address */}
        <div className="bg-card border border-border rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-2">Shipping Address</h2>
          <p className="text-muted-foreground whitespace-pre-line">
            {formatShippingAddress(order.shipping_address)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Link to="/" className="flex-1">
            <Button className="w-full">
              <ShoppingBag className="h-4 w-4 mr-2" />
              Continue Shopping
            </Button>
          </Link>
          <Link to="/orders" className="flex-1">
            <Button variant="outline" className="w-full">
              <Package className="h-4 w-4 mr-2" />
              View All Orders
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
