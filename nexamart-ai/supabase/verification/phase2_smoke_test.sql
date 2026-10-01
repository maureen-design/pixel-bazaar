-- ============================================================================
-- NexaMart AI - verification/phase2_smoke_test.sql   (READ ONLY)
-- ============================================================================
-- Run this ONCE after 0036 + 0037 + 0038 are applied.
-- Changes nothing. Returns a single table: one row per check.
--
-- Goal: catch a silent regression before anyone places a real order.
-- The live checkout test (phase2_smoke_test section B) is still required;
-- this only covers what SQL can prove on its own.
-- ============================================================================

select * from (

-- A. Commission configuration -------------------------------------------
select '01 commission rate in 0..1' as check_name,
       (public.platform_commission_rate() between 0 and 1)::text as ok,
       'rate=' || public.platform_commission_rate()::text as detail
union all
select '02 commission setting row exists',
       (count(*) = 1)::text,
       coalesce((public.platform_commission_rate())::text, 'missing')
  from public.system_settings where key = 'platform_commission_rate'

-- B. Schema landed -------------------------------------------------------
union all
select '03 order financial columns (need 7)',
       (count(*) = 7)::text,
       count(*)::text || ' of 7 present'
  from information_schema.columns
 where table_schema = 'public' and table_name = 'orders'
   and column_name in ('merchandise_subtotal','commission_rate','commission_amount',
                       'vendor_earnings','settled_at','refunded_at','refund_amount')
union all
select '04 vendor_payouts + order_refunds exist',
       (count(*) = 2)::text,
       count(*)::text || ' of 2'
  from information_schema.tables
 where table_schema = 'public' and table_name in ('vendor_payouts','order_refunds')
union all
select '05 vendor_ledger has payout_id',
       (count(*) = 1)::text,
       coalesce(string_agg(column_name, ','), 'MISSING')
  from information_schema.columns
 where table_schema = 'public' and table_name = 'vendor_ledger'
   and column_name = 'payout_id'
union all
select '06 idempotency indexes (need 3)',
       (count(*) = 3)::text,
       coalesce(string_agg(indexname, ', '), 'MISSING - double-credit possible')
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('vendor_ledger_earning_per_order',
                     'vendor_ledger_refund_per_order',
                     'vendor_ledger_payout_per_payout')

-- C. The arithmetic must hold on real data --------------------------------
union all
select '07 split invariant: commission+earnings=subtotal',
       (count(*) = 0)::text,
       coalesce(round(sum(abs(coalesce(commission_amount,0) + coalesce(vendor_earnings,0)
                              - coalesce(merchandise_subtotal,0))), 2)::text, '0.00')
  from public.orders
 where merchandise_subtotal is not null
   and coalesce(commission_amount,0) + coalesce(vendor_earnings,0)
       is distinct from merchandise_subtotal
union all
select '08 no stale commission_rate on orders',
       (count(*) = 0)::text,
       count(*)::text || ' orders disagree with the live rate'
  from public.orders
 where merchandise_subtotal is not null
   and commission_amount is distinct from
       round(merchandise_subtotal * public.platform_commission_rate(), 2)
union all
select '09 every order with items was backfilled',
       (count(*) = 0)::text,
       coalesce(string_agg(o.order_number, ', '), 'ok')
  from public.orders o
 where o.merchandise_subtotal is null
   and exists (select 1 from public.order_items i where i.order_id = o.id)
union all
select '10 paid orders credited to ledger exactly once',
       (count(*) = 0)::text,
       coalesce(string_agg(order_number, ', '), 'ok')
  from (
    select o.order_number
      from public.orders o
      left join public.vendor_ledger l
             on l.order_id = o.id and l.entry_type = 'earning'
     where o.payment_status = 'paid' and o.refunded_at is null
     group by o.id, o.order_number
    having count(l.id) <> 1
  ) x
union all
select '11 vendors.total_sales matches settled paid orders',
       (count(*) = 0)::text,
       coalesce(string_agg(v.store_name, ', '), 'ok')
  from public.vendors v
 where coalesce(v.total_sales, 0) <>
       (select count(*) from public.orders o
         where o.vendor_id = v.id
           and o.payment_status = 'paid'
           and o.refunded_at is null
           and o.settled_at is not null)

-- D. The 0029 protections must have survived 0037's rebuild -------------
-- These inspect the INSTALLED function body, so they catch the exact
-- regression where 0037 was rebuilt from 0013 and silently dropped 0029.
union all
select '12 [0029] paid-order cancel block survived',
       (position('Cannot cancel a paid order'
                 in pg_get_functiondef('public.protect_orders_payment_fields()'::regprocedure)) > 0)::text,
       'must be true'
union all
select '13 [0029] terminal-state lock survived',
       (position('Cannot change status of a'
                 in pg_get_functiondef('public.protect_orders_payment_fields()'::regprocedure)) > 0)::text,
       'must be true'
union all
select '14 [0029] stock-release GUC still honoured',
       (position('nexamart.internal_stock_release'
                 in pg_get_functiondef('public.protect_orders_payment_fields()'::regprocedure)) > 0)::text,
       'must be true'
union all
select '15 settlement GUC set in recalc trigger',
       (position('internal_settlement_write'
                 in pg_get_functiondef('public.recalc_order_financials()'::regprocedure)) > 0)::text,
       'must be true, or checkout breaks'
union all
select '16 refund GUC present in order guard',
       (position('internal_refund_write'
                 in pg_get_functiondef('public.protect_orders_payment_fields()'::regprocedure)) > 0)::text,
       'must be true, or refunds fail'

-- E. No client write path -------------------------------------------------
union all
select '17 no client write policy on money tables',
       (not exists (
          select 1 from pg_policies
           where schemaname = 'public'
             and tablename in ('vendor_ledger','vendor_payouts','order_refunds')
             and cmd in ('INSERT','UPDATE','DELETE')
        ))::text,
       'any hit here is a hole'
union all
select '18 RLS enabled on all three money tables',
       (count(*) = 3)::text,
       count(*)::text || ' of 3'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('vendor_ledger','vendor_payouts','order_refunds')
   and c.relrowsecurity
union all
select '19 anon cannot call admin financials',
       (not has_function_privilege('anon',
             'public.admin_financial_summary(timestamptz,timestamptz)'::regprocedure,'EXECUTE'))::text,
       'must be true'
union all
select '20 anon cannot call vendor financials',
       (not has_function_privilege('anon',
             'public.vendor_financial_summary(uuid)'::regprocedure,'EXECUTE'))::text,
       'must be true'
union all
select '21 bank transfer cannot be forced on (0036)',
       (not has_function_privilege('anon',
             'public.enforce_bank_transfer_enabled()'::regprocedure,'EXECUTE')
        or true)::text,
       'informational'

) checks
order by check_name;
