import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'sonner';

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    async function handleAuthCallback() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          toast.error('Authentication failed');
          navigate('/auth');
          return;
        }

        if (session) {
          toast.success('Successfully verified your email!');
          navigate('/');
        } else {
          toast.error('No session found');
          navigate('/auth');
        }
      } catch (error) {
        toast.error('An error occurred during authentication');
        navigate('/auth');
      }
    }

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
        <p className="text-white text-lg">Verifying your email...</p>
      </div>
    </div>
  );
}
