-- ============================================================================
-- 0042_vendor_trust_and_activity_logs.sql
-- ============================================================================
-- Three defects found by the vendor-trust audit.
--
-- 1. activity_logs accepted NO client writes.
--    RLS was enabled (0001_base_schema.sql:338) with a SELECT policy only
--    (0001_base_schema.sql:522). Every insert from the app ran as
--    `authenticated`, so every one was denied. admin/Vendors.tsx:59/:92/:177
--    and utils/activityLogger.ts:10 all discarded the returned { error }, so
--    approvals and rejections reported success while writing no audit row.
--    Confirmed on the live database: activity_logs held exactly one row
--    ('security_hardening'), written by migration 0020 as the table owner.
--
-- 2. Unverified vendors could publish live products.
--    products_insert_policy / products_update_policy (0001_base_schema.sql:396,
--    :400) authorized on ownership alone, with no is_verified condition. A
--    pending applicant could therefore create or flip a product to 'active'.
--
-- 3. reject_vendor only flipped a flag.
--    add_vendor_approval_rpc.sql:76 un-verified the vendor but left its
--    products live, so a rejected store kept selling. approve_vendor:42 also
--    unconditionally set profiles.role = 'vendor', which would silently demote
--    an admin who owned a storefront.
--
-- Idempotent: safe to re-run.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Admins may insert audit rows; nobody else may.
-- ---------------------------------------------------------------------------
-- Writes come from the admin session (admin/Vendors.tsx, admin/Coupons.tsx via
-- utils/activityLogger.ts). public.is_admin() is SECURITY DEFINER (0021) so it
-- does not recurse through profiles RLS.
drop policy if exists "activity_logs_insert_admin" on public.activity_logs;
create policy "activity_logs_insert_admin"
  on public.activity_logs for insert
  to authenticated
  with check (public.is_admin(auth.uid()));


-- ---------------------------------------------------------------------------
-- 2. Only verified vendors may publish or keep live products.
-- ---------------------------------------------------------------------------
-- A pending applicant may still draft (status <> 'active') their catalogue, but
-- cannot reach or retain 'active'. The USING clause stays ownership-only so an
-- unverified vendor can still edit a draft or unpublish a legacy live product;
-- WITH CHECK is what forbids the row from *ending up* active.
drop policy if exists "products_insert_policy" on public.products;
create policy "products_insert_policy"
  on public.products for insert
  with check (
    auth.uid() in (
      select vendors.user_id from public.vendors where vendors.id = products.vendor_id
    )
    and (
      products.status <> 'active'::public.product_status
      or exists (
        select 1 from public.vendors v
         where v.id = products.vendor_id and v.is_verified
      )
    )
  );

drop policy if exists "products_update_policy" on public.products;
create policy "products_update_policy"
  on public.products for update
  using (
    auth.uid() in (
      select vendors.user_id from public.vendors where vendors.id = products.vendor_id
    )
  )
  with check (
    auth.uid() in (
      select vendors.user_id from public.vendors where vendors.id = products.vendor_id
    )
    and (
      products.status <> 'active'::public.product_status
      or exists (
        select 1 from public.vendors v
         where v.id = products.vendor_id and v.is_verified
      )
    )
  );


-- ---------------------------------------------------------------------------
-- 3a. approve_vendor: never demote an admin.
-- ---------------------------------------------------------------------------
-- Previously: update profiles set role = 'vendor' where id = target_user_id.
-- An admin-owned storefront approved through this RPC would lose admin rights.
-- Only promote accounts that are not already admin.
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

  -- role <> 'admin' prevents demoting an admin who happens to own a storefront.
  update public.profiles
     set role = 'vendor'
   where id = target_user_id
     and role <> 'admin';

  return true;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3b. reject_vendor: un-verify, unpublish live products, demote non-admins.
-- ---------------------------------------------------------------------------
-- Rule chosen for reject vs profiles.role: a rejected seller is not a vendor, so
-- a non-admin profile returns to 'customer'. The vendors row is kept (with
-- is_verified = false) because deleting it would cascade-delete products and
-- order history (see add_vendor_approval_rpc.sql:49-51). Active products are
-- moved to 'draft' rather than deleted, so nothing is lost and the store can be
-- re-approved later. An admin profile is never demoted.
create or replace function public.reject_vendor(target_vendor_id uuid)
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

  update public.vendors set is_verified = false where id = target_vendor_id;

  -- Unpublish the storefront so a rejected seller stops selling immediately.
  update public.products
     set status = 'draft'::public.product_status
   where vendor_id = target_vendor_id
     and status = 'active'::public.product_status;

  -- A rejected non-admin is a customer again. Admins keep their role.
  update public.profiles
     set role = 'customer'
   where id = target_user_id
     and role <> 'admin';

  return true;
end;
$$;

grant execute on function public.approve_vendor(uuid) to authenticated;
grant execute on function public.reject_vendor(uuid) to authenticated;

-- ============================================================================
-- End of migration
-- ============================================================================
