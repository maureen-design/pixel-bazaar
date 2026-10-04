import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { AuthLayout } from '../../layouts/AuthLayout';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  meetsAllRequirements,
  firstUnmetRequirement,
} from '../../utils/passwordValidation';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { PasswordRequirements } from '../../components/ui/PasswordRequirements';

/**
 * True when this page was opened by a recovery link.
 *
 * Two shapes have to be covered. The implicit flow puts the tokens in the
 * fragment alongside type=recovery; the PKCE flow, which supabase-js now uses
 * by default, redirects with ?code=... and no type marker at all. Checking only
 * one of them means the other silently fails.
 */
function isRecoveryLink(): boolean {
  if (window.location.hash.includes('type=recovery')) return true;
  const params = new URLSearchParams(window.location.search);
  return params.get('type') === 'recovery' || params.has('code');
}

function friendlyResetError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const lower = message.toLowerCase();
  if (
    lower.includes('expired') ||
    lower.includes('invalid token') ||
    lower.includes('no recovery session') ||
    lower.includes('password recovery') ||
    (lower.includes('recovery') && lower.includes('invalid'))
  ) {
    return 'This password reset link is invalid or has expired. Please request a new one.';
  }
  if (lower.includes('same as') || lower.includes('previous password')) {
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
  const [status, setStatus] = useState<
    'checking' | 'ready' | 'invalid' | 'signed-in'
  >('checking');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<{ newPassword?: string; confirmPassword?: string }>({});
  const successRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    let invalidTimer: ReturnType<typeof setTimeout> | undefined;
    const fromRecoveryLink = isRecoveryLink();

    const clearTimer = () => {
      if (invalidTimer) {
        clearTimeout(invalidTimer);
        invalidTimer = undefined;
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        // A session with no recovery marker means the user simply navigated
        // here while already signed in. This is not a reset, so the form is
        // withheld and they are pointed at Settings, which is the legitimate
        // place to change a password when authenticated.
        if (!fromRecoveryLink) {
          setStatus('signed-in');
          return;
        }
        setStatus('ready');
      } else {
        // The recovery session may still be exchanging after the link opens,
        // so allow a grace period before declaring the link dead.
        invalidTimer = setTimeout(
          () => { if (mounted) setStatus('invalid'); },
          fromRecoveryLink ? 8000 : 1500
        );
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      // Only PASSWORD_RECOVERY counts. SIGNED_IN is deliberately NOT accepted:
      // treating an ordinary login as a recovery is what let a misdirected
      // recovery link look like a successful sign-in with no password change.
      if (event === 'PASSWORD_RECOVERY') {
        clearTimer();
        setStatus('ready');
      } else if (event === 'SIGNED_OUT' && !successRef.current) {
        clearTimer();
        setStatus('invalid');
      }
    });

    return () => {
      mounted = false;
      clearTimer();
      subscription.unsubscribe();
    };
  }, []);

  const validate = (): boolean => {
    const errs: { newPassword?: string; confirmPassword?: string } = {};
    if (!newPassword) {
      errs.newPassword = 'Please enter a new password';
    } else if (!meetsAllRequirements(newPassword)) {
      const unmet = firstUnmetRequirement(newPassword);
      errs.newPassword = unmet
        ? `Missing: ${unmet.charAt(0).toLowerCase()}${unmet.slice(1)}`
        : 'Your password does not meet all the requirements below';
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

      // A recovery link is a bearer token: whoever holds the email can replay
      // it. Once the password has been changed the session it created must be
      // destroyed, so the link stops working the moment it has been used.
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // Non-fatal. The password is already changed; a failed local sign-out
        // must not present as a failed reset.
      }

      setSuccess(true);
      toast.success('Password updated successfully!');
    } catch (error) {
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

  if (status === 'signed-in') {
    return (
      <AuthLayout title="Reset your password" subtitle="You are already signed in">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 aria-hidden="true" className="w-7 h-7 text-primary" />
          </div>
          <p className="text-muted-foreground">
            This page is only for setting a password from a reset link. To change your
            password while signed in, use your account settings.
          </p>
          <div className="flex flex-col gap-3 pt-2">
            <Link to="/settings" className="text-primary hover:text-primary/80 text-sm">
              Go to account settings
            </Link>
            <Link to="/" className="text-muted-foreground hover:text-foreground text-sm">
              Continue to the site
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  if (status === 'invalid') {
    return (
      <AuthLayout title="Reset your password" subtitle="We couldn't verify this reset link">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle aria-hidden="true" className="w-7 h-7 text-destructive" />
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
            Your password has been updated and this reset link can no longer be used.
            Sign in with your new password.
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
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {passwordField(
          'New Password',
          newPassword,
          (value) => { setNewPassword(value); setErrors((prev) => ({ ...prev, newPassword: '' })); },
          errors.newPassword || (
            newPassword && !meetsAllRequirements(newPassword)
              ? 'Password does not meet all requirements'
              : undefined
          )
        )}

        {passwordField(
          'Confirm Password',
          confirmPassword,
          (value) => { setConfirmPassword(value); setErrors((prev) => ({ ...prev, confirmPassword: '' })); },
          errors.confirmPassword || (
            confirmPassword && confirmPassword !== newPassword
              ? 'Passwords do not match'
              : undefined
          )
        )}

        <PasswordRequirements value={newPassword} />

        <Button
          type="submit"
          className="w-full"
          loading={loading}
          disabled={!meetsAllRequirements(newPassword) || newPassword !== confirmPassword}
        >
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