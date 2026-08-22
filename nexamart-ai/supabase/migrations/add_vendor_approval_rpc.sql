-- ============================================================================
-- Vendor approval RPCs
-- Secure vendor approval/rejection for admins.
-- SECURITY DEFINER + fixed search_path; authorization is verified inside the
-- function via auth.uid() and profiles.role (never trusts client input).
-- ============================================================================

create or replace function public.approve_vendor(target_vendor_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_user_id uuid;
  caller_role    public.user_role;
  target_user_id uuid;
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

  select user_id into target_user_id
    from public.vendors
   where id = target_vendor_id;

  if target_user_id is null then
    raise exception 'Vendor not found';
  end if;

  update public.vendors set is_verified = true where id = target_vendor_id;
  update public.profiles set role = 'vendor' where id = target_user_id;

  return true;
end;
$$;

-- Reject/revoke a vendor by un-verifying the application.
-- NOTE: intentionally sets is_verified = false instead of deleting the row:
-- deleting a vendors row would cascade-delete the vendor's products and
-- order history (products.vendor_id / orders.vendor_id on delete cascade).
create or replace function public.reject_vendor(target_vendor_id uuid)
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

  update public.vendors set is_verified = false where id = target_vendor_id;

  return true;
end;
$$;

grant execute on function public.approve_vendor(uuid) to authenticated;
grant execute on function public.reject_vendor(uuid) to authenticated;