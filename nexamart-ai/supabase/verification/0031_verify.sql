-- ============================================================================
-- Verification for 0031_vendor_update_protection.sql
-- Read-only. Run this AFTER applying 0031.
-- Expected: every check reports ok = true / present = true.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Triggers installed
-- ---------------------------------------------------------------------------
select '1_triggers' as check,
       count(*) = 2 as ok,
       string_agg(tgname, ', ' order by tgname) as found
  from pg_trigger
 where tgrelid = 'public.vendors'::regclass
   and not tgisinternal
   and tgname in ('trg_vendors_protect_system_fields',
                  'trg_vendors_protect_insert_defaults');

-- ---------------------------------------------------------------------------
-- 2. Update policies: owner policy must now carry WITH CHECK, and an explicit
--    admin policy must exist.
-- ---------------------------------------------------------------------------
select '2_update_policies' as check,
       (select count(*) = 1 from pg_policies
         where tablename = 'vendors' and policyname = 'vendors_update_policy'
           and qual is not null and with_check is not null)          as owner_guarded,
       (select count(*) = 1 from pg_policies
         where tablename = 'vendors' and policyname = 'vendors_update_admin_policy') as admin_policy_present;

-- ---------------------------------------------------------------------------
-- 3. WITH CHECK text must pin ownership (auth.uid() = user_id), so a vendor
--    cannot repoint their row at another account.
-- ---------------------------------------------------------------------------
select '3_with_check_pins_owner' as check,
       with_check like '%auth.uid() = user_id%' as ok,
       with_check
  from pg_policies
 where tablename = 'vendors' and policyname = 'vendors_update_policy';

-- ---------------------------------------------------------------------------
-- 4. No permissive leftover: exactly the expected four policies.
-- ---------------------------------------------------------------------------
select '4_policy_inventory' as check,
       policyname,
       cmd,
       (qual is not null) as has_using,
       (with_check is not null) as has_with_check
  from pg_policies
 where tablename = 'vendors'
 order by policyname;

-- ---------------------------------------------------------------------------
-- 5. Escalation audit: any vendor currently holding is_verified without a
--    matching admin approval is a row to inspect. Expect 0 after applying 0031
--    (0031 blocks future writes but does not rewrite history).
-- ---------------------------------------------------------------------------
select '5_self_verified_vendors' as check,
       count(*) as suspicious_rows,
       coalesce(string_agg(store_name, ', '), '(none)') as stores
  from public.vendors
 where is_verified
   and user_id is not null
   and not exists (
     select 1 from public.profiles p
      where p.id = public.vendors.user_id and p.role in ('vendor', 'admin')
   );

-- ---------------------------------------------------------------------------
-- 6. Forged reputation: rating / total_sales are supposed to be system-owned
--    and start at 0. Anything above 0 predates 0031 and was written by a
--    bypass or by hand.
-- ---------------------------------------------------------------------------
select '6_forged_reputation' as check,
       count(*) filter (where rating > 0)      as nonzero_rating,
       count(*) filter (where total_sales > 0) as nonzero_total_sales
  from public.vendors;

-- ============================================================================
-- Behavioural test (run separately, from an authenticated vendor session).
-- Each statement MUST raise:
--   'Vendor approval, rating, sales and ownership fields are managed by NexaMart'
-- Substitute your own vendor id.
-- ---------------------------------------------------------------------------
-- 1) self-approve:            update vendors set is_verified = true where id = '<my id>';
-- 2) forge rating:            update vendors set rating = 5 where id = '<my id>';
-- 3) forge sales:             update vendors set total_sales = 999 where id = '<my id>';
-- 4) reassign ownership:      update vendors set user_id = '<other uuid>' where id = '<my id>';
-- 5) clear rejection:         update vendors set rejection_reason = null where id = '<my id>';
--
-- These MUST still succeed:
-- 6) update vendors set store_name = 'Renamed Store' where id = '<my id>';
-- 7) update vendors set store_description = 'New copy', city = 'Nairobi' where id = '<my id>';
--
-- And as an admin session: approve_vendor / reject_vendor must still work, and
-- admin/Vendors.tsx's direct rejection_reason write must now match one row
-- instead of zero.
-- ============================================================================
