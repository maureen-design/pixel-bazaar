import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { PasswordRequirements } from '../../components/ui/PasswordRequirements';
import { meetsAllRequirements, validateFullName } from '../../utils/passwordValidation';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import { checkRateLimit, getRemainingAttempts } from '../../lib/rateLimit';

export function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; password?: string; confirmPassword?: string }>({});
  const [loading, setLoading] = useState(false);
  // Set when Supabase reports the address is already registered. Kept as
  // state rather than a toast so the user gets two working exits instead of a
  // dead end.
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [formError, setFormError] = useState('');
  const { signUp } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const rawNext = searchParams.get('next') || '';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const isCheckoutIntent = next === '/checkout';

  const validate = (): boolean => {
    const errs: { fullName?: string; email?: string; password?: string; confirmPassword?: string } = {};

    const fullNameError = validateFullName(fullName);
    if (fullNameError) errs.fullName = fullNameError;

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errs.email = 'Please enter a valid email address';
    }

    if (!password) {
      errs.password = 'Please enter a password';
    } else if (!meetsAllRequirements(password)) {
      errs.password = 'Your password does not meet all the requirements below';
    }

    if (!confirmPassword) {
      errs.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDuplicateEmail(false);
    setFormError('');
    if (!validate()) return;

    const rateLimitKey = `signup:${email.trim().toLowerCase()}`;
    if (!checkRateLimit(rateLimitKey, 3, 300000)) { // 3 attempts per 5 minutes for signup
      const remaining = getRemainingAttempts(rateLimitKey, 3);
      setFormError(`Too many signup attempts. Please try again later. (${remaining} attempts remaining)`);
      return;
    }

    setLoading(true);
    try {
      await signUp(email.trim(), password, fullName.trim());
      toast.success('Account created! Please check your email to verify.');
      navigate(`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create account';
      const lower = (message as string).toLowerCase();
      // Supabase reports a duplicate address as "User already registered".
      // The toast alone left the user at a dead end, having filled in a whole
      // form for nothing. Rendering the panel instead offers a direct way back
      // to sign-in and to password recovery.
      //
      // This stays on SUBMIT rather than on keystroke. Probing as the user
      // types would turn the signup form into an account-enumeration oracle,
      // which is exactly what ForgotPassword's neutral "if an account exists"
      // wording exists to avoid.
      if (lower.includes('already registered') || lower.includes('already been registered')) {
        setDuplicateEmail(true);
      } else {
        setFormError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const clearFieldError = (field: 'fullName' | 'email' | 'password' | 'confirmPassword') => {
    setErrors((prev) => ({ ...prev, [field]: '' }));
    if (field === 'email') setDuplicateEmail(false);
  };

  return (
    <AuthLayout
      title={isCheckoutIntent ? `Create your ${settings.siteName} account` : 'Create an Account'}
      subtitle={
        isCheckoutIntent
          ? "You're one step away from completing your order."
          : `Join ${settings.siteName}`
      }
    >
      {duplicateEmail && (
        <div
          role="status"
          className="rounded-xl border border-border bg-card p-5 mb-5 space-y-4"
        >
          <div className="flex items-start gap-3">
            <AlertCircle aria-hidden="true" className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                An account already exists for {email.trim()}
              </p>
              <p className="text-sm text-muted-foreground">
                Sign in with your existing password, or reset it if you can't remember it.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Link to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>
              <Button className="w-full">Sign In</Button>
            </Link>
            <Link to="/forgot-password" className="text-center">
              <Button variant="ghost" className="w-full">Forgot your password?</Button>
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label="Full Name"
          type="text"
          placeholder="Enter your full name"
          value={fullName}
          onChange={(e) => { setFullName(e.target.value); clearFieldError('fullName'); }}
          autoComplete="name"
          error={errors.fullName}
          required
        />
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          error={errors.email}
          required
        />
        <PasswordInput
          label="Password"
          value={password}
          onChange={(value) => { setPassword(value); clearFieldError('password'); }}
          placeholder="Create a password"
          autoComplete="new-password"
          error={errors.password || (
            password && !meetsAllRequirements(password)
              ? 'Password does not meet all requirements'
              : undefined
          )}
          required
        />
        <PasswordInput
          label="Confirm Password"
          value={confirmPassword}
          onChange={(value) => { setConfirmPassword(value); clearFieldError('confirmPassword'); }}
          placeholder="Re-enter your password"
          autoComplete="new-password"
          error={errors.confirmPassword || (
            confirmPassword && confirmPassword !== password
              ? 'Passwords do not match'
              : undefined
          )}
          required
        />
        {password && <PasswordRequirements value={password} />}
        {formError && (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </div>
        )}
        {isCheckoutIntent && (
          <p className="text-xs text-muted-foreground">
            Your cart will be waiting for you — create your account and we'll continue right to
            checkout.
          </p>
        )}
        <Button type="submit" className="w-full" loading={loading}>
          {duplicateEmail ? 'Create Another Account' : 'Create Account'}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-primary hover:text-primary/80">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
