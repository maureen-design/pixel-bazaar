-- ============================================================================
-- e2e_order_money_flow.sql
-- ============================================================================
-- A REAL order through the money path, with real numbers.
--
-- WHY THIS FILE EXISTS
--   Every check so far has been synthetic or read-only. That is why 0040's
--   reconciliation (check 021) passed by adding 0 + 0 = 0: the arithmetic
--   wiring is proven, the MONEY is not. This file creates an order, pays it,
--   checks that every reporting RPC independently reaches the same figures,
--   then refunds it and checks the reversal.
--
-- WHAT IT ASSERTS
--   1. Settlement fires and splits the money: commission + vendor_earnings
--      must equal merchandise_subtotal exactly, no rounding drift.
--   2. Commission is merchandise-only, at the configured platform rate.
--   3. Exactly one ledger credit, equal to vendor_earnings.
--   4. Admin and vendor reporting RPCs move by exactly the probe's figures.
--   5. The refund returns the FULL customer total (merchandise + tax +
--      shipping) while the vendor reversal stays merchandise-only.
--   6. The ledger nets to zero and vendor outstanding returns to baseline.
--   7. Restock returns the reserved units exactly once.
--
-- HOW DELTAS WORK HERE
--   Every reporting figure is captured BEFORE the probe order is created, and
--   compared as a delta afterwards. Comparing absolute totals would fail the
--   moment real paid orders exist in the window, which would make the probe
--   report a business bug that is actually just test-data noise.
--
-- HOW TO RUN
--   Paste the whole file and press Run ONCE, as a single session. The results
--   table is session-scoped and the assertions read their own writes.
--
--   Then read the final grid. Every row must show ok = true. A false row
--   carries actual-versus-expected in detail; send that row verbatim.
--
-- SAFETY
--   This writes then deletes real rows: one order, one order_item, one refund,
--   ledger entries, plus restored stock and vendor total_sales. Cleanup runs
--   unconditionally because nothing in this script raises before it.
--
--   Read section 1 before running against production.
-- ============================================================================


drop table if exists e2e_results;

-- NOTE: the column is check_name, not check. "check" is reserved in SQL (it
-- introduces a table constraint) and cannot be used unquoted as a column name.
create temp table e2e_results (
  seq        int,
  check_name text,
  ok         boolean,
  detail     text
);


-- ============================================================================
-- Section 0. Pick a vendor, a product, an admin.
--
-- All three are REQUIRED. A probe without a vendor has no ledger and no
-- vendor-side figures, so it would pass vacuously the way 021 did.
-- ============================================================================
do $$
declare
  v_vendor_id      uuid;
  v_vendor_user    uuid;
  v_product_id     uuid;
  v_admin_id       uuid;

  v_rate           numeric;

  v_qty            int := 2;
  v_price          numeric;
  v_merch          numeric;
  v_tax            numeric;
  v_shipping       numeric := 250.00;
  v_total          numeric;

  v_exp_commission numeric;
  v_exp_earnings   numeric;

  v_order_id       uuid;
  v_order_no       text := 'E2E-PROBE-0001';

  v_commission     numeric;
  v_earnings       numeric;

  v_settled_at     timestamptz;
  v_ledger_earn    numeric;
  v_ledger_rows    bigint;
  v_stock_before   int;
  v_stock_after    int;
  v_total_sales    int;
  v_outstanding_0  numeric;
  v_outstanding_1  numeric;

  v_refund_amt     numeric;
  v_ledger_net     numeric;
  v_ledger_reversal numeric;

  -- Post-probe admin readings.
  v_a_gmv          numeric;
  v_a_commission   numeric;
  v_a_net          numeric;
  v_a_vendor       numeric;
  v_a_orders       bigint;
  v_a_tax          numeric;
  v_a_shipping     numeric;
  v_day_commission numeric;
  v_day_gmv        numeric;

  v_rg_earnings    numeric;
  v_rg_refunds     numeric;
  v_rg_orders      bigint;
  v_dl_earnings    numeric;
  v_dl_orders      bigint;

  v_rf_count       bigint;
  v_rf_amount      numeric;
  v_rf_commission  numeric;
  v_rf_vendor_back numeric;

  -- Pre-probe readings, so every comparison below is a delta.
  v_pre_gmv        numeric;
  v_pre_commission numeric;
  v_pre_net        numeric;
  v_pre_vendor     numeric;
  v_pre_orders     bigint;
  v_pre_tax        numeric;
  v_pre_shipping   numeric;
  v_pre_day_comm   numeric;
  v_pre_rg_earn    numeric;
  v_pre_dl_earn    numeric;
  v_pre_rf_count   bigint;
  v_pre_rf_amount  numeric;
  v_pre_rf_comm    numeric;
  v_pre_rf_vendor  numeric;
begin
  -- Vendor plus a real product belonging to them, so order_items is genuine.
  select v.id, v.user_id into v_vendor_id, v_vendor_user
    from public.vendors v
   order by v.created_at
   limit 1;

  if v_vendor_id is null then
    raise notice 'ABORT: no vendor exists. Apply a vendor through the UI, then re-run.';
    return;
  end if;

  select p.id, p.price into v_product_id, v_price
    from public.products p
   where p.vendor_id = v_vendor_id
     and p.status = 'active'::public.product_status
   order by p.created_at
   limit 1;

  if v_product_id is null then
    raise notice 'ABORT: vendor % has no active product. Publish one, then re-run.', v_vendor_id;
    return;
  end if;

  select id into v_admin_id
    from public.profiles
   where role = 'admin'::public.user_role
   limit 1;

  if v_admin_id is null then
    raise notice 'ABORT: no admin profile exists.';
    return;
  end if;

  -- One admin identity satisfies both the admin-gated and vendor-gated RPCs,
  -- so every reporting call below runs under a single known role.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);

  -- ------------------------------------------------------------------------
  -- Section 1. Compute the expected money by hand, and snapshot every
  -- reporting figure, before any write happens.
  --
  -- Tax and shipping are deliberately non-zero. A refund of exactly the
  -- merchandise subtotal would still pass if refund_order() ignored tax and
  -- shipping, which is precisely the bug this file exists to rule out.
  -- ------------------------------------------------------------------------
  select public.platform_commission_rate() into v_rate;

  v_merch := round(v_price * v_qty, 2);
  v_tax   := round(v_merch * 16 / 100, 2);      -- 16% VAT, storefront default
  v_total := round(v_merch + v_tax + v_shipping, 2);

  v_exp_commission := round(v_merch * v_rate, 2);
  v_exp_earnings   := v_merch - v_exp_commission;

  select stock_quantity into v_stock_before
    from public.products where id = v_product_id;

  select total_sales into v_total_sales
    from public.vendors where id = v_vendor_id;

  select r.outstanding into v_outstanding_0
    from lateral public.vendor_financial_summary(v_vendor_id) r;

  select r.gmv, r.platform_commission, r.net_platform_revenue,
         r.vendor_earnings_paid, r.orders_paid, r.tax_collected, r.shipping_collected
    into v_pre_gmv, v_pre_commission, v_pre_net, v_pre_vendor,
         v_pre_orders, v_pre_tax, v_pre_shipping
    from lateral public.admin_financial_summary(
           now() - interval '1 day', now() + interval '1 day'
         ) r;

  select coalesce(sum(r.commission), 0) into v_pre_day_comm
    from lateral public.admin_daily_commission(
           now() - interval '1 day', now() + interval '1 day'
         ) r;

  select r.earnings into v_pre_rg_earn
    from lateral public.vendor_financial_summary_range(
           v_vendor_id, now() - interval '1 day', now() + interval '1 day'
         ) r;

  select coalesce(sum(r.earnings), 0) into v_pre_dl_earn
    from lateral public.vendor_daily_earnings(
           v_vendor_id, now() - interval '1 day', now() + interval '1 day'
         ) r;

  select r.refunds, r.amount, r.commission, r.vendor_back
    into v_pre_rf_count, v_pre_rf_amount, v_pre_rf_comm, v_pre_rf_vendor
    from lateral public.admin_refunds_in_window(
           now() - interval '1 day', now() + interval '1 day'
         ) r;

  insert into e2e_results values (
    0,
    'baseline captured',
    true,
    format('vendor=%s product=%s price=%s qty=%s merch=%s tax=%s shipping=%s total=%s rate=%s expected_commission=%s expected_earnings=%s stock_before=%s total_sales_before=%s outstanding_before=%s',
      v_vendor_id, v_product_id, v_price, v_qty, v_merch, v_tax, v_shipping, v_total,
      v_rate, v_exp_commission, v_exp_earnings, v_stock_before, v_total_sales,
      coalesce(v_outstanding_0, 0))
  );

  -- =========================================================================
  -- Section 2. Create the order as checkout would leave it.
  --
  -- payment_method 'mpesa' with payment_type 'now' is deliberate. 'bank' and
  -- 'later' are both gated by enforce_orders_payment_settings(), which fails
  -- closed when the platform setting is off, and that gate is not what this
  -- file is testing.
  --
  -- Stock is not decremented here: create_order owns stock, and section 7
  -- verifies restock against the value captured in section 1.
  -- =========================================================================
  delete from public.orders where order_number = v_order_no;

  insert into public.orders (
    order_number, user_id, vendor_id, status, payment_status,
    payment_method, payment_type, delivery_method,
    shipping_address, shipping_cost, tax_amount, discount_amount,
    total_amount, created_at
  )
  values (
    v_order_no, coalesce(v_vendor_user, v_admin_id), v_vendor_id,
    'pending', 'pending',
    'mpesa', 'now', 'standard',
    'E2E probe address', v_shipping, v_tax, 0,
    v_total, now()
  )
  returning id into v_order_id;

  -- This insert fires trg_order_items_recalc_financials, which populates
  -- merchandise_subtotal, commission_amount and vendor_earnings. With no line
  -- item there is no merchandise, and so no money to test.
  insert into public.order_items (
    order_id, product_id, product_name, product_price, quantity, total_price
  )
  values (
    v_order_id, v_product_id, 'E2E PROBE ITEM', v_price, v_qty, v_merch
  );

  select merchandise_subtotal, commission_amount, vendor_earnings
    into v_merch, v_commission, v_earnings
    from public.orders where id = v_order_id;

  insert into e2e_results values (
    1,
    'settlement columns populated on order_items insert',
    v_merch is not null and v_commission is not null and v_earnings is not null,
    format('merchandise_subtotal=%s commission_amount=%s vendor_earnings=%s',
      v_merch, v_commission, v_earnings)
  );

  -- =========================================================================
  -- Section 3. Pay it. This transition must credit the ledger.
  -- =========================================================================
  update public.orders
     set payment_status = 'paid',
         paid_at        = now(),
         status         = 'processing'
   where id = v_order_id;

  select settled_at into v_settled_at
    from public.orders where id = v_order_id;

  insert into e2e_results values (
    2,
    'settle trigger fired on payment',
    v_settled_at is not null,
    format('settled_at=%s', coalesce(v_settled_at::text, 'NULL'))
  );

  insert into e2e_results values (
    3,
    'commission = configured rate x merchandise',
    abs(coalesce(v_commission, -1) - v_exp_commission) <= 0.01,
    format('expected=%s actual=%s rate=%s merch=%s', v_exp_commission, v_commission, v_rate, v_merch)
  );

  insert into e2e_results values (
    4,
    'commission + vendor earnings = merchandise subtotal',
    abs(coalesce(v_commission, -1) + coalesce(v_earnings, -1) - v_merch) <= 0.01,
    format('commission=%s earnings=%s sum=%s merch=%s',
      v_commission, v_earnings, coalesce(v_commission, 0) + coalesce(v_earnings, 0), v_merch)
  );

  -- Negative assertion: proves tax and shipping were NOT folded into the
  -- commission base, which is the business rule we settled on.
  insert into e2e_results values (
    5,
    'commission base excludes tax and shipping',
    abs(coalesce(v_commission, 0) - round(v_total * v_rate, 2)) > 0.01,
    format('commission=%s; commission on total would be %s; merch=%s total=%s',
      v_commission, round(v_total * v_rate, 2), v_merch, v_total)
  );

  -- Exactly one credit. Two rows would mean the settle trigger double-fired.
  select coalesce(sum(amount), 0), count(*)
    into v_ledger_earn, v_ledger_rows
    from public.vendor_ledger
   where order_id = v_order_id and entry_type = 'earning';

  insert into e2e_results values (
    6,
    'exactly one ledger credit equal to vendor earnings',
    v_ledger_rows = 1 and abs(v_ledger_earn - v_earnings) <= 0.01,
    format('earning_rows=%s ledger_sum=%s vendor_earnings=%s',
      v_ledger_rows, v_ledger_earn, v_earnings)
  );

  insert into e2e_results values (
    7,
    'settlement incremented vendor total_sales once',
    coalesce((select total_sales from public.vendors where id = v_vendor_id), -1)
      = coalesce(v_total_sales, 0) + 1,
    format('before=%s after=%s',
      v_total_sales, (select total_sales from public.vendors where id = v_vendor_id))
  );

  -- =========================================================================
  -- Section 4. Admin reporting must move by exactly the probe's figures.
  -- =========================================================================
  select r.gmv, r.platform_commission, r.net_platform_revenue,
         r.vendor_earnings_paid, r.orders_paid, r.tax_collected, r.shipping_collected
    into v_a_gmv, v_a_commission, v_a_net, v_a_vendor, v_a_orders, v_a_tax, v_a_shipping
    from lateral public.admin_financial_summary(
           now() - interval '1 day', now() + interval '1 day'
         ) r;

  insert into e2e_results values (
    8,
    'admin summary commission rose by exactly the order commission',
    abs((v_a_commission - coalesce(v_pre_commission, 0)) - v_exp_commission) <= 0.01,
    format('expected_delta=%s actual_delta=%s (pre=%s post=%s)',
      v_exp_commission, v_a_commission - coalesce(v_pre_commission, 0),
      v_pre_commission, v_a_commission)
  );

  insert into e2e_results values (
    9,
    'admin summary vendor earnings rose by exactly the order earnings',
    abs((v_a_vendor - coalesce(v_pre_vendor, 0)) - v_exp_earnings) <= 0.01,
    format('expected_delta=%s actual_delta=%s (pre=%s post=%s)',
      v_exp_earnings, v_a_vendor - coalesce(v_pre_vendor, 0),
      v_pre_vendor, v_a_vendor)
  );

  -- The reconciliation check 021 could only evaluate as 0 + 0 = 0.
  insert into e2e_results values (
    10,
    'admin GMV delta = commission delta + vendor earnings delta',
    abs(
      (v_a_gmv - coalesce(v_pre_gmv, 0))
      - ((v_a_commission - coalesce(v_pre_commission, 0))
         + (v_a_vendor - coalesce(v_pre_vendor, 0)))
    ) <= 0.01,
    format('gmv_delta=%s commission_delta=%s vendor_delta=%s sum=%s',
      v_a_gmv - coalesce(v_pre_gmv, 0),
      v_a_commission - coalesce(v_pre_commission, 0),
      v_a_vendor - coalesce(v_pre_vendor, 0),
      (v_a_commission - coalesce(v_pre_commission, 0))
        + (v_a_vendor - coalesce(v_pre_vendor, 0)))
  );

  insert into e2e_results values (
    11,
    'admin summary counted exactly one more paid order',
    v_a_orders - coalesce(v_pre_orders, 0) = 1,
    format('orders_paid_delta=%s (pre=%s post=%s)',
      v_a_orders - coalesce(v_pre_orders, 0), v_pre_orders, v_a_orders)
  );

  insert into e2e_results values (
    12,
    'admin summary added tax and shipping separately from commission',
    abs((v_a_tax - coalesce(v_pre_tax, 0)) - v_tax) <= 0.01
      and abs((v_a_shipping - coalesce(v_pre_shipping, 0)) - v_shipping) <= 0.01,
    format('tax_delta=%s (expected %s) shipping_delta=%s (expected %s)',
      v_a_tax - coalesce(v_pre_tax, 0), v_tax,
      v_a_shipping - coalesce(v_pre_shipping, 0), v_shipping)
  );

  -- Zero-filled daily series must carry today's commission.
  select coalesce(sum(r.commission), 0), coalesce(sum(r.gmv), 0)
    into v_day_commission, v_day_gmv
    from lateral public.admin_daily_commission(
           now() - interval '1 day', now() + interval '1 day'
         ) r;

  insert into e2e_results values (
    13,
    'admin daily commission rose by exactly the order commission',
    abs((v_day_commission - coalesce(v_pre_day_comm, 0)) - v_exp_commission) <= 0.01,
    format('expected_delta=%s actual_delta=%s (pre=%s post=%s) daily_gmv_delta=%s',
      v_exp_commission, v_day_commission - coalesce(v_pre_day_comm, 0),
      v_pre_day_comm, v_day_commission,
      v_day_gmv - coalesce(v_pre_gmv, 0))
  );

  -- =========================================================================
  -- Section 5. Vendor reporting must match, on the paid_at basis.
  -- =========================================================================
  select r.earnings, r.refunds, r.orders
    into v_rg_earnings, v_rg_refunds, v_rg_orders
    from lateral public.vendor_financial_summary_range(
           v_vendor_id, now() - interval '1 day', now() + interval '1 day'
         ) r;

  insert into e2e_results values (
    14,
    'vendor range earnings rose by exactly the order earnings',
    abs((v_rg_earnings - coalesce(v_pre_rg_earn, 0)) - v_exp_earnings) <= 0.01,
    format('expected_delta=%s actual_delta=%s (pre=%s post=%s) range_orders=%s',
      v_exp_earnings, v_rg_earnings - coalesce(v_pre_rg_earn, 0),
      v_pre_rg_earn, v_rg_earnings, v_rg_orders)
  );

  insert into e2e_results values (
    15,
    'vendor range still reports no refund',
    coalesce(v_rg_refunds, 0) = 0,
    format('range_refunds=%s (must be 0 at this point)', coalesce(v_rg_refunds, 0))
  );

  select coalesce(sum(r.earnings), 0), coalesce(sum(r.orders), 0)
    into v_dl_earnings, v_dl_orders
    from lateral public.vendor_daily_earnings(
           v_vendor_id, now() - interval '1 day', now() + interval '1 day'
         ) r;

  insert into e2e_results values (
    16,
    'vendor daily earnings rose by the same amount as the vendor range',
    abs((v_dl_earnings - coalesce(v_pre_dl_earn, 0))
        - (v_rg_earnings - coalesce(v_pre_rg_earn, 0))) <= 0.01,
    format('range_delta=%s daily_delta=%s daily_orders=%s',
      v_rg_earnings - coalesce(v_pre_rg_earn, 0),
      v_dl_earnings - coalesce(v_pre_dl_earn, 0), v_dl_orders)
  );

  -- =========================================================================
  -- Section 6. Refund, then verify the reversal.
  -- =========================================================================
  v_refund_amt := public.refund_order(
    v_order_id,
    'E2E probe refund',
    'E2E-PROBE',
    true
  );

  -- The customer gets back merchandise + tax + shipping.
  insert into e2e_results values (
    17,
    'refund returns the full customer total',
    abs(v_refund_amt - v_total) <= 0.01,
    format('expected_full_total=%s refund_returned=%s merch=%s tax=%s shipping=%s',
      v_total, v_refund_amt, v_merch, v_tax, v_shipping)
  );

  insert into e2e_results values (
    18,
    'refund is larger than the merchandise subtotal',
    v_refund_amt > v_merch,
    format('refund=%s merch=%s (proves tax and shipping were included)', v_refund_amt, v_merch)
  );

  -- The vendor loses only the merchandise share, never tax or shipping.
  select coalesce(sum(amount), 0) into v_ledger_reversal
    from public.vendor_ledger
   where order_id = v_order_id and entry_type = 'refund';

  insert into e2e_results values (
    19,
    'vendor reversal is merchandise-only, equal to vendor earnings',
    abs(v_ledger_reversal + v_exp_earnings) <= 0.01,
    format('reversal=%s expected=%s merch=%s full_total=%s',
      v_ledger_reversal, -v_exp_earnings, v_merch, v_total)
  );

  -- Earning plus reversal must net to exactly zero.
  select coalesce(sum(amount), 0) into v_ledger_net
    from public.vendor_ledger
   where order_id = v_order_id;

  insert into e2e_results values (
    20,
    'ledger nets to zero after a full refund',
    abs(v_ledger_net) <= 0.01,
    format('ledger_net=%s', v_ledger_net)
  );

  select r.outstanding into v_outstanding_1
    from lateral public.vendor_financial_summary(v_vendor_id) r;

  insert into e2e_results values (
    21,
    'vendor outstanding returns to its pre-probe value',
    abs(v_outstanding_1 - coalesce(v_outstanding_0, 0)) <= 0.01,
    format('before=%s after=%s', coalesce(v_outstanding_0, 0), v_outstanding_1)
  );

  -- Admin live totals must be back to their pre-probe values.
  select r.net_platform_revenue, r.gmv
    into v_a_net, v_a_gmv
    from lateral public.admin_financial_summary(
           now() - interval '1 day', now() + interval '1 day'
         ) r;

  insert into e2e_results values (
    22,
    'admin live commission and GMV return to pre-probe values after refund',
    abs(v_a_net - coalesce(v_pre_net, 0)) <= 0.01
      and abs(v_a_gmv - coalesce(v_pre_gmv, 0)) <= 0.01,
    format('net: pre=%s post=%s | gmv: pre=%s post=%s (both must match pre)',
      coalesce(v_pre_net, 0), v_a_net, coalesce(v_pre_gmv, 0), v_a_gmv)
  );

  -- 0040's new RPC: refunds bucketed by refunded_at rather than paid_at.
  select r.refunds, r.amount, r.commission, r.vendor_back
    into v_rf_count, v_rf_amount, v_rf_commission, v_rf_vendor_back
    from lateral public.admin_refunds_in_window(
           now() - interval '1 day', now() + interval '1 day'
         ) r;

  insert into e2e_results values (
    23,
    'admin_refunds_in_window reports the refund with correct amounts',
    (v_rf_count - coalesce(v_pre_rf_count, 0)) = 1
      and abs((v_rf_amount - coalesce(v_pre_rf_amount, 0)) - v_total) <= 0.01
      and abs((v_rf_commission - coalesce(v_pre_rf_comm, 0)) - v_exp_commission) <= 0.01
      and abs((v_rf_vendor_back - coalesce(v_pre_rf_vendor, 0)) - v_exp_earnings) <= 0.01,
    format('refunds_delta=%s (expected 1) amount_delta=%s (expected %s) commission_clawed_back_delta=%s (expected %s) vendor_back_delta=%s (expected %s)',
      v_rf_count - coalesce(v_pre_rf_count, 0),
      v_rf_amount - coalesce(v_pre_rf_amount, 0), v_total,
      v_rf_commission - coalesce(v_pre_rf_comm, 0), v_exp_commission,
      v_rf_vendor_back - coalesce(v_pre_rf_vendor, 0), v_exp_earnings)
  );

  -- =========================================================================
  -- Section 7. Restock happened exactly once.
  -- =========================================================================
  select stock_quantity into v_stock_after
    from public.products where id = v_product_id;

  insert into e2e_results values (
    24,
    'restock returned the reserved units',
    v_stock_after = v_stock_before + v_qty,
    format('before=%s after=%s quantity=%s expected_after=%s',
      v_stock_before, v_stock_after, v_qty, v_stock_before + v_qty)
  );

  -- =========================================================================
  -- Section 8. Cleanup. Always runs; nothing above raises.
  --
  -- Ledger rows go first: vendor_ledger.order_id is ON DELETE SET NULL, so
  -- deleting the order first would orphan the entries and permanently corrupt
  -- the vendor's lifetime sums.
  -- =========================================================================
  delete from public.vendor_ledger where order_id = v_order_id;
  delete from public.order_refunds where order_id = v_order_id;

  update public.products
     set stock_quantity = v_stock_before
   where id = v_product_id;

  update public.vendors
     set total_sales = v_total_sales
   where id = v_vendor_id;

  delete from public.orders where id = v_order_id;

  insert into e2e_results values (
    25,
    'probe cleaned up completely',
    not exists (select 1 from public.orders where order_number = v_order_no)
      and not exists (select 1 from public.vendor_ledger where order_id = v_order_id)
      and (select stock_quantity from public.products where id = v_product_id) = v_stock_before
      and (select total_sales from public.vendors where id = v_vendor_id) = v_total_sales,
    format('order=%s stock_restored=%s total_sales_restored=%s',
      v_order_no, v_stock_before, v_total_sales)
  );

end;
$$;


-- ============================================================================
-- Results. This is the grid to read.
-- ============================================================================
select seq, check_name, ok, detail
  from e2e_results
 order by seq;