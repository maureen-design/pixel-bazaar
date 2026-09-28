-- ============================================================================
-- Migration: 0034_vendor_private_split.sql
--
-- Moves the private vendor columns off public.vendors into a side table, so
-- that the table-level SELECT which PostgREST requires for embeds no longer
-- costs us the privacy of those columns.
--
-- Why this exists
--   0032 removed table-level SELECT from anon/authenticated and replaced it
--   with a column grant on the 14 public columns. Postgres honoured that, but
--   PostgREST could not resolve `vendor:vendors!inner(...)` at all:
--     {"code":"42501","message":"permission denied for table vendors"}
--   and every product grid on the site rendered empty. 0033 restored the
--   table-level grant.
--
--   The 0033 corrective `revoke select (phone, ...)` was then a silent no-op,
--   and the reason is worth writing down because it is easy to get wrong again:
--   table-level and column-level privileges are INDEPENDENT and ORed together.
--   The effective privilege on a column is the UNION of relacl and attacl. A
--   column-level REVOKE can only subtract a grant that lives in attacl; it
--   cannot mask a grant that lives in relacl. Live evidence: after running it,
--   attacl was still NULL and has_column_privilege('anon','vendors','phone',
--   'SELECT') was still true.
--
--   Conclusion: there is NO way to deny specific columns from a role that holds
--   table-level SELECT. The only way to hide a column from anon is to not have
--   that column on a table anon can read. Hence this file.
--
-- What moves to public.vendor_private
--   phone, rejection_reason, rejection_count, last_rejected_at
--
-- What stays on public.vendors, and why - user_id
--   user_id deliberately STAYS. It is a FK to profiles with a UNIQUE
--   constraint (0001:60, 0027 vendors_user_id_unique) that is the
--   duplicate-application guard, and it is referenced by vendor authorization
--   in nine RLS policies and three definer functions:
--     0001:394,398,402,406  products insert/update/delete for vendors
--     0001:480,484         orders select/update
--     0001:489             order_items select
--     0014:37,42           orders RLS tighten
--     0031:132             vendors_update_policy
--     0029:90, 0030:67     order-cancellation integrity (definer)
--     add_vendor_approval_rpc.sql:33
--   and by two edge functions on the service key:
--     send-vendor-lifecycle, send-admin-notification
--   Moving it means rewriting all of the above, including order-cancellation
--   and order-integrity functions, which is out of scope here. So user_id
--   remains readable by anon. That is a real, accepted exposure and it is
--   recorded in 0034_verify.sql so it cannot be forgotten. See RESIDUAL RISK.
--
-- Result
--   vendors: 14 public columns, table-level SELECT for anon/authenticated,
--            embeds work, and there is nothing left on the table to leak.
--   vendor_private: no anon grant at all, RLS owner-or-admin, reachable only
--            through the SECURITY DEFINER RPCs or an owner/admin session.
--
-- Idempotent: safe to re-run. The data copy is guarded on the columns still
-- existing, and every drop uses `if exists`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The side table
-- ---------------------------------------------------------------------------
-- vendor_id is both PK and FK, which enforces the 1:1 invariant. ON DELETE
-- CASCADE keeps a private row from outliving its vendor.
create table if not exists public.vendor_private (
  vendor_id        uuid primary key references public.vendors (id) on delete cascade,
  phone            text,
  rejection_reason text,
  rejection_count  integer not null default 0,
  last_rejected_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.vendor_private is
  'Private vendor data. Reachable only via SECURITY DEFINER RPCs or an owner/admin session. Never expose to anon.';
comment on column public.vendor_private.rejection_reason is 'Admin-supplied. Visible to the applicant and admins only.';
comment on column public.vendor_private.phone is 'Applicant-supplied. Visible to the applicant and admins only.';

create or replace function public.touch_vendor_private_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists update_vendor_private_updated_at on public.vendor_private;
create trigger update_vendor_private_updated_at
  before update on public.vendor_private
  for each row execute function public.touch_vendor_private_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Grants and RLS
-- ---------------------------------------------------------------------------
-- Every grantee is revoked BY NAME, not just PUBLIC. This is the subtle part,
-- and an earlier version of this file got it wrong:
--
--   Supabase applies ALTER DEFAULT PRIVILEGES on the public schema, so
--   `create table public.vendor_private` arrives ALREADY carrying explicit ALL
--   grants for anon, authenticated and service_role. `revoke ... from public`
--   removes only the PUBLIC pseudo-role's ACL entry; it leaves those explicit
--   per-role entries completely intact. Revoking from public alone therefore
--   left anon holding SELECT on this table, and the section 8 guard caught it.
--
-- So: name every role. Then grant back only what is actually needed.
revoke all on table public.vendor_private from anon, authenticated, public;

-- authenticated is the only role that gets anything, and only these three
-- privileges. No DELETE: deleting a vendor cascades anyway, and there is
-- deliberately no DELETE policy below.
grant select, insert, update on table public.vendor_private to authenticated;
grant all on table public.vendor_private to service_role;

-- Same lesson applies to the function grants in section 7: name the roles.
revoke all on function public.get_my_vendor() from anon, public;
revoke all on function public.admin_list_vendors() from anon, public;

alter table public.vendor_private enable row level security;

-- Ownership is still "the vendors row's user_id is me", and authenticated can
-- evaluate that subquery because it holds SELECT on vendors. Only the four
-- moderation/contact columns moved, not the ownership link.
drop policy if exists "vendor_private_select_policy" on public.vendor_private;
create policy "vendor_private_select_policy"
  on public.vendor_private for select
  using (
    exists (
      select 1 from public.vendors v
       where v.id = vendor_private.vendor_id
         and v.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles
       where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- WITH CHECK pins vendor_id to a store I own, so an owner cannot write my
-- private fields onto someone else's store row.
drop policy if exists "vendor_private_insert_policy" on public.vendor_private;
create policy "vendor_private_insert_policy"
  on public.vendor_private for insert
  with check (
    exists (
      select 1 from public.vendors v
       where v.id = vendor_private.vendor_id
         and v.user_id = auth.uid()
    )
  );

drop policy if exists "vendor_private_update_policy" on public.vendor_private;
create policy "vendor_private_update_policy"
  on public.vendor_private for update
  using (
    exists (
      select 1 from public.vendors v
       where v.id = vendor_private.vendor_id
         and v.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles
       where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.vendors v
       where v.id = vendor_private.vendor_id
         and v.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles
       where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- No DELETE policy and no DELETE grant. Deleting a vendor cascades anyway.

-- ---------------------------------------------------------------------------
-- 3. Invariant: every vendors row has exactly one vendor_private row
-- ---------------------------------------------------------------------------
-- Without this the side table could drift out of sync, and a vendor with no
-- private row would silently lose their phone number. The trigger is SECURITY
-- DEFINER so it writes despite RLS, which is how the app's later upsert of
-- `phone` always finds a row to update.
create or replace function public.ensure_vendor_private_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.vendor_private (vendor_id)
  values (new.id)
  on conflict (vendor_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_vendors_ensure_private_row on public.vendors;
create trigger trg_vendors_ensure_private_row
  after insert on public.vendors
  for each row execute function public.ensure_vendor_private_row();

-- ---------------------------------------------------------------------------
-- 4. Guards on the side table, mirroring 0031's guards on vendors
-- ---------------------------------------------------------------------------
-- An owner may edit their own contact number. They may not edit the moderation
-- fields, and they may not repoint vendor_id at another store.
create or replace function public.protect_vendor_private_system_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  if auth.uid() is null then
    return new;
  end if;

  select role into v_role from public.profiles where id = auth.uid();

  if v_role = 'admin' then
    return new;
  end if;

  if old.vendor_id        is distinct from new.vendor_id        or
     old.rejection_reason is distinct from new.rejection_reason or
     old.rejection_count  is distinct from new.rejection_count  or
     old.last_rejected_at is distinct from new.last_rejected_at then
    raise exception 'Vendor moderation and ownership fields are managed by NexaMart';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_vendor_private_protect_system_fields on public.vendor_private;
create trigger trg_vendor_private_protect_system_fields
  before update on public.vendor_private
  for each row execute function public.protect_vendor_private_system_fields();

create or replace function public.protect_vendor_private_insert_defaults()
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

  new.rejection_reason := null;
  new.rejection_count  := 0;
  new.last_rejected_at := null;

  return new;
end;
$$;

drop trigger if exists trg_vendor_private_protect_insert_defaults on public.vendor_private;
create trigger trg_vendor_private_protect_insert_defaults
  before insert on public.vendor_private
  for each row execute function public.protect_vendor_private_insert_defaults();

-- ---------------------------------------------------------------------------
-- 5. Recreate 0031's vendors triggers WITHOUT the columns that are leaving
-- ---------------------------------------------------------------------------
-- This must happen BEFORE the drop in section 6, or the trigger bodies would
-- reference columns that no longer exist and every vendors UPDATE would fail.
create or replace function public.protect_vendor_system_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  if auth.uid() is null then
    return new;
  end if;

  select role into v_role from public.profiles where id = auth.uid();

  if v_role = 'admin' then
    return new;
  end if;

  -- rejection_reason / rejection_count / last_rejected_at are no longer on
  -- vendors; they are guarded by protect_vendor_private_system_fields above.
  if old.is_verified is distinct from new.is_verified or
     old.rating      is distinct from new.rating      or
     old.total_sales is distinct from new.total_sales or
     old.user_id     is distinct from new.user_id     or
     old.created_at  is distinct from new.created_at then
    raise exception 'Vendor approval, rating, sales and ownership fields are managed by NexaMart';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_vendors_protect_system_fields on public.vendors;
create trigger trg_vendors_protect_system_fields
  before update on public.vendors
  for each row execute function public.protect_vendor_system_fields();

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

  new.is_verified := false;
  new.rating      := 0;
  new.total_sales := 0;

  return new;
end;
$$;

drop trigger if exists trg_vendors_protect_insert_defaults on public.vendors;
create trigger trg_vendors_protect_insert_defaults
  before insert on public.vendors
  for each row execute function public.protect_vendor_insert_defaults();

-- ---------------------------------------------------------------------------
-- 6. Move the data, then drop the columns
-- ---------------------------------------------------------------------------
-- The copy runs only while the source columns still exist, so a re-run of this
-- migration is a no-op rather than an error. `do update` makes it converge
-- rather than accumulate, in case it is ever run against a partially migrated
-- database.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'vendors'
       and column_name  = 'phone'
  ) then
    insert into public.vendor_private (
      vendor_id, phone, rejection_reason, rejection_count, last_rejected_at
    )
    select v.id,
           v.phone,
           v.rejection_reason,
           coalesce(v.rejection_count, 0),
           v.last_rejected_at
      from public.vendors v
    on conflict (vendor_id) do update
      set phone            = excluded.phone,
          rejection_reason = excluded.rejection_reason,
          rejection_count  = excluded.rejection_count,
          last_rejected_at = excluded.last_rejected_at;
  end if;
end;
$$;

-- Any vendors row that predates this migration still needs a private row, in
-- case the trigger above has not fired for it.
insert into public.vendor_private (vendor_id)
select v.id from public.vendors v
on conflict (vendor_id) do nothing;

alter table public.vendors
  drop column if exists phone,
  drop column if exists rejection_reason,
  drop column if exists rejection_count,
  drop column if exists last_rejected_at;

-- ---------------------------------------------------------------------------
-- 7. Repoint the two definer RPCs
-- ---------------------------------------------------------------------------
-- Both keep their exact previous return shape, so AuthContext.tsx,
-- vendor/Apply.tsx, admin/Vendors.tsx and admin/Dashboard.tsx need no change
-- on the read side. SECURITY DEFINER means these read vendor_private despite
-- its RLS, which is the whole point of routing access through here.
create or replace function public.get_my_vendor()
returns table (
  id                   uuid,
  user_id              uuid,
  store_name           text,
  store_description    text,
  store_logo           text,
  store_cover          text,
  rating               numeric,
  total_sales          integer,
  is_verified          boolean,
  business_name        text,
  country              text,
  city                 text,
  main_categories      text,
  phone                text,
  rejection_reason     text,
  rejection_count      integer,
  last_rejected_at     timestamptz,
  created_at           timestamptz,
  updated_at           timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id,
         v.user_id,
         v.store_name,
         v.store_description,
         v.store_logo,
         v.store_cover,
         v.rating,
         v.total_sales,
         v.is_verified,
         v.business_name,
         v.country,
         v.city,
         v.main_categories,
         vp.phone,
         vp.rejection_reason,
         vp.rejection_count,
         vp.last_rejected_at,
         v.created_at,
         v.updated_at
    from public.vendors v
    left join public.vendor_private vp on vp.vendor_id = v.id
   where v.user_id = auth.uid();
$$;

create or replace function public.admin_list_vendors()
returns table (
  id                   uuid,
  user_id              uuid,
  store_name           text,
  store_description    text,
  store_logo           text,
  store_cover          text,
  rating               numeric,
  total_sales          integer,
  is_verified          boolean,
  business_name        text,
  country              text,
  city                 text,
  main_categories      text,
  phone                text,
  rejection_reason     text,
  rejection_count      integer,
  last_rejected_at     timestamptz,
  created_at           timestamptz,
  updated_at           timestamptz,
  applicant_full_name  text,
  applicant_email      text,
  applicant_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.profiles
     where profiles.id = auth.uid()
       and profiles.role = 'admin'
  ) then
    raise exception 'Permission denied: admin role required';
  end if;

  return query
  select v.id,
         v.user_id,
         v.store_name,
         v.store_description,
         v.store_logo,
         v.store_cover,
         v.rating,
         v.total_sales,
         v.is_verified,
         v.business_name,
         v.country,
         v.city,
         v.main_categories,
         vp.phone,
         vp.rejection_reason,
         vp.rejection_count,
         vp.last_rejected_at,
         v.created_at,
         v.updated_at,
         p.full_name,
         p.email,
         p.created_at
    from public.vendors v
    left join public.vendor_private vp on vp.vendor_id = v.id
    left join public.profiles p on p.id = v.user_id
   order by v.created_at desc;
end;
$$;

-- Grants are restated so a re-run repairs them if they were lost. anon is
-- named explicitly, not left to the PUBLIC revoke alone - see section 2 for
-- why that distinction matters.
revoke all on function public.get_my_vendor() from anon, public;
grant execute on function public.get_my_vendor() to authenticated;

revoke all on function public.admin_list_vendors() from anon, public;
grant execute on function public.admin_list_vendors() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Guard
-- ---------------------------------------------------------------------------
-- Same reasoning as 0033's guard: this migration's whole value is that the
-- private columns stop being readable. If that did not happen, fail loudly
-- rather than leave a migration that looks like it worked.
--
-- Every check below uses has_table_privilege / has_column_privilege, never
-- information_schema.*_privileges. The information_schema views fall back to
-- the table ACL for any column with no ACL of its own, and expand every
-- privilege in it, so they report a table-level grant as column-level SELECT.
-- An earlier version of this guard used column_privileges and both
-- misdiagnosed the state and hid why it was wrong.
do $$
declare
  still_on_vendors text;
  anon_can_read    text;
begin
  select string_agg(column_name, ', ' order by column_name) into still_on_vendors
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'vendors'
     and column_name in ('phone', 'rejection_reason', 'rejection_count', 'last_rejected_at');

  if still_on_vendors is not null then
    raise exception
      '0034 FAILED - private columns still present on public.vendors: %', still_on_vendors;
  end if;

  select string_agg(c, ', ' order by c) into anon_can_read
    from unnest(array['phone', 'rejection_reason', 'rejection_count', 'last_rejected_at']) as c
   where has_column_privilege('anon', 'public.vendor_private', c, 'SELECT');

  if anon_can_read is not null then
    raise exception
      '0034 FAILED - anon can still read vendor_private columns: %', anon_can_read;
  end if;

  if has_table_privilege('anon', 'public.vendor_private', 'SELECT') then
    raise exception
      '0034 FAILED - anon still holds table-level SELECT on public.vendor_private';
  end if;

  -- And the other direction. Over-revoking is the failure mode that has bitten
  -- this migration twice already (0032 broke the embeds, 0033 re-opened the
  -- leak), so assert that authenticated can still do its job rather than only
  -- asserting that anon cannot.
  if not has_column_privilege('authenticated', 'public.vendor_private', 'phone', 'SELECT') then
    raise exception
      '0034 FAILED - authenticated lost SELECT on vendor_private, so owner and admin writes will fail';
  end if;

  if not has_table_privilege('anon', 'public.vendors', 'SELECT') then
    raise exception
      '0033 was not applied - anon has no table-level SELECT on vendors, so PostgREST embeds will 42501';
  end if;

  -- Note: there is deliberately no `has_column_privilege('anon',
  -- 'public.vendors', 'phone', 'SELECT')` check here. That column is gone by
  -- this point, and has_column_privilege raises "column does not exist" rather
  -- than returning false, so the check would abort the migration with a
  -- misleading error. `still_on_vendors` above is the structural proof, and it
  -- is the stronger one: a column that is not on the table cannot leak from it.
end;
$$;

-- ============================================================================
-- End of migration
-- ============================================================================
