import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { meetsAllRequirements } from '../../utils/passwordValidation';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { PasswordRequirements } from '../../components/ui/PasswordRequirements';

function friendlyResetError(error: any): string {
  const message = error?.message || '';
  const lower = message.toLowerCase();
  if (
    lower.includes('expired') ||
    lower.includes('invalid token') ||
    lower.includes('no recovery session') ||
    lower.includes('password recovery') ||
    lower.includes('recovery') && lower.includes('invalid')
  ) {
    return 'This password reset link is invalid or has expired. Please request a new one.';
  }
  if (lower.includes('same as') || lower.includes('same as the old') || lower.includes('previous password')) {
    return 'Your new password must be different from your previous password.';
  }
  if (lower.includes('at least') || lower.includes('characters')) {
    return 'Your new password does not meet the requirements. Please try again.';
  }
  return 'Unable to update your password. Please try again.';
}

export function ResetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<{ newPassword?: string; confirmPassword?: string }>({});
  const successRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    let invalidTimer: ReturnType<typeof setTimeout> | undefined;

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        if (mounted) setStatus('ready');
      } else {
        // The recovery session may still be exchanging after the link opens.
        invalidTimer = setTimeout(() => { if (mounted) setStatus('invalid'); }, 1500);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        if (invalidTimer) clearTimeout(invalidTimer);
        if (mounted) setStatus('ready');
      } else if (event === 'SIGNED_OUT' && !successRef.current) {
        if (mounted) setStatus('invalid');
      }
    });

    return () => {
      mounted = false;
      if (invalidTimer) clearTimeout(invalidTimer);
      subscription.unsubscribe();
    };
  }, []);

  const validate = (): boolean => {
    const errs: { newPassword?: string; confirmPassword?: string } = {};
    if (!newPassword) {
      errs.newPassword = 'Please enter a new password';
    } else if (!meetsAllRequirements(newPassword)) {
      errs.newPassword = 'Your password does not meet all the requirements below';
    }
    if (!confirmPassword) {
      errs.confirmPassword = 'Please confirm your new password';
    } else if (newPassword !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      successRef.current = true;
      setSuccess(true);
      toast.success('Password updated successfully!');
    } catch (error: any) {
      toast.error(friendlyResetError(error));
    } finally {
      setLoading(false);
    }
  };

  const passwordField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    fieldError?: string
  ) => (
    <PasswordInput
      label={label}
      value={value}
      onChange={onChange}
      placeholder="Enter a new password"
      autoComplete="new-password"
      error={fieldError}
    />
  );

  if (status === 'checking') {
    return (
      <AuthLayout title="Reset your password" subtitle="Checking your reset link...">
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AuthLayout>
    );
  }

  if (status === 'invalid') {
    return (
      <AuthLayout title="Reset your password" subtitle="We couldn't verify this reset link">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <span className="text-destructive text-2xl font-bold">!</span>
          </div>
          <p className="text-muted-foreground">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <div className="flex flex-col gap-3 pt-2">
            <Link to="/forgot-password" className="text-primary hover:text-primary/80 text-sm">
              Request a new reset link
            </Link>
            <Link to="/login" className="text-primary hover:text-primary/80 text-sm">
              Back to sign in
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  if (success) {
    return (
      <AuthLayout title="Password updated" subtitle="Your password has been changed successfully">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 bg-success/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 aria-hidden="true" className="w-7 h-7 text-success" />
          </div>
          <p className="text-muted-foreground">
            Your password has been updated. You can now sign in with your new password.
          </p>
          <Link to="/login">
            <Button className="w-full">Sign In</Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Create a new password for your account">
      <form onSubmit={handleSubmit} className="space-y-4">
        {passwordField(
          'New Password',
          newPassword,
          (value) => { setNewPassword(value); setErrors((prev) => ({ ...prev, newPassword: '' })); },
          errors.newPassword
        )}

        {passwordField(
          'Confirm Password',
          confirmPassword,
          (value) => { setConfirmPassword(value); setErrors((prev) => ({ ...prev, confirmPassword: '' })); },
          errors.confirmPassword
        )}

        <PasswordRequirements value={newPassword} />

        <Button type="submit" className="w-full" loading={loading}>
          Reset Password
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
