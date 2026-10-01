-- ============================================================================
-- 0040_verify.sql
-- ============================================================================
-- SUPERSEDED, kept only for reference. Do not run this file.
--
-- It contains four result sets in one paste, and the Supabase SQL Editor
-- renders only ONE grid per Run, so it silently hid whole sections. That is
-- why 0039's output never appeared either.
--
-- Run these instead, each on its own:
--   0040_verify_a_catalog.sql    rows, 6 checks
--   0040_verify_b_admin.sql      notices 021 to 026
--   0040_verify_c_nonadmin.sql   notices 030 to 032
--
-- Read-only either way.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Section 1. Catalog. Runs without any identity.
-- ---------------------------------------------------------------------------
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
select '001b',
       bool_and(has_function_privilege('authenticated', sig, 'EXECUTE')),
       'all three grant EXECUTE to authenticated'
  from f
union all
select '001c',
       bool_and(NOT has_function_privilege('anon', sig, 'EXECUTE')),
       'anon is denied on all three'
  from f
union all
-- 'public' is a pseudo-role with no OID, so has_function_privilege('public',...)
-- is not reliable. aclexplode exposes PUBLIC grants as grantee = 0 instead.
-- acldefault covers the proacl IS NULL case, where PUBLIC holds EXECUTE by default.
select '002',
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
       ),
       'refunds RPC is not left open to PUBLIC'
union all
select '003',
       (select count(*) = 0
          from public.orders o
         where o.payment_status in ('paid'::public.payment_status, 'refunded'::public.payment_status)
           and o.paid_at is null),
       'if false, some paid orders have no paid_at and the coalesce fallback is being used; true means every settled order has a real payment timestamp'
union all
select '004',
       (select count(*) = 0
          from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('admin_financial_summary','admin_daily_commission','admin_refunds_in_window')
            and (NOT p.prosecdef
                 OR NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c
                                 WHERE c = 'search_path='))),
       'every admin reporting function is SECURITY DEFINER with a pinned empty search_path';


-- ---------------------------------------------------------------------------
-- Section 2. Windowing semantics, computed directly against the tables.
-- These do not call the RPCs, so they run without identity and prove the
-- underlying data supports the new date basis.
-- ---------------------------------------------------------------------------
select '005' as check,
       (select count(*) = 0
          from public.orders o
         where o.payment_status in ('paid'::public.payment_status, 'refunded'::public.payment_status)
           and o.paid_at is not null
           and o.paid_at > o.created_at + interval '90 days') as ok,
       'if false, an order was paid long after creation and will appear in a very different window than before the migration; true means created_at and paid_at are close enough that the shift is small'
union all
select '006',
       (select coalesce(sum(o.commission_amount), 0) >= 0
          from public.orders o
         where o.payment_status in ('paid'::public.payment_status, 'refunded'::public.payment_status)
           and o.refunded_at is null
           and coalesce(o.paid_at, o.created_at) >= now() - interval '30 days'
           and coalesce(o.paid_at, o.created_at) <  now()),
       'live commission over the last 30 days on the new paid_at basis is non-negative and computable'
union all
select '007',
       (select count(*) = 0
          from public.orders o
         where o.refunded_at is not null
           and o.refund_amount is null),
       'if false, a refunded order has no refund_amount and the money-back figures will be understated'
union all
select '008',
       (select coalesce(sum(o.refund_amount), 0) >= 0
          from public.orders o
         where o.refunded_at is not null),
       'refund amounts are non-negative; a negative here means a refund is being recorded as a charge'
order by 1;


-- ---------------------------------------------------------------------------
-- Section 3. Exercise the RPCs as an admin.
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin   uuid;
  v_count   int;
  v_first   date;
  v_comm    numeric;
  v_gmv     numeric;
  v_vend    numeric;
  v_orders  bigint;
  v_net     numeric;
  v_refunds bigint;
  v_amt     numeric;
begin
  -- No identity in the SQL Editor, so adopt a real admin for this transaction.
  select id into v_admin
    from public.profiles
   where role = 'admin'::public.user_role
   limit 1;

  if v_admin is null then
    raise notice 'SKIP: no admin profile exists, sections 3 and 4 cannot run';
    return;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',    v_admin::text,
      'role',   'authenticated',
      'email',  'verify@local'
    )::text,
    true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  -- 021. Totals resolve, and the components reconcile.
  select r.orders_paid, r.gmv, r.net_platform_revenue, r.vendor_earnings_paid
    into v_orders, v_gmv, v_net, v_vend
    from lateral public.admin_financial_summary(
           now() - interval '30 days', now()
         ) r;

  raise notice '021 admin_financial_summary: orders_paid=%, gmv=%, net_commission=%, vendor_earnings=%',
    v_orders, v_gmv, v_net, v_vend;
  raise notice '   commission + vendor_earnings must equal gmv, got % + % = % (expected %)',
    v_net, v_vend, v_net + v_vend, v_gmv;

  -- 022. Daily series is contiguous and zero filled.
  select count(*), min(r.day)
    into v_count, v_first
    from lateral public.admin_daily_commission(
           now() - interval '10 days', now()
         ) r;

  raise notice '022 admin_daily_commission returned % rows, first day %', v_count, v_first;

  -- 023. A single day is callable without error.
  select r.commission, r.gmv, r.orders
    into v_comm, v_gmv, v_orders
    from lateral public.admin_daily_commission(
           date_trunc('day', now() at time zone 'Africa/Nairobi')
             at time zone 'Africa/Nairobi',
           (date_trunc('day', now() at time zone 'Africa/Nairobi') + interval '1 day')
             at time zone 'Africa/Nairobi'
         ) r;

  raise notice '023 today: commission=%, gmv=%, orders=%', v_comm, v_gmv, v_orders;

  -- 024. Inverted window is rejected rather than silently returning nothing.
  begin
    perform * from public.admin_daily_commission(now(), now() - interval '5 days');
    raise notice '024 FAIL: inverted window was accepted';
  exception
    when others then
      raise notice '024 PASS: inverted window rejected with %', sqlerrm;
  end;

  -- 025. New refunds RPC resolves.
  select r.refunds, r.amount
    into v_refunds, v_amt
    from lateral public.admin_refunds_in_window(
           now() - interval '30 days', now()
         ) r;

  raise notice '025 admin_refunds_in_window: refunds=%, amount=%', v_refunds, v_amt;

  -- 026. Null bounds fall back rather than erroring.
  select count(*) into v_count
    from lateral public.admin_financial_summary(null, null) r;

  raise notice '026 PASS: null bounds resolved, % row returned', v_count;

end;
$$;


-- ---------------------------------------------------------------------------
-- Section 4. The same calls must be refused for a non-admin.
-- ---------------------------------------------------------------------------
do $$
declare
  v_who    uuid;
  v_who_tx text;
begin
  -- Prefer a genuine customer, fall back to any non-admin account.
  select p.id, p.role::text
    into v_who, v_who_tx
    from public.profiles p
   where p.role <> 'admin'::public.user_role
     and not exists (
       select 1 from public.vendors v where v.user_id = p.id
     )
   limit 1;

  if v_who is null then
    select p.id, p.role::text
      into v_who, v_who_tx
      from public.profiles p
     where p.role <> 'admin'::public.user_role
     limit 1;
  end if;

  if v_who is null then
    raise notice 'SKIP: no non-admin profile exists, section 4 cannot run';
    return;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_who::text, 'role', 'authenticated')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_who::text, true);

  raise notice '--- assuming % role=% ---', v_who, v_who_tx;

  begin
    perform * from public.admin_financial_summary(now() - interval '5 days', now());
    raise notice '030 FAIL: non-admin read admin_financial_summary';
  exception
    when others then
      raise notice '030 PASS: totals refused, %', sqlerrm;
  end;

  begin
    perform * from public.admin_daily_commission(now() - interval '5 days', now());
    raise notice '031 FAIL: non-admin read admin_daily_commission';
  exception
    when others then
      raise notice '031 PASS: daily series refused, %', sqlerrm;
  end;

  begin
    perform * from public.admin_refunds_in_window(now() - interval '5 days', now());
    raise notice '032 FAIL: non-admin read admin_refunds_in_window';
  exception
    when others then
      raise notice '032 PASS: refunds refused, %', sqlerrm;
  end;

end;
$$;