-- ============================================================================
-- Verification for 0029_order_cancellation_integrity.sql
-- Run in Supabase Dashboard -> SQL Editor. Read-only except for Section 4,
-- which runs inside a transaction that is always ROLLED BACK.
-- ============================================================================


-- ============================================================================
-- SECTION 1. Grants and objects
-- Expect: anon=false, authenticated=false, service_role=true, proacl=service_role only
-- ============================================================================
select
  p.proname,
  p.prosecdef as security_definer,
  p.proconfig as search_path,
  pg_get_userbyid(p.proowner) as owner,
  p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'release_stock_for_order';

select
  has_function_privilege('anon',          'public.release_stock_for_order(uuid)', 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', 'public.release_stock_for_order(uuid)', 'EXECUTE') as customer_can_execute,
  has_function_privilege('service_role',  'public.release_stock_for_order(uuid)', 'EXECUTE') as service_can_execute;


-- ============================================================================
-- SECTION 2. Triggers on orders
-- Expect: trg_orders_release_stock_on_cancel = AFTER / FOR EACH ROW
--         trg_orders_protect_payment_fields  = BEFORE / FOR EACH ROW
-- ============================================================================
select
  t.tgname,
  case t.tgtype & 2 when 2 then 'BEFORE' else 'AFTER' end as timing,
  p.proname as function,
  t.tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and c.relname = 'orders'
  and not t.tgisinternal
order by t.tgname;


-- ============================================================================
-- SECTION 3. Integrity report (read-only)
-- ============================================================================

-- 3a. The breach: paid/refunded order marked cancelled. Expect zero rows.
select
  id,
  order_number,
  status,
  payment_status,
  stock_released,
  created_at
from public.orders
where status = 'cancelled'
  and payment_status in ('paid', 'refunded')
order by created_at desc;

-- 3b. Cancelled but stock never released. Expect zero rows.
select
  id,
  order_number,
  status,
  payment_status,
  stock_released,
  created_at
from public.orders
where status = 'cancelled'
  and stock_released = false
order by created_at desc;

-- 3c. Negative base stock. Expect zero rows.
select id, name, stock_quantity
from public.products
where stock_quantity < 0
order by stock_quantity;

-- 3d. Negative variant-combination stock. Expect zero rows.
select
  p.id,
  p.name,
  c.value->>'id' as variant_id,
  (c.value->>'stock')::int as stock
from public.products p,
     lateral jsonb_array_elements(coalesce(p.variants->'combinations', '[]'::jsonb)) as c(value)
where (c.value->>'stock')::int < 0
order by stock;


-- ============================================================================
-- SECTION 4. Behavioural tests
-- Every block below mutates data but the whole section is ROLLED BACK.
-- Tests need a JWT to be simulated, because protect_orders_payment_fields()
-- returns early when auth.uid() is null (that is the service-role path).
-- ============================================================================
begin;

-- 4a. A paid order can never be cancelled, even by an admin.
--     0013 let admins bypass every guard; 0029 must not.
do $$
declare
  v_order record;
  v_admin uuid;
  v_msg   text;
begin
  select id, order_number, payment_status into v_order
  from public.orders
  where payment_status = 'paid'
  order by created_at desc
  limit 1;

  if not found then
    raise notice 'SKIP 4a: no paid order exists to test with';
    return;
  end if;

  select id into v_admin from public.profiles where role = 'admin' limit 1;
  if v_admin is null then
    raise notice 'SKIP 4a: no admin profile exists';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

  begin
    update public.orders set status = 'cancelled' where id = v_order.id;
    raise notice 'FAIL 4a: admin cancelled paid order % (should have been blocked)', v_order.order_number;
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'Cannot cancel a paid order%' then
      raise notice 'PASS 4a: paid order % blocked -> %', v_order.order_number, v_msg;
    else
      raise notice 'FAIL 4a: unexpected error -> %', v_msg;
    end if;
  end;
end $$;

-- 4b. A cancelled order is terminal: it cannot be rewritten to shipped.
do $$
declare
  v_order record;
  v_admin uuid;
  v_msg   text;
begin
  select id, order_number into v_order
  from public.orders
  where status = 'cancelled'
  order by created_at desc
  limit 1;

  if not found then
    raise notice 'SKIP 4b: no cancelled order exists to test with';
    return;
  end if;

  select id into v_admin from public.profiles where role = 'admin' limit 1;
  if v_admin is null then
    raise notice 'SKIP 4b: no admin profile exists';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

  begin
    update public.orders set status = 'shipped' where id = v_order.id;
    raise notice 'FAIL 4b: cancelled order % was rewritten to shipped', v_order.order_number;
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'Cannot change status of a cancelled%' then
      raise notice 'PASS 4b: terminal state protected -> %', v_msg;
    else
      raise notice 'FAIL 4b: unexpected error -> %', v_msg;
    end if;
  end;
end $$;

-- 4c. Cancelling an unpaid order releases its stock exactly once.
--     This is the vendor/admin manual-cancellation path that leaked stock in
--     0013, now covered by trg_orders_release_stock_on_cancel.
do $$
declare
  v_order   record;
  v_item    record;
  v_before  int;
  v_after   int;
  v_again   int;
  v_repeat  boolean;
  v_released boolean;
  v_admin   uuid;
begin
  select o.id, o.order_number into v_order
  from public.orders o
  where o.payment_status not in ('paid', 'refunded')
    and o.status not in ('cancelled', 'delivered')
    and o.stock_released = false
    and exists (
      select 1 from public.order_items oi
      where oi.order_id = o.id and oi.variant_id is null
    )
  order by o.created_at desc
  limit 1;

  if not found then
    raise notice 'SKIP 4c: no unpaid order with a non-variant item available';
    return;
  end if;

  select oi.product_id, oi.quantity, p.stock_quantity
    into v_item
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.order_id = v_order.id and oi.variant_id is null
  order by oi.id
  limit 1;

  v_before := v_item.stock_quantity;

  select id into v_admin from public.profiles where role = 'admin' limit 1;
  if v_admin is not null then
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  end if;

  update public.orders set status = 'cancelled' where id = v_order.id;

  select stock_released into v_released
  from public.orders where id = v_order.id;

  select stock_quantity into v_after
  from public.products where id = v_item.product_id;

  if v_released and v_after = v_before + v_item.quantity then
    raise notice 'PASS 4c: order % released stock % -> % (+%)',
      v_order.order_number, v_before, v_after, v_item.quantity;
  else
    raise notice 'FAIL 4c: order % stock_released=%, stock % -> % (expected %)',
      v_order.order_number, v_released, v_before, v_after, v_before + v_item.quantity;
  end if;

  -- Idempotency: a second release attempt must restore nothing.
  v_repeat := public.release_stock_for_order(v_order.id);

  select stock_quantity into v_again
  from public.products where id = v_item.product_id;

  if v_again = v_after then
    raise notice 'PASS 4c2: repeat release was a no-op (returned %, stock still %)',
      v_repeat, v_again;
  else
    raise notice 'FAIL 4c2: repeat release changed stock % -> %', v_after, v_again;
  end if;
end $$;

-- 4d. A customer who does not own the order cannot release its stock.
--     Grants already block the call; this proves the internal guard too.
do $$
declare
  v_order    record;
  v_item     record;
  v_caller   uuid;
  v_result   boolean;
  v_before   int;
  v_after    int;
begin
  select o.id, o.order_number, o.vendor_id into v_order
  from public.orders o
  where o.status = 'cancelled'
    and o.stock_released = false
    and exists (
      select 1 from public.order_items oi
      where oi.order_id = o.id and oi.variant_id is null
    )
  order by o.created_at desc
  limit 1;

  if not found then
    raise notice 'SKIP 4d: no cancelled/unreleased order available';
    return;
  end if;

  select p.id into v_caller
  from public.profiles p
  where p.role <> 'admin'
    and not exists (
      select 1 from public.vendors v
      where v.id = v_order.vendor_id and v.user_id = p.id
    )
  limit 1;

  if v_caller is null then
    raise notice 'SKIP 4d: no non-admin, non-vendor profile available';
    return;
  end if;

  select oi.product_id, oi.quantity, p.stock_quantity into v_item
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.order_id = v_order.id and oi.variant_id is null
  order by oi.id
  limit 1;

  v_before := v_item.stock_quantity;

  perform set_config('request.jwt.claim.sub', v_caller::text, true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_caller::text, 'role', 'authenticated')::text, true);

  v_result := public.release_stock_for_order(v_order.id);

  select stock_quantity into v_after
  from public.products where id = v_item.product_id;

  if v_result = false and v_after = v_before then
    raise notice 'PASS 4d: non-owner caller denied, stock unchanged (%)', v_before;
  else
    raise notice 'FAIL 4d: returned %, stock % -> % (expected false / unchanged)',
      v_result, v_before, v_after;
  end if;
end $$;

rollback;
