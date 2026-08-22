import { useState } from 'react';
import { CreditCard, Lock, Check } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { supabase } from '../../lib/supabaseClient';

interface CardPaymentFormProps {
  amount: number;
  orderId?: string;
  formatPrice: (n: number) => string;
  onSuccess: () => void;
  onBack: () => void;
}

export function CardPaymentForm({ amount, orderId, formatPrice, onSuccess, onBack }: CardPaymentFormProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke('process-card-payment', {
        body: {
          amount: Math.round(amount),
          currency: 'KES',
          cardNumber: cardNumber.replace(/\s/g, ''),
          expiry,
          cvv,
          orderId,
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data.error || 'Payment failed');

      setProcessing(false);
      setDone(true);
      setTimeout(onSuccess, 1000);
    } catch (err: any) {
      setError(err.message || 'Payment failed');
      setProcessing(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-8">
        <Check className="w-12 h-12 text-success mx-auto mb-4" />
        <p className="text-success font-semibold text-lg">Payment successful!</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-card rounded-xl p-6 border border-border">
        <div className="flex items-center gap-2 mb-6">
          <CreditCard className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Card Payment</h3>
          <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
            <Lock className="w-3 h-3" /> Secured
          </span>
        </div>

        <div className="space-y-4">
          <Input
            label="Card Number"
            placeholder="4242 4242 4242 4242"
            value={cardNumber}
            onChange={e => setCardNumber(e.target.value)}
            maxLength={19}
            required
            inputMode="numeric"
            autoComplete="cc-number"
          />
          <Input
            label="Cardholder Name"
            placeholder="John Doe"
            value={cardName}
            onChange={e => setCardName(e.target.value)}
            required
            autoComplete="cc-name"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Expiry"
              placeholder="MM/YY"
              value={expiry}
              onChange={e => setExpiry(e.target.value)}
              maxLength={5}
              required
              inputMode="numeric"
              autoComplete="cc-exp"
            />
            <Input
              label="CVV"
              type="password"
              placeholder="***"
              value={cvv}
              onChange={e => setCvv(e.target.value)}
              maxLength={4}
              required
              inputMode="numeric"
              autoComplete="cc-csc"
            />
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">
        You will be charged <strong className="text-foreground">{formatPrice(amount)}</strong>
      </p>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1" disabled={processing}>
          Back
        </Button>
        <Button type="submit" className="flex-1" disabled={processing}>
          {processing ? 'Processing...' : `Pay ${formatPrice(amount)}`}
        </Button>      </div>
    </form>
  );
}
