-- ============================================================================
-- 0040_verify_a_catalog.sql
-- ============================================================================
-- SECTION A of 0040 verification. Runs with no identity needed.
--
-- RUN THIS FILE ON ITS OWN. The Supabase SQL Editor only renders one result
-- grid per Run, so if this is pasted together with the other sections you will
-- see a different section's output and assume this one was empty.
--
-- Expected: 6 rows, ok = true for all of them.
-- This script is read-only.
-- ============================================================================

with f as (
  select p.oid::regprocedure::text as sig, p.prosecdef, p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'admin_financial_summary',
       'admin_daily_commission',
       'admin_refunds_in_window'
     )
)
select '001' as check,
       count(*) = 3 as ok,
       'expected 3 admin reporting functions, found ' || count(*)::text as detail
  from f
union all
select '001b' as check,
       bool_and(has_function_privilege('authenticated', sig, 'EXECUTE')) as ok,
       'all three grant EXECUTE to authenticated, or the dashboards render zero' as detail
  from f
union all
select '001c' as check,
       bool_and(NOT has_function_privilege('anon', sig, 'EXECUTE')) as ok,
       'anon is denied EXECUTE on all three' as detail
  from f
union all
-- PUBLIC is a pseudo-role with no OID, so has_function_privilege('public',...)
-- cannot be used. aclexplode surfaces PUBLIC grants as grantee = 0, and
-- acldefault() supplies the default ACL when proacl IS NULL.
select '002' as check,
       NOT EXISTS (
         select 1
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           cross join lateral aclexplode(
             coalesce(p.proacl, acldefault('f', p.proowner))
           ) acl
          where n.nspname = 'public'
            and p.proname = 'admin_refunds_in_window'
            and acl.grantee = 0
            and acl.privilege_type = 'EXECUTE'
       ) as ok,
       'refunds RPC is not left open to PUBLIC' as detail
union all
select '003' as check,
       (select count(*) = 0
          from public.orders o
         where o.payment_status in ('paid'::public.payment_status, 'refunded'::public.payment_status)
           and o.paid_at is null) as ok,
       'FALSE means some paid orders have no paid_at and the coalesce fallback is being used; true means every settled order has a real payment timestamp' as detail
union all
select '004' as check,
       (select count(*) = 0
          from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('admin_financial_summary','admin_daily_commission','admin_refunds_in_window')
            and (NOT p.prosecdef
                 OR NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c
                                 WHERE c = 'search_path='))) as ok,
       'every admin reporting function is SECURITY DEFINER with a pinned empty search_path' as detail
order by 1;