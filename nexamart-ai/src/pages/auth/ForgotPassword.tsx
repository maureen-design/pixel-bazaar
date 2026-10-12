import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import { checkRateLimit, getRemainingAttempts } from '../../lib/rateLimit';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');

    const rateLimitKey = `forgot:${trimmed.toLowerCase()}`;
    if (!checkRateLimit(rateLimitKey, 3, 300000)) { // 3 attempts per 5 minutes
      const remaining = getRemainingAttempts(rateLimitKey, 3);
      setFormError(`Too many requests. Please try again later. (${remaining} attempts remaining)`);
      return;
    }
    setLoading(true);
    try {
      await resetPassword(trimmed);
      setSent(true);
      toast.success('Password reset email sent!');
    } catch (error: any) {
      setFormError(error.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout title="Check Your Email" subtitle="We've sent you a password reset link">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">
            If an account exists with {email}, you'll receive a password reset email.
          </p>
          <Link to="/login" className="text-primary hover:text-primary/80 text-sm">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset Password" subtitle="Enter your email to receive a reset link">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setEmailError(''); setFormError(''); }}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          error={emailError}
          required
        />
        {formError && (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </div>
        )}
        <Button type="submit" className="w-full" loading={loading}>
          Send Reset Link
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Remember your password?{' '}
          <Link to="/login" className="text-primary hover:text-primary/80">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}