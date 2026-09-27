import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';

interface AuthContextType {
  user: any | null;
  session: any | null;
  profile: any | null;
  vendor: any | null;
  isLoading: boolean;
  isVendor: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [vendor, setVendor] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Fetch user profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        setProfile(profileData);

        // Fetch vendor data by ownership. This is the public.get_my_vendor()
        // RPC rather than a filtered `select *` on vendors: migration 0032
        // revoked SELECT on phone / rejection_* / user_id for anon and
        // authenticated, so the star expands to columns this session cannot
        // read and the ownership predicate itself is no longer available to
        // it. The definer moves that test server-side and returns the full
        // own-row, private fields included. Mirrors the ownership-based RLS
        // on products, so admins who own a store are included.
        const { data: vendorData } = await supabase
          .rpc('get_my_vendor')
          .maybeSingle();
        setVendor(vendorData);
      } else {
        setProfile(null);
        setVendor(null);
      }
      
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin + '/auth/callback',
      },
    });
    if (error) throw error;

    // Send welcome email (non-blocking)
    supabase.functions.invoke('send-welcome-email', {
      body: { email, full_name: fullName },
    }).catch(() => {});
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/auth/reset-password',
    });
    if (error) throw error;
  };

  const isVendor = vendor?.is_verified === true;
  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, session, profile, vendor, isLoading, isVendor, isAdmin, signIn, signUp, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}