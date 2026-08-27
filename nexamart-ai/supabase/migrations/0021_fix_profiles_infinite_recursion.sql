-- ============================================================================
-- 0021_fix_profiles_infinite_recursion.sql
-- Fix: profiles_select_admin_policy queries profiles FROM a profiles policy
-- causing infinite recursion. All REST API queries return 500.
--
-- Solution: SECURITY DEFINER function that bypasses RLS.
-- ============================================================================

-- 1. Create helper function (runs as function owner, bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = uid AND role = 'admin');
$$;

-- 2. Fix profiles admin SELECT policy
DROP POLICY IF EXISTS "profiles_select_admin_policy" ON public.profiles;

CREATE POLICY "profiles_select_admin_policy"
  ON public.profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

-- 3. Fix system_settings admin SELECT policy (same pattern)
DROP POLICY IF EXISTS "system_settings_admin_read" ON public.system_settings;

CREATE POLICY "system_settings_admin_read"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
