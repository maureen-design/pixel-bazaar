-- ============================================================================
-- Confirms the 4b FAIL was caused by nexamart.internal_stock_release staying
-- 'on' for the whole transaction, not by a broken terminal-state guard.
--
-- Run as three separate SQL Editor submissions:
--   1. create or replace function public.nexa_0029_guc_tmp() ... $$;
--   2. select * from public.nexa_0029_guc_tmp();
--   3. drop function if exists public.nexa_0029_guc_tmp();
-- ============================================================================

create or replace function public.nexa_0029_guc_tmp()
returns table(test text, outcome text, detail text)
language plpgsql
as $$
declare
  v_order   record;
  v_admin   uuid;
  v_guc     text;
  v_msg     text;
  v_outcome text;
  v_detail  text;
begin
  v_outcome := 'SKIP';
  v_detail  := 'no admin profile exists';

  begin
    select id into v_admin from public.profiles where role = 'admin' limit 1;

    if v_admin is not null then
      select o.id, o.order_number into v_order
      from public.orders o
      order by o.created_at desc limit 1;

      if v_order.id is not null then
        v_detail := 'test did not complete';

        -- Seed and probe share one subtransaction so the GUC set by the
        -- release is still visible, exactly as in the failing 4b run.
        begin
          perform set_config('request.jwt.claim.sub', '', true);
          perform set_config('request.jwt.claims', '', true);

          update public.orders set status = 'cancelled' where id = v_order.id;
          update public.orders set stock_released = false where id = v_order.id;

          v_guc := current_setting('nexamart.internal_stock_release', true);

          raise exception 'NEXA_ROLLBACK' using errcode = 'RX001';
        exception when sqlstate 'RX001' then
          null;
        end;
      else
        v_detail := 'no order exists to seed from';
      end if;
    end if;
  end;
  return query select '4b-i GUC value after seeding'::text, 'INFO',
                 format('nexamart.internal_stock_release = %s (expected "on", which is why the earlier 4b rewrite was allowed)',
                        coalesce(nullif(v_guc, ''), '<unset>'));

  -- Same test, but the bypass flag is cleared before the rewrite attempt.
  v_outcome := 'SKIP';
  v_detail  := 'no admin profile exists';
  begin
    select id into v_admin from public.profiles where role = 'admin' limit 1;

    if v_admin is not null then
      select o.id, o.order_number into v_order
      from public.orders o
      order by o.created_at desc limit 1;

      if v_order.id is not null then
        v_detail := 'test did not complete';

        begin
          perform set_config('request.jwt.claim.sub', '', true);
          perform set_config('request.jwt.claims', '', true);

          update public.orders set status = 'cancelled' where id = v_order.id;
          update public.orders set stock_released = false where id = v_order.id;

          perform set_config('nexamart.internal_stock_release', 'off', true);

          perform set_config('request.jwt.claim.sub', v_admin::text, true);
          perform set_config('request.jwt.claims',
                             json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

          v_outcome := 'FAIL';
          v_detail  := format('order %s was still rewritten from cancelled to shipped', v_order.order_number);

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
      else
        v_detail := 'no order exists to seed from';
      end if;
    end if;
  end;
  return query select '4b-ii rewrite with GUC cleared'::text, v_outcome, v_detail;

  return;
end;
$$;
