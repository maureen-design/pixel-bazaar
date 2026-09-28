-- ============================================================================
-- Verification for 0034_vendor_private_split.sql
-- Read-only. Run this AFTER applying 0033 then 0034.
--
-- This is the authoritative check for the final state. The four things that
-- must be true are asserted as sections 1-3, section 5 (REST), and section 6
-- (sessions).
--
-- NOTE ON information_schema: several checks below use
-- has_column_privilege / has_table_privilege rather than
-- information_schema.*_privileges. That is deliberate. The information_schema
-- views fall back to the table ACL for any column with no ACL of its own, and
-- they expand every privilege in it, not just SELECT. They have produced two
-- false readings during this work already - once reporting 30 rows of "leaked"
-- INSERT/UPDATE/DELETE, and once reporting SELECT on columns that
-- has_column_privilege correctly said were closed. Trust has_column_privilege.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. THE PROOF: anon cannot read the private fields
-- ---------------------------------------------------------------------------
-- 1a. They must not exist on vendors at all. This is the structural guarantee:
--     a column that is not on a table anon can read cannot leak from it.
select '1a_columns_gone_from_vendors' as check,
       count(*) = 0                                    as ok,
       coalesce(string_agg(column_name, ', '), '(none - correct)') as still_present
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'vendors'
   and column_name in ('phone', 'rejection_reason', 'rejection_count', 'last_rejected_at');
-- Expect ok = true, still_present = (none - correct).

-- 1b. And anon must hold nothing at all on vendor_private. Not even a table
--     grant, so RLS never even comes into it.
--
--     This is the check that caught the one real bug in 0034: the migration
--     revoked only from PUBLIC, and Supabase's ALTER DEFAULT PRIVILEGES on the
--     public schema had already granted anon an explicit ALL on the new table.
--     Revoking from PUBLIC does not touch per-role entries. If this check ever
--     fails, run the diagnostic below and revoke by name.
--
--     Diagnostic if it fails:
--       select grantee, privilege_type, column_name
--         from information_schema.column_privileges
--        where table_schema = 'public' and table_name = 'vendor_private'
--          and column_name = 'phone' and privilege_type = 'SELECT';
select '1b_anon_has_no_vendor_private_privileges' as check,
       has_table_privilege('anon', 'public.vendor_private', 'SELECT') = false
         as no_table_select,
       has_column_privilege('anon', 'public.vendor_private', c, 'SELECT') = false
         as no_column_select,
       c as column_name
  from unnest(array['phone', 'rejection_reason', 'rejection_count', 'last_rejected_at']) as c;
-- Expect no_table_select = true and no_column_select = true on all four rows.

-- 1c. The private data actually survived the move. A migration that drops the
--     columns and loses the values would pass 1a and 1b perfectly.
select '1c_private_data_preserved' as check,
       (select count(*) from public.vendors)                       as vendors,
       (select count(*) from public.vendor_private)               as private_rows,
       (select count(*) from public.vendor_private) =
       (select count(*) from public.vendors)                       as one_to_one,
       (select count(*) from public.vendor_private where phone is not null) as with_phone;
-- Expect one_to_one = true, and private_rows = vendors.
-- with_phone should equal the number of vendors that had a phone before the
-- move - if that dropped, the copy lost data.

-- ---------------------------------------------------------------------------
-- 2. THE PROOF: product embeds still return store_name
-- ---------------------------------------------------------------------------
-- The regression that started all of this. Without table-level SELECT on
-- vendors, PostgREST cannot resolve the relation and every product grid on the
-- site renders empty.
select '2_embed_path_intact' as check,
       has_table_privilege('anon',          'public.vendors', 'SELECT') as anon_table,
       has_table_privilege('authenticated', 'public.vendors', 'SELECT') as auth_table,
       has_column_privilege('anon', 'public.vendors', 'store_name', 'SELECT') as store_name;
-- Expect all three true.

-- And the public columns are all still readable, which is what the embeds and
-- the store page depend on.
select '2b_public_columns_open' as check,
       has_column_privilege('anon', 'public.vendors', c, 'SELECT') as anon,
       c as column_name
  from unnest(array['id', 'store_name', 'store_description', 'store_logo',
                    'store_cover', 'rating', 'total_sales', 'is_verified',
                    'business_name', 'country', 'city', 'main_categories',
                    'created_at', 'updated_at', 'user_id']) as c
 order by c;
-- Expect anon = true on all fifteen rows. user_id is the accepted exposure -
-- see section 7.

-- Direct read as anon, to prove it against a real query not a catalog lookup.
-- begin;
-- set local role anon;
-- select store_name from public.vendors limit 3;
-- rollback;
-- Expect three populated store names.

-- ---------------------------------------------------------------------------
-- 3. THE PROOF: the private fields are still reachable for owner and admin
-- ---------------------------------------------------------------------------
-- 3a. Both definer RPCs still exist, still definer, search_path still pinned,
--     and anon still cannot call them.
select '3a_rpc_hardening' as check,
       p.proname                                    as function,
       p.prosecdef                                  as security_definer,
       (p.proconfig @> array['search_path=public']) as search_path_pinned,
       has_function_privilege('anon', p.oid, 'execute') = false as anon_blocked
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('get_my_vendor', 'admin_list_vendors')
 order by p.proname;
-- Expect two rows, all three flags true.

-- 3b. The RPCs must still return the private fields. Their return shape is
--     unchanged, which is why no read-path app code had to change.
select '3b_rpc_returns_private_fields' as check,
       count(*) = 2                                  as ok,
       string_agg(argname, ', ' order by ord)        as private_return_columns
  from pg_proc p
  cross join lateral unnest(p.proargnames) with ordinality as a(argname, ord)
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('get_my_vendor', 'admin_list_vendors')
   and a.argname in ('phone', 'rejection_reason', 'rejection_count', 'last_rejected_at');
-- Expect ok = true, 8 rows of columns total (4 per function).

-- 3c. vendor_private RLS is enabled and has the owner-or-admin policies. The
--     definer functions bypass this, which is intended.
select '3c_vendor_private_rls' as check,
       (select relrowsecurity from pg_class
         where oid = 'public.vendor_private'::regclass)   as rls_enabled,
       (select count(*) = 3 from pg_policies
         where tablename = 'vendor_private')              as policy_count;
-- Expect rls_enabled = true, policy_count = true.
-- There is deliberately NO delete policy.

-- 3d. The 1:1 invariant trigger is installed, so no vendor can end up with no
--     private row and silently lose their phone number.
select '3d_invariant_triggers' as check,
       (select count(*) = 1 from pg_trigger
         where tgrelid = 'public.vendors'::regclass
           and not tgisinternal
           and tgname = 'trg_vendors_ensure_private_row')  as ensure_private_row,
       (select count(*) = 1 from pg_trigger
         where tgrelid = 'public.vendor_private'::regclass
           and not tgisinternal
           and tgname = 'trg_vendor_private_protect_system_fields') as private_guard,
       (select count(*) = 1 from pg_trigger
         where tgrelid = 'public.vendor_private'::regclass
           and not tgisinternal
           and tgname = 'trg_vendor_private_protect_insert_defaults') as private_defaults;
-- Expect all three true.

-- 3e. 0031's vendors triggers were rebuilt without the moved columns. If
--     section 5 had run before the rebuild, every vendors UPDATE would be
--     failing on a missing column, so confirm they are the new bodies.
select '3e_0031_triggers_intact' as check,
       (select count(*) = 1 from pg_trigger
         where tgrelid = 'public.vendors'::regclass
           and not tgisinternal
           and tgname = 'trg_vendors_protect_system_fields')  as system_fields,
       (select count(*) = 1 from pg_trigger
         where tgrelid = 'public.vendors'::regclass
           and not tgisinternal
           and tgname = 'trg_vendors_protect_insert_defaults') as insert_defaults,
       (select count(*) = 1 from pg_policies
         where tablename = 'vendors'
           and policyname = 'vendors_update_admin_policy')      as admin_update_policy,
       (select count(*) = 1 from pg_policies
         where tablename = 'vendors'
           and policyname = 'vendors_select_policy')            as select_policy;
-- Expect all four true. vendors_update_policy must still be auth.uid() = user_id,
-- which is why user_id stayed.

-- 3f. Vendors insert/update privileges are untouched by 0034, so vendor
--     product and store management still work.
select '3f_vendors_write_privileges' as check,
       count(*) = 3                                              as ok,
       string_agg(privilege_type, ', ' order by privilege_type) as found
  from information_schema.table_privileges
 where table_schema = 'public'
   and table_name   = 'vendors'
   and grantee      = 'authenticated'
   and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
-- Expect ok = true, found = DELETE, INSERT, UPDATE.

-- ---------------------------------------------------------------------------
-- 4. Policy inventory, for the record
-- ---------------------------------------------------------------------------
select '4_policy_inventory' as check,
       tablename,
       policyname,
       cmd,
       qual is not null as has_using,
       with_check is not null as has_with_check
  from pg_policies
 where tablename in ('vendors', 'vendor_private')
 order by tablename, policyname;
-- vendors_select_policy must remain using (true) on purpose: a verified-only
-- policy would 404 the pending /store/:id page and blank the store name on
-- cards for unverified vendors.

-- ============================================================================
-- 5. Behavioural tests. Run these from each role or over REST with the anon
--    key. The SQL editor is privileged and will pass everything.
-- ============================================================================
--
-- A. ANON - the private table must be entirely unreachable
--      curl -s "$URL/rest/v1/vendor_private?select=*&limit=1" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--    MUST NOT be a 200 with rows. Expect 401, 42501, or 404/PGRST205 - anon
--    holds no privilege on the table, so PostgREST may simply omit it from the
--    schema cache. All four are correct. A 200 is a complete failure of this
--    migration.
--
--      curl -s "$URL/rest/v1/vendors?select=phone&limit=1" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--    MUST NOT be a 200. The column no longer exists, so expect 42703
--    (undefined column), 400, or 404 depending on PostgREST's resolution
--    order. Do NOT accept a 200 with a null value - that is exactly how the
--    previous attempt looked like a pass while user_id and phone were readable.
--
-- B. ANON - the public surface must be unchanged
--      curl -s "$URL/rest/v1/vendors?select=id,store_name,is_verified&limit=3" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--    MUST return three populated rows.
--
-- C. ANON - THE REGRESSION CHECK. This is the call that returned 42501 when
--    0032 was applied alone, and it is what every product query in the app
--    depends on.
--      curl -s "$URL/rest/v1/products?select=id,name,vendor:vendors!inner(store_name)&limit=3" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--    MUST return three products, each with a NON-NULL vendor.store_name.
--    A 42501 means 0033 is missing. An empty array means the embed resolved but
--    the join matched nothing.
--
--    Also check the store page fields and the badge:
--      curl -s "$URL/rest/v1/vendors?select=id,store_name,store_description,store_logo,store_cover,country,city,business_name,is_verified,created_at&limit=1" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--      curl -s "$URL/rest/v1/products?select=id,vendor:vendors!inner(store_name,is_verified)&limit=2" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--
-- D. OWNER (vendor) session - own private data
--      select * from public.get_my_vendor();
--    MUST succeed and include phone, rejection_reason, rejection_count,
--    last_rejected_at. This is the path that replaces the direct column read.
--
--      select * from public.vendor_private;
--    MUST succeed but return only the caller's own row, because of RLS.
--
--      update public.vendor_private set phone = '+254700000000' where vendor_id = '<own id>';
--    MUST succeed - this is the Apply/Settings write path.
--
--      update public.vendor_private set rejection_count = 0 where vendor_id = '<own id>';
--    MUST RAISE: Vendor moderation and ownership fields are managed by
--    NexaMart. A vendor must not be able to clear their own rejection history.
--
--      update public.vendor_private set vendor_id = '<someone else's vendor id>' where vendor_id = '<own id>';
--    MUST RAISE, either from the trigger or from the WITH CHECK policy.
--
-- E. ADMIN session - approve and reject
--      select applicant_full_name, applicant_email, phone, rejection_reason,
--             rejection_count, last_rejected_at
--        from public.admin_list_vendors()
--       where is_verified is false
--       order by created_at asc;
--    MUST succeed and populate the applicant columns.
--
--      select public.approve_vendor('<pending vendor id>');
--      select public.reject_vendor('<vendor id>');
--      update public.vendor_private
--         set rejection_reason = 'Incomplete documents', last_rejected_at = now()
--       where vendor_id = '<vendor id>';
--    MUST all succeed. These four are exactly what admin/Vendors.tsx issues.
--
-- F. NON-ADMIN authenticated session (a plain customer)
--      select * from public.vendor_private;
--    MUST return zero rows, not an error - RLS filters rather than denies here.
--      select * from public.admin_list_vendors();
--    MUST RAISE: Permission denied: admin role required.
--      insert into public.vendor_private (vendor_id, phone) values ('<any vendor id>', '+254...');
--    MUST RAISE - the WITH CHECK requires that the caller owns that vendors row.
--
-- G. UI smoke test
--    1. Apply as a new vendor: submit, and confirm the phone number is stored
--       (visible on the admin roster) and no console error about vendor_private.
--    2. Re-apply with the same account: MUST still be refused by the
--       vendors_user_id_unique constraint. This is the invariant user_id stayed
--       to protect - if a second application now goes through, 0034 broke it.
--    3. Vendor settings: load and save a store-name change.
--    4. Homepage / search / category / wishlist grids: store names render.
--    5. Product detail: vendor block and verified badge render.
--    6. /store/:id for a verified vendor, then a pending one.
--    7. Admin vendors: list loads with Owner and email; reject with a reason;
--       confirm the reason and timestamp persist after a reload.
-- ============================================================================

-- ============================================================================
-- 7. ACCEPTED RESIDUAL RISK - user_id
-- ============================================================================
-- vendors.user_id is STILL readable by anon and is a direct link from a
-- storefront to an auth account. This was deliberately not moved in 0034
-- because it is load-bearing for vendor authorization in nine RLS policies and
-- three definer functions, including order-cancellation integrity, and for two
-- service-key edge functions. Moving it is a separate, much larger change.
--
-- This check exists so the exposure is recorded rather than forgotten:
select '7_known_exposure_user_id' as check,
       has_column_privilege('anon', 'public.vendors', 'user_id', 'SELECT') as anon_reads_user_id,
       (select count(*) from pg_policies
         where qual like '%vendors.user_id%'
            or with_check like '%vendors.user_id%')                       as policies_depending_on_it;
-- Expect anon_reads_user_id = TRUE. That is the documented, accepted state.
-- policies_depending_on_it is 9 today; if it drops, the reason for keeping
-- user_id on vendors has weakened and it becomes worth revisiting.
-- ============================================================================
