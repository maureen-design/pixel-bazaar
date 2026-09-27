-- ============================================================================
-- Verification for 0032_vendor_privacy_columns.sql
-- Read-only. Run this AFTER applying 0032.
--
-- 0032 IS NOT A COMPLETE STATE. It removes table-level SELECT and grants the
-- 14 public columns instead. Postgres honours that, but PostgREST cannot
-- resolve `vendor:vendors!inner(...)` without table-level SELECT, so the whole
-- storefront renders empty. 0033 restores the table grant and re-revokes the
-- private columns.
--
-- For the final, correct configuration use 0033_verify.sql. Checks 1 and 2
-- below describe the pre-0033 state and are kept only to document the
-- intermediate step; they are not the assertions to trust.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The five private columns must not be SELECT-able by anon / authenticated.
--
--    Asserted with has_column_privilege rather than information_schema. The
--    information_schema view falls back to the table ACL for any column with
--    no column ACL of its own, and expands every privilege in it - not just
--    SELECT. Under 0032 alone that produced 5 columns x 3 write privileges x 2
--    roles = 30 rows of harmless noise; under 0033, where the table grant
--    carries `r`, it reports SELECT on the private columns and false-alarms.
--    has_column_privilege is what Postgres actually resolves and is correct in
--    both states.
-- ---------------------------------------------------------------------------
select '1_private_columns_closed' as check,
       has_column_privilege('anon',          'public.vendors', c, 'SELECT') as anon,
       has_column_privilege('authenticated', 'public.vendors', c, 'SELECT') as authenticated,
       c as column_name
  from unnest(array['phone', 'rejection_reason', 'rejection_count',
                    'last_rejected_at', 'user_id']) as c;
-- Expect anon = false and authenticated = false on all five rows. This holds
-- both after 0032 alone and after 0033.

-- 1b. Public columns readable. Also state-independent.
select '1b_public_columns_open' as check,
       has_column_privilege('anon', 'public.vendors', 'store_name',  'SELECT') as store_name,
       has_column_privilege('anon', 'public.vendors', 'is_verified', 'SELECT') as is_verified,
       has_column_privilege('anon', 'public.vendors', 'country',     'SELECT') as country;
-- Expect all true.

-- ---------------------------------------------------------------------------
-- 2. Pre-0033 state only. 0032 removes table-level SELECT; 0033 puts it back.
--    Run this only to confirm 0032 landed, or after rolling 0033 back. In the
--    final configuration (0032 + 0033) this correctly reports ok = false with
--    anon and authenticated listed - that is the expected end state, not a
--    failure. See 0033_verify.sql check 1.
-- ---------------------------------------------------------------------------
select '2_table_level_select_under_0032_only' as check,
       count(*) = 0                                as ok,
       coalesce(string_agg(grantee, ', '), '(none - correct)') as table_level_select_holders
  from information_schema.table_privileges
 where table_schema = 'public'
   and table_name   = 'vendors'
   and privilege_type = 'SELECT'
   and grantee in ('PUBLIC', 'anon', 'authenticated');
-- Under 0032 alone: ok = true, holders = (none - correct).
-- Under 0032 + 0033: ok = false, holders = anon, authenticated. Correct.

-- ---------------------------------------------------------------------------
-- 3. The 14 public columns must still be readable by anon and authenticated,
--    otherwise the storefront breaks. Under 0032 these come from a column
--    grant; under 0033 they are covered by the table grant instead.
-- ---------------------------------------------------------------------------
select '3_public_columns_granted' as check,
       count(distinct column_name) = 14 as all_columns_present,
       count(distinct case when grantee = 'anon'          then column_name end) = 14 as anon_ok,
       count(distinct case when grantee = 'authenticated' then column_name end) = 14 as authenticated_ok
  from information_schema.column_privileges
 where table_schema = 'public'
   and table_name   = 'vendors'
   and grantee in ('anon', 'authenticated')
   and column_name in ('id', 'store_name', 'store_description', 'store_logo',
                       'store_cover', 'rating', 'total_sales', 'is_verified',
                       'business_name', 'country', 'city', 'main_categories',
                       'created_at', 'updated_at');

-- ---------------------------------------------------------------------------
-- 4. Write paths must be untouched: vendor applications, vendor settings and
--    the admin rejection write all depend on these.
-- ---------------------------------------------------------------------------
select '4_write_privileges_intact' as check,
       count(*) = 3                                              as ok,
       string_agg(privilege_type, ', ' order by privilege_type)  as found
  from information_schema.table_privileges
 where table_schema = 'public'
   and table_name   = 'vendors'
   and grantee      = 'authenticated'
   and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

-- ---------------------------------------------------------------------------
-- 5. Both RPCs must be SECURITY DEFINER with a pinned search_path.
-- ---------------------------------------------------------------------------
select '5_function_hardening' as check,
       p.proname                                        as function,
       p.prosecdef                                      as security_definer,
       (p.proconfig @> array['search_path=public'])     as search_path_pinned
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('get_my_vendor', 'admin_list_vendors')
 order by p.proname;

-- ---------------------------------------------------------------------------
-- 6. Execute must be withheld from anon. authenticated keeps it.
-- ---------------------------------------------------------------------------
select '6_function_execute_grants' as check,
       p.proname                                                          as function,
       has_function_privilege('anon', p.oid, 'execute')                   as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute')          as authenticated_can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('get_my_vendor', 'admin_list_vendors')
 order by p.proname;
-- Expect anon_can_execute = false on both rows.

-- ---------------------------------------------------------------------------
-- 7. Policy inventory. vendors_select_policy is deliberately still using (true)
--    - see the migration header for why verified-only would 404 the pending
--    store page and blank vendor names on unverified product cards.
-- ---------------------------------------------------------------------------
select '7_policy_inventory' as check,
       policyname,
       cmd,
       qual,
       with_check
  from pg_policies
 where tablename = 'vendors'
 order by policyname;

-- ---------------------------------------------------------------------------
-- 8. Regression guard: 0031's write protections must still be installed.
-- ---------------------------------------------------------------------------
select '8_write_protection_intact' as check,
       (select count(*) = 2 from pg_trigger
         where tgrelid = 'public.vendors'::regclass
           and not tgisinternal
           and tgname in ('trg_vendors_protect_system_fields',
                          'trg_vendors_protect_insert_defaults'))  as triggers_present,
       (select count(*) = 1 from pg_policies
         where tablename = 'vendors'
           and policyname = 'vendors_update_admin_policy')          as admin_update_policy;

-- ============================================================================
-- Behavioural tests. Run these from each role, not from the SQL editor
-- (the editor is a privileged role and will pass everything).
-- ============================================================================
--
-- A. ANON session (or via REST with the anon key)
--    MUST raise: 42501 permission denied for table vendors
--      select * from public.vendors limit 1;
--    MUST raise: 42501 permission denied for column phone
--      select id, phone from public.vendors;
--      select id, rejection_reason, rejection_count, last_rejected_at, user_id
--        from public.vendors;
--    MUST succeed, zero private keys in the result:
--      select id, store_name, store_logo, is_verified, country
--        from public.vendors order by created_at desc limit 5;
--    MUST succeed (unverified vendors included - the policy is still using true):
--      select count(*) from public.vendors where is_verified is false;
--
-- B. REST-level embed check, anon key, from a shell. Proves the PostgREST
--    embed path still resolves the vendor name on cards:
--      curl -s "$URL/rest/v1/products?select=id,name,vendor:vendors!inner(store_name)&limit=3" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--    Every returned product must carry a non-null vendor.store_name. If this
--    comes back with a null name, the embed is being denied and Batch A's
--    blank-vendor regression is back.
--
--    Same for the store page columns:
--      curl -s "$URL/rest/v1/vendors?select=id,store_name,store_description,store_logo,store_cover,country,city,business_name,is_verified,created_at&limit=1" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--
-- C. VENDOR session - own private fields
--    MUST succeed, returning your own row:
--      select * from public.get_my_vendor();
--    Must include phone / rejection_reason / rejection_count / last_rejected_at.
--    MUST return zero rows for a customer with no vendor row:
--      select * from public.get_my_vendor();
--    MUST still be a permission error on the table (proving the RPC, not the
--    grant, is what preserves owner access):
--      select * from public.vendors;
--
-- D. ADMIN session - private fields plus applicant identity
--    MUST succeed:
--      select count(*) from public.admin_list_vendors();
--      select applicant_full_name, applicant_email, phone, rejection_reason,
--             rejection_count, last_rejected_at
--        from public.admin_list_vendors()
--       where is_verified is false
--       order by created_at asc;
--
-- E. NON-ADMIN authenticated session (a plain customer)
--    MUST raise: Permission denied: admin role required
--      select * from public.admin_list_vendors();
--    MUST still be a permission error:
--      select * from public.vendors;
--
-- F. UI smoke test after the deploy
--    1. Homepage / search / category grid: store names still render.
--    2. Product detail: vendor block + verified badge render.
--    3. /store/:id for a VERIFIED vendor, then for a PENDING vendor - the
--       pending one must still load with the "Verification pending" badge.
--    4. Vendor settings: load and save a store-name change.
--    5. Admin vendors: list loads with Owner / email columns populated,
--       reject a vendor with a reason, confirm it still saves.
-- ============================================================================
