import { useState, useEffect, useRef } from 'react';
import { CreditCard, Lock, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { supabase } from '../../lib/supabaseClient';

// Card payments are handled by Paystack's hosted checkout: this component
// starts a checkout session server-side and redirects to it. No card data is
// ever collected or transmitted by this app.
interface CardPaymentFormProps {
  amount: number;
  orderId?: string;
  formatPrice: (n: number) => string;
  onBack?: () => void;
}

export function CardPaymentForm({ amount, orderId, formatPrice, onBack }: CardPaymentFormProps) {
  const [status, setStatus] = useState<'starting' | 'redirecting' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const startedRef = useRef(false);

  const startCheckout = async () => {
    if (!orderId) {
      setErrorMsg('Missing order reference.');
      setStatus('error');
      return;
    }
    setStatus('starting');
    setErrorMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('create-paystack-checkout', {
        body: { orderId },
      });
      if (error) throw new Error(error.message);
      if (!data?.success || !data?.authorization_url) {
        throw new Error(data?.error || 'Could not start the card payment.');
      }
      setStatus('redirecting');
      window.location.href = data.authorization_url;
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not start the card payment. Please try again.');
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      startCheckout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = status === 'starting' || status === 'redirecting';

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl p-6 border border-border">
        <div className="flex items-center gap-2 mb-6">
          <CreditCard className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Secure Card Payment</h3>
          <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
            <Lock className="w-3 h-3" /> Secured by Paystack
          </span>
        </div>

        {busy ? (
          <div className="text-center py-8" role="status">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
            <p className="font-medium">
              {status === 'starting'
                ? 'Starting your secure payment…'
                : 'Redirecting to the secure Paystack checkout…'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              You will be charged <strong className="text-foreground">{formatPrice(amount)}</strong>.
              Card details are entered on Paystack&apos;s encrypted page — never in this app.
            </p>
          </div>
        ) : (
          <div role="alert" className="text-center py-4">
            <AlertCircle aria-hidden="true" className="w-8 h-8 text-destructive mx-auto mb-3" />
            <p className="text-destructive font-medium mb-1">{errorMsg}</p>
            <p className="text-sm text-muted-foreground">
              Your order is safe — you can retry or go back and choose another payment method.
            </p>
          </div>
        )}
      </div>

      {!busy && (
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button type="button" onClick={startCheckout} className="flex-1">
            Retry Payment
          </Button>
        </div>
      )}
    </div>
  );
}
