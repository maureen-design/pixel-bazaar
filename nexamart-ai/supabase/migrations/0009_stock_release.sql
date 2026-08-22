-- ============================================================================
-- NexaMart AI - 0009_stock_release.sql
-- Safe, idempotent stock release on failed/cancelled payments (Priority #7).
--
-- Additive only:
--   1) orders.stock_released boolean NOT NULL DEFAULT false
--      -> authoritative "already released" guard so repeated callbacks /
--         retries / webhook replays can NEVER release stock twice.
--   2) SECURITY DEFINER RPC public.release_stock_for_order(p_order_id uuid)
--      -> restores base stock_quantity AND variant-combination stock exactly
--         once, in a single transaction, mirroring the decrement logic used
--         by createOrder (orderUtils.ts).
--
-- The RPC is the ONLY place that releases stock. Server-side failure paths
-- (mpesa-callback, process-card-payment) call it. It refuses to release for:
--   * successful/paid orders      (payment_status = 'paid'/'refunded')
--   * delivered orders            (status = 'delivered')
--   * processing / shipped orders (status IN ('processing','shipped'))
--   * orders already released     (stock_released = true)
--
-- Idempotent migration: safe to re-run (add column if not exists /
-- create or replace function).
-- ============================================================================

-- 1. Additive guard column ----------------------------------------------------
alter table public.orders
  add column if not exists stock_released boolean not null default false;

-- 2. SECURITY DEFINER release RPC ----------------------------------------------
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
begin
  -- Authoritative state guard: only cancelled/failed orders qualify.
  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    return false;
  end if;

  -- Never release for paid / refunded / delivered / processing / shipped orders.
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

grant execute on function public.release_stock_for_order(uuid) to authenticated;

-- ============================================================================
-- End of migration
-- ============================================================================
