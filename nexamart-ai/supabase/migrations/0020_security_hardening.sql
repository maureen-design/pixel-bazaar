-- ============================================================================
-- 0020_security_hardening.sql
-- Security fixes identified in the comprehensive security audit
--
-- NOTE: PostgREST foreign-key joins (e.g. profiles(full_name, email, phone))
-- bypass RLS on the joined table. Restricting vendor access to customer PII
-- requires removing the join and fetching profiles separately — tracked as a
-- follow-up item. This migration addresses the critical/duplicate policy issues.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CRITICAL: Drop the permissive "Allow all inserts on profiles" policy
--    This policy had WITH CHECK (true), allowing anyone (including anon) to
--    insert arbitrary profiles with any role. The profiles_insert_policy
--    (auth.uid() = id) is the correct policy and already exists.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all inserts on profiles" ON public.profiles;

-- ---------------------------------------------------------------------------
-- 2. Tighten profiles SELECT — owners see their own full profile;
--    other authenticated users cannot read profiles directly.
--    (Cross-table joins still work via PostgREST — see NOTE above.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;

CREATE POLICY "profiles_select_own_policy"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Admins need to read all profiles for user management
CREATE POLICY "profiles_select_admin_policy"
  ON public.profiles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- ---------------------------------------------------------------------------
-- 3. Clean up duplicate RLS policies
-- ---------------------------------------------------------------------------

-- orders: drop duplicate insert policy (keep "Users can insert orders")
DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;

-- order_items: drop duplicate select policy
-- "order_items_select_policy" already covers customer + vendor.
-- "Users can view own order items" is redundant and weaker.
DROP POLICY IF EXISTS "Users can view own order items" ON public.order_items;

-- wishlist_items: drop duplicate insert/delete policies
DROP POLICY IF EXISTS "wishlist_items_insert_policy" ON public.wishlist_items;
DROP POLICY IF EXISTS "wishlist_items_delete_policy" ON public.wishlist_items;

-- ---------------------------------------------------------------------------
-- 4. Drop unused is_approved column from vendors
--    The app uses is_verified exclusively; is_approved was never populated.
-- ---------------------------------------------------------------------------
ALTER TABLE public.vendors DROP COLUMN IF EXISTS is_approved;

-- ---------------------------------------------------------------------------
-- 5. Audit log this migration
-- ---------------------------------------------------------------------------
INSERT INTO public.activity_logs (id, user_id, user_email, action, details)
SELECT
  uuid_generate_v4(),
  (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1),
  (SELECT email FROM public.profiles WHERE role = 'admin' LIMIT 1),
  'security_hardening',
  '{"migration": "0020_security_hardening", "changes": ["dropped permissive profiles insert policy", "tightened profiles select to owner-only", "dropped duplicate RLS policies", "dropped unused is_approved column"]}'::jsonb
WHERE EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin');
