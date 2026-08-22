-- ============================================================================
-- NexaMart AI - 0016_pay_later_enforcement.sql
-- Pay Later lifecycle enforcement (Priority #18C-1).
--
-- ADDITIVE AND SAFE to apply:
--   1) orders.reminder_sent boolean NOT NULL DEFAULT false
--      -> idempotent guard for the pay-later-reconcile reminder sweep.
--   2) create_order() updated to reject Bank + Later (bank transfer not
--      implemented for deferred payment) and to allow M-Pesa/Card + Later.
--   3) protect_orders_payment_fields trigger unchanged (from 0013).
--
-- Does NOT touch:
--   - 0009 (release_stock_for_order)
--   - 0013 trigger logic (protect_orders_payment_fields is re-applied unchanged)
--   - 0014 RLS policies
--   - 0015 email_sent column
--   - M-Pesa functions or configuration
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Additive guard column for idempotent reminder tracking -------------------
alter table public.orders
  add column if not exists reminder_sent boolean not null default false;

-- 2. Server-authoritative order creation RPC (updated) ------------------------
-- Identical to 0013 except for the Pay Later payment-method validation block
-- marked with "-- #18C-1" below.
create or replace function public.create_order(p_request jsonb)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();

  v_items jsonb;
  v_item record;
  v_product public.products;
  v_product_id uuid;
  v_quantity integer;
  v_variant_id text;
  v_variant_attributes jsonb;
  v_combo jsonb;
  v_combo_pos integer;
  v_unit_price numeric(10,2);
  v_item_total numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_order_items jsonb := '[]'::jsonb;

  v_vendor_id uuid;

  v_delivery_method text;
  v_payment_method text;
  v_payment_type text;
  v_notes text;
  v_shipping_address jsonb;
  v_county text;

  v_tax_rate_j jsonb;
  v_std_j jsonb;
  v_exp_j jsonb;
  v_county_j jsonb;
  v_default_j jsonb;
  v_tmp jsonb;
  v_tax_rate numeric;
  v_express_enabled boolean;
  v_pickup_enabled boolean;

  v_base_shipping numeric(10,2);
  v_surcharge numeric(10,2) := 0;
  v_shipping_cost numeric(10,2);
  v_delivery_cost numeric(10,2);
  v_tax numeric(10,2);

  v_coupon public.coupons;
  v_coupon_code text;
  v_discount numeric(10,2) := 0;

  v_total numeric(10,2);
  v_payment_deadline timestamptz;
  v_order_number text;
  v_order public.orders;
  v_retry integer;
  v_cnty record;
begin
  -- A. Authentication: the authenticated user owns the order.
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if jsonb_typeof(p_request) <> 'object' then
    raise exception 'Invalid order request';
  end if;

  -- B. Input / order intent.
  v_items := p_request->'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  v_shipping_address := p_request->'shipping_address';
  if v_shipping_address is null or jsonb_typeof(v_shipping_address) <> 'object' then
    raise exception 'Shipping address is required';
  end if;

  v_delivery_method := coalesce(p_request->>'delivery_method', 'standard');
  if v_delivery_method not in ('standard', 'express', 'pickup') then
    raise exception 'Invalid delivery method';
  end if;

  v_payment_method := p_request->>'payment_method';
  if v_payment_method is null or length(v_payment_method) = 0 then
    raise exception 'Payment method is required';
  end if;

  v_payment_type := coalesce(p_request->>'payment_type', 'now');
  if v_payment_type not in ('now', 'later') then
    raise exception 'Invalid payment type';
  end if;

  -- #18C-1: Pay Later is only available with M-Pesa or Card payment methods.
  -- Bank transfer is not implemented for deferred payment.  Reject Bank + Later
  -- server-side so no broken unpaid order can be created via direct RPC.
  if v_payment_type = 'later' and v_payment_method not in ('mpesa', 'card') then
    raise exception 'Pay Later is only available with M-Pesa or Card payment methods';
  end if;

  v_notes := p_request->>'notes';
  v_county := coalesce(v_shipping_address->>'county', '');
  v_coupon_code := nullif(p_request->>'coupon_code', '');

  -- F. Platform settings (missing = storefront defaults; disabled methods reject).
  select value into v_tax_rate_j from public.system_settings where key = 'tax_rate';
  v_tax_rate := case when jsonb_typeof(v_tax_rate_j) = 'number' then (v_tax_rate_j::text)::numeric else 16 end;

  select value into v_std_j from public.system_settings where key = 'standard_shipping_cost';
  select value into v_exp_j from public.system_settings where key = 'express_shipping_cost';
  select value into v_county_j from public.system_settings where key = 'county_surcharges';
  select value into v_default_j from public.system_settings where key = 'default_county_surcharge';

  select value into v_tmp from public.system_settings where key = 'pickup_enabled';
  v_pickup_enabled := case when jsonb_typeof(v_tmp) = 'boolean' then v_tmp::text = 'true' else true end;
  select value into v_tmp from public.system_settings where key = 'express_enabled';
  v_express_enabled := case when jsonb_typeof(v_tmp) = 'boolean' then v_tmp::text = 'true' else true end;

  if v_delivery_method = 'express' and not v_express_enabled then
    raise exception 'Express delivery is currently disabled';
  end if;
  if v_delivery_method = 'pickup' and not v_pickup_enabled then
    raise exception 'Store pickup is currently disabled';
  end if;

  -- Delivery costs
  if v_delivery_method = 'pickup' then
    v_delivery_cost := 0;
    v_base_shipping := 0;
  else
    v_delivery_cost := case
      when v_delivery_method = 'express' then coalesce((v_exp_j::text)::numeric, 600)
      else coalesce((v_std_j::text)::numeric, 250)
    end;
    v_base_shipping := v_delivery_cost;
  end if;

  -- County surcharge
  if length(v_county) > 0 then
    v_surcharge := coalesce((v_default_j::text)::numeric, 500);
    if jsonb_typeof(v_county_j) = 'object' then
      for v_cnty in
        select key, value from jsonb_each(v_county_j)
      loop
        if lower(v_cnty.key) = lower(v_county) then
          v_surcharge := (v_cnty.value::text)::numeric;
          exit;
        end if;
      end loop;
    end if;
  end if;

  if v_delivery_method = 'pickup' then
    v_shipping_cost := 0;
  else
    v_shipping_cost := v_base_shipping + v_surcharge;
  end if;

  -- C/D/K. Validate cart items against the database, enforce single-vendor,
  -- compute authoritative subtotal and decrement stock atomically.
  for v_item in
    select value from jsonb_array_elements(v_items)
  loop
    if jsonb_typeof(v_item.value) <> 'object' then
      raise exception 'Invalid cart item';
    end if;

    v_product_id := (v_item.value->>'product_id')::uuid;
    v_quantity := (v_item.value->>'quantity')::integer;
    v_variant_id := nullif(v_item.value->>'variant_id', '');
    v_variant_attributes := v_item.value->'variant_attributes';

    if v_product_id is null then
      raise exception 'Invalid product in cart';
    end if;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Invalid quantity for product';
    end if;

    select * into v_product
      from public.products
     where id = v_product_id
       for update;

    if not found then
      raise exception 'Product not found';
    end if;

    if v_product.status <> 'active' then
      raise exception 'Product "%" is not available', v_product.name;
    end if;

    if v_vendor_id is null then
      v_vendor_id := v_product.vendor_id;
    elsif v_vendor_id <> v_product.vendor_id then
      raise exception 'Please checkout items from one vendor at a time';
    end if;

    if v_variant_id is not null then
      select c.value, c.pos into v_combo, v_combo_pos
        from jsonb_array_elements(
               coalesce(v_product.variants->'combinations', '[]'::jsonb)
             ) with ordinality as c(value, pos)
       where c.value->>'id' = v_variant_id
       limit 1;

      if v_combo is null then
        raise exception 'Product variant not found';
      end if;

      v_unit_price := coalesce((v_combo->>'price')::numeric, v_product.price);
      if coalesce((v_combo->>'stock')::integer, 0) < v_quantity then
        raise exception 'Insufficient stock for variant of "%"', v_product.name;
      end if;

      update public.products
         set variants = jsonb_set(
               variants,
               array['combinations', (v_combo_pos - 1)::text, 'stock'],
               to_jsonb(coalesce((v_combo->>'stock')::integer, 0) - v_quantity),
               false
             )
       where id = v_product_id;
    else
      v_unit_price := v_product.price;
      if v_product.stock_quantity < v_quantity then
        raise exception 'Insufficient stock for "%"', v_product.name;
      end if;
      update public.products
         set stock_quantity = v_product.stock_quantity - v_quantity
       where id = v_product_id;
    end if;

    v_item_total := round((v_unit_price * v_quantity) * 100) / 100;
    v_subtotal := round((v_subtotal + v_item_total) * 100) / 100;

    v_order_items := v_order_items || jsonb_build_object(
      'product_id', v_product_id,
      'product_name', v_product.name,
      'product_price', v_unit_price,
      'quantity', v_quantity,
      'total_price', v_item_total,
      'variant_id', v_variant_id,
      'variant_attributes', v_variant_attributes
    );
  end loop;

  if v_vendor_id is null then
    raise exception 'Cart has no valid products';
  end if;

  -- H. Coupon validation (server-side).
  if v_coupon_code is not null then
    select * into v_coupon
      from public.coupons
     where upper(code) = upper(v_coupon_code);

    if not found then
      raise exception 'Invalid coupon code';
    end if;
    if not v_coupon.is_active then
      raise exception 'Coupon is not active';
    end if;
    if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
      raise exception 'Coupon has expired';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
      raise exception 'Coupon has reached its usage limit';
    end if;
    if v_coupon.min_spend is not null and v_subtotal < v_coupon.min_spend then
      raise exception 'Minimum spend not met for this coupon';
    end if;

    if v_coupon.discount_type = 'percentage' then
      v_discount := round((v_subtotal * v_coupon.discount_value / 100) * 100) / 100;
      if v_coupon.max_discount is not null and v_discount > v_coupon.max_discount then
        v_discount := v_coupon.max_discount;
      end if;
    else
      v_discount := v_coupon.discount_value;
    end if;
    v_discount := least(v_discount, v_subtotal);
  end if;

  -- G. Tax from the authoritative subtotal.
  v_tax := round((v_subtotal * v_tax_rate / 100) * 100) / 100;

  -- I. Authoritative final total.
  v_total := round((v_subtotal + v_shipping_cost + v_tax - v_discount) * 100) / 100;

  if v_payment_type = 'later' then
    v_payment_deadline := now() + interval '24 hours';
  end if;

  -- J. Server-generated order number with collision-safe retry.
  for v_retry in 1..10 loop
    v_order_number := 'ORD-' || to_char(now(), 'YYYYMMDD')
                   || '-' || lpad(floor(random() * 10000)::text, 4, '0');
    exit when not exists (select 1 from public.orders where order_number = v_order_number);
  end loop;
  if exists (select 1 from public.orders where order_number = v_order_number) then
    raise exception 'Could not generate a unique order number';
  end if;

  -- L. Insert the order with only authoritative server-derived values.
  insert into public.orders (
    user_id, vendor_id, order_number, total_amount, shipping_address, shipping_cost,
    tax_amount, discount_amount, status, payment_status, payment_method, delivery_method,
    delivery_cost, payment_type, payment_deadline, coupon_id, coupon_code, notes
  ) values (
    v_user_id, v_vendor_id, v_order_number, v_total, v_shipping_address::text, v_shipping_cost,
    v_tax, v_discount, 'pending', 'pending', v_payment_method, v_delivery_method,
    v_delivery_cost, v_payment_type, v_payment_deadline,
    case when v_coupon_code is not null then v_coupon.id else null end,
    case when v_coupon_code is not null then v_coupon.code else null end,
    v_notes
  )
  returning * into v_order;

  -- M. Order items with authoritative price snapshots.
  insert into public.order_items (
    order_id, product_id, product_name, product_price, quantity, total_price, variant_id, variant_attributes
  )
  select
    v_order.id,
    (oi->>'product_id')::uuid,
    oi->>'product_name',
    (oi->>'product_price')::numeric,
    (oi->>'quantity')::integer,
    (oi->>'total_price')::numeric,
    nullif(oi->>'variant_id', ''),
    oi->'variant_attributes'
  from jsonb_array_elements(v_order_items) as oi;

  -- Coupon usage recorded authoritatively (same transaction).
  if v_coupon_code is not null then
    update public.coupons
       set used_count = used_count + 1
     where id = v_coupon.id;
  end if;

  -- N. Return the authoritative order to the frontend.
  return v_order;
end;
$$;

revoke all on function public.create_order(jsonb) from public;
grant execute on function public.create_order(jsonb) to authenticated;

-- ============================================================================
-- End of migration
-- ============================================================================
