-- ============================================================================
-- NexaMart AI - verification/grants_audit.sql   (READ ONLY)
-- ============================================================================
-- Item 16: privilege hardening audit.
-- This script only SELECTs. It changes nothing.
-- Run it in the Supabase SQL Editor and read section 8 (the verdict).
--
-- Background: in Postgres every function has EXECUTE granted to PUBLIC by
-- default, and Supabase gives `anon` and `authenticated` table privileges
-- broadly. Anything SECURITY DEFINER that either role can call is a way to
-- bypass RLS, because SECURITY DEFINER runs as the owner.
-- ============================================================================


-- 1. VERDICT SUMMARY ------------------------------------------------------
select * from (
  select
    'anon has table access (must be 0)' as check,
    count(*)::text as found,
    case when count(*) = 0 then 'PASS' else 'FAIL' end as result
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public'

  union all
  select
    'public tables without RLS (must be 0)',
    count(*)::text,
    case when count(*) = 0 then 'PASS' else 'FAIL' end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity

  union all
  select
    'SECURITY DEFINER fns callable by anon',
    count(*)::text,
    case when count(*) = 0 then 'PASS' else 'FAIL' end
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and has_function_privilege('anon', p.oid, 'EXECUTE')

  union all
  select
    'SECURITY DEFINER money fns callable by ANY authenticated user',
    count(*)::text,
    case when count(*) = 0 then 'PASS' else 'FAIL' end
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and p.proname in (
      'admin_financial_summary', 'vendor_financial_summary',
      'settle_order_financials', 'recalc_order_financials',
      'settle_payout', 'refund_order'
    )
) v order by result, check;


-- 2. anon table grants - every row here is a bug -----------------------
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
group by table_name
order by table_name;
-- Expected: 0 rows. anon is an unauthenticated visitor and needs no tables.


-- 3. Tables with RLS disabled -------------------------------------------
-- RLS off means the table's grants alone decide access, which is how
-- "authenticated can update everything" bugs happen.
select c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by c.relname;
-- Expected: 0 rows.


-- 4. authenticated DIRECT writes on money tables ----------------------
-- RLS normally makes these harmless, but grants should still be tight so a
-- policy mistake is not the only thing standing between a customer and the
-- ledger.
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'authenticated'
  and table_schema = 'public'
  and table_name in (
    'orders', 'order_items', 'vendor_ledger', 'vendor_payouts',
    'order_refunds', 'system_settings', 'profiles', 'vendors'
  )
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
order by table_name, privilege_type;


-- 5. RLS policies on the money tables ----------------------------------
-- Expect: read-only for customers, write via RPC only.
select tablename, policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('orders', 'vendor_ledger', 'vendor_payouts', 'order_refunds', 'system_settings')
order by tablename, policyname;


-- 6. SECURITY DEFINER functions reachable by anon ----------------------
select
  p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as function,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_call
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by p.proname;
-- Expected: 0 rows, or only functions that are safe to expose publicly.


-- 7. SECURITY DEFINER functions any authenticated user can call ---------
-- These bypass RLS. Each MUST verify the caller's role or ownership
-- internally. Review the list deliberately; do not revoke vendor embed
-- helpers, which are intended to be callable (migration 0033).
select
  p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as function,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and has_function_privilege('authenticated', p.oid, 'EXECUTE')
order by p.proname;


-- 8. Deliberate exceptions - confirm these still work -------------------
-- These are intentionally granted. Do NOT remove them during hardening.
select
  'vendor embed table (0033)' as intentional_grant,
  has_table_privilege('authenticated', 'public.vendors', 'SELECT') as present
union all
select
  'get_public_vendor_embed',
  has_function_privilege('authenticated',
    'public.get_public_vendor_embed(jsonb, integer)'::regprocedure, 'EXECUTE')
union all
select
  'get_public_vendor_embed_batch',
  has_function_privilege('authenticated',
    'public.get_public_vendor_embed_batch(jsonb)'::regprocedure, 'EXECUTE');
-- Expected: all true. If one is false the storefront vendor names will break.


-- 9. Column-level grants -----------------------------------------------
-- Rare, but a column grant can hand over a field with no table grant.
select table_name, column_name, privilege_type
from information_schema.column_privileges
where grantee in ('anon', 'authenticated')
  and table_schema = 'public'
  and privilege_type in ('INSERT', 'UPDATE')
  and table_name in ('orders', 'vendor_ledger', 'system_settings', 'profiles')
order by table_name, column_name;
