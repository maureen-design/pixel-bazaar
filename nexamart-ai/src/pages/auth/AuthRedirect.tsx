import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Handles email deep links:
 * - If authenticated → redirect to target URL
 * - If not authenticated → redirect to login with next parameter
 */
export function AuthRedirect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isLoading } = useAuth();

  const to = searchParams.get('to') || '/';
  // Security: only allow relative paths, block protocol-relative URLs
  const safePath = to.startsWith('/') && !to.startsWith('//') ? to : '/';

  useEffect(() => {
    if (isLoading) return;

    if (user) {
      // Authenticated → go to target
      navigate(safePath, { replace: true });
    } else {
      // Not authenticated → go to login with next param
      navigate(`/login?next=${encodeURIComponent(safePath)}`, { replace: true });
    }
  }, [user, isLoading, navigate, safePath]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}
