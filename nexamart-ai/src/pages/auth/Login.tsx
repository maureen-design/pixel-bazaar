import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { toast } from 'sonner';
import { useSettings } from '../../hooks/useSettings';
import { checkRateLimit, getRemainingAttempts } from '../../lib/rateLimit';
import { loginSchema } from '../../lib/validations';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState('');
  const { signIn } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const rawNext = searchParams.get('next') || '';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const isCheckoutIntent = next === '/checkout';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach(issue => {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    const rateLimitKey = `login:${email.toLowerCase()}`;
    if (!checkRateLimit(rateLimitKey, 5, 60000)) {
      const remaining = getRemainingAttempts(rateLimitKey, 5);
      setFormError(`Too many attempts. Please try again in a minute. (${remaining} attempts remaining)`);
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      toast.success(isCheckoutIntent ? "You're almost there — finishing your purchase!" : 'Welcome back!');
      navigate(next);
    } catch (error: any) {
      setFormError(error.message || 'Invalid email or password');
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
          onChange={(e) => { setEmail(e.target.value); setErrors(prev => ({ ...prev, email: '' })); }}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          error={errors.email}
          required
        />
        <PasswordInput
          label="Password"
          placeholder="••••••••"
          value={password}
          onChange={(value) => { setPassword(value); setErrors(prev => ({ ...prev, password: '' })); }}
          error={errors.password}
          required
          autoComplete="current-password"
        />
        <div className="flex items-center justify-between">
          <Link to="/forgot-password" className="text-sm text-primary hover:text-primary/80">
            Forgot password?
          </Link>
        </div>
        {formError && (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </div>
        )}
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