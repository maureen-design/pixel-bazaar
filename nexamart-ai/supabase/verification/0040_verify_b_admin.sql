-- ============================================================================
-- 0040_verify_b_admin.sql
-- ============================================================================
-- SECTION B of 0040 verification. Exercises the RPCs AS AN ADMIN.
--
-- RUN THIS FILE ON ITS OWN. It returns one grid with 6 rows.
--
-- Why the identity switch is needed: this file is executed as a role with no
-- auth.uid(), so calling an admin-gated function directly raises
--   42501 Not authorised to view platform financials
-- The block below adopts a real admin for the duration of its transaction.
--
-- Results are returned as ROWS rather than notices, because the SQL Editor
-- does not reliably surface the notices panel.
--
-- The row that matters most is 021: net commission + vendor earnings must
-- equal GMV to the cent. If that does not reconcile, the commission split is
-- wrong and no dashboard will reveal it.
--
-- This script is read-only. It creates a temporary table and changes nothing
-- else.
-- ============================================================================

do $$
declare
  v_admin   uuid;
  v_count   int;
  v_first   date;
  v_comm    numeric;
  v_gmv     numeric;
  v_vend    numeric;
  v_net     numeric;
  v_orders  bigint;
  v_refunds bigint;
  v_amt     numeric;
begin
  -- No ON COMMIT DROP. The Editor may run each statement as its own
  -- transaction, which would discard the table before the final SELECT.
  create temp table verify_b (
    step text primary key,
    ok boolean not null,
    detail text
  );

  select id into v_admin
    from public.profiles
   where role = 'admin'::public.user_role
   limit 1;

  if v_admin is null then
    insert into verify_b values
      ('setup', false, 'no admin profile exists, cannot exercise admin-gated RPCs');
    return;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  insert into verify_b values
    ('identity', true, 'assumed admin id=' || v_admin::text);

  -- 021. Totals resolve and the components reconcile exactly.
  begin
    select r.orders_paid, r.gmv, r.net_platform_revenue, r.vendor_earnings_paid
      into v_orders, v_gmv, v_net, v_vend
      from lateral public.admin_financial_summary(
             now() - interval '30 days', now()
           ) r;

    insert into verify_b values (
      '021 reconcile',
      v_net + v_vend = v_gmv,
      'orders_paid=' || v_orders
        || ' gmv=' || v_gmv
        || ' net_commission=' || v_net
        || ' vendor_earnings=' || v_vend
        || ' | commission+vendor=' || (v_net + v_vend)
        || ' vs gmv=' || v_gmv
    );
  exception
    when others then
      insert into verify_b values
        ('021 reconcile', false, 'error: ' || sqlerrm);
  end;

  -- 022. The daily series is contiguous and zero filled. A 10-day window must
  --      yield exactly 11 rows, one per calendar day including both ends.
  begin
    select count(*), min(r.day)
      into v_count, v_first
      from lateral public.admin_daily_commission(
             now() - interval '10 days', now()
           ) r;

    insert into verify_b values (
      '022 daily series',
      v_count = 11,
      'rows=' || v_count || ' expected=11 first_day=' || v_first
    );
  exception
    when others then
      insert into verify_b values
        ('022 daily series', false, 'error: ' || sqlerrm);
  end;

  -- 023. A single day is callable without error.
  begin
    select r.commission, r.gmv, r.orders
      into v_comm, v_gmv, v_orders
      from lateral public.admin_daily_commission(
             date_trunc('day', now() at time zone 'Africa/Nairobi')
               at time zone 'Africa/Nairobi',
             (date_trunc('day', now() at time zone 'Africa/Nairobi') + interval '1 day')
               at time zone 'Africa/Nairobi'
           ) r;

    insert into verify_b values (
      '023 single day',
      true,
      'today commission=' || v_comm || ' gmv=' || v_gmv || ' orders=' || v_orders
    );
  exception
    when others then
      insert into verify_b values
        ('023 single day', false, 'error: ' || sqlerrm);
  end;

  -- 024. An inverted window must be rejected, not silently return nothing.
  begin
    perform * from public.admin_daily_commission(now(), now() - interval '5 days');
    insert into verify_b values
      ('024 inverted window', false, 'LEAK: an inverted window was accepted');
  exception
    when others then
      insert into verify_b values
        ('024 inverted window', true, 'rejected: ' || sqlerrm);
  end;

  -- 025. The new refunds RPC resolves.
  begin
    select r.refunds, r.amount
      into v_refunds, v_amt
      from lateral public.admin_refunds_in_window(
             now() - interval '30 days', now()
           ) r;

    insert into verify_b values (
      '025 refunds rpc',
      true,
      'refunds_issued_last_30d=' || v_refunds || ' amount=' || v_amt
    );
  exception
    when others then
      insert into verify_b values
        ('025 refunds rpc', false, 'error: ' || sqlerrm);
  end;

  -- 026. Null bounds fall back to the 90-day default rather than erroring.
  begin
    select count(*) into v_count
      from lateral public.admin_financial_summary(null, null) r;

    insert into verify_b values (
      '026 null bounds',
      v_count = 1,
      'rows=' || v_count || ' expected=1'
    );
  exception
    when others then
      insert into verify_b values
        ('026 null bounds', false, 'error: ' || sqlerrm);
  end;

end;
$$;

-- The grid the Editor actually renders.
select step as check, ok, detail
  from verify_b
 order by case step
           when 'identity' then 0
           when '021 reconcile' then 1
           when '022 daily series' then 2
           when '023 single day' then 3
           when '024 inverted window' then 4
           when '025 refunds rpc' then 5
           when '026 null bounds' then 6
           else 9
         end;