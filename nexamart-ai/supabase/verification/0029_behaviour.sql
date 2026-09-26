-- ============================================================================
-- 0029 behavioural verification, result-set edition.
--
-- Run in three separate SQL Editor submissions, in order:
--   1. create or replace function public.nexa_0029_verify_tmp() ... $$;
--   2. select * from public.nexa_0029_verify_tmp();
--   3. drop function if exists public.nexa_0029_verify_tmp();
--
-- Every data change runs inside a plpgsql subtransaction that is forced to
-- roll back with a custom SQLSTATE (RX001), so this is safe even if the
-- 0029 guards turn out to be broken. Nothing is ever committed.
-- ============================================================================

create or replace function public.nexa_0029_verify_tmp()
returns table(test text, outcome text, detail text)
language plpgsql
as $$
declare
  v_order    record;
  v_item     record;
  v_admin    uuid;
  v_caller   uuid;
  v_before   int;
  v_after    int;
  v_again    int;
  v_released boolean;
  v_repeat   boolean;
  v_result   boolean;
  v_msg      text;
  v_outcome  text;
  v_detail   text;
begin

  -- 4a. A paid order can never be cancelled, even by an admin. ---------------
  v_outcome := 'SKIP';
  v_detail  := 'no data to test with';
  begin
    select id, order_number into v_order
    from public.orders where payment_status = 'paid'
    order by created_at desc limit 1;

    if found then
      select id into v_admin from public.profiles where role = 'admin' limit 1;

      if v_admin is null then
        v_detail := 'no admin profile exists';
      else
        perform set_config('request.jwt.claim.sub', v_admin::text, true);
        perform set_config('request.jwt.claims',
                           json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

        begin
          update public.orders set status = 'cancelled' where id = v_order.id;
          v_outcome := 'FAIL';
          v_detail  := format('admin cancelled paid order %s and nothing blocked it',
                              v_order.order_number);
          raise exception 'NEXA_ROLLBACK' using errcode = 'RX001';
        exception when sqlstate 'RX001' then
          null;
        when others then
          v_msg := sqlerrm;
          if v_msg like 'Cannot cancel a paid order%' then
            v_outcome := 'PASS';
            v_detail  := format('admin blocked on order %s: %s', v_order.order_number, v_msg);
          else
            v_outcome := 'FAIL';
            v_detail  := format('blocked by the wrong error: %s', v_msg);
          end if;
        end;
      end if;
    else
      v_detail := 'no paid order exists';
    end if;
  end;
  return query select '4a paid order cannot be cancelled'::text, v_outcome, v_detail;

  -- 4b. A cancelled order is terminal. ---------------------------------------
  v_outcome := 'SKIP';
  v_detail  := 'no data to test with';
  begin
    select id, order_number into v_order
    from public.orders where status = 'cancelled'
    order by created_at desc limit 1;

    if found then
      select id into v_admin from public.profiles where role = 'admin' limit 1;

      if v_admin is null then
        v_detail := 'no admin profile exists';
      else
        perform set_config('request.jwt.claim.sub', v_admin::text, true);
        perform set_config('request.jwt.claims',
                           json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

        begin
          update public.orders set status = 'shipped' where id = v_order.id;
          v_outcome := 'FAIL';
          v_detail  := format('order %s was rewritten from cancelled to shipped', v_order.order_number);
          raise exception 'NEXA_ROLLBACK' using errcode = 'RX001';
        exception when sqlstate 'RX001' then
          null;
        when others then
          v_msg := sqlerrm;
          if v_msg like 'Cannot change status of a cancelled%' then
            v_outcome := 'PASS';
            v_detail  := format('terminal state protected on %s: %s', v_order.order_number, v_msg);
          else
            v_outcome := 'FAIL';
            v_detail  := format('blocked by the wrong error: %s', v_msg);
          end if;
        end;
      end if;
    else
      v_detail := 'no cancelled order exists';
    end if;
  end;
  return query select '4b cancelled order is terminal'::text, v_outcome, v_detail;

  -- 4c. Cancelling an unpaid order releases stock exactly once. --------------
  v_outcome := 'SKIP';
  v_detail  := 'no unpaid order with a non-variant item';
  begin
    select o.id, o.order_number into v_order
    from public.orders o
    where o.payment_status not in ('paid', 'refunded')
      and o.status not in ('cancelled', 'delivered')
      and o.stock_released = false
      and exists (select 1 from public.order_items oi
                  where oi.order_id = o.id and oi.variant_id is null)
    order by o.created_at desc limit 1;

    if found then
      select oi.product_id, oi.quantity, p.stock_quantity into v_item
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = v_order.id and oi.variant_id is null
      order by oi.id limit 1;

      select id into v_admin from public.profiles where role = 'admin' limit 1;

      v_outcome := 'FAIL';
      v_detail  := 'test did not complete';

      begin
        if v_admin is not null then
          perform set_config('request.jwt.claim.sub', v_admin::text, true);
          perform set_config('request.jwt.claims',
                             json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
        end if;

        v_before := v_item.stock_quantity;

        update public.orders set status = 'cancelled' where id = v_order.id;

        select stock_released into v_released
        from public.orders where id = v_order.id;

        select stock_quantity into v_after
        from public.products where id = v_item.product_id;

        if v_released and v_after = v_before + v_item.quantity then
          v_outcome := 'PASS';
          v_detail  := format('order %s released stock %s -> %s (+%s)',
                              v_order.order_number, v_before, v_after, v_item.quantity);
        else
          v_detail  := format('order %s stock_released=%s, stock %s -> %s (expected %s)',
                              v_order.order_number, v_released, v_before, v_after,
                              v_before + v_item.quantity);
        end if;

        v_repeat := public.release_stock_for_order(v_order.id);

        select stock_quantity into v_again
        from public.products where id = v_item.product_id;

        if v_again <> v_after then
          v_outcome := 'FAIL';
          v_detail  := format('repeat release changed stock %s -> %s (must stay %s)',
                              v_after, v_again, v_after);
        else
          v_detail := v_detail || format(' | repeat release was a no-op (returned %s)', v_repeat);
        end if;

        raise exception 'NEXA_ROLLBACK' using errcode = 'RX001';
      exception when sqlstate 'RX001' then
        null;
      end;
    end if;
  end;
  return query select '4c cancel releases stock once'::text, v_outcome, v_detail;

  -- 4d. A customer who does not own the order cannot release its stock. -----
  v_outcome := 'SKIP';
  v_detail  := 'no cancelled/unreleased order available';
  begin
    select o.id, o.order_number, o.vendor_id into v_order
    from public.orders o
    where o.status = 'cancelled'
      and o.stock_released = false
      and exists (select 1 from public.order_items oi
                  where oi.order_id = o.id and oi.variant_id is null)
    order by o.created_at desc limit 1;

    if found then
      select p.id into v_caller
      from public.profiles p
      where p.role <> 'admin'
        and not exists (select 1 from public.vendors v
                        where v.id = v_order.vendor_id and v.user_id = p.id)
      limit 1;

      if v_caller is null then
        v_detail := 'no non-admin, non-vendor profile available';
      else
        select oi.product_id, oi.quantity, p.stock_quantity into v_item
        from public.order_items oi
        join public.products p on p.id = oi.product_id
        where oi.order_id = v_order.id and oi.variant_id is null
        order by oi.id limit 1;

        v_outcome := 'FAIL';
        v_detail  := 'test did not complete';

        begin
          perform set_config('request.jwt.claim.sub', v_caller::text, true);
          perform set_config('request.jwt.claims',
                             json_build_object('sub', v_caller::text, 'role', 'authenticated')::text, true);

          v_before := v_item.stock_quantity;
          v_result := public.release_stock_for_order(v_order.id);

          select stock_quantity into v_after
          from public.products where id = v_item.product_id;

          if v_result = false and v_after = v_before then
            v_outcome := 'PASS';
            v_detail  := format('non-owner denied, stock unchanged at %s', v_before);
          else
            v_detail  := format('returned %s, stock %s -> %s (expected false / unchanged)',
                                v_result, v_before, v_after);
          end if;

          raise exception 'NEXA_ROLLBACK' using errcode = 'RX001';
        exception when sqlstate 'RX001' then
          null;
        end;
      end if;
    end if;
  end;
  return query select '4d non-owner cannot release stock'::text, v_outcome, v_detail;

  -- 4e. Execute grants. ------------------------------------------------------
  return query
  select '4e execute grants'::text,
         case when has_function_privilege('anon', 'public.release_stock_for_order(uuid)', 'EXECUTE')
                or has_function_privilege('authenticated', 'public.release_stock_for_order(uuid)', 'EXECUTE')
              then 'FAIL' else 'PASS' end,
         format('anon=%s, authenticated=%s, service_role=%s',
                has_function_privilege('anon', 'public.release_stock_for_order(uuid)', 'EXECUTE'),
                has_function_privilege('authenticated', 'public.release_stock_for_order(uuid)', 'EXECUTE'),
                has_function_privilege('service_role', 'public.release_stock_for_order(uuid)', 'EXECUTE'));

  return;
end;
$$;
