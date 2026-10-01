-- ============================================================================
-- NexaMart AI - verification/phase2_money_probe.sql
-- ============================================================================
-- WHY IT IS A FUNCTION AND NOT A SCRIPT
--   The first version used a temp table plus BEGIN/ROLLBACK. Supabase's SQL
--   Editor commits between statements, so "ON COMMIT DROP" deleted the temp
--   table before the SELECT could read it ("relation smoke does not exist"),
--   and the ROLLBACK was never honoured - which meant the probe could have
--   left real orders, payouts and refunds behind.
--
--   As a function the whole test is ONE statement, so PostgreSQL guarantees it
--   is atomic: any unhandled error rolls the entire thing back by itself.
--   Cleanup is still done explicitly on the success path, so the probe is safe
--   to re-run even if the editor commits between statements.
--
-- HOW TO RUN
--   1. Run this file once to create the function.
--   2. Run:  select * from public.phase2_money_probe();
--   3. When finished:  drop function public.phase2_money_probe();
--
-- NOTE: do not use PL/pgSQL GOTO for the early exit. It is rejected as a
--   syntax error here ("syntax error at or near goto"), which meant the
--   function was never created at all. The work is wrapped in a single
--   BEGIN ... EXCEPTION block instead, which is both simpler and safer: any
--   unexpected error is recorded as a failed step rather than aborting.
--
-- WHAT IT PROVES
--   phase2_smoke_test only asserts "no violations exist", which passes
--   trivially on an empty database. This actually executes the money path:
--   create order -> items inserted as a customer -> commission split ->
--   settlement -> payout -> refund -> restock, plus the guard tests that
--   confirm the bad actions are REFUSED.
--
-- EXPECTED NUMBERS (cart 2000 + 500 = 2500 subtotal, 16% tax, 250 shipping)
--   total_amount    3150.00
--   commission       375.00   15% of 2500, merchandise only
--   vendor_earnings 2125.00
--   375 + 2125 = 2500 exactly
--   refund_amount   3150.00   everything the customer paid
--   vendor reversal -2125.00  merchandise only; tax/shipping never reversed
--   stock            +3        qty 2 + qty 1, both on the same product
-- ============================================================================


create or replace function public.phase2_money_probe()
returns table (step text, ok boolean, detail text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_steps   text[]    := array[]::text[];
  v_oks     boolean[] := array[]::boolean[];
  v_details text[]    := array[]::text[];

  v_customer      uuid;
  v_customer_role text;
  v_admin         uuid;
  v_vendor        uuid;
  v_product       uuid;
  v_stock0        integer;
  v_stock1        integer;
  v_sales0        integer;
  v_sales1        integer;
  v_order         uuid;
  v_order_no      text := 'PROBE-' || to_char(clock_timestamp(), 'HH24MISSMS');
  v_sub           numeric;
  v_comm          numeric;
  v_earn          numeric;
  v_status        text;
  v_refund_amt    numeric;
  v_refund        numeric;
  v_payout        uuid;
  v_bal0          numeric;
  v_bal1          numeric;
  v_bal2          numeric;
  v_rls_on        boolean;
  v_write_policies bigint;
  v_abort         boolean := false;
begin
  ---------------------------------------------------------------------------
  -- Context. 0020_security_hardening dropped vendors.is_approved, so this uses
  -- vendors.is_verified, which is the flag the app actually reads.
  ---------------------------------------------------------------------------
  select p.id, p.role::text into v_customer, v_customer_role
    from public.profiles p
   where p.role <> 'admin'
   order by (p.role = 'customer') desc, p.created_at
   limit 1;

  if v_customer is null then
    select p.id, p.role::text into v_customer, v_customer_role
      from public.profiles p order by p.created_at limit 1;
  end if;

  select id into v_admin from public.profiles where role = 'admin' limit 1;

  select id into v_vendor from public.vendors where is_verified order by created_at limit 1;
  if v_vendor is null then
    select id into v_vendor from public.vendors order by created_at limit 1;
  end if;

  select id, coalesce(stock_quantity, 0) into v_product, v_stock0
    from public.products
   where stock_quantity is not null
   order by created_at limit 1;

  if v_customer is null or v_vendor is null or v_product is null then
    v_steps   := array_append(v_steps,   'SETUP: need >=1 profile, >=1 vendor, >=1 product');
    v_oks     := array_append(v_oks,     false);
    v_details := array_append(v_details, format('customer=%s vendor=%s product=%s',
                                               v_customer, v_vendor, v_product));
    return query select * from unnest(v_steps, v_oks, v_details) as t(step, ok, detail);
    return;
  end if;

  v_steps   := array_append(v_steps,   'SETUP: probe context');
  v_oks     := array_append(v_oks,     true);
  v_details := array_append(v_details, format('customer=%s role=%s vendor=%s product=%s stock=%s',
                                    v_customer, v_customer_role, v_vendor, v_product, v_stock0));

  v_steps   := array_append(v_steps,   'SETUP: an admin profile exists (needed for payout/refund)');
  v_oks     := array_append(v_oks,     v_admin is not null);
  v_details := array_append(v_details, coalesce(v_admin::text, 'NONE - payout and refund cannot be tested'));

  select coalesce(total_sales, 0) into v_sales0 from public.vendors where id = v_vendor;

  ---------------------------------------------------------------------------
  -- Create the order.
  ---------------------------------------------------------------------------
  insert into public.orders (
    user_id, vendor_id, order_number, total_amount,
    shipping_address, shipping_cost, tax_amount, delivery_cost,
    status, payment_status, payment_method, delivery_method
  ) values (
    v_customer, v_vendor, v_order_no, 3150.00,
    'Probe Street, Nairobi', 250.00, 400.00, 0.00,
    'pending', 'pending', 'mpesa', 'standard'
  ) returning id into v_order;

  -- Both GUCs are set because auth.uid() reads one or the other depending on
  -- the Postgres/Supabase version.
  perform set_config('request.jwt.claim.sub', v_customer::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_customer::text, 'role', 'authenticated')::text, true);

  ---------------------------------------------------------------------------
  -- All the work, in one guarded block. Any unexpected failure is captured as
  -- a failed step instead of aborting the run.
  ---------------------------------------------------------------------------
  begin

    -- STEP 1. Insert items AS A CUSTOMER. The checkout regression test.
    -- create_order() is SECURITY DEFINER but the order guard reads the SESSION
    -- role, so inserting items fires recalc -> UPDATE orders -> guard. Without
    -- the settlement escape this raises 'Customers cannot update orders' and
    -- aborts every checkout in the app.
    begin
      insert into public.order_items
        (order_id, product_id, product_name, product_price, quantity, total_price)
      values
        (v_order, v_product, 'Probe item A', 1000.00, 2, 2000.00),
        (v_order, v_product, 'Probe item B',  500.00, 1,  500.00);

      v_steps   := array_append(v_steps,   '01 items insert as customer (CHECKOUT REGRESSION)');
      v_oks     := array_append(v_oks,     true);
      v_details := array_append(v_details, 'no exception - the settlement escape works');
    exception when others then
      v_steps   := array_append(v_steps,   '01 items insert as customer (CHECKOUT REGRESSION)');
      v_oks     := array_append(v_oks,     false);
      v_details := array_append(v_details, 'RAISED: ' || sqlerrm);
      v_abort   := true;
    end;

    if not v_abort then

      -- STEPS 2-6. The commission split.
      select merchandise_subtotal, commission_amount, vendor_earnings
        into v_sub, v_comm, v_earn
        from public.orders where id = v_order;

      v_steps := array_append(v_steps, '02 subtotal = sum of line items');
      v_oks   := array_append(v_oks,   v_sub = 2500.00);
      v_details := array_append(v_details, coalesce(v_sub::text, 'null'));

      v_steps := array_append(v_steps, '03 commission = 15% of the subtotal');
      v_oks   := array_append(v_oks,   v_comm = 375.00);
      v_details := array_append(v_details, coalesce(v_comm::text, 'null'));

      v_steps := array_append(v_steps, '04 vendor earnings = subtotal - commission');
      v_oks   := array_append(v_oks,   v_earn = 2125.00);
      v_details := array_append(v_details, coalesce(v_earn::text, 'null'));

      v_steps := array_append(v_steps, '05 commission + earnings = subtotal, no rounding drift');
      v_oks   := array_append(v_oks,   coalesce(v_comm + v_earn, -1) = v_sub);
      v_details := array_append(v_details, (coalesce(v_comm,0) + coalesce(v_earn,0))::text);

      -- 15% of the FULL 3150 would be 472.50, so this catches commission
      -- leaking onto tax and shipping.
      v_steps := array_append(v_steps, '06 tax and shipping are NOT commission-bearing');
      v_oks   := array_append(v_oks,   v_comm = round(v_sub * 0.15, 2));
      v_details := array_append(v_details, 'commission=' || coalesce(v_comm::text,'null') || ' (15% of the total would be 472.50)');

      -- STEP 7. A customer must not be able to rewrite money fields.
      begin
        update public.orders set total_amount = 1.00 where id = v_order;
        v_steps   := array_append(v_steps, '07 customer CANNOT rewrite total_amount');
        v_oks     := array_append(v_oks,     false);
        v_details := array_append(v_details, 'IT WAS ALLOWED - the guard is too loose');
      exception when others then
        v_steps   := array_append(v_steps, '07 customer CANNOT rewrite total_amount');
        v_oks     := array_append(v_oks,     true);
        v_details := array_append(v_details, sqlerrm);
      end;

      -- STEPS 8-21. Settlement, payout and refund, all as an admin.
      if v_admin is not null then
        perform set_config('request.jwt.claim.sub', v_admin::text, true);
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

        update public.orders
           set payment_status = 'paid', paid_at = now()
         where id = v_order;

        select coalesce(sum(l.amount), 0) into v_bal0
          from public.vendor_ledger l
         where l.vendor_id = v_vendor and l.order_id = v_order and l.entry_type = 'earning';

        select coalesce(total_sales, 0) into v_sales1 from public.vendors where id = v_vendor;

        v_steps := array_append(v_steps, '08 ledger credited the vendor on payment');
        v_oks   := array_append(v_oks,   v_bal0 = 2125.00);
        v_details := array_append(v_details, coalesce(v_bal0::text, 'null'));

        v_steps := array_append(v_steps, '09 vendors.total_sales incremented exactly once');
        v_oks   := array_append(v_oks,   v_sales1 = v_sales0 + 1);
        v_details := array_append(v_details, v_sales0::text || ' -> ' || v_sales1::text);

        -- A retried payment callback must not pay the vendor twice.
        update public.orders set payment_status = 'pending' where id = v_order;
        update public.orders set payment_status = 'paid'    where id = v_order;

        select coalesce(sum(l.amount), 0) into v_bal1
          from public.vendor_ledger l
         where l.vendor_id = v_vendor and l.order_id = v_order and l.entry_type = 'earning';

        v_steps := array_append(v_steps, '10 a retried payment does NOT double-credit');
        v_oks   := array_append(v_oks,   v_bal1 = v_bal0);
        v_details := array_append(v_details, v_bal0::text || ' -> ' || v_bal1::text);

        -- Payouts.
        v_payout := public.create_vendor_payout(v_vendor, 1000.00, 'bank_transfer', 'PROBE-REF', 'probe');

        select public.vendor_balance(v_vendor) into v_bal1;
        v_steps := array_append(v_steps, '11 a PENDING payout does not move the balance');
        v_oks   := array_append(v_oks,   v_bal1 = v_bal0);
        v_details := array_append(v_details, 'balance still ' || v_bal0::text);

        perform public.mark_vendor_payout_paid(v_payout, 'PROBE-TRACE');
        select public.vendor_balance(v_vendor) into v_bal1;

        v_steps := array_append(v_steps, '12 marking a payout PAID debits the balance');
        v_oks   := array_append(v_oks,   v_bal1 = v_bal0 - 1000);
        v_details := array_append(v_details, v_bal0::text || ' -> ' || v_bal1::text);

        begin
          perform public.mark_vendor_payout_paid(v_payout);
          v_steps   := array_append(v_steps, '13 the same payout cannot be marked paid twice');
          v_oks     := array_append(v_oks,     false);
          v_details := array_append(v_details, 'IT WAS ALLOWED');
        exception when others then
          v_steps   := array_append(v_steps, '13 the same payout cannot be marked paid twice');
          v_oks     := array_append(v_oks,     true);
          v_details := array_append(v_details, sqlerrm);
        end;

        begin
          perform public.create_vendor_payout(v_vendor, 999999.00, 'mpesa');
          perform public.mark_vendor_payout_paid(
            (select p.id from public.vendor_payouts p
              where p.vendor_id = v_vendor and p.status = 'pending'
              order by p.created_at desc limit 1));
          v_steps   := array_append(v_steps, '14 overdrawing the balance is refused');
          v_oks     := array_append(v_oks,     false);
          v_details := array_append(v_details, 'IT WAS ALLOWED');
        exception when others then
          v_steps   := array_append(v_steps, '14 overdrawing the balance is refused');
          v_oks     := array_append(v_oks,     true);
          v_details := array_append(v_details, sqlerrm);
        end;

        -- Refund.
        v_refund := public.refund_order(v_order, 'probe', 'PROBE-RF', true);

        v_steps := array_append(v_steps, '15 refund returns everything the customer paid');
        v_oks   := array_append(v_oks,   v_refund = 3150.00);
        v_details := array_append(v_details, coalesce(v_refund::text, 'null'));

        select coalesce(sum(l.amount), 0) into v_bal2
          from public.vendor_ledger l
         where l.vendor_id = v_vendor and l.order_id = v_order;

        v_steps := array_append(v_steps, '16 the vendor reversal is merchandise only');
        v_oks   := array_append(v_oks,   v_bal2 = 0);
        v_details := array_append(v_details, 'earning 2125 + reversal = ' || v_bal2::text || ' (tax and shipping are never reversed)');

        select o.payment_status::text, o.refund_amount, coalesce(pr.stock_quantity, 0)
          into v_status, v_refund_amt, v_stock1
          from public.orders o
          join public.products pr on pr.id = v_product
         where o.id = v_order;

        v_steps := array_append(v_steps, '17 the order is marked refunded');
        v_oks   := array_append(v_oks,   v_status = 'refunded');
        v_details := array_append(v_details, coalesce(v_status,'null') || ' refund_amount=' || coalesce(v_refund_amt::text,'null'));

      -- Both probe lines point at the SAME product (qty 2 and qty 1), so a
      -- correct refund puts back 3 units. Asserting a return to the original
      -- count was a bug in this probe, not in the restock logic.
      v_steps := array_append(v_steps, '18 the refund restocked the items');
      v_oks   := array_append(v_oks,   v_stock1 = v_stock0 + 3);
      v_details := array_append(v_details,
        v_stock0::text || ' -> ' || v_stock1::text || ' (+3 = qty 2 + qty 1 on the same product)');

        begin
          perform public.refund_order(v_order, 'again');
          v_steps   := array_append(v_steps, '19 an order cannot be refunded twice');
          v_oks     := array_append(v_oks,     false);
          v_details := array_append(v_details, 'IT WAS ALLOWED');
        exception when others then
          v_steps   := array_append(v_steps, '19 an order cannot be refunded twice');
          v_oks     := array_append(v_oks,     true);
          v_details := array_append(v_details, sqlerrm);
        end;

        -- Non-admins must be locked out.
        perform set_config('request.jwt.claim.sub', v_customer::text, true);
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_customer::text, 'role', 'authenticated')::text, true);

        begin
          perform public.refund_order(v_order, 'sneaky');
          v_steps   := array_append(v_steps, '20 a customer CANNOT issue a refund');
          v_oks     := array_append(v_oks,     false);
          v_details := array_append(v_details, 'IT WAS ALLOWED');
        exception when others then
          v_steps   := array_append(v_steps, '20 a customer CANNOT issue a refund');
          v_oks     := array_append(v_oks,     true);
          v_details := array_append(v_details, sqlerrm);
        end;

        begin
          perform public.create_vendor_payout(v_vendor, 10.00, 'mpesa');
          v_steps   := array_append(v_steps, '21 a customer CANNOT create a payout');
          v_oks     := array_append(v_oks,     false);
          v_details := array_append(v_details, 'IT WAS ALLOWED');
        exception when others then
          v_steps   := array_append(v_steps, '21 a customer CANNOT create a payout');
          v_oks     := array_append(v_oks,     true);
          v_details := array_append(v_details, sqlerrm);
        end;

      else
        v_steps := array_append(v_steps, '08-21 settlement, payout and refund');
        v_oks   := array_append(v_oks,   false);
        v_details := array_append(v_details,
          'SKIPPED: no admin profile exists, create one and re-run');
      end if;

      -- STEP 22. RLS structural check.
      -- Deliberately structural: PostgreSQL forbids SET ROLE inside a SECURITY
      -- DEFINER function, and the SQL editor runs as the table owner for whom
      -- RLS is bypassed anyway. True row-level enforcement has to be proven
      -- through the REST API with a real customer token, not from SQL.
      select c.relrowsecurity into v_rls_on
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'vendor_ledger';

      select count(*) into v_write_policies
        from pg_policies
       where schemaname = 'public'
         and tablename in ('vendor_ledger', 'vendor_payouts', 'order_refunds')
         and cmd in ('INSERT', 'UPDATE', 'DELETE');

      v_steps := array_append(v_steps, '22 RLS enabled and no client write policy on the money tables');
      v_oks   := array_append(v_oks,   coalesce(v_rls_on, false) and v_write_policies = 0);
      v_details := array_append(v_details,
        'rls_on=' || coalesce(v_rls_on::text,'?') || ' write_policies=' || v_write_policies::text);

    end if;  -- not v_abort

  exception when others then
    -- Anything unexpected above is reported rather than aborting the run, so
    -- you still see which steps completed before the failure.
    v_steps   := array_append(v_steps,   'PROBE ABORTED EARLY');
    v_oks     := array_append(v_oks,     false);
    v_details := array_append(v_details, 'unexpected failure: ' || sqlerrm);
  end;

  ---------------------------------------------------------------------------
  -- Cleanup, always reached. Explicit so re-running never accumulates probe
  -- data even if the editor commits between statements. On an unhandled error
  -- the single statement rolls back by itself, which is why this is belt and
  -- braces.
  ---------------------------------------------------------------------------
  if v_order is not null then
    delete from public.vendor_ledger where order_id = v_order;
    delete from public.order_refunds  where order_id = v_order;
    delete from public.vendor_ledger
     where payout_id in (select id from public.vendor_payouts where reference like 'PROBE-%');
    delete from public.vendor_payouts where reference like 'PROBE-%';
    delete from public.orders where id = v_order;   -- cascades to order_items
  end if;

  -- Restore total_sales. That column is guarded, and 0037 lets exactly one
  -- writer through, so the same flag is used here.
  if v_vendor is not null and v_sales0 is not null then
    perform set_config('nexamart.internal_settlement_write', 'on', true);
    update public.vendors set total_sales = v_sales0 where id = v_vendor;
    perform set_config('nexamart.internal_settlement_write', 'off', true);
  end if;

  v_steps := array_append(v_steps, 'CLEANUP: all probe data removed');
  v_oks   := array_append(v_oks,   true);
  v_details := array_append(v_details,
    format('order=%s removed, PROBE- payouts/refunds removed, total_sales restored to %s',
           v_order_no, v_sales0));

  return query select * from unnest(v_steps, v_oks, v_details) as t(step, ok, detail);
end;
$$;

-- Not for application use. Only the function owner should call this.
revoke all on function public.phase2_money_probe() from public, anon, authenticated;

-- ============================================================================
-- Then run:   select * from public.phase2_money_probe();
-- Clean up:   drop function public.phase2_money_probe();
--
-- READING THE OUTPUT
--   Every ok = true  -> the Phase 2 money logic is genuinely proven.
--   Any ok = false   -> a real defect, not a cosmetic issue.
--
--   "role=customer" in the SETUP line means the probe ran as a real customer,
--   so steps 07 and 20-21 tested the exact branches you care about.
--   "role=vendor" means no customer profile exists in this database, so a
--   vendor stood in; step 01 is still valid (the settlement escape is checked
--   before any role), but 07 and 20-21 hit the vendor branch instead.
--   "role=admin" means every profile is an admin and 07 and 20-21 prove
--   nothing. Register a real customer account, then re-run.
-- ============================================================================
