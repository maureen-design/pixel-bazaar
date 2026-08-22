import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import { useSettings } from '../../hooks/useSettings';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const rawNext = searchParams.get('next') || '';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const isCheckoutIntent = next === '/checkout';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      toast.success(isCheckoutIntent ? "You're almost there — finishing your purchase!" : 'Welcome back!');
      navigate(next);
    } catch (error: any) {
      toast.error(error.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const signupLink = `/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;

  const checkoutBenefits = [
    'Keep your cart connected to your account',
    'Track your orders',
    'Save products to your wishlist',
    'Receive order confirmations and updates',
  ];

  return (
    <AuthLayout
      title={isCheckoutIntent ? "You're almost there!" : 'Welcome back'}
      subtitle={
        isCheckoutIntent
          ? 'Your cart is ready. Sign in to continue to checkout.'
          : `Sign in to your ${settings.siteName} account.`
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="flex items-center justify-between">
          <Link to="/forgot-password" className="text-sm text-primary hover:text-primary/80">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          Sign In
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{' '}
          <Link to={signupLink} className="text-primary hover:text-primary/80">
            Sign up
          </Link>
        </p>
      </form>

      {isCheckoutIntent && (
        <div className="mt-6 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground mb-3">
            Sign in to keep shopping with:
          </p>
          <ul className="space-y-2">
            {checkoutBenefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check aria-hidden="true" className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      )}
    </AuthLayout>
  );
}