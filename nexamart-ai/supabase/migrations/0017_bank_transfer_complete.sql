-- ============================================================================
-- NexaMart AI - 0017_bank_transfer_complete.sql
-- Bank Transfer complete workflow (Priority #18C-2).
--
-- ADDITIVE AND SAFE:
--   1) Bank detail settings in system_settings (bank_name, bank_account_name, etc.)
--   2) bank_transfer_enabled setting (independent of bank_pay_later_enabled)
--   3) create_order updated to set payment_deadline for bank orders + guard
--   4) verify_bank_payment(admin) RPC — guarded, idempotent
--   5) reject_bank_payment(admin) RPC — guarded, idempotent, releases stock
--   6) BEFORE INSERT trigger for bank_transfer_enabled guard
--
-- Does NOT touch:
--   - M-Pesa functions or configuration
--   - Pay Later implementation
--   - Card implementation
--   - 0009 release_stock_for_order
--   - 0013 protect_orders_payment_fields
--   - 0014 RLS policies
--   - 0015 email_sent column
--   - 0016 Pay Later enforcement (Bank + Later rejection preserved)
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Bank detail settings -----------------------------------------------------
insert into public.system_settings (key, value, description) values
  ('bank_transfer_enabled', 'true'::jsonb, 'Bank Transfer payment method')
on conflict (key) do nothing;

insert into public.system_settings (key, value, description) values
  ('bank_name', '""'::jsonb, 'Bank name for transfers')
on conflict (key) do nothing;

insert into public.system_settings (key, value, description) values
  ('bank_account_name', '""'::jsonb, 'Bank account name for transfers')
on conflict (key) do nothing;

insert into public.system_settings (key, value, description) values
  ('bank_account_number', '""'::jsonb, 'Bank account number for transfers')
on conflict (key) do nothing;

insert into public.system_settings (key, value, description) values
  ('bank_branch', '""'::jsonb, 'Bank branch for transfers')
on conflict (key) do nothing;

insert into public.system_settings (key, value, description) values
  ('bank_swift_code', '""'::jsonb, 'Bank SWIFT/BIC code')
on conflict (key) do nothing;

insert into public.system_settings (key, value, description) values
  ('bank_transfer_deadline_hours', '72'::jsonb, 'Hours before bank transfer order expires')
on conflict (key) do nothing;

-- 2. Server-side bank_transfer_enabled guard (BEFORE INSERT) ------------------
-- Separate from the existing bank_pay_later_enabled trigger. This one only
-- fires for payment_method = 'bank' and checks bank_transfer_enabled.
create or replace function public.enforce_bank_transfer_enabled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled jsonb;
begin
  if NEW.payment_method = 'bank' then
    select value into v_enabled
      from public.system_settings
     where key = 'bank_transfer_enabled';

    if v_enabled is not distinct from 'false'::jsonb then
      raise exception 'Bank transfer is currently disabled';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_orders_enforce_bank_transfer on public.orders;
create trigger trg_orders_enforce_bank_transfer
  before insert on public.orders
  for each row execute function public.enforce_bank_transfer_enabled();

-- 3. create_order updated: bank orders get a payment_deadline ------------------
-- Copy of 0016 create_order with the bank deadline logic added.
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
  v_bank_deadline_hours integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if jsonb_typeof(p_request) <> 'object' then
    raise exception 'Invalid order request';
  end if;

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

  -- #18C-1: Pay Later is only available with M-Pesa or Card.
  if v_payment_type = 'later' and v_payment_method not in ('mpesa', 'card') then
    raise exception 'Pay Later is only available with M-Pesa or Card payment methods';
  end if;

  v_notes := p_request->>'notes';
  v_county := coalesce(v_shipping_address->>'county', '');
  v_coupon_code := nullif(p_request->>'coupon_code', '');

  -- Platform settings
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

  -- Validate cart items, enforce single-vendor, compute subtotal, decrement stock
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

  -- Coupon validation
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

  -- Tax and total
  v_tax := round((v_subtotal * v_tax_rate / 100) * 100) / 100;
  v_total := round((v_subtotal + v_shipping_cost + v_tax - v_discount) * 100) / 100;

  -- Payment deadline: Pay Later gets 24h, Bank Transfer gets configured deadline
  if v_payment_type = 'later' then
    v_payment_deadline := now() + interval '24 hours';
  elsif v_payment_method = 'bank' then
    select value into v_tmp from public.system_settings where key = 'bank_transfer_deadline_hours';
    v_bank_deadline_hours := case when jsonb_typeof(v_tmp) = 'number' then (v_tmp::text)::integer else 72 end;
    if v_bank_deadline_hours < 1 then v_bank_deadline_hours := 72; end if;
    v_payment_deadline := now() + (v_bank_deadline_hours || ' hours')::interval;
  end if;

  -- Order number
  for v_retry in 1..10 loop
    v_order_number := 'ORD-' || to_char(now(), 'YYYYMMDD')
                   || '-' || lpad(floor(random() * 10000)::text, 4, '0');
    exit when not exists (select 1 from public.orders where order_number = v_order_number);
  end loop;
  if exists (select 1 from public.orders where order_number = v_order_number) then
    raise exception 'Could not generate a unique order number';
  end if;

  -- Insert order
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

  -- Order items
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

  -- Coupon usage
  if v_coupon_code is not null then
    update public.coupons
       set used_count = used_count + 1
     where id = v_coupon.id;
  end if;

  return v_order;
end;
$$;

revoke all on function public.create_order(jsonb) from public;
grant execute on function public.create_order(jsonb) to authenticated;

-- 4. Admin RPC: verify_bank_payment ------------------------------------------
-- Guarded, idempotent. Only admin can call. Transitions:
--   payment_method=bank, payment_status=pending, status=pending
--   → payment_status=paid, status=processing, paid_at=now()
create or replace function public.verify_bank_payment(
  p_order_id uuid,
  p_admin_ref text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_role public.user_role;
  v_order record;
begin
  -- Auth check
  if v_caller is null then
    return json_build_object('success', false, 'error', 'Not authenticated');
  end if;

  select role into v_role from public.profiles where id = v_caller;
  if v_role <> 'admin' then
    return json_build_object('success', false, 'error', 'Unauthorized');
  end if;

  -- Fetch order
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return json_build_object('success', false, 'error', 'Order not found');
  end if;

  -- Validate state
  if v_order.payment_method <> 'bank' then
    return json_build_object('success', false, 'error', 'Not a bank transfer order');
  end if;
  if v_order.payment_status <> 'pending' then
    return json_build_object('success', false, 'error', 'Order payment already resolved');
  end if;
  if v_order.status not in ('pending', 'processing') then
    return json_build_object('success', false, 'error', 'Order cannot be verified in current status');
  end if;

  -- Transition (guarded — will not affect already-paid orders)
  update public.orders
     set payment_status = 'paid',
         status = 'processing',
         paid_at = now(),
         payment_id = coalesce(p_admin_ref, v_order.order_number)
   where id = p_order_id
     and payment_status = 'pending'
   returning id into p_order_id;

  if p_order_id is null then
    return json_build_object('success', false, 'error', 'Concurrent modification — retry');
  end if;

  return json_build_object('success', true, 'message', 'Payment verified');
end;
$$;

revoke all on function public.verify_bank_payment(uuid, text) from public;
grant execute on function public.verify_bank_payment(uuid, text) to authenticated;

-- 5. Admin RPC: reject_bank_payment -------------------------------------------
-- Guarded, idempotent. Only admin can call. Transitions:
--   payment_method=bank, payment_status=pending
--   → payment_status=failed, status=cancelled
-- Then releases stock via release_stock_for_order (idempotent).
create or replace function public.reject_bank_payment(
  p_order_id uuid,
  p_reason text default 'Bank transfer payment not verified'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_role public.user_role;
  v_order record;
  v_updated boolean;
begin
  -- Auth check
  if v_caller is null then
    return json_build_object('success', false, 'error', 'Not authenticated');
  end if;

  select role into v_role from public.profiles where id = v_caller;
  if v_role <> 'admin' then
    return json_build_object('success', false, 'error', 'Unauthorized');
  end if;

  -- Fetch order
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return json_build_object('success', false, 'error', 'Order not found');
  end if;

  -- Validate state
  if v_order.payment_method <> 'bank' then
    return json_build_object('success', false, 'error', 'Not a bank transfer order');
  end if;
  if v_order.payment_status = 'paid' then
    return json_build_object('success', false, 'error', 'Cannot reject an already-paid order');
  end if;
  if v_order.payment_status = 'failed' then
    return json_build_object('success', false, 'error', 'Order payment already rejected');
  end if;

  -- Transition (guarded)
  update public.orders
     set payment_status = 'failed',
         status = 'cancelled',
         payment_error = p_reason
   where id = p_order_id
     and payment_status <> 'paid'
     and payment_status <> 'failed'
   returning true into v_updated;

  if not v_updated then
    return json_build_object('success', false, 'error', 'Concurrent modification — retry');
  end if;

  -- Release stock (idempotent via stock_released guard in release_stock_for_order)
  perform public.release_stock_for_order(p_order_id);

  return json_build_object('success', true, 'message', 'Payment rejected, stock released');
end;
$$;

revoke all on function public.reject_bank_payment(uuid, text) from public;
grant execute on function public.reject_bank_payment(uuid, text) to authenticated;

-- ============================================================================
-- End of migration
-- ============================================================================
