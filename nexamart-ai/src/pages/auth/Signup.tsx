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
import { useSettings } from '../../hooks/useSettings';
import { checkRateLimit, getRemainingAttempts } from '../../lib/rateLimit';

export function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; password?: string; confirmPassword?: string }>({});
  const [loading, setLoading] = useState(false);
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
    if (!validate()) return;

    const rateLimitKey = `signup:${email.trim().toLowerCase()}`;
    if (!checkRateLimit(rateLimitKey, 3, 300000)) { // 3 attempts per 5 minutes for signup
      const remaining = getRemainingAttempts(rateLimitKey, 3);
      toast.error(`Too many signup attempts. Please try again later. (${remaining} attempts remaining)`);
      return;
    }

    setLoading(true);
    try {
      await signUp(email.trim(), password, fullName.trim());
      toast.success('Account created! Please check your email to verify.');
      navigate(`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`);
    } catch (error: any) {
      const message = error?.message || 'Failed to create account';
      const lower = (message as string).toLowerCase();
      if (lower.includes('already registered') || lower.includes('already been registered')) {
        toast.error('An account with this email already exists. Please sign in instead.');
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const clearFieldError = (field: 'fullName' | 'email' | 'password' | 'confirmPassword') => {
    setErrors((prev) => ({ ...prev, [field]: '' }));
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
        {isCheckoutIntent && (
          <p className="text-xs text-muted-foreground">
            Your cart will be waiting for you — create your account and we'll continue right to
            checkout.
          </p>
        )}
        <Button type="submit" className="w-full" loading={loading}>
          Create Account
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
