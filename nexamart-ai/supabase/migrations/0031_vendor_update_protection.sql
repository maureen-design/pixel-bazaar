-- ============================================================================
-- NexaMart AI - 0031_vendor_update_protection.sql
-- Stop vendors from granting themselves privileges.
--
-- Root cause (see 0001_base_schema.sql:366-368):
--   create policy "vendors_update_policy" on public.vendors for update
--     using (auth.uid() = user_id);
-- The policy has a USING clause but no WITH CHECK, and RLS alone cannot
-- restrict *which columns* a row owner may write. Any authenticated user could
-- therefore run, against their own vendors row:
--     update vendors set is_verified = true where id = <own row>
-- and AuthContext.tsx:100 derives `isVendor` straight from
-- `vendor.is_verified === true`, so that single self-set flag granted entry to
-- the whole /vendor/* dashboard. rating / total_sales could likewise be forged
-- (both are displayed to buyers) and user_id could be reassigned to transfer
-- the store to another account.
--
-- The same escalation is reachable through INSERT, because
-- vendors_insert_policy only checks `auth.uid() = user_id`.
--
-- This migration therefore guards three surfaces:
--   1. UPDATE  - system-owned columns become immutable to non-admin writers
--                (BEFORE UPDATE trigger, same pattern as 0029's
--                protect_orders_payment_fields).
--   2. INSERT  - is_verified / rating / total_sales are forced to their
--                unprivileged defaults so a self-inserted row cannot start
--                life approved.
--   3. POLICY  - vendors_update_policy gains the missing WITH CHECK so user_id
--                cannot be repointed, and an explicit admin policy is added.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. System-owned columns are immutable to non-admin, non-service writers
-- ---------------------------------------------------------------------------
create or replace function public.protect_vendor_system_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  -- Service-role / server-side writers (approval RPC internals, edge
  -- functions using the service key) have no JWT subject; they are trusted.
  if auth.uid() is null then
    return new;
  end if;

  select role into v_role from public.profiles where id = auth.uid();

  -- Admins retain full vendor-management capability. The approval RPCs
  -- (add_vendor_approval_rpc.sql) are SECURITY DEFINER but still carry the
  -- admin's JWT subject, so they are covered by this branch.
  if v_role = 'admin' then
    return new;
  end if;

  -- Approval, reputation and moderation state are system-owned.
  if old.is_verified      is distinct from new.is_verified      or
     old.rating           is distinct from new.rating           or
     old.total_sales      is distinct from new.total_sales      or
     old.user_id          is distinct from new.user_id          or
     old.created_at       is distinct from new.created_at       or
     old.rejection_reason is distinct from new.rejection_reason or
     old.rejection_count  is distinct from new.rejection_count  or
     old.last_rejected_at is distinct from new.last_rejected_at then
    raise exception 'Vendor approval, rating, sales and ownership fields are managed by NexaMart';
  end if;

  -- Everything else (store_name, store_description, store_logo, store_cover,
  -- business_name, phone, city, main_categories, country) is vendor-editable,
  -- which is exactly what vendor/Settings.tsx writes.
  return new;
end;
$$;

drop trigger if exists trg_vendors_protect_system_fields on public.vendors;
create trigger trg_vendors_protect_system_fields
  before update on public.vendors
  for each row execute function public.protect_vendor_system_fields();

-- ---------------------------------------------------------------------------
-- 2. A self-inserted application can never start out approved
-- ---------------------------------------------------------------------------
-- Without this, hardening UPDATE alone would be bypassable: apply as vendor,
-- then insert a row with is_verified = true.
create or replace function public.protect_vendor_insert_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin'
  ) then
    return new;
  end if;

  new.is_verified      := false;
  new.rating           := 0;
  new.total_sales      := 0;
  new.rejection_count  := 0;
  new.rejection_reason := null;
  new.last_rejected_at := null;

  return new;
end;
$$;

drop trigger if exists trg_vendors_protect_insert_defaults on public.vendors;
create trigger trg_vendors_protect_insert_defaults
  before insert on public.vendors
  for each row execute function public.protect_vendor_insert_defaults();

-- ---------------------------------------------------------------------------
-- 3. Close the missing WITH CHECK and give admins an explicit path
-- ---------------------------------------------------------------------------
-- The old USING-only policy let a vendor repoint user_id at another account.
-- WITH CHECK is evaluated against the post-update row, so it pins ownership.
drop policy if exists "vendors_update_policy" on public.vendors;
create policy "vendors_update_policy"
  on public.vendors for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- admin/Vendors.tsx:70 writes rejection_reason / last_rejected_at directly from
-- the admin's session. Under the owner-only policy above that update matches
-- zero rows, so vendor rejection silently failed. Grant admins the equivalent
-- of the categories policy (0001_base_schema.sql:383).
drop policy if exists "vendors_update_admin_policy" on public.vendors;
create policy "vendors_update_admin_policy"
  on public.vendors for update
  using (exists (
    select 1 from public.profiles
     where profiles.id = auth.uid() and profiles.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
     where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

-- ============================================================================
-- End of migration
-- ============================================================================
