import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreditCard, Smartphone, Building2, Check, Tag, Loader2, Phone, ArrowRight, ArrowLeft, Clock, Shield, ShoppingCart, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { createOrder, type ShippingAddress } from '../utils/orderUtils';
import { DeliveryMethodSelector, type DeliveryMethod } from '../components/checkout/DeliveryMethodSelector';
import { CardPaymentForm } from '../components/checkout/CardPaymentForm';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { KENYA_COUNTIES, getTownsForCounty } from '../data/kenya-counties';
import { formatPrice } from '../config/pricing';
import { getShippingCostFor } from '../lib/settings';
import { useSettings } from '../hooks/useSettings';
import { useCartStockValidation } from '../hooks/useCartStockValidation';
import { validateCartStock } from '../lib/cartStock';
import type { CartStockReport } from '../lib/cartStock';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { SafeImg } from '../components/SafeImg';

const STEPS = ['Shipping', 'Payment'] as const;
type Step = (typeof STEPS)[number];

function isValidKenyanPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('07')) return true;
  if (digits.length === 12 && digits.startsWith('254')) return true;
  return false;
}

// Bounds a promise so a stalled request cannot leave the UI on an indefinite
// loading spinner. M-Pesa STK initiation must surface an error within ~40s.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export function Checkout() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { cartItems, cartTotal, clearCart } = useCart();
  const { settings, loading: settingsLoading } = useSettings();
  const { report: stockReport } = useCartStockValidation(cartItems);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('Shipping');
  const [selectedPayment, setSelectedPayment] = useState('mpesa');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('standard');
  const [paymentType, setPaymentType] = useState<'now' | 'later'>('now');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  const [formData, setFormData] = useState<ShippingAddress>({
    full_name: '',
    phone: '',
    address: '',
    city: '',
    county: '',
  });

  const [errors, setErrors] = useState<Partial<ShippingAddress>>({});
  // A submit-time re-check is fresher than the mount-time report, so it wins
  // while the user is still on this screen.
  const [submitStockReport, setSubmitStockReport] = useState<CartStockReport | null>(null);
  const stockIssues = (submitStockReport ?? stockReport).issues;
  const stockNotices = (submitStockReport ?? stockReport).notices;

  const [orderCreated, setOrderCreated] = useState<any>(null);
  const [mpesaPhone, setMpesaPhone] = useState(profile?.phone || '');
  const [mpesaStatus, setMpesaStatus] = useState<'idle' | 'sending' | 'sent' | 'success' | 'error' | 'cancelled' | 'failed' | 'pending'>('idle');
  const [resendCooldown, setResendCooldown] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      cooldownRef.current = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
    }
  }, [resendCooldown > 0]);

  if (!settingsLoading) {
    if (deliveryMethod === 'express' && !settings.expressEnabled) setDeliveryMethod('standard');
    if (deliveryMethod === 'pickup' && !settings.pickupEnabled) setDeliveryMethod('standard');
    if (selectedPayment === 'mpesa' && !settings.mpesaEnabled) {
      setSelectedPayment(settings.cardEnabled ? 'card' : settings.bankTransferEnabled ? 'bank' : 'mpesa');
    } else if (selectedPayment === 'card' && !settings.cardEnabled) {
      setSelectedPayment(settings.mpesaEnabled ? 'mpesa' : settings.bankTransferEnabled ? 'bank' : 'card');
    } else if (selectedPayment === 'bank' && !settings.bankTransferEnabled) {
      setSelectedPayment(settings.mpesaEnabled ? 'mpesa' : settings.cardEnabled ? 'card' : 'bank');
    }
    if (paymentType === 'later' && !settings.bankPayLaterEnabled) setPaymentType('now');
  }

  const shipping = getShippingCostFor(deliveryMethod, formData.county, settings);
  const taxRate = settings.taxRate / 100;
  const tax = Math.round(cartTotal * taxRate * 100) / 100;
  let discount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discount_type === 'percentage') {
      discount = (cartTotal * appliedCoupon.discount_value) / 100;
      if (appliedCoupon.max_discount && discount > appliedCoupon.max_discount) {
        discount = appliedCoupon.max_discount;
      }
    } else {
      discount = appliedCoupon.discount_value;
    }
  }
  const total = cartTotal + shipping + tax - discount;

  const validateForm = (): Partial<ShippingAddress> => {
    const newErrors: Partial<ShippingAddress> = {};
    if (!formData.full_name.trim()) newErrors.full_name = 'Full name is required';
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!isValidKenyanPhone(formData.phone.trim())) {
      newErrors.phone = 'Please enter a valid phone number';
    }
    if (!formData.address.trim()) newErrors.address = 'Address is required';
    if (!formData.city.trim()) newErrors.city = 'Please select a city/town';
    if (!formData.county.trim()) newErrors.county = 'Please select a county';
    setErrors(newErrors);
    return newErrors;
  };

  const FIELD_ORDER = ['full_name', 'phone', 'address', 'city', 'county'] as const;

  const focusFirstInvalid = (errs: Partial<ShippingAddress>) => {
    for (const name of FIELD_ORDER) {
      if (errs[name]) {
        const el = document.querySelector(`[name="${name}"]`);
        if (el instanceof HTMLElement) el.focus();
        break;
      }
    }
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) { setCouponError('Enter a coupon code'); return; }
    setCouponLoading(true);
    setCouponError('');
    try {
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', couponCode.toUpperCase())
        .eq('is_active', true)
        .single();
      if (error || !data) { setCouponError('Invalid coupon code'); setCouponLoading(false); return; }
      if (data.expires_at && new Date(data.expires_at) < new Date()) { setCouponError('This coupon has expired'); setCouponLoading(false); return; }
      if (data.usage_limit && data.used_count >= data.usage_limit) { setCouponError('This coupon has reached its usage limit'); setCouponLoading(false); return; }
      if (data.min_spend > 0 && cartTotal < data.min_spend) { setCouponError(`Minimum spend of ${formatPrice(data.min_spend)} required`); setCouponLoading(false); return; }
      setAppliedCoupon(data);
      toast.success(`Coupon applied! ${data.discount_type === 'percentage' ? `${data.discount_value}% off` : `${formatPrice(data.discount_value)} off`}`);
    } catch { setCouponError('Failed to validate coupon'); } finally { setCouponLoading(false); }
  };

  const removeCoupon = () => { setAppliedCoupon(null); setCouponCode(''); setCouponError(''); };

  const goToStep = (s: Step) => {
    if (s === 'Payment') {
      const errs = validateForm();
      if (Object.keys(errs).length > 0) {
        focusFirstInvalid(errs);
        return;
      }
    }
    setStep(s);
  };

  const handlePlaceOrder = async () => {
    if (!user) { toast.error('Please sign in to complete your order'); navigate('/login'); return; }
    if (cartItems.length === 0) { toast.error('Your cart is empty'); navigate('/cart'); return; }
    if (settingsLoading) { toast.error('Please wait while checkout settings load'); return; }

    if (paymentType === 'later' && !settings.bankPayLaterEnabled) {
      toast.error('Pay Later is currently disabled'); return;
    }
    if (selectedPayment === 'mpesa' && !settings.mpesaEnabled) {
      toast.error('M-Pesa payments are currently disabled'); return;
    }
    if (selectedPayment === 'card' && !settings.cardEnabled) {
      toast.error('Card payments are currently disabled'); return;
    }
    if (selectedPayment === 'bank' && !settings.bankTransferEnabled) {
      toast.error('Bank transfer is currently disabled'); return;
    }
    if (deliveryMethod === 'express' && !settings.expressEnabled) {
      toast.error('Express delivery is currently disabled'); return;
    }
    if (deliveryMethod === 'pickup' && !settings.pickupEnabled) {
      toast.error('Store pickup is currently disabled'); return;
    }

    const vendorIds = new Set(cartItems.map((item) => (item.products as { vendor_id?: string } | undefined)?.vendor_id).filter(Boolean));
    if (vendorIds.size > 1) {
      toast.error('Please checkout items from one vendor at a time.');
      return;
    }

    // Re-check live stock at the last possible moment so the shopper is not
    // pushed into a payment step for something that can no longer ship.
    // create_order still re-validates and locks stock; this only warns sooner.
    const stockCheck = await validateCartStock(cartItems);
    if (stockCheck.checked && !stockCheck.ok) {
      setSubmitStockReport(stockCheck);
      toast.error(stockCheck.issues[0].message);
      return;
    }

    setLoading(true);

    try {
      const order = await createOrder(
        cartItems, formData, selectedPayment,
        appliedCoupon?.code, deliveryMethod, paymentType,
      );
      if (!order) throw new Error('Failed to create order');

      // Bank transfer and Pay Later are paid outside this flow: their "order
      // placed" email is sent immediately and the cart is cleared. M-Pesa and
      // card (Pay Now) keep the cart until payment succeeds, so a cancelled/
      // failed payment can be retried from checkout; their confirmation email
      // is sent server-side after payment is confirmed.
      const isPayLater = paymentType === 'later' && selectedPayment !== 'bank';
      const isDeferred = selectedPayment === 'bank' || isPayLater;

      if (isDeferred) {
        try {
          await supabase.functions.invoke('send-order-email', {
            body: { order_id: order.id },
          });
        } catch { toast.warning('Order placed, but email confirmation could not be sent.'); }

        await clearCart();
        toast.success('Order placed successfully!');
        navigate(`/order-confirmation/${order.id}`);
        return;
      }

      // Coupon usage was already recorded server-side inside create_order.
      if (selectedPayment === 'mpesa') {
        setOrderCreated(order);
      } else if (selectedPayment === 'card') {
        setOrderCreated(order);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  const handleMpesaPayment = async () => {
    if (!mpesaPhone.trim()) { toast.error('Please enter your M-Pesa phone number'); return; }
    if (!orderCreated) return;

    setMpesaStatus('sending');
    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('mpesa-stk-push', {
          body: { phoneNumber: mpesaPhone, amount: Math.round(Number(orderCreated.total_amount)), orderId: orderCreated.id },
        }),
        40000,
        'M-Pesa did not respond. Please try again.',
      );

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setMpesaStatus('sent');
      setResendCooldown(15);
      toast.success('Payment request sent. Check your phone to complete payment.');

      pollPaymentStatus(orderCreated.id);
    } catch (error: any) {
      toast.error(error.message || 'Failed to initiate M-Pesa payment');
      setMpesaStatus('error');
    }
  };

  const stopPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = null;
  };

  // Reads the authoritative order state and applies the matching UI state.
  // Returns the verdict so the poller can decide whether to keep waiting.
  const applyMpesaStatus = async (orderId: string): Promise<'paid' | 'cancelled' | 'failed' | 'pending'> => {
    const { data, error } = await supabase
      .from('orders')
      .select('payment_status, status, payment_error')
      .eq('id', orderId)
      .single();

    // A read failure is not a payment verdict; keep waiting.
    if (error || !data) return 'pending';

    if (data.payment_status === 'paid') {
      stopPolling();
      setMpesaStatus('success');
      toast.success('Payment successful. Confirming your order...');
      await clearCart();
      setTimeout(() => navigate(`/order-confirmation/${orderId}`), 1500);
      return 'paid';
    }

    if (data.payment_status === 'failed' || data.status === 'cancelled') {
      stopPolling();
      const isCancellation = /cancel/i.test(String(data.payment_error || ''));
      setMpesaStatus(isCancellation ? 'cancelled' : 'failed');
      if (isCancellation) {
        toast.info('Payment cancelled. Your order was not paid.');
      } else {
        toast.error('Payment failed. Please try again.');
      }
      return isCancellation ? 'cancelled' : 'failed';
    }

    return 'pending';
  };

  const pollPaymentStatus = (orderId: string) => {
    let attempts = 0;
    const maxAttempts = 30;

    stopPolling();

    pollingRef.current = setInterval(async () => {
      attempts++;
      const verdict = await applyMpesaStatus(orderId);
      if (verdict !== 'pending') return;
      if (attempts >= maxAttempts) {
        stopPolling();
        setMpesaStatus('pending');
        toast.info('Payment is still being processed. Please wait while we confirm it.');
      }
    }, 5000);
  };

  const handleCheckPaymentStatus = async () => {
    if (!orderCreated) return;
    const verdict = await applyMpesaStatus(orderCreated.id);
    if (verdict === 'pending') {
      toast.info('Payment is still being processed.');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleCountyChange = (value: string) => {
    const towns = getTownsForCounty(value);
    setFormData(prev => ({
      ...prev,
      county: value,
      city: towns.includes(prev.city) ? prev.city : '',
    }));
    setErrors(prev => ({ ...prev, county: '', city: '' }));
  };

  const handleCityChange = (value: string) => {
    setFormData(prev => ({ ...prev, city: value }));
    setErrors(prev => ({ ...prev, city: '' }));
  };

  // M-Pesa Payment Screen
  if (orderCreated && selectedPayment === 'mpesa') {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <div className="max-w-lg mx-auto px-4 py-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-success/20">
              <Smartphone className="w-10 h-10 text-success" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Complete M-Pesa Payment</h2>
            <p className="text-muted-foreground mb-2">Order: {orderCreated.order_number}</p>
            <p className="text-3xl font-bold text-primary mb-8">{formatPrice(Number(orderCreated.total_amount))}</p>

            {mpesaStatus === 'idle' && (
              <div className="space-y-4">
                <Input
                  label="M-Pesa Phone Number"
                  type="tel"
                  value={mpesaPhone}
                  onChange={(e) => setMpesaPhone(e.target.value)}
                  placeholder="0712 345 678"
                />
                <Button onClick={handleMpesaPayment} className="w-full py-4 text-lg gap-2">
                  <Phone className="w-5 h-5" /> Pay with M-Pesa
                </Button>
              </div>
            )}

            {mpesaStatus === 'sending' && (
              <div className="space-y-4">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                <p className="text-muted-foreground">Sending payment request...</p>
              </div>
            )}

            {mpesaStatus === 'sent' && (
              <div className="space-y-4">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-success" />
                <p className="text-success font-medium">Payment request sent</p>
                <p className="text-muted-foreground text-sm mb-2">
                  Check your phone to complete payment.
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>Complete the payment on your phone...</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleMpesaPayment}
                    disabled={resendCooldown > 0}
                    className="gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend STK Push'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/cart')}>
                    Cancel & Back to Cart
                  </Button>
                </div>
              </div>
            )}

            {mpesaStatus === 'success' && (
              <div className="space-y-4">
                <Check className="w-12 h-12 text-success mx-auto" />
                <p className="text-success font-semibold text-lg">Payment successful. Confirming your order...</p>
                <p className="text-muted-foreground">Redirecting to order confirmation...</p>
              </div>
            )}

            {mpesaStatus === 'error' && (
              <div className="space-y-4">
                <p className="text-destructive font-medium">Payment failed. Please try again.</p>
                <p className="text-muted-foreground text-sm">You can try again or check your order status later.</p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button variant="outline" onClick={() => { setMpesaStatus('idle'); setMpesaPhone(''); }}>
                    Try Again
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/cart')}>
                    Back to Cart
                  </Button>
                  <Button onClick={() => navigate(`/order-confirmation/${orderCreated.id}`)}>
                    View Order
                  </Button>
                </div>
              </div>
            )}

            {mpesaStatus === 'cancelled' && (
              <div className="space-y-4">
                <p className="text-foreground font-medium">Payment cancelled. Your order was not paid.</p>
                <p className="text-muted-foreground text-sm">You can try again from checkout or check your order status later.</p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button onClick={() => navigate('/cart')}>
                    Back to Cart
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/order-confirmation/${orderCreated.id}`)}>
                    View Order
                  </Button>
                </div>
              </div>
            )}

            {mpesaStatus === 'failed' && (
              <div className="space-y-4">
                <p className="text-destructive font-medium">Payment failed. Please try again.</p>
                <p className="text-muted-foreground text-sm">You can try again from checkout or check your order status later.</p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button onClick={() => navigate('/cart')}>
                    Back to Cart
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/order-confirmation/${orderCreated.id}`)}>
                    View Order
                  </Button>
                </div>
              </div>
            )}

            {mpesaStatus === 'pending' && (
              <div className="space-y-4">
                <p className="text-foreground font-medium">Payment is still being processed. Please wait while we confirm it.</p>
                <p className="text-muted-foreground text-sm">You can check again or check your order status later.</p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button onClick={handleCheckPaymentStatus}>
                    Check Payment Status
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/cart')}>
                    Back to Cart
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/order-confirmation/${orderCreated.id}`)}>
                    View Order
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  // Card Payment Screen
  if (orderCreated && selectedPayment === 'card') {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <div className="max-w-lg mx-auto px-4 py-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-primary/20">
              <CreditCard className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-center mb-2">Complete Card Payment</h2>
            <p className="text-muted-foreground text-center mb-2">Order: {orderCreated.order_number}</p>
            <p className="text-3xl font-bold text-primary text-center mb-8">{formatPrice(Number(orderCreated.total_amount))}</p>
            <CardPaymentForm
              amount={orderCreated.total_amount}
              orderId={orderCreated.id}
              formatPrice={formatPrice}
              onBack={() => { setOrderCreated(null); }}
            />
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  // Empty cart
  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl p-12 border border-border text-center">
            <h2 className="text-2xl font-semibold mb-2">Your cart is empty</h2>
            <p className="text-muted-foreground mb-6">Add items to your cart before checkout</p>
            <Button onClick={() => navigate('/')}>Continue Shopping</Button>
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  // Step indicator
  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold mb-8">Checkout</h1>

        {/* Steps */}
        <div className="flex items-center gap-2 mb-8 flex-wrap">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <button
                onClick={() => i < stepIndex ? setStep(s) : undefined}
                aria-current={i === stepIndex ? 'step' : undefined}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  i === stepIndex ? 'bg-primary text-primary-foreground' :
                  i < stepIndex ? 'bg-primary/10 text-primary cursor-pointer' :
                  'bg-muted text-muted-foreground cursor-default'
                }`}
              >
                {i < stepIndex ? <Check className="w-4 h-4" /> : <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs border-current">{i + 1}</span>}
                {s}
              </button>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {/* Step 1: Shipping + Delivery */}
            {step === 'Shipping' && (
              <div className="space-y-6">
                <div className="bg-card rounded-xl p-6 border border-border">
                  <h2 className="text-xl font-semibold mb-6">Shipping Address</h2>
                  <div className="space-y-4">
                    <Input label="Full Name *" type="text" name="full_name" value={formData.full_name} onChange={handleInputChange} placeholder="Enter your full name" error={errors.full_name} />
                    <Input label="Phone Number *" type="tel" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="+254 7XX XXX XXX" error={errors.phone} />
                    <Input label="Address *" type="text" name="address" value={formData.address} onChange={handleInputChange} placeholder="Street address, apartment, etc." error={errors.address} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label htmlFor="checkout-county" className="text-sm font-medium text-foreground">
                          County *
                        </label>
                        <Select value={formData.county} onValueChange={handleCountyChange}>
                          <SelectTrigger id="checkout-county" className="w-full" aria-invalid={errors.county ? true : undefined}>
                            <SelectValue placeholder="Select County" />
                          </SelectTrigger>
                          <SelectContent>
                            {KENYA_COUNTIES.map((county) => (
                              <SelectItem key={county.name} value={county.name}>
                                {county.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.county && (
                          <p id="checkout-county-error" role="alert" className="text-destructive text-sm mt-1">
                            {errors.county}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="checkout-city" className="text-sm font-medium text-foreground">
                          City/Town *
                        </label>
                        <Select
                          value={formData.city}
                          onValueChange={handleCityChange}
                          disabled={!formData.county}
                        >
                          <SelectTrigger id="checkout-city" className="w-full" aria-invalid={errors.city ? true : undefined}>
                            <SelectValue placeholder={formData.county ? 'Select City/Town' : 'Select County first'} />
                          </SelectTrigger>
                          <SelectContent>
                            {getTownsForCounty(formData.county).map((town) => (
                              <SelectItem key={town} value={town}>
                                {town}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.city && (
                          <p id="checkout-city-error" role="alert" className="text-destructive text-sm mt-1">
                            {errors.city}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-card rounded-xl p-6 border border-border">
                  <h2 className="text-xl font-semibold mb-6">Delivery Method</h2>
                  <DeliveryMethodSelector value={deliveryMethod} onChange={setDeliveryMethod} county={formData.county} settings={settings} />
                </div>

                <Button onClick={() => goToStep('Payment')} className="w-full py-4 text-lg gap-2">
                  Continue to Payment <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
            )}

            {/* Step 2: Payment */}
            {step === 'Payment' && (
              <div className="space-y-6">
                <div className="bg-card rounded-xl p-6 border border-border">
                  <h2 className="text-xl font-semibold mb-6">Payment Method</h2>
                  <div role="radiogroup" aria-label="Payment method" className="space-y-3">
                    {[
                      { id: 'mpesa', icon: Smartphone, bg: 'bg-success', label: 'M-Pesa', desc: 'STK Push to your phone — confirm on handset', enabled: settings.mpesaEnabled },
                      { id: 'card', icon: CreditCard, bg: 'bg-primary', label: 'Credit/Debit Card', desc: 'Paystack secure checkout — Visa, Mastercard', enabled: settings.cardEnabled },
                      { id: 'bank', icon: Building2, bg: 'bg-muted-foreground', label: 'Bank Transfer', desc: `Manual transfer — use order number as reference, ${settings.bankTransferDeadlineHours || 72}h deadline`, enabled: settings.bankTransferEnabled },
                    ].filter((p) => p.enabled).map(({ id, icon: Icon, bg, label, desc }) => (
                      <button key={id} type="button" role="radio" aria-checked={selectedPayment === id} aria-label={label} onClick={() => setSelectedPayment(id)}
                        className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-all ${selectedPayment === id ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'}`}>
                        <div className={`w-12 h-12 ${bg} rounded-lg flex items-center justify-center`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium">{label}</p>
                          <p className="text-sm text-muted-foreground">{desc}</p>
                        </div>
                        {selectedPayment === id && <Check className="w-5 h-5 text-primary" />}
                      </button>
                    ))}
                  </div>

                  {selectedPayment === 'mpesa' && (
                    <div className="mt-4 p-3 bg-success/5 border border-success/20 rounded-lg">
                      <p className="text-sm font-medium text-success mb-1">How M-Pesa works</p>
                      <p className="text-sm text-muted-foreground">
                        Tap Place Order → enter M-Pesa number → approve STK Push on your phone. Payment status is verified automatically. <span className="font-medium">Do not close this tab</span> until you see “Payment successful”.
                      </p>
                    </div>
                  )}

                  {selectedPayment === 'card' && (
                    <div className="mt-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-sm font-medium text-primary mb-1">How card payment works</p>
                      <p className="text-sm text-muted-foreground">
                        Tap Place Order → you’ll be redirected to Paystack’s secure hosted checkout. Complete payment there and you’ll return here. Status: <span className="font-medium">Pending until Paystack confirms</span>.
                      </p>
                    </div>
                  )}

                  {selectedPayment === 'bank' && (
                    <div className="mt-4 p-3 bg-accent/5 border border-accent/20 rounded-lg">
                      <p className="text-sm font-medium text-foreground mb-1">Bank transfer — manual verification</p>
                      <p className="text-sm text-muted-foreground">
                        After Place Order you’ll see account details + your order number as reference. Transfer within <span className="font-medium">{settings.bankTransferDeadlineHours || 72} hours</span>. Status stays <span className="font-medium">Awaiting payment</span> until admin verifies — no auto-confirmation.
                      </p>
                    </div>
                  )}
                </div>

                {/* Pay Now / Pay Later Toggle */}
                {settings.bankPayLaterEnabled && (
                <div className="bg-card rounded-xl p-6 border border-border">
                  <h2 className="text-xl font-semibold mb-4">Payment Type</h2>
                  <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Payment type">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={paymentType === 'now'}
                      onClick={() => setPaymentType('now')}
                      className={`flex items-center gap-3 p-4 rounded-lg border transition-all ${
                        paymentType === 'now' ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'
                      }`}
                    >
                      <Shield className={`w-5 h-5 ${paymentType === 'now' ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div className="text-left">
                        <p className="font-medium text-sm">Pay Now</p>
                        <p className="text-xs text-muted-foreground">Pay immediately</p>
                      </div>
                      {paymentType === 'now' && <Check className="w-4 h-4 text-primary ml-auto" />}
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={paymentType === 'later'}
                      onClick={() => setPaymentType('later')}
                      className={`flex items-center gap-3 p-4 rounded-lg border transition-all ${
                        paymentType === 'later' ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'
                      }`}
                    >
                      <Clock className={`w-5 h-5 ${paymentType === 'later' ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div className="text-left">
                        <p className="font-medium text-sm">Pay Later</p>
                        <p className="text-xs text-muted-foreground">Reserve 24 hrs to pay</p>
                      </div>
                      {paymentType === 'later' && <Check className="w-4 h-4 text-primary ml-auto" />}
                    </button>
                  </div>
                  {paymentType === 'later' && (
                    <p className="text-xs text-muted-foreground mt-3 border-l-2 border-warning/40 pl-3">
                      <span className="font-medium text-foreground">Pay Later:</span> {selectedPayment === 'bank'
                        ? `Stock reserved 24h. Complete bank transfer within ${settings.bankTransferDeadlineHours || 72}h — order shows “Unpaid / Bank Transfer Pending” until verified, then moves to Processing.`
                        : 'Stock reserved 24h. Complete payment from My Orders → Pay Now. Until then status is “Unpaid” and order is not yet being prepared.'}
                    </p>
                  )}
                </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep('Shipping')} className="flex-1 gap-2">
                    <ArrowLeft className="w-5 h-5" /> Back to Shipping
                  </Button>
                  <Button onClick={handlePlaceOrder} className="flex-1 gap-2" disabled={loading || settingsLoading}>
                    {loading ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Creating Order...</>
                    ) : (
                      <><ShoppingCart className="w-5 h-5" /> Place Order</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-card rounded-xl p-6 border border-border sticky top-24">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Order Summary</h2>
                <Link to="/cart" className="text-sm text-primary hover:text-primary/80 transition-colors">
                  Edit Cart
                </Link>
              </div>

              <div className="mb-6 p-3 bg-muted rounded-lg border border-border">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-success" />
                      <span className="text-sm font-medium text-success">{appliedCoupon.code}</span>
                      <Badge variant="default" className="text-xs">
                        {appliedCoupon.discount_type === 'percentage' ? `-${appliedCoupon.discount_value}%` : `-KES ${appliedCoupon.discount_value}`}
                      </Badge>
                    </div>
                    <button onClick={removeCoupon} className="text-xs text-destructive hover:text-destructive/80">Remove</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input placeholder="Coupon code" value={couponCode} onChange={(e) => { setCouponCode(e.target.value); setCouponError(''); }} className="flex-1 text-sm" />
                    <Button size="sm" variant="outline" onClick={applyCoupon} disabled={couponLoading}>{couponLoading ? '...' : 'Apply'}</Button>
                  </div>
                )}
                {couponError && <p role="alert" className="text-xs text-destructive mt-1">{couponError}</p>}
              </div>

              {stockIssues.length > 0 && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3"
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                    {stockIssues.length === 1
                      ? '1 item is no longer available'
                      : `${stockIssues.length} items are no longer available`}
                  </p>
                  <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-destructive">
                    {stockIssues.map((issue) => (
                      <li key={issue.cartItemId}>{issue.message}</li>
                    ))}
                  </ul>
                  <Link
                    to="/cart"
                    className="mt-2 inline-block text-xs font-medium text-destructive underline underline-offset-2"
                  >
                    Update your cart
                  </Link>
                </div>
              )}

              {stockNotices.length > 0 && stockIssues.length === 0 && (
                <p role="status" className="mb-4 text-xs text-amber-600 dark:text-amber-500">
                  {stockNotices.map((notice) => notice.message).join(' ')}
                </p>
              )}

              <div className="space-y-4 mb-6 max-h-80 overflow-y-auto">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                      {item.products?.images && item.products.images[0] && (
                        <SafeImg src={item.products.images[0]} alt={item.products.name} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground font-medium text-sm truncate">{item.products?.name}</p>
                      {item.variant_attributes && (
                        <p className="text-muted-foreground text-xs">{Object.values(item.variant_attributes).join(', ')}</p>
                      )}
                      <p className="text-muted-foreground text-sm">Qty: {item.quantity}</p>
                      <p className="text-primary font-semibold text-sm">{formatPrice((item.variant_price || item.products?.price || 0) * item.quantity)}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4 border-t border-border pt-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground">{formatPrice(cartTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="text-foreground">{shipping === 0 ? 'Free' : formatPrice(shipping)}</span>
                </div>
                {step !== 'Shipping' && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Delivery method</span>
                    <span className="capitalize">{deliveryMethod}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax ({(taxRate * 100).toFixed(0)}%)</span>
                  <span className="text-foreground">{formatPrice(tax)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-success">
                    <span>Discount</span>
                    <span>-{formatPrice(discount)}</span>
                  </div>
                )}
                <div className="border-t border-border pt-4">
                  <div className="flex justify-between">
                    <span className="text-foreground font-semibold">Total</span>
                    <span className="text-foreground font-bold text-xl">{formatPrice(total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
