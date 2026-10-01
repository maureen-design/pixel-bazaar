-- ============================================================================
-- 0035_handle_new_user_trigger.sql
-- Create a public.profiles row automatically for every new auth user.
--
-- THE BUG THIS FIXES
-- ------------------
-- Nothing in the application ever inserted into public.profiles:
--   * AuthContext.signUp() calls supabase.auth.signUp() (auth.users only) and
--     then fires send-welcome-email. It never touches profiles.
--   * No handle_new_user / on_auth_user_created trigger existed in any
--     migration 0001-0034.
--   * All 22 references to profiles in the codebase are SELECT or DELETE.
--
-- profiles.id is the auth.users id, and 9 foreign keys across 8 tables point
-- at public.profiles(id) - most of them NOT NULL. The consequences for an
-- account created through the real signup form:
--
--   1. src/pages/vendor/Apply.tsx inserts vendors(user_id). vendors.user_id is
--      `not null references public.profiles(id) on delete cascade`. With no
--      profile row that insert is a foreign-key violation, so a brand-new user
--      can never become a vendor through the UI. The 3 existing vendors only
--      exist because profile rows were inserted by hand during setup.
--
--   2. src/pages/Settings.tsx runs
--        .from('profiles').update({...}).eq('id', user.id)
--      and reports success on `error === null`. PostgREST returns error: null
--      when the UPDATE matches zero rows, so the user is shown "Profile updated
--      successfully!" while nothing is stored. A silent data-loss bug that
--      actively lies to the user.
--
--   3. AuthContext sets profile to null, so the user's name is blank in the
--      navbar, the admin user list, and reports.
--
-- THE FIX
-- -------
-- The standard Supabase pattern: an AFTER INSERT trigger on auth.users that
-- copies id / email / full_name out of raw_user_meta_data into public.profiles.
-- Doing it in the database rather than in the client means it cannot be
-- skipped, cannot be bypassed, and does not depend on the app still working.
--
-- SECURITY
-- --------
-- SECURITY DEFINER is required: migration 0020 dropped the permissive
-- "Allow all inserts on profiles" policy, and the surviving
-- profiles_insert_policy is `auth.uid() = id`, which cannot be relied on from
-- inside an auth.users trigger. RLS on profiles is enabled but not FORCEd, so
-- a definer function owned by the table owner bypasses it. search_path is
-- pinned empty and every object is schema-qualified, so the function cannot be
-- redirected through a malicious search_path.
--
-- ROLE SAFETY
-- -----------
-- role is intentionally omitted from the insert so it always takes the column
-- default of 'customer'. A user can never be an admin by signing up, and this
-- mirrors the intent of 0008 (no client-side role escalation).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Trigger function
-- ---------------------------------------------------------------------------
-- DROP ... IF EXISTS first so this migration is replay-safe.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- email is `not null` on profiles but nullable on auth.users (phone-only
  -- signups). Skip rather than raise, so a phone signup can never be blocked
  -- by this trigger.
  if new.email is null then
    return new;
  end if;

  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Copies a new auth user into public.profiles. SECURITY DEFINER + pinned '
  'search_path; role is never taken from client metadata.';


-- ---------------------------------------------------------------------------
-- 2. Attach the trigger
-- ---------------------------------------------------------------------------
-- auth.users is owned by the migration role, so the trigger can be created.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- 3. Backfill existing accounts
-- ---------------------------------------------------------------------------
-- The trigger only fires on INSERT, so every account that already exists in
-- auth.users is still missing its profile row. This covers all of them in one
-- idempotent statement, and is what makes the fix safe to apply to the live
-- database where vendors were seeded by hand.
insert into public.profiles (id, email, full_name)
select u.id,
       u.email,
       nullif(u.raw_user_meta_data ->> 'full_name', '')
  from auth.users u
 where u.email is not null
   and not exists (select 1 from public.profiles p where p.id = u.id)
on conflict do nothing;
