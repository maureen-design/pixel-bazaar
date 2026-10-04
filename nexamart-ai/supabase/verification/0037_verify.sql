-- ============================================================================
-- NexaMart AI - verification/0037_verify.sql
-- ============================================================================
-- Run AFTER 0037_platform_financials.sql.
-- Read-only except where explicitly marked PROBE.
--
-- Sections 1-7 run without any identity and must all report ok = true.
-- Section 8 was moved to 0040_verify_b_admin.sql because admin-gated RPCs
-- need an adopted admin identity; see the note at section 8 below.
--
-- Sections 9 and 10 are PROBES: they are instructions, not executable SQL.
-- They can only be completed from a signed-in browser session, because they
-- require a real customer JWT that SQL Editor cannot supply.
-- ============================================================================


-- 1. Commission setting exists and is sane -------------------------------
select
  'commission rate sane' as check,
  public.platform_commission_rate() between 0 and 1 as ok,
  public.platform_commission_rate() as rate,
  (public.platform_commission_rate() * 100) as percent,
  -- The literal must be cast: to_jsonb() is polymorphic, and a bare string
-- literal arrives as `unknown`, which raises 42804 "could not determine
-- polymorphic type". Casting to jsonb directly also matches the column type.
  to_jsonb('Platform commission as a FRACTION (0.15 = 15%). Charged on merchandise subtotal only.'::text)
    = (select value from public.system_settings where key = 'platform_commission_rate')
    as description_unchanged;


-- 2. Order financial columns exist --------------------------------------
select
  'order financial columns' as check,
  count(*) = 7 as ok,
  string_agg(column_name, ', ' order by ordinal_position) as columns
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name in ('merchandise_subtotal', 'commission_rate', 'commission_amount',
                      'vendor_earnings', 'settled_at', 'refunded_at', 'refund_amount');


-- 3. Every order splits correctly (arithmetic invariant) ------------------
-- commission + earnings must equal the merchandise subtotal EXACTLY.
-- Any row where they differ by more than a cent is a bug.
select
  'split invariant holds' as check,
  count(*) = 0 as ok,
  coalesce(sum(abs((coalesce(commission_amount,0) + coalesce(vendor_earnings,0))
                    - coalesce(merchandise_subtotal,0))), 0) as worst_drift
from public.orders;

-- Expect 0 rows and worst_drift = 0.


-- 4. The split matches the live commission setting ------------------------
-- Recompute independently and compare. Catches a stale commission_rate.
select
  'split matches setting' as check,
  count(*) = 0 as ok
from public.orders
where merchandise_subtotal is not null
  and commission_amount is distinct from
      round(merchandise_subtotal * public.platform_commission_rate(), 2);


-- 5. Ledger is consistent with paid orders -------------------------------
-- Every paid, non-refunded order must have exactly one 'earning' row.
select
  'paid orders credited once' as check,
  count(*) = 0 as ok,
  string_agg(coalesce(o.order_number, '?'), ', ') as offenders
from public.orders o
left join public.vendor_ledger l
       on l.order_id = o.id and l.entry_type = 'earning'
where o.payment_status = 'paid'
  and o.refunded_at is null
group by o.id, o.order_number
having count(l.id) <> 1;


-- 6. total_sales reflects paid orders ------------------------------------
select
  'total_sales matches paid orders' as check,
  count(*) = 0 as ok
from public.vendors v
where coalesce(v.total_sales, 0)
      <> (select count(*)
            from public.orders o
           where o.vendor_id = v.id
             and o.payment_status = 'paid'
             and o.refunded_at is null
             and o.settled_at is not null);


-- 7. Ledger has no client write path -------------------------------------
-- Must be false. A vendor must never be able to credit themselves.
-- pg_policies exposes the command as `cmd` (type pg_command). There is no
-- `policy_cmd` column, so the original subquery raised a column error and this
-- check never actually ran. Roles is name[] and defaults to {public}, which
-- covers both anon and authenticated, so an INSERT policy for either shows up.
select
  'ledger has no anon/authenticated INSERT policy' as check,
  not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'vendor_ledger'
       and cmd::text  = 'INSERT'
  ) as ok,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'vendor_ledger'
      and cmd::text = 'INSERT') as insert_policies;

-- Expect ok = true, insert_policies = 0.


-- 8. Truthful revenue figures ----------------------------------------------
-- Moved OUT of this file on purpose.
--
-- admin_financial_summary() is SECURITY DEFINER and gates on auth.uid() being
-- an admin (see 0039, the RAISE at ~line 70). The SQL Editor runs as a role
-- with no auth.uid(), so calling it directly raised
--   42501 Not authorised to view platform financials
-- That is the authorisation check working correctly, not a defect. This file
-- therefore stays runnable as-is: sections 1-7 need no identity.
--
-- To see these figures, run 0040_verify_b_admin.sql instead. It adopts a real
-- admin via set_config('request.jwt.claims', ...) for the duration of its
-- transaction and then calls admin_financial_summary(null, null) twice, once
-- for the window checks (021) and once for the totals (check 022 onward).
-- Read-only; creates a temp table and changes nothing else.
--
-- The comparison this section was making, for reference:
--
--   select
--     public.platform_commission_rate() as rate,
--     f.orders_paid,
--     f.gmv                 as merchandise_only,
--     f.platform_commission as true_platform_revenue,
--     f.tax_collected,
--     f.shipping_collected,
--     f.vendor_earnings_paid,
--     f.net_platform_revenue,
--     -- what the dashboards used to call "revenue":
--     (select coalesce(sum(total_amount), 0)
--        from public.orders
--       where payment_status = 'paid'::public.payment_status) as old_gross_mislabel
--   from public.admin_financial_summary(null, null) f;


-- ============================================================================
-- 9. PROBE - live checkout round trip (MOST IMPORTANT) --------------------
-- ============================================================================
-- This is the test that would have caught the customer-role bug. Walk it in
-- order and watch for errors.
--
--   A. As a signed-in CUSTOMER, place a real order through the app
--      (any product, any payment method). It MUST succeed.
--      If you see "Customers cannot update orders", the settlement guard
--      in section 8 of 0037 is not working - roll back and stop.
--
--   B. Re-run section 3. The new order must satisfy the split invariant.
--
--   C. Check the split by hand for the new order:
--
--      select order_number, merchandise_subtotal, commission_rate,
--             commission_amount, vendor_earnings
--        from public.orders
--       where merchandise_subtotal is not null
--       order by created_at desc limit 5;
--
--      At 15%: a KES 1,000.00 cart -> subtotal 1000.00, commission 150.00,
--      earnings 850.00. Exact, no drift.
--
--   D. Mark the order paid the way the real flow does (M-Pesa callback or
--      admin confirm), then re-run sections 5 and 6. Both must still pass,
--      and vendors.total_sales must have incremented by 1.
--
--   E. Confirm the customer CANNOT self-credit the ledger:
--      as the customer, attempt
--        insert into public.vendor_ledger (vendor_id, entry_type, amount)
--        values ('<vendor-id>', 'earning', 999999);
--      Expect: RLS / permission error. Not a success.
-- ============================================================================


-- ============================================================================
-- 10. PROBE - guard replacement is byte-for-byte safer, not looser --------
-- ============================================================================
-- The settlement escape must not have opened a hole. As a CUSTOMER, try to
-- tamper with a payment-owned field on your own order:
--
--   update public.orders set total_amount = 1 where order_number = '<yours>';
--
-- Expect: ERROR "Payment-owned order fields are immutable".
--
-- And the ledger route:
--   update public.orders set vendor_earnings = 999999
--    where order_number = '<yours>';
-- Expect: ERROR as well. If this SUCCEEDS, section 8 of 0037 is too loose
-- and the settlement flag is reachable from the client. Fix before shipping.
-- ============================================================================
