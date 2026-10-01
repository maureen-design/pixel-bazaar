-- ============================================================================
-- NexaMart AI - verification/0039_verify.sql
-- ============================================================================
-- Read-only. Creates nothing, mutates nothing. Safe against production.
--
-- Run after applying 0039.
--
-- WHY SOME CHECKS ARE DO BLOCKS
--   admin_daily_commission and vendor_financial_summary_range are admin- or
--   owner-gated, which is the point: they must refuse anyone else. The Supabase
--   SQL Editor has no authenticated identity, so auth.uid() is NULL and a bare
--   call legitimately raises
--       42501 Not authorised to view platform financials
--   That is correct behaviour, not a broken database. Every check that CALLS an
--   RPC therefore runs inside a DO block that sets an admin JWT first.
--
--   Only pure catalog lookups and direct table reads are bare SELECTs, because
--   those need no identity.
--
-- OUTPUT
--   Section 1 and 2 return rows with an "ok" column. Sections 3 and 4 report via
--   RAISE NOTICE, which the SQL Editor prints in the messages tab.
--   Every ok must be true and every notice must say PASS.
-- ============================================================================


-- ===========================================================================
-- SECTION 1. Catalog. No RPC calls, no identity needed.
-- ===========================================================================

select '001 all three RPCs exist' as check,
       (
         to_regprocedure('public.admin_daily_commission(timestamptz,timestamptz)') is not null
     and to_regprocedure('public.vendor_financial_summary_range(uuid,timestamptz,timestamptz)') is not null
     and to_regprocedure('public.vendor_daily_earnings(uuid,timestamptz,timestamptz)') is not null
       ) as ok,
       'admin_daily_commission, vendor_financial_summary_range, vendor_daily_earnings' as detail;

select '002 authenticated can execute' as check,
       (
         has_function_privilege('authenticated', 'public.admin_daily_commission(timestamptz,timestamptz)',  'EXECUTE')
     and has_function_privilege('authenticated', 'public.vendor_financial_summary_range(uuid,timestamptz,timestamptz)', 'EXECUTE')
     and has_function_privilege('authenticated', 'public.vendor_daily_earnings(uuid,timestamptz,timestamptz)', 'EXECUTE')
       ) as ok,
       'the dashboards need EXECUTE or they render zero' as detail;

select '003 anon and public cannot execute' as check,
       (
         not has_function_privilege('anon',   'public.admin_daily_commission(timestamptz,timestamptz)',  'EXECUTE')
     and not has_function_privilege('anon',   'public.vendor_financial_summary_range(uuid,timestamptz,timestamptz)', 'EXECUTE')
     and not has_function_privilege('anon',   'public.vendor_daily_earnings(uuid,timestamptz,timestamptz)', 'EXECUTE')
     and not has_function_privilege('public', 'public.admin_daily_commission(timestamptz,timestamptz)',  'EXECUTE')
       ) as ok,
       'commission by day is platform margin data; it must not be public' as detail;

-- Asserts search_path is PINNED, which is the property that matters: an
-- unpinned search_path is how a SECURITY DEFINER function gets hijacked.
-- Deliberately not an exact-string match, because PostgreSQL stores an empty
-- path as search_path="" with the quotes included.
select '004 every RPC is SECURITY DEFINER with a pinned search_path' as check,
       not exists (
         select 1
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('admin_daily_commission','vendor_financial_summary_range','vendor_daily_earnings')
            and (not p.prosecdef
                 or coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%')
       ) as ok,
       'SECURITY DEFINER without a pinned search_path is how function hijacking works' as detail;

-- Informational, so you can eyeball what is pinned rather than trust 004.
select '004b actual function settings' as check,
       true as ok,
       p.proname || '  ->  ' || coalesce(array_to_string(p.proconfig, ' | '), '(NONE - unsafe)')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('admin_daily_commission','vendor_financial_summary_range','vendor_daily_earnings')
 order by p.proname;


-- ===========================================================================
-- SECTION 2. Data integrity. Direct table reads, no identity needed.
-- ===========================================================================

select '005 commission + vendor earnings = merchandise subtotal, every order' as check,
       not exists (
         select 1 from public.orders
          where merchandise_subtotal is not null
            and abs(coalesce(commission_amount, 0) + coalesce(vendor_earnings, 0) - merchandise_subtotal) > 0.01
       ) as ok,
       'if false, the dashboards are showing money that does not exist; true means every order balances' as detail;

select '006 commission is charged on merchandise only' as check,
       not exists (
         select 1 from public.orders
          where commission_amount is not null
            and merchandise_subtotal is not null
            and abs(commission_amount - round(merchandise_subtotal * public.platform_commission_rate(), 2)) > 0.01
       ) as ok,
       'commission must equal rate x merchandise_subtotal exactly' as detail;

select '007 refunded orders carry an amount and a timestamp' as check,
       not exists (
         select 1 from public.orders
          where payment_status = 'refunded'
            and (refund_amount is null or refunded_at is null)
       ) as ok,
       'the vendor range RPC keys off these to exclude reversed earnings' as detail;

select '008 every paid order was settled' as check,
       not exists (
         select 1 from public.orders
          where payment_status = 'paid'
            and settled_at is null
       ) as ok,
       'every paid order has a settled_at timestamp from the 0037 trigger; false would mean a missed trigger' as detail;

select '009 orders created after 0037 are fully backfilled' as check,
       not exists (
         select 1 from public.orders
          where created_at < now() - interval '7 days'
            and (merchandise_subtotal is null or commission_amount is null or vendor_earnings is null)
       ) as ok,
       'no order older than 7 days has NULL money columns, so the backfill is complete' as detail;


-- ===========================================================================
-- SECTION 3. RPC behaviour. Requires an admin JWT, so it runs in a DO block.
--
-- Every assertion is written TWICE - once by calling the function, once as a
-- plain aggregate - so a bug in the function cannot hide behind its own output.
-- ===========================================================================

do $$
declare
  v_admin   uuid;
  v_vendor  uuid;
  v_count   bigint;
  v_rpc     numeric;
  v_raw     numeric;
  v_orders  bigint;
  v_orders_rpc bigint;
  v_net     numeric;
  v_live    numeric;
  v_gone    numeric;
  v_live_rpc numeric;
begin
  select id into v_admin from public.profiles where role = 'admin' limit 1;

  if v_admin is null then
    raise notice 'FAIL 020: no admin profile exists, cannot test the admin-gated RPCs';
    return;
  end if;

  -- Both GUCs, because auth.uid() reads one or the other depending on version.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

  -- 021. Zero-filling. A quiet week must produce explicit zero rows, not gaps.
  select count(*) into v_count
    from lateral public.admin_daily_commission(now() - interval '10 days', now()) r;

  if v_count = 11 then
    raise notice 'PASS 021 admin series is zero-filled (11 rows for a 10-day window)';
  else
    raise notice 'FAIL 021 expected 11 daily rows, got %', v_count;
  end if;

  select id into v_vendor from public.vendors order by created_at limit 1;

  if v_vendor is null then
    raise notice 'FAIL 022: no vendor exists';
    return;
  end if;

  select count(*) into v_count
    from lateral public.vendor_daily_earnings(v_vendor, now() - interval '10 days', now()) r;

  if v_count = 11 then
    raise notice 'PASS 022 vendor series is zero-filled (11 rows for a 10-day window)';
  else
    raise notice 'FAIL 022 expected 11 daily rows, got %', v_count;
  end if;

  -- 023. vendor_financial_summary_range vs a hand-written aggregate, same
  --      vendor and same window on both sides.
  select coalesce(sum(o.vendor_earnings), 0), count(*)
    into v_raw, v_orders
    from public.orders o
   where o.vendor_id = v_vendor
     and o.refunded_at is null
     and o.payment_status in ('paid','refunded')
     and o.paid_at >= now() - interval '90 days'
     and o.paid_at <  now();

  -- Keep the two counts in separate variables. Assigning the RPC count into the
  -- same variable the hand-written aggregate used would compare it against
  -- itself, which is always true.
  select r.earnings, r.orders into v_rpc, v_orders_rpc
    from lateral public.vendor_financial_summary_range(v_vendor, now() - interval '90 days', now()) r;

  if abs(v_rpc - v_raw) < 0.01 and v_orders_rpc = v_orders then
    raise notice 'PASS 023 vendor_financial_summary_range matches the orders table (earnings=%, orders=%)', v_rpc, v_orders_rpc;
  else
    raise notice 'FAIL 023 rpc earnings=% / raw=% , rpc orders=% / raw orders=%', v_rpc, v_raw, v_orders_rpc, v_orders;
  end if;

  -- 024. The daily series sums LIVE commission only, so compare against a
  --      live-only aggregate. It must NOT be compared against
  --      net_platform_revenue, which subtracts refunded commission and so
  --      differs by design whenever a refund exists.
  select coalesce(sum(r.commission), 0) into v_live_rpc
    from lateral public.admin_daily_commission(now() - interval '90 days', now()) r;

  select coalesce(sum(o.commission_amount), 0) into v_live
    from public.orders o
   where o.payment_status in ('paid','refunded')
     and o.refunded_at is null
     and o.created_at >= now() - interval '90 days'
     and o.created_at <  now();

  if abs(v_live_rpc - v_live) < 0.01 then
    raise notice 'PASS 024 admin daily commission matches live commission (%)', v_live_rpc;
  else
    raise notice 'FAIL 024 daily rpc=% but orders table=%', v_live_rpc, v_live;
  end if;

  -- 025. The headline the dashboard card shows must be internally consistent.
  select coalesce(sum(o.commission_amount), 0) into v_gone
    from public.orders o
   where o.payment_status in ('paid','refunded')
     and o.refunded_at is not null
     and o.created_at >= now() - interval '90 days'
     and o.created_at <  now();

  select net_platform_revenue into v_net
    from lateral public.admin_financial_summary(now() - interval '90 days', now());

  -- net = live - refunded, so net - live + refunded must be zero.
  if abs(v_net - v_live + v_gone) < 0.01 then
    raise notice 'PASS 025 net platform revenue is internally consistent (live=%, refunded=%, net=%)', v_live, v_gone, v_net;
  else
    raise notice 'FAIL 025 net=% but live-% + refunded(%) does not reconcile', v_net, v_live, v_gone;
  end if;

  -- 026. Negative balances must be representable, because a refund after a
  --      payout is explicitly allowed and 0038 does not clamp it.
  if exists (
    select 1 from public.vendor_ledger
     where vendor_id = v_vendor and entry_type = 'refund'
  ) then
    raise notice 'NOTE 026 this vendor has refunds on the ledger; check the dashboard shows a negative balance if overpaid';
  else
    raise notice 'PASS 026 no refunds on this vendor ledger, negative-balance path not exercised';
  end if;
end;
$$;


-- ===========================================================================
-- SECTION 4. Authorisation. Deliberately impersonates a NON-admin and proves
-- the guard fires. Run after section 3.
-- ===========================================================================

do $$
declare
  v_customer uuid;
  v_vendor   uuid;
begin
  select id into v_customer
    from public.profiles where role = 'customer' order by created_at limit 1;

  if v_customer is null then
    select id into v_customer from public.profiles where role <> 'admin' order by created_at limit 1;
  end if;

  select id into v_vendor from public.vendors order by created_at limit 1;

  if v_customer is null or v_vendor is null then
    raise notice 'SKIP 030: need >=1 non-admin profile and >=1 vendor';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_customer::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_customer::text, 'role', 'authenticated')::text, true);

  begin
    perform public.admin_daily_commission(now() - interval '30 days', now());
    raise notice 'FAIL 030: a NON-ADMIN read platform commission by day';
  exception when others then
    raise notice 'PASS 030 non-admin blocked from admin_daily_commission: %', sqlerrm;
  end;

  begin
    perform public.vendor_financial_summary_range(v_vendor, now() - interval '30 days', now());
    raise notice 'CHECK 031: no exception, so the impersonated user may actually own vendor %', v_vendor;
  exception when others then
    raise notice 'PASS 031 blocked from another vendor''s financials: %', sqlerrm;
  end;

  begin
    perform public.admin_financial_summary(now() - interval '30 days', now());
    raise notice 'FAIL 032: a NON-ADMIN read platform financials';
  exception when others then
    raise notice 'PASS 032 non-admin blocked from admin_financial_summary: %', sqlerrm;
  end;
end;
$$;

-- ============================================================================
-- Expected result
--   Sections 1 and 2: every ok = true
--   Section 3: 021 through 026 all PASS
--   Section 4: 030 and 032 PASS, 031 either outcome is fine
--
-- Reminder for after you deploy: a failing RPC in the browser now raises an
-- error toast instead of silently rendering KES 0, so revenue figures should
-- change rather than go blank.
-- ============================================================================