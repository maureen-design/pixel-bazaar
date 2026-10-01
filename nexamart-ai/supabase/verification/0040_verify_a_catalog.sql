-- ============================================================================
-- 0040_verify_a_catalog.sql
-- ============================================================================
-- SECTION A of 0040 verification. Runs with no identity needed.
--
-- RUN THIS FILE ON ITS OWN. The Supabase SQL Editor only renders one result
-- grid per Run, so if this is pasted together with the other sections you will
-- see a different section's output and assume this one was empty.
--
-- Expected: 9 rows (6 checks + 3 lines of 004dump), ok = true for all checks.
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
-- PostgreSQL stores `set search_path = ''` as search_path="" WITH the quotes
-- attached, so matching the bare prefix 'search_path=' finds nothing and
-- reports a false negative. Confirmed against the 004dump row below, which
-- prints the stored value verbatim.
select '004' as check,
       (select count(*) = 0
          from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('admin_financial_summary','admin_daily_commission','admin_refunds_in_window')
            and NOT (
                 p.prosecdef
                 -- Must exist a search_path entry whose value is empty after
                 -- stripping quotes. Phrased positively as a definition of
                 -- SAFE, because the obvious negative form is inverted: a
                 -- function with no search_path setting at all, and a function
                 -- with search_path=public, are both unsafe and both satisfy
                 -- "no entry has a non-empty value".
                 and EXISTS (
                       select 1
                         from unnest(coalesce(p.proconfig, '{}')) c
                        where c like 'search_path=%'
                          -- chr() avoids having to write a literal quote, which
                          -- needs four characters and silently derails the whole
                          -- statement when miscounted.
                          and nullif(
                                btrim(replace(replace(
                                  substr(c, length('search_path=') + 1),
                                  chr(34), ''),
                                  chr(39), '')),
                                '') is null
                     )
               )) as ok,
       'every admin reporting function is SECURITY DEFINER with search_path pinned to empty' as detail
union all
-- Not a pass or fail. Shows the stored setting verbatim so a false 004 can be
-- diagnosed without guessing.
select '004dump' as check,
       null::boolean as ok,
       p.proname || ' | prosecdef=' || p.prosecdef || ' | proconfig=' || coalesce(array_to_string(p.proconfig, ' ~ '), '(null)')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('admin_financial_summary','admin_daily_commission','admin_refunds_in_window')
order by 1;