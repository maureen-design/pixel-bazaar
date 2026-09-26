-- ============================================================================
-- 0029 guard verification, self-seeding edition.
--
-- The database has no paid and no cancelled orders, so 4a/4b skipped. These
-- versions manufacture the preconditions inside a subtransaction that always
-- rolls back, so they work on an empty order table.
--
-- Run as three separate SQL Editor submissions:
--   1. create or replace function public.nexa_0029_guards_tmp() ... $$;
--   2. select * from public.nexa_0029_guards_tmp();
--   3. drop function if exists public.nexa_0029_guards_tmp();
-- ============================================================================

create or replace function public.nexa_0029_guards_tmp()
returns table(test text, outcome text, detail text)
language plpgsql
as $$
declare
  v_order   record;
  v_admin   uuid;
  v_msg     text;
  v_outcome text;
  v_detail  text;
begin

  -- 4a. A paid order can never be cancelled, even by an admin. ---------------
  v_outcome := 'SKIP';
  v_detail  := 'no admin profile exists';
  begin
    select id into v_admin from public.profiles where role = 'admin' limit 1;

    if v_admin is not null then
      select o.id, o.order_number into v_order
      from public.orders o
      order by o.created_at desc limit 1;

      if v_order.id is null then
        v_detail := 'no order exists to seed from';
      else
        v_detail := 'test did not complete';

        begin
          -- Seed: mark the newest order as paid, with no JWT so the
          -- service-role early return in protect_orders_payment_fields
          -- permits the write.
          begin
            perform set_config('request.jwt.claim.sub', '', true);
            perform set_config('request.jwt.claims', '', true);

            update public.orders
               set payment_status = 'paid',
                   status          = 'processing'
             where id = v_order.id;
          exception when others then
            v_outcome := 'SKIP';
            v_detail  := format('could not seed a paid order: %s', sqlerrm);
            raise exception 'NEXA_ROLLBACK' using errcode = 'RX001';
          end;

          perform set_config('request.jwt.claim.sub', v_admin::text, true);
          perform set_config('request.jwt.claims',
                             json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

          v_outcome := 'FAIL';
          v_detail  := format('admin cancelled paid order %s and nothing blocked it',
                              v_order.order_number);

          begin
            update public.orders set status = 'cancelled' where id = v_order.id;
          exception when others then
            v_msg := sqlerrm;
            if v_msg like 'Cannot cancel a paid order%' then
              v_outcome := 'PASS';
              v_detail  := format('paid order %s blocked: %s', v_order.order_number, v_msg);
            else
              v_detail  := format('blocked by the wrong error: %s', v_msg);
            end if;
          end;

          raise exception 'NEXA_ROLLBACK' using errcode = 'RX001';
        exception when sqlstate 'RX001' then
          null;
        end;
      end if;
    end if;
  end;
  return query select '4a paid order cannot be cancelled'::text, v_outcome, v_detail;

  -- 4b. A cancelled order is terminal: it cannot be rewritten. ---------------
  v_outcome := 'SKIP';
  v_detail  := 'no admin profile exists';
  begin
    select id into v_admin from public.profiles where role = 'admin' limit 1;

    if v_admin is not null then
      select o.id, o.order_number into v_order
      from public.orders o
      order by o.created_at desc limit 1;

      if v_order.id is null then
        v_detail := 'no order exists to seed from';
      else
        v_detail := 'test did not complete';

        begin
          begin
            perform set_config('request.jwt.claim.sub', '', true);
            perform set_config('request.jwt.claims', '', true);

            update public.orders
               set status = 'cancelled'
             where id = v_order.id;

            update public.orders
               set stock_released = false
             where id = v_order.id;
          exception when others then
            v_outcome := 'SKIP';
            v_detail  := format('could not seed a cancelled order: %s', sqlerrm);
            raise exception 'NEXA_ROLLBACK' using errcode = 'RX001';
          end;

          perform set_config('request.jwt.claim.sub', v_admin::text, true);
          perform set_config('request.jwt.claims',
                             json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

          v_outcome := 'FAIL';
          v_detail  := format('order %s was rewritten from cancelled to shipped', v_order.order_number);

          begin
            update public.orders set status = 'shipped' where id = v_order.id;
          exception when others then
            v_msg := sqlerrm;
            if v_msg like 'Cannot change status of a cancelled%' then
              v_outcome := 'PASS';
              v_detail  := format('terminal state protected on %s: %s', v_order.order_number, v_msg);
            else
              v_detail  := format('blocked by the wrong error: %s', v_msg);
            end if;
          end;

          raise exception 'NEXA_ROLLBACK' using errcode = 'RX001';
        exception when sqlstate 'RX001' then
          null;
        end;
      end if;
    end if;
  end;
  return query select '4b cancelled order is terminal'::text, v_outcome, v_detail;

  return;
end;
$$;
