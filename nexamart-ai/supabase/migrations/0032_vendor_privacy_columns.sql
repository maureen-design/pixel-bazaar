-- ============================================================================
-- Migration: 0032_vendor_privacy_columns.sql
--
-- Root cause
--   0001_base_schema.sql:530   grant all on all tables in schema public
--                              to anon, authenticated, service_role;
--   0001_base_schema.sql:358   create policy "vendors_select_policy"
--                              on public.vendors for select using (true);
--
--   Together those mean the anon key - which ships in the browser bundle via
--   VITE_SUPABASE_ANON_KEY and is therefore public - can read every column of
--   every vendors row:
--
--     curl '<supabase-url>/rest/v1/vendors?select=*' -H 'apikey: <anon key>'
--
--   No app query leaked this. Every buyer-facing vendors read already listed
--   columns explicitly (useStore.ts STORE_FIELDS, useVendors.ts, the
--   vendor:vendors!inner(...) embeds in useProducts / useSearch /
--   useCategoryFilter / WishlistContext). The exposure was direct PostgREST.
--
-- Why column privileges and not a tighter RLS policy
--   vendors_select_policy is row-level; privacy here is column-level. Making
--   the policy `is_verified = true or auth.uid() = user_id or <admin>` would
--   hide unverified vendor rows, and two surfaces depend on those rows being
--   readable by anon:
--     - /store/:id (useStore.ts) deliberately renders a pending vendor with a
--       "Verification pending" badge instead of 404ing.
--     - product cards embed `vendor:vendors!inner(...)` for every product
--       regardless of approval, so hiding unverified rows blanks the store
--       name on those cards.
--   Every vendors row carries public content, so there is no row-private class
--   of data to separate. Rows stay open; the column grants below are the
--   control, and they are enforced by Postgres rather than by convention.
--
-- Private from anon AND authenticated (both are "public buyers" - a signed-up
-- customer has no business reading these either):
--   phone, rejection_reason, rejection_count, last_rejected_at, user_id
--
-- Preserved access:
--   owner -> public.get_my_vendor()       security definer, own row only
--   admin -> public.admin_list_vendors()  security definer, role-checked
--
-- service_role keeps its table-level grant, so all 18 edge functions
-- (send-vendor-lifecycle, send-admin-notification, ...) are unaffected.
--
-- MUST BE APPLIED TOGETHER WITH 0033_vendor_embed_grant.sql
--   The column grants below are not sufficient on their own. Revoking the
--   table-level grant also removes table-level SELECT, which PostgREST requires
--   to resolve `vendor:vendors!inner(...)` at all. Under 0032 alone every one of
--   those embeds returns 42501 and the storefront renders empty, while direct
--   SQL as anon still reads store_name fine - a confusing split. 0033 restores
--   the table grant and re-revokes the five private columns on top of it.
--   See supabase/verification/0033_verify.sql for the final-state checks.
--
-- ROLLBACK: `grant select on public.vendors to anon, authenticated;`
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Column privileges
-- ---------------------------------------------------------------------------
-- The table-level grant has to go first. `grant all on all tables` in 0001 is
-- a table-level SELECT, and while it stands the narrower column grant below
-- is meaningless - a table-level grant covers every column including future
-- ones.
--
-- WARNING: 0032 IS NOT A COMPLETE STATE ON ITS OWN. Removing this grant also
-- removes table-level SELECT entirely, and PostgREST needs table-level SELECT to
-- resolve a relation. Applied alone, 0032 makes every `vendor:vendors!inner`
-- embed fail with 42501 and the whole storefront renders empty, even though
-- direct SQL as anon still reads fine. 0033_vendor_embed_grant.sql restores the
-- table grant and re-revokes the five private columns on top of it. Always
-- apply 0032 then 0033, never 0032 alone.
revoke select on public.vendors from anon, authenticated;

-- The public half. This is the union of what the store page, product embeds,
-- featured vendors and the verified badge actually read. Note there is no
-- default-privileges clause in 0001, so a column added later is NOT
-- auto-granted: new columns fail closed and someone has to add them here.
grant select (
  id,
  store_name,
  store_description,
  store_logo,
  store_cover,
  rating,
  total_sales,
  is_verified,
  business_name,
  country,
  city,
  main_categories,
  created_at,
  updated_at
) on public.vendors to anon, authenticated;

-- INSERT / UPDATE / DELETE are deliberately left at table level.
--   - vendor/Apply.tsx inserts an application row (needs the phone column).
--   - vendor/Settings.tsx updates store_name / store_description /
--     business_name / store_logo / store_cover.
--   - admin/Vendors.tsx:70 updates rejection_reason / last_rejected_at, which
--     0031's policies and triggers already govern for writes.
-- Revoking SELECT does not affect those paths: an UPDATE needs UPDATE privilege
-- on the SET columns, and neither query uses RETURNING.

-- Intentional side effect, called out because it is the reason four queries
-- were rewritten: `select *` on vendors now fails with
--   42501 permission denied for table vendors
-- for anon and authenticated, because the star expands to the revoked columns.

-- ---------------------------------------------------------------------------
-- 2. Row-level SELECT policy, restated with its reasoning
-- ---------------------------------------------------------------------------
-- Dropped and recreated purely so the intent lives in the schema. The
-- expression is unchanged, and that is the deliberate choice - see the header.
drop policy if exists "vendors_select_policy" on public.vendors;
create policy "vendors_select_policy"
  on public.vendors for select
  using (true);

-- ---------------------------------------------------------------------------
-- 3. Owner self-read
-- ---------------------------------------------------------------------------
-- AuthContext.tsx used `select *` filtered by user_id, and vendor/Apply.tsx
-- used the same shape to detect an existing application. Both are now
-- permission errors, and the user_id filter is itself the predicate being
-- revoked. This moves the ownership test server-side, where the definer can
-- still read user_id. auth.uid() is null for anon, so the predicate matches
-- nothing and the function is a no-op for logged-out callers.
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
         v.phone,
         v.rejection_reason,
         v.rejection_count,
         v.last_rejected_at,
         v.created_at,
         v.updated_at
    from public.vendors v
   where v.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 4. Admin roster
-- ---------------------------------------------------------------------------
-- admin/Vendors.tsx and admin/Dashboard.tsx did
--   select('*, profiles!inner(full_name, email, created_at)')
-- Two separate reasons that stops working. The star expands to the revoked
-- columns, so it fails on those. And the PostgREST embed resolves through
-- vendors.user_id, which authenticated can no longer select, so the join would
-- fail even with an explicit column list. The second reason is the reason to
-- keep this change: it is a genuine capability removal, not a syntax fix.
-- (Separately, 0032 alone breaks all embeds via the missing table-level grant;
-- 0033 fixes that. The user_id revoke stands and is the reason for this RPC.)
--
-- Folding the applicant identity in here also removes the reliance on the
-- documented embed-bypasses-RLS behaviour (0020:5-6): the join runs inside a
-- definer function owned by the migration role, so profiles' owner-only
-- SELECT policy is not in the path at all.
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
         v.phone,
         v.rejection_reason,
         v.rejection_count,
         v.last_rejected_at,
         v.created_at,
         v.updated_at,
         p.full_name,
         p.email,
         p.created_at
    from public.vendors v
    left join public.profiles p on p.id = v.user_id
   order by v.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Function grants
-- ---------------------------------------------------------------------------
-- Same pattern as 0011/0013/0017: revoke from PUBLIC (which implicitly covers
-- anon and authenticated) before granting, so an inherited default cannot
-- leave these callable by logged-out callers.
revoke all on function public.get_my_vendor() from public;
grant execute on function public.get_my_vendor() to authenticated;

revoke all on function public.admin_list_vendors() from public;
grant execute on function public.admin_list_vendors() to authenticated;

-- ============================================================================
-- End of migration
-- ============================================================================
