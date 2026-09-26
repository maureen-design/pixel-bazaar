-- ============================================================================
-- NexaMart AI - 0030_release_guc_scope.sql
-- Narrows the bypass window opened by 0029.
--
-- 0029 introduced the transaction-local flag
-- nexamart.internal_stock_release so that release_stock_for_order can set
-- orders.stock_released even though that column is otherwise immutable
-- (trg_orders_protect_payment_fields). protect_orders_payment_fields returns
-- early while the flag is 'on'.
--
-- The problem: 0029 turned the flag on and never turned it off, so the bypass
-- stayed armed for the remainder of the transaction rather than for the single
-- internal update that needs it. No current code path can exploit this:
--   - every supabase edge function performs its status update and its
--     release_stock_for_order call as two separate PostgREST requests, i.e. two
--     separate transactions, so the flag dies with the first one;
--   - reject_bank_payment (0017:550,564) performs its protected order write
--     before calling release_stock_for_order, so nothing runs after the flag is
--     armed.
-- It remains a latent footgun: any future multi-statement routine that cancels
-- an order and then writes to a protected column would silently lose all
-- payment-field protection, with no error raised.
--
-- The fix: reset the flag immediately after the internal stock_released write,
-- shrinking the window from "the rest of the transaction" to one statement.
--
-- No schema change, no data change, no behaviour change to any existing path.
-- CREATE OR REPLACE preserves the function's existing ACL, so the 0029 grants
-- (service_role only) are retained and do not need restating.
-- Idempotent: safe to re-run.
-- ============================================================================

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
  -- is normally immutable (trg_orders_protect_payment_fields).
  perform set_config('nexamart.internal_stock_release', 'on', true);

  -- Mark released FIRST (same transaction) so concurrent callbacks short-circuit.
  update public.orders
     set stock_released = true
   where id = p_order_id;

  -- Release the bypass immediately. Only the update above needs it, so the
  -- payment-field protections must be armed again before this function
  -- returns and before any later statement in the same transaction runs.
  perform set_config('nexamart.internal_stock_release', 'off', true);

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

-- ============================================================================
-- End of migration
-- ============================================================================
