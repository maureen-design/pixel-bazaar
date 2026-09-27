-- ============================================================================
-- Verification for 0033_vendor_embed_grant.sql
-- Read-only. Run this AFTER applying 0033.
--
-- This is the authoritative check for the final state. 0032 alone is a broken
-- intermediate state; 0032 + 0033 together are the real configuration.
-- Expected: every check reports the stated value.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table-level SELECT must be present for anon. This is the assertion 0032
--    broke: without it PostgREST cannot resolve the vendor embed and every
--    product grid on the site renders empty.
-- ---------------------------------------------------------------------------
select '1_table_select_granted' as check,
       has_table_privilege('anon',          'public.vendors', 'SELECT') as anon,
       has_table_privilege('authenticated', 'public.vendors', 'SELECT') as authenticated;
-- Expect anon = true and authenticated = true.

-- ---------------------------------------------------------------------------
-- 2. The five private columns must stay unreadable. This is the whole point of
--    0032, and it is asserted per column rather than off the ACL text, because
--    has_column_privilege is what Postgres actually resolves - and because
--    information_schema.column_privileges falls back to the table ACL for
--    columns with no ACL of their own. With the 0033 table grant in place that
--    fallback now reports SELECT on the private columns, which is a false
--    alarm. Do not use information_schema here.
-- ---------------------------------------------------------------------------
select '2_private_columns_closed' as check,
       has_column_privilege('anon',          'public.vendors', c, 'SELECT') as anon,
       has_column_privilege('authenticated', 'public.vendors', c, 'SELECT') as authenticated,
       c as column_name
  from unnest(array['phone', 'rejection_reason', 'rejection_count',
                    'last_rejected_at', 'user_id']) as c;
-- Expect anon = false and authenticated = false on all five rows.

-- ---------------------------------------------------------------------------
-- 3. The public columns must still resolve, otherwise the storefront is broken
--    rather than private.
-- ---------------------------------------------------------------------------
select '3_public_columns_open' as check,
       has_column_privilege('anon', 'public.vendors', c, 'SELECT') as anon,
       c as column_name
  from unnest(array['id', 'store_name', 'store_description', 'store_logo',
                    'store_cover', 'rating', 'total_sales', 'is_verified',
                    'business_name', 'country', 'city', 'main_categories',
                    'created_at', 'updated_at']) as c
 order by c;
-- Expect anon = true on all fourteen rows.

-- ---------------------------------------------------------------------------
-- 4. Direct read as anon. Confirms the above against a real query rather than
--    a catalog lookup.
-- ---------------------------------------------------------------------------
-- begin;
-- set local role anon;
-- select store_name from public.vendors limit 3;
-- rollback;
-- Expect three populated store names.

-- ---------------------------------------------------------------------------
-- 5. Join form as anon, which is the shape PostgREST generates for an embed.
--    `v.id` and `v.store_name` are both table-granted, so this must work.
-- ---------------------------------------------------------------------------
-- begin;
-- set local role anon;
-- select p.id, v.store_name
--   from public.products p
--   left join public.vendors v on v.id = p.vendor_id
--  limit 3;
-- rollback;
-- Expect three rows with populated store_name.

-- ---------------------------------------------------------------------------
-- 6. Write paths must be untouched by 0033: vendor applications, vendor
--    settings and the admin rejection write all depend on these.
-- ---------------------------------------------------------------------------
select '6_write_privileges_intact' as check,
       count(*) = 3                                             as ok,
       string_agg(privilege_type, ', ' order by privilege_type) as found
  from information_schema.table_privileges
 where table_schema = 'public'
   and table_name   = 'vendors'
   and grantee      = 'authenticated'
   and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
-- Expect ok = true, found = DELETE, INSERT, UPDATE.

-- ---------------------------------------------------------------------------
-- 7. Both definer RPCs from 0032 must still exist and stay hardened.
-- ---------------------------------------------------------------------------
select '7_function_hardening' as check,
       p.proname                                    as function,
       p.prosecdef                                  as security_definer,
       (p.proconfig @> array['search_path=public']) as search_path_pinned,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('get_my_vendor', 'admin_list_vendors')
 order by p.proname;
-- Expect two rows, security_definer = true, search_path_pinned = true,
-- anon_can_execute = false.

-- ---------------------------------------------------------------------------
-- 8. Regression guard: 0031's write protections must still be installed.
-- ---------------------------------------------------------------------------
select '8_write_protection_intact' as check,
       (select count(*) = 2 from pg_trigger
         where tgrelid = 'public.vendors'::regclass
           and not tgisinternal
           and tgname in ('trg_vendors_protect_system_fields',
                          'trg_vendors_protect_insert_defaults')) as triggers_present,
       (select count(*) = 1 from pg_policies
         where tablename = 'vendors'
           and policyname = 'vendors_update_admin_policy')          as admin_update_policy;
-- Expect triggers_present = true, admin_update_policy = true.

-- ---------------------------------------------------------------------------
-- 9. Row policy is still deliberately permissive. See the 0032 header: a
--    verified-only policy would 404 the pending store page and blank the vendor
--    name on cards for unverified vendors.
-- ---------------------------------------------------------------------------
select '9_policy_inventory' as check,
       policyname,
       cmd,
       qual,
       with_check
  from pg_policies
 where tablename = 'vendors'
 order by policyname;
-- Expect vendors_select_policy with qual = true.

-- ============================================================================
-- Behavioural tests. Run from each role, not the SQL editor, which is
-- privileged and will pass everything.
-- ============================================================================
--
-- A. ANON - the private columns must be denied
--      curl -s "$URL/rest/v1/vendors?select=phone&limit=1" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--    MUST return 42501 permission denied for column phone.
--
--    Same for rejection_reason, rejection_count, last_rejected_at, user_id.
--
-- B. ANON - the public columns must be readable directly
--      curl -s "$URL/rest/v1/vendors?select=id,store_name,is_verified&limit=3" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--    MUST return three populated rows.
--
-- C. ANON - THE REGRESSION CHECK. This is the exact call that failed under
--    0032 alone. It is what every product query in the app depends on.
--      curl -s "$URL/rest/v1/products?select=id,name,vendor:vendors!inner(store_name)&limit=3" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--    MUST return three products, each with a non-null vendor.store_name.
--    A 42501 here means 0033 was not applied. An empty array means the embed
--    resolved but the join produced nothing.
--
-- D. VENDOR session - own private fields, via the RPC rather than the table
--      select * from public.get_my_vendor();
--    MUST succeed, including phone / rejection_reason / rejection_count /
--    last_rejected_at.
--    MUST still be a permission error on the table:
--      select phone from public.vendors;
--
-- E. ADMIN session - private fields plus applicant identity
--      select applicant_full_name, applicant_email, phone, rejection_reason
--        from public.admin_list_vendors()
--       where is_verified is false
--       order by created_at asc;
--    MUST succeed.
--
-- F. NON-ADMIN authenticated session (a plain customer)
--      select phone from public.vendors;              -- 42501
--      select * from public.admin_list_vendors();     -- Permission denied: admin role required
--
-- G. UI smoke test
--    1. Homepage, search, category, wishlist grids: store names render.
--    2. Product detail: vendor block + verified badge render.
--    3. /store/:id for a verified vendor, then a pending one.
--    4. Vendor settings: load and save.
--    5. Admin vendors: list loads, reject with a reason still saves.
-- ============================================================================
