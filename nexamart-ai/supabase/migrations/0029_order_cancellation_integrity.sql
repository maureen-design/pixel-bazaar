-- ============================================================================
-- NexaMart AI - 0029_order_cancellation_integrity.sql
-- Fixes three confirmed cancellation / stock-release integrity defects.
--
-- Defect 1: paid orders could be marked cancelled
--   0013_orders_payment_integrity.sql:428 allowed a vendor to set
--   status = 'cancelled' with NO check on the previous status and NO check on
--   payment_status, and 0013:397 let an admin bypass every guard entirely.
--   Result: status = 'cancelled' with payment_status = 'paid' -> no refund was
--   issued and release_stock_for_order (0009:52) refuses to release stock for
--   paid orders, so the stock stayed reserved forever while
--   OrderTimeline.tsx told the customer it had been released.
--
-- Defect 2: vendor/admin cancellation never released stock
--   Only reject_bank_payment (0017) and the payment edge functions call
--   release_stock_for_order. The manual paths
--   (src/pages/vendor/Orders.tsx handleCancelOrder and
--    src/pages/admin/Orders.ts handleCancelOrder) perform a bare
--   .update({ status: 'cancelled' }), so an unpaid order cancelled by a vendor
--   or admin kept its stock reserved indefinitely, contradicting the promise in
--   src/pages/Terms.tsx that cancelled orders have their stock released.
--
-- Defect 3: release_stock_for_order was not correctly restricted
--   0009:116 only ADDED a grant to authenticated and never revoked the default
--   EXECUTE grant to PUBLIC, so anon and every logged-in customer could call
--   the SECURITY DEFINER RPC directly via PostgREST on ANY cancelled, unpaid
--   order. The function also performed no caller authorization at all.
--
-- The fix:
--   1) Revoke release_stock_for_order from public/anon/authenticated, grant it
--      only to service_role, and add an explicit caller check.
--   2) Add an AFTER UPDATE trigger so ANY transition into 'cancelled' releases
--      stock in the same transaction. This fixes the vendor and admin paths
--      without changing either page.
--   3) Rebuild trg_orders_protect_payment_fields so that a paid or refunded
--      order can never be cancelled, and so that terminal states (cancelled,
--      delivered) can no longer be rewritten. These checks run BEFORE the admin
--      early-return so they apply to admins too.
--
-- No new features, no schema changes, no data mutation.
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Lock down release_stock_for_order -----------------------------------------
-- 0009 granted EXECUTE to authenticated but never revoked the implicit PUBLIC
-- grant, so the RPC was reachable by anon and by any authenticated customer.
revoke all on function public.release_stock_for_order(uuid) from public;
revoke all on function public.release_stock_for_order(uuid) from anon;
revoke all on function public.release_stock_for_order(uuid) from authenticated;
grant execute on function public.release_stock_for_order(uuid) to service_role;

-- Recreate with an explicit caller check. This is defence in depth: even when
-- invoked from another SECURITY DEFINER function (e.g. reject_bank_payment,
-- where the effective role is the owner but the JWT is still present), the
-- caller must be the service role, an admin, or the order's own vendor.
create or replace function public.release_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item record;
  v_combos jsonb;
  v_caller uuid := auth.uid();
begin
  -- Authoritative state guard: only cancelled/failed orders qualify.
  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    return false;
  end if;

  -- Caller authorization. auth.uid() is null for service-role callers (the
  -- M-Pesa / Paystack / card / reconciliation edge functions), which are the
  -- authoritative release points. Interactive callers must be an admin or the
  -- vendor who owns the order.
  if v_caller is not null then
    if not exists (
      select 1 from public.profiles
       where id = v_caller and role = 'admin'
    ) and not exists (
      select 1
        from public.vendors v
        join public.orders o on o.vendor_id = v.id
       where o.id = p_order_id and v.user_id = v_caller
    ) then
      return false;
    end if;
  end if;

  -- Never release for paid / refunded orders. A paid order must be refunded
  -- first; releasing its stock would create oversellable inventory.
  if v_order.payment_status in ('paid', 'refunded') then
    return false;
  end if;
  -- Only cancelled orders qualify (status enum has no 'failed' value).
  if v_order.status <> 'cancelled' then
    return false;
  end if;

  -- Idempotency: never release twice.
  if v_order.stock_released then
    return false;
  end if;

  -- Allow this function to flip orders.stock_released even though that column
  -- is normally immutable (trg_orders_protect_payment_fields). The flag is
  -- transaction-local and only set by this function, so it cannot be used by a
  -- client to bypass the payment-field protections.
  perform set_config('nexamart.internal_stock_release', 'on', true);

  -- Mark released FIRST (same transaction) so concurrent callbacks short-circuit.
  update public.orders
     set stock_released = true
   where id = p_order_id;

  -- Restore stock for every reserved line item.
  for v_item in
    select oi.product_id, oi.quantity, oi.variant_id
      from public.order_items oi
     where oi.order_id = p_order_id
  loop
    if v_item.variant_id is not null then
      -- Variant-combination stock (mirrors createOrder decrement path).
      select p.variants into v_combos
        from public.products p
       where p.id = v_item.product_id;

      if v_combos is not null and jsonb_typeof(v_combos->'combinations') = 'array' then
        select jsonb_set(
                 v_combos,
                 array['combinations', (c.pos - 1)::text, 'stock'],
                 to_jsonb(
                   greatest(
                     0,
                     coalesce((c.value->>'stock')::int, 0) + v_item.quantity
                   )
                 ),
                 false
               )
          into v_combos
          from jsonb_array_elements(v_combos->'combinations') with ordinality as c(value, pos)
         where c.value->>'id' = v_item.variant_id;

        if v_combos is not null then
          update public.products
             set variants = v_combos
           where id = v_item.product_id;
        end if;
      end if;
    else
      -- Normal base stock_quantity.
      update public.products
         set stock_quantity = stock_quantity + v_item.quantity
       where id = v_item.product_id;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.release_stock_for_order(uuid) from public;
revoke all on function public.release_stock_for_order(uuid) from anon;
revoke all on function public.release_stock_for_order(uuid) from authenticated;
grant execute on function public.release_stock_for_order(uuid) to service_role;

-- 2. Release stock automatically on ANY transition into 'cancelled' -----------
-- Closes the vendor/admin manual-cancellation gap (Defect 2) without touching
-- either page: whichever code path sets status = 'cancelled' now gets the stock
-- release that Terms.tsx promises.
create or replace function public.release_stock_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only act on a real transition into 'cancelled', and only at the top level.
  -- pg_trigger_depth() > 1 means this is the nested update performed by
  -- release_stock_for_order itself, which must not recurse.
  if new.status = 'cancelled'
     and old.status is distinct from new.status
     and pg_trigger_depth() = 1 then
    perform public.release_stock_for_order(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_release_stock_on_cancel on public.orders;
create trigger trg_orders_release_stock_on_cancel
  after update on public.orders
  for each row execute function public.release_stock_on_cancel();

-- 3. Block paid -> cancelled and protect terminal states ----------------------
-- Recreated from 0013 with three changes:
--   a) the internal stock-release flag is honoured, so the release path can set
--      orders.stock_released;
--   b) a paid or refunded order can never transition to 'cancelled';
--   c) 'cancelled' and 'delivered' are terminal and can no longer be rewritten.
-- Checks (b) and (c) deliberately run BEFORE the admin early-return so they
-- apply to vendors and admins alike.
create or replace function public.protect_orders_payment_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  -- Service-role / server-side writers (M-Pesa callback, STK push, card edge,
  -- reconciliation jobs) have no JWT subject; they are trusted to perform
  -- legitimate transitions.
  if auth.uid() is null then
    return new;
  end if;

  -- The authoritative release path (release_stock_on_cancel ->
  -- release_stock_for_order) sets orders.stock_released. Honour the
  -- transaction-local flag it sets so that internal release is not blocked by
  -- the payment-field immutability check below.
  if current_setting('nexamart.internal_stock_release', true) = 'on' then
    return new;
  end if;

  -- (b) A paid or refunded order must never be cancelled: there is no refund
  -- integration, so cancelling would strand the customer and keep stock locked.
  if new.status = 'cancelled'
     and old.status is distinct from new.status
     and old.payment_status in ('paid', 'refunded') then
    raise exception 'Cannot cancel a paid order: refund the payment first';
  end if;

  -- (c) Terminal states cannot be rewritten. This prevents a cancelled order
  -- from being silently un-cancelled, which would double-count any release.
  if old.status in ('cancelled', 'delivered') and old.status is distinct from new.status then
    raise exception 'Cannot change status of a % order', old.status;
  end if;

  select role into v_role from public.profiles where id = auth.uid();

  -- Admins retain full order-management capability.
  if v_role = 'admin' then
    return new;
  end if;

  -- Payment / system-owned columns are immutable to non-admin, non-service actors.
  if old.total_amount       is distinct from new.total_amount       or
     old.shipping_cost      is distinct from new.shipping_cost      or
     old.tax_amount         is distinct from new.tax_amount         or
     old.discount_amount    is distinct from new.discount_amount    or
     old.coupon_id          is distinct from new.coupon_id          or
     old.coupon_code        is distinct from new.coupon_code        or
     old.payment_status     is distinct from new.payment_status     or
     old.payment_method     is distinct from new.payment_method     or
     old.payment_type       is distinct from new.payment_type       or
     old.payment_deadline   is distinct from new.payment_deadline   or
     old.payment_id         is distinct from new.payment_id         or
     old.mpesa_checkout_id  is distinct from new.mpesa_checkout_id  or
     old.mpesa_transaction_id is distinct from new.mpesa_transaction_id or
     old.payment_error      is distinct from new.payment_error      or
     old.paid_at            is distinct from new.paid_at            or
     old.stock_released     is distinct from new.stock_released     or
     old.order_number       is distinct from new.order_number       or
     old.user_id            is distinct from new.user_id            or
     old.vendor_id          is distinct from new.vendor_id          or
     old.delivery_method    is distinct from new.delivery_method    or
     old.delivery_cost      is distinct from new.delivery_cost      or
     old.shipping_address   is distinct from new.shipping_address   then
    raise exception 'Payment-owned order fields are immutable';
  end if;

  -- Vendors may only perform the fulfillment transitions the app supports.
  if v_role = 'vendor' then
    if old.status is distinct from new.status then
      if new.status not in ('processing', 'shipped', 'delivered', 'cancelled') then
        raise exception 'Invalid vendor order status transition';
      end if;
    end if;
    return new;
  end if;

  -- Customers have no legitimate order-update flow.
  raise exception 'Customers cannot update orders';
end;
$$;

drop trigger if exists trg_orders_protect_payment_fields on public.orders;
create trigger trg_orders_protect_payment_fields
  before update on public.orders
  for each row execute function public.protect_orders_payment_fields();

-- 4. Repair report (read-only) -------------------------------------------------
-- Lists rows the defects may already have produced. Run this SELECT on its own
-- first. Rows from group 1 are the integrity breach (paid order marked
-- cancelled, no refund, no stock release). Rows from group 2 are unpaid orders
-- that were cancelled without releasing their reserved stock. The release is
-- idempotent via orders.stock_released, so if you decide to repair, run the
-- commented block below once and re-run this report to confirm it is empty.
--
--   select
--     o.id,
--     o.order_number,
--     o.status,
--     o.payment_status,
--     o.stock_released,
--     o.created_at,
--     case
--       when o.payment_status in ('paid','refunded') then 'paid order marked cancelled'
--       else 'cancelled without stock release'
--     end as issue
--   from public.orders o
--   where o.status = 'cancelled'
--     and o.stock_released = false
--     and o.payment_status not in ('refunded')
--   order by o.created_at desc;
--
-- Optional repair (idempotent, run only after reviewing the report above):
--
--   do $$
--   declare r record;
--   begin
--     for r in
--       select id from public.orders
--        where status = 'cancelled'
--          and stock_released = false
--          and payment_status not in ('paid', 'refunded')
--     loop
--       perform public.release_stock_for_order(r.id);
--     end loop;
--   end $$;

-- ============================================================================
-- End of migration
-- ============================================================================
