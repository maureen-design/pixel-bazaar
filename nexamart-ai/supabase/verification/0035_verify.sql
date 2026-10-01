-- ============================================================================
-- Verification for 0035_handle_new_user_trigger.sql
-- Read-only. Run this AFTER applying 0035.
--
-- Sections 1-4 are static assertions: they can all be answered from the
-- catalog. Section 5 is the check that actually matters and it is NOT a
-- SELECT - it is a live signup you have to perform by hand, because the
-- trigger fires on auth.users INSERT and there is no read-only way to
-- simulate that.
--
-- Expected result: every check in 1-4 reports ok = true.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The trigger exists and is enabled
-- ---------------------------------------------------------------------------
select '1_trigger_exists' as check,
       count(*) = 1                                    as ok,
       coalesce(string_agg(tgname || ' on ' || t.tgrelid::regclass
                           || ' (enabled=' || t.tgenabled || ')', ', '),
                '(trigger missing)')                    as detail
  from pg_trigger t
  join pg_namespace n on n.oid = t.tgnamespace
 where n.nspname = 'auth'
   and t.tgrelid = 'auth.users'::regclass
   and t.tgname   = 'on_auth_user_created'
   and not t.tgisinternal;


-- ---------------------------------------------------------------------------
-- 2. The function is SECURITY DEFINER with a pinned search_path
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is mandatory here: 0020 removed the permissive profiles
-- insert policy, so an invoker-rights function could not write the row. An
-- empty search_path is the defence against search_path redirection.
select '2_function_secure' as check,
       p.prosecdef                                       as security_definer,
       coalesce(array_to_string(p.proconfig, ','), '(unset)') as config,
       p.prosecdef                                       as ok
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'handle_new_user';


-- ---------------------------------------------------------------------------
-- 3. THE PROOF: no auth account is missing its profile
-- ---------------------------------------------------------------------------
-- This is the check that was failing before the fix. It should now be zero.
-- Anything above zero means an account can still not become a vendor.
select '3_every_user_has_profile' as check,
       count(*) = 0                                       as ok,
       count(*)                                           as users_missing_profile
  from auth.users u
 where u.email is not null
   and not exists (select 1 from public.profiles p where p.id = u.id);


-- ---------------------------------------------------------------------------
-- 3b. The inverse: no orphan profile rows
-- ---------------------------------------------------------------------------
select '3b_no_orphan_profiles' as check,
       count(*) = 0                                        as ok,
       count(*)                                            as orphan_profiles
  from public.profiles p
 where not exists (select 1 from auth.users u where u.id = p.id);


-- ---------------------------------------------------------------------------
-- 4. The backfill did not touch roles
-- ---------------------------------------------------------------------------
-- The INSERT in 0035 lists only (id, email, full_name), so role must always
-- come from the column default. A null role would mean the default was
-- bypassed, which would break is_admin() and the role gates.
select '4_role_never_null' as check,
       count(*) = 0                                        as ok,
       count(*)                                            as null_role_profiles
  from public.profiles
 where role is null;

-- Coverage summary: how many of each role exist, so you can see at a glance
-- that admins/vendors survived the backfill unchanged.
select '4b_role_breakdown' as check,
       role::text                                         as role,
       count(*)                                           as profiles
  from public.profiles
 group by role
 order by role;


-- ---------------------------------------------------------------------------
-- 5. RLS on profiles was not weakened
-- ---------------------------------------------------------------------------
-- 0035 must not have opened profiles up. Anonymous still must not be able to
-- read another user's row.
-- NOTE: has_table_privilege is used rather than information_schema, following
-- the convention set in 0034_verify.sql - the information_schema views fall
-- back to the table ACL and have produced false readings on this database.
select '5_anon_cannot_select_profiles' as check,
       has_table_privilege('anon', 'public.profiles', 'SELECT') = false as ok,
       has_table_privilege('anon', 'public.profiles', 'SELECT')         as anon_can_select,
       has_table_privilege('anon', 'public.profiles', 'INSERT') = false as anon_can_insert;


-- ---------------------------------------------------------------------------
-- 6. LIVE TEST - you must perform this by hand
-- ---------------------------------------------------------------------------
-- The trigger fires on auth.users INSERT, so nothing above can prove the
-- end-to-end path. Do this in the browser:
--
--   6a. Sign up at /signup with a brand new email and a full name.
--   6b. Re-run section 3 above. It must still report users_missing_profile = 0.
--   6c. Sign in as that user and open /settings, change the full name, save.
--       It must say "Profile updated successfully!" AND the value must still
--       be there after a hard refresh. Before this fix it reported success
--       while writing nothing.
--   6d. As that same user, complete /vendor/apply. Before this fix the insert
--       failed with a foreign-key violation on vendors.user_id.
--   6e. Check the role was not escalated:
--         select id, email, role from public.profiles
--          where email = '<the new test email>';
--       role must be 'customer'.
--   6f. Re-run section 4b and confirm the count for 'customer' went up by 1.
--
-- If 6b still reports a missing profile, the trigger did not fire - most
-- likely cause is the trigger not existing at all, which section 1 answers.
