-- ============================================================================
-- NexaMart AI - 0008_restrict_profiles_role_update.sql
-- Client-side role escalation fix (Priority #6).
--
-- 1) Replace the vulnerable profiles_update_policy:
--      OLD: using (auth.uid() = id)            -- no WITH CHECK -> user could
--              set their own role to 'admin'
--      NEW: using (auth.uid() = id)  +  WITH CHECK that pins role to the
--              caller's CURRENT stored role. A user can still update their own
--              full_name / phone / address / avatar_url, but any attempt to
--              change `role` in the same row is rejected by RLS.
--
-- 2) Add a SECURITY DEFINER RPC update_user_role(target_user_id uuid,
--      new_role user_role) for admins to change other users' roles. Mirrors the
--      existing secure approve_vendor / reject_vendor pattern:
--        - verifies auth.uid() is an authenticated admin
--        - validates new_role against the user_role enum (parameter typing)
--        - refuses to remove the last admin account (lockout guard)
--        - fixed search_path to avoid search-path hijacking
--
-- Idempotent: safe to re-run (drop if exists + create or replace).
-- ============================================================================

-- Replace profiles_update_policy ---------------------------------------------
drop policy if exists "profiles_update_policy" on public.profiles;
create policy "profiles_update_policy"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and (
      role is not distinct from (
        select p.role from public.profiles p where p.id = auth.uid()
      )
    )
  );

-- Secure role-update RPC ------------------------------------------------------
create or replace function public.update_user_role(target_user_id uuid, new_role public.user_role)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_user_id uuid;
  caller_role    public.user_role;
begin
  caller_user_id := auth.uid();

  if caller_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select role into caller_role
    from public.profiles
   where id = caller_user_id;

  if caller_role is null or caller_role <> 'admin' then
    raise exception 'Permission denied: admin role required';
  end if;

  -- Lockout guard: never leave the platform with zero admin accounts.
  if new_role <> 'admin' then
    if not exists (
      select 1 from public.profiles
       where role = 'admin' and id <> target_user_id
    ) then
      raise exception 'Cannot remove the last admin account';
    end if;
  end if;

  if not exists (
    select 1 from public.profiles where id = target_user_id
  ) then
    raise exception 'Target user not found';
  end if;

  update public.profiles
     set role = new_role
   where id = target_user_id;

  return true;
end;
$$;

grant execute on function public.update_user_role(uuid, public.user_role) to authenticated;

-- ============================================================================
-- End of migration
-- ============================================================================
