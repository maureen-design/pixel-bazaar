-- ============================================================================
-- NexaMart AI - 0037_platform_financials.sql
-- ============================================================================
-- Project : 004 - Fix broken things (Phase 2, money)
-- Items   : 12 - Commission model + server-side split
--           13 - Vendor ledger (foundation)
--           15 - True revenue analytics (foundation)
-- Applied : after 0036_bank_transfer_fail_closed.sql
-- Authors : Maureen /KIP
--
-- DECISIONS TAKEN (business, confirmed by owner)
--   - Commission rate is a SETTING, not a hardcoded constant.
--     Default 15% (0.15), clampable 0..1.
--   - Commission is charged on MERCHANDISE ONLY
--     (sum of order_items.total_price).
--     Rationale: tax_amount is remitted to the government, not the vendor,
--     so charging a vendor commission on it would be wrong. Shipping is
--     excluded for the same reason - it typically covers real carrier cost.
--   - Payouts are tracked in an internal ledger and marked paid manually.
--     No automatic M-Pesa B2C movement in this migration.
--   - Refunds are FULL ORDER only (see 0038).
--
-- PROBLEM
--   - No commission column existed anywhere. The platform kept 100% of
--     order_items.total_price on every sale.
--   - admin/Dashboard.tsx and vendor/Dashboard.tsx both labelled
--     sum(orders.total_amount) as "Revenue". total_amount includes tax and
--     shipping, and neither query filtered on payment_status, so cancelled
--     and unpaid orders counted as revenue.
--   - vendors.total_sales was pinned to 0 and nothing ever incremented it.
--
-- DESIGN NOTES
--   - The split is recomputed by an AFTER trigger on order_items, not on
--     orders. create_order() (0013) inserts the order row FIRST and its
--     order_items SECOND, so a trigger on orders could not see the line
--     items in time. Driving it from order_items makes the totals correct
--     regardless of insert order and self-heals if a line item changes.
--   - commission_amount is rounded to 2dp, and vendor_earnings is then
--     defined as merchandise_subtotal - commission_amount. Deriving one
--     from the other (rather than rounding both) guarantees the two always
--     sum back to the subtotal exactly, with no stray cent.
--   - Money is credited to the ledger only when payment_status flips to
--     'paid'. Creating an order is not a sale.
--   - Ledger rows are written ONLY by SECURITY DEFINER functions. There is
--     no client INSERT policy, so a vendor cannot credit themselves money.
--
-- SAFETY
--   - Idempotent: safe to re-run.
--   - Existing orders are backfilled from their line items. At time of
--     writing the project had 0 orders, so the backfill is a no-op, but it
--     is written to be correct if rows exist.
--   - No payout, refund or withdrawal is performed by this migration.
--
-- FOLLOW-UP
--   0038_platform_payouts_refunds.sql  - payouts + refunds + reversals
-- ============================================================================

-- 1. Commission setting --------------------------------------------------------
insert into public.system_settings (key, value, description) values
  ('platform_commission_rate', '0.15'::jsonb,
   'Platform commission as a FRACTION (0.15 = 15%). Charged on merchandise subtotal only.')
on conflict (key) do nothing;

create or replace function public.platform_commission_rate()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, least(1, coalesce(
    (select (s.value #>> '{}')::numeric
       from public.system_settings s
      where s.key = 'platform_commission_rate'),
    0.15)));
$$;

revoke all on function public.platform_commission_rate() from public;
grant execute on function public.platform_commission_rate() to anon, authenticated;


-- 2. Order financial columns ---------------------------------------------------
alter table public.orders
  add column if not exists merchandise_subtotal numeric(12,2),
  add column if not exists commission_rate      numeric(6,5),
  add column if not exists commission_amount    numeric(12,2),
  add column if not exists vendor_earnings      numeric(12,2),
  add column if not exists settled_at           timestamptz,
  add column if not exists refunded_at          timestamptz,
  add column if not exists refund_amount        numeric(12,2);

comment on column public.orders.merchandise_subtotal is
  'Sum of order_items.total_price. The commission base. Excludes tax and shipping.';
comment on column public.orders.commission_rate is
  'Snapshot of platform_commission_rate at settlement time, so later rate changes do not rewrite history.';
comment on column public.orders.vendor_earnings is
  'merchandise_subtotal - commission_amount. Never negative.';


-- 3. Recalculate the split whenever the line items change ---------------------
create or replace function public.recalc_order_financials()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_merch    numeric(12,2);
  v_rate     numeric(6,5);
  v_comm     numeric(12,2);
begin
  -- NEW is unassigned on DELETE, so branch on TG_OP rather than relying on
  -- NEW.order_id evaluating to NULL.
  if tg_op = 'DELETE' then
    v_order_id := old.order_id;
  else
    v_order_id := new.order_id;
  end if;

  select coalesce(sum(oi.total_price), 0)
    into v_merch
    from public.order_items oi
   where oi.order_id = v_order_id;

  v_rate := public.platform_commission_rate();
  v_comm := round(v_merch * v_rate, 2);

  -- Runs during customer checkout, so the order guard must be satisfied.
  perform set_config('nexamart.internal_settlement_write', 'on', true);
  update public.orders
     set merchandise_subtotal = v_merch,
         commission_rate      = v_rate,
         commission_amount    = v_comm,
         -- derived, so the pair always sums back to the subtotal exactly
         vendor_earnings      = v_merch - v_comm,
         updated_at           = now()
   where id = v_order_id;
  perform set_config('nexamart.internal_settlement_write', 'off', true);

  return null;                                    -- AFTER trigger
end;
$$;

drop trigger if exists trg_order_items_recalc_financials on public.order_items;
create trigger trg_order_items_recalc_financials
  after insert or update or delete
  on public.order_items
  for each row execute function public.recalc_order_financials();


-- 4. Backfill existing orders --------------------------------------------------
update public.orders o
   set merchandise_subtotal = sub.merch,
       commission_rate      = public.platform_commission_rate(),
       commission_amount    = round(sub.merch * public.platform_commission_rate(), 2),
       vendor_earnings      = sub.merch - round(sub.merch * public.platform_commission_rate(), 2)
  from (select order_id, sum(total_price) as merch
          from public.order_items
         group by order_id) sub
 where sub.order_id = o.id
   and o.merchandise_subtotal is null;

-- Orders with no line items at all: settle the columns at zero, not null.
update public.orders o
   set merchandise_subtotal = 0,
       commission_rate      = public.platform_commission_rate(),
       commission_amount    = 0,
       vendor_earnings      = 0
 where o.merchandise_subtotal is null
   and not exists (select 1 from public.order_items oi where oi.order_id = o.id);


-- 5. Vendor ledger -------------------------------------------------------------
create table if not exists public.vendor_ledger (
  id            uuid primary key default uuid_generate_v4(),
  vendor_id     uuid not null references public.vendors (id) on delete cascade,
  order_id      uuid references public.orders (id) on delete set null,
  entry_type    text not null check (entry_type in ('earning','payout','refund','adjustment')),
  amount        numeric(12,2) not null,
  balance_after numeric(12,2),
  description   text,
  reference     text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

comment on table public.vendor_ledger is
  'Append-only double-sided record of vendor money. Positive amount = credit to vendor, negative = debit. Written only by SECURITY DEFINER functions.';
comment on column public.vendor_ledger.amount is
  'Signed. earnings/payout credits are positive; refunds are negative.';

create index if not exists idx_vendor_ledger_vendor_created
  on public.vendor_ledger (vendor_id, created_at desc);
create index if not exists idx_vendor_ledger_order
  on public.vendor_ledger (order_id);

-- RLS: vendors read their own ledger, admins read all. NO insert/update/delete
-- policy for anybody - the money functions are the only writer.
alter table public.vendor_ledger enable row level security;

drop policy if exists "vendors read own ledger" on public.vendor_ledger;
create policy "vendors read own ledger" on public.vendor_ledger
  for select to authenticated
  using (exists (select 1
                   from public.vendors v
                  where v.id = vendor_ledger.vendor_id
                    and v.user_id = auth.uid()));

drop policy if exists "admins read all ledger" on public.vendor_ledger;
create policy "admins read all ledger" on public.vendor_ledger
  for select to authenticated
  using (exists (select 1
                   from public.profiles p
                  where p.id = auth.uid()
                    and p.role = 'admin'));

revoke all on public.vendor_ledger from anon;


-- 6. Ledger credit when an order is actually paid ------------------------------
-- create_order() inserts the order as payment_status='pending'. An order is not
-- revenue until the money arrives, so the credit fires on the transition into
-- 'paid' only, and never twice.
create or replace function public.settle_order_financials()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_status is distinct from 'paid'::public.payment_status then
    return null;
  end if;

  -- already settled (re-save, or backfilled): never double-credit
  if new.settled_at is not null then
    return null;
  end if;

  -- a refunded order must not be re-credited
  if new.refunded_at is not null
     or new.payment_status = 'refunded'::public.payment_status then
    return null;
  end if;

  insert into public.vendor_ledger (vendor_id, order_id, entry_type, amount, description)
  values (new.vendor_id,
          new.id,
          'earning',
          coalesce(new.vendor_earnings, 0),
          'Order ' || new.order_number);

  perform set_config('nexamart.internal_settlement_write', 'on', true);

  update public.orders
     set settled_at = now(),
         updated_at  = now()
   where id = new.id;

  -- total_sales is a real business number now. protect_vendor_system_fields()
  -- (replaced in section 7) lets this write through.
  update public.vendors
     set total_sales = coalesce(total_sales, 0) + 1
   where id = new.vendor_id;

  perform set_config('nexamart.internal_settlement_write', 'off', true);

  return null;
end;
$$;

drop trigger if exists trg_orders_settle_financials on public.orders;
create trigger trg_orders_settle_financials
  after update of payment_status on public.orders
  for each row execute function public.settle_order_financials();


-- 7. Allow exactly one writer through the vendor guard -------------------------
-- 0034's protect_vendor_system_fields() pins total_sales/rating/is_verified
-- against non-admin writes. The settlement function above is SECURITY DEFINER,
-- but this trigger keys off the SESSION role, not the effective role, so a
-- customer-initiated settlement would still be rejected. A local transaction
-- flag is the narrowest way to let that one function through.
create or replace function public.protect_vendor_system_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Settlement path (set by settle_order_financials / 0038 reversals).
  -- transaction-local, so it cannot leak to a later request.
  if coalesce(current_setting('nexamart.internal_settlement_write', true), 'off') = 'on' then
    return new;
  end if;

  select role into v_role from public.profiles where id = auth.uid();

  if v_role = 'admin' then
    return new;
  end if;

  if old.is_verified is distinct from new.is_verified or
     old.rating      is distinct from new.rating      or
     old.total_sales is distinct from new.total_sales or
     old.user_id     is distinct from new.user_id     or
     old.created_at  is distinct from new.created_at then
    raise exception 'Vendor approval, rating, sales and ownership fields are managed by NexaMart';
  end if;

  return new;
end;
$$;

-- 8. Let the settlement path through the ORDER payment guard -----------------
-- REQUIRED, and based on the 0029 version of this function, NOT the 0013 one.
-- 0029 replaced protect_orders_payment_fields() after 0013 and added three
-- protections; rebuilding from 0013 would have silently reverted all of them.
--
-- Why a bypass is needed at all: this function ends in
--   raise exception 'Customers cannot update orders';
-- for any non-admin, non-service session. create_order() is SECURITY DEFINER,
-- but the trigger reads the SESSION role through auth.uid(). So a customer
-- checking out would trip it: inserting order_items fires
-- trg_order_items_recalc_financials -> UPDATE public.orders -> this guard ->
-- "Customers cannot update orders", aborting the entire order.
--
-- The bypass is deliberately minimal. It is set and cleared around a single
-- statement (the convention 0030 established for nexamart.internal_stock_release
-- after it documented that leaving a flag armed is a latent footgun), it uses
-- the same nexamart. prefix, and it still enforces the full
-- payment-field immutability list. Settlement only ever writes the derived
-- columns, none of which are on that list.
create or replace function public.protect_orders_payment_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role              public.user_role;
  v_protected_changed boolean;
  v_settlement        boolean :=
    coalesce(current_setting('nexamart.internal_settlement_write', true), 'off') = 'on';
  v_refund            boolean :=
    coalesce(current_setting('nexamart.internal_refund_write', true), 'off') = 'on';
  -- The refund path is the only one allowed to move payment_status, and only
  -- to 'refunded'. Everything else on the list still applies.
  v_touch_payment     boolean;
begin
  -- Service-role / server-side writers (M-Pesa callback, STK push, card edge,
  -- reconciliation) have no JWT subject and are trusted.
  if auth.uid() is null then
    return new;
  end if;

  -- The authoritative release path (release_stock_on_cancel ->
  -- release_stock_for_order) sets orders.stock_released.
  if current_setting('nexamart.internal_stock_release', true) = 'on' then
    return new;
  end if;

  -- 0029's list, computed once. Unchanged field-for-field, except that
  -- payment_status is gated by v_touch_payment so the refund path can use it.
  v_touch_payment := not v_refund;

  v_protected_changed :=
       old.total_amount         is distinct from new.total_amount         or
       old.shipping_cost        is distinct from new.shipping_cost        or
       old.tax_amount           is distinct from new.tax_amount           or
       old.discount_amount      is distinct from new.discount_amount      or
       old.coupon_id            is distinct from new.coupon_id            or
       old.coupon_code          is distinct from new.coupon_code          or
       (v_touch_payment and old.payment_status is distinct from new.payment_status) or
       old.payment_method       is distinct from new.payment_method       or
       old.payment_type         is distinct from new.payment_type         or
       old.payment_deadline     is distinct from new.payment_deadline     or
       old.payment_id           is distinct from new.payment_id           or
       old.mpesa_checkout_id    is distinct from new.mpesa_checkout_id    or
       old.mpesa_transaction_id is distinct from new.mpesa_transaction_id or
       old.payment_error        is distinct from new.payment_error        or
       old.paid_at              is distinct from new.paid_at              or
       old.stock_released       is distinct from new.stock_released       or
       old.order_number         is distinct from new.order_number         or
       old.user_id              is distinct from new.user_id              or
       old.vendor_id            is distinct from new.vendor_id            or
       old.delivery_method      is distinct from new.delivery_method      or
       old.delivery_cost        is distinct from new.delivery_cost        or
       old.shipping_address     is distinct from new.shipping_address;

  -- (b) A paid or refunded order must never be cancelled. There is no partial
  -- cancellation, so cancelling would strand the customer and keep stock locked.
  if new.status = 'cancelled'
     and old.status is distinct from new.status
     and old.payment_status in ('paid', 'refunded') then
    raise exception 'Cannot cancel a paid order: refund the payment first';
  end if;

  -- (c) Terminal states cannot be rewritten, so a cancelled order cannot be
  -- silently un-cancelled and double-count its stock release.
  if old.status in ('cancelled', 'delivered') and old.status is distinct from new.status then
    raise exception 'Cannot change status of a % order', old.status;
  end if;

  -- Settlement writes only derived financial columns (merchandise_subtotal,
  -- commission_rate, commission_amount, vendor_earnings, settled_at). The
  -- payment-field list above still applies in full.
  if v_settlement then
    if v_protected_changed then
      raise exception 'Payment-owned order fields are immutable';
    end if;
    return new;
  end if;

  -- The refund path may flip payment_status, and only ever to 'refunded'. It
  -- must not be able to move it back to 'paid' or 'pending' to launder money.
  if v_refund then
    if v_protected_changed then
      raise exception 'Payment-owned order fields are immutable';
    end if;
    if new.payment_status is distinct from 'refunded'::public.payment_status then
      raise exception 'A refund may only mark an order as refunded';
    end if;
    return new;
  end if;

  select role into v_role from public.profiles where id = auth.uid();

  -- Admins retain full order-management capability.
  if v_role = 'admin' then
    return new;
  end if;

  if v_protected_changed then
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


-- 9. Honest money reporting ---------------------------------------------------
-- Replaces the "revenue = sum(total_amount)" pattern, which counted tax,
-- shipping, and unpaid/cancelled orders.
create or replace function public.admin_financial_summary(p_from timestamptz, p_to timestamptz)
returns table (
  orders_paid        bigint,
  gmv                numeric,
  tax_collected      numeric,
  shipping_collected numeric,
  platform_commission numeric,
  refunded_amount    numeric,
  net_platform_revenue numeric,
  vendor_earnings_paid numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- SECURITY DEFINER bypasses RLS, so authorisation must happen here.
  -- Without this check any signed-in customer could read the platform's
  -- commission and margin figures.
  if not exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.role = 'admin'::public.user_role
  ) then
    raise exception 'Not authorised to view platform financials'
      using errcode = '42501';
  end if;

  return query
  with paid as (
    select o.*
      from public.orders o
     where o.payment_status in ('paid'::public.payment_status, 'refunded'::public.payment_status)
       and o.created_at >= coalesce(p_from, '-infinity'::timestamptz)
       and o.created_at <  coalesce(p_to,   'infinity'::timestamptz)
  ),
  live as (
    select * from paid where refunded_at is null
  ),
  gone as (
    select * from paid where refunded_at is not null
  )
  select
    (select count(*) from live),
    coalesce((select sum(merchandise_subtotal) from live), 0),
    coalesce((select sum(tax_amount)           from live), 0),
    coalesce((select sum(coalesce(shipping_cost,0) + coalesce(delivery_cost,0)) from live), 0),
    coalesce((select sum(commission_amount)    from live), 0),
    coalesce((select sum(coalesce(refund_amount, merchandise_subtotal)) from gone), 0),
    coalesce((select sum(commission_amount)    from live), 0)
      - coalesce((select sum(commission_amount) from gone), 0),
    coalesce((select sum(vendor_earnings)      from live), 0);
end;
$$;

revoke all on function public.admin_financial_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_financial_summary(timestamptz, timestamptz) to authenticated;


create or replace function public.vendor_financial_summary(p_vendor_id uuid)
returns table (
  total_earnings   numeric,
  total_refunded   numeric,
  total_paid_out   numeric,
  outstanding      numeric,
  lifetime_orders  bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Caller must be an admin, or the vendor who actually owns this record.
  -- Passing someone else's vendor id must fail.
  if not exists (
    select 1
      from public.profiles p
      left join public.vendors v on v.user_id = p.id
     where p.id = auth.uid()
       and (p.role = 'admin'::public.user_role or v.id = p_vendor_id)
  ) then
    raise exception 'Not authorised to view these vendor financials'
      using errcode = '42501';
  end if;

  return query
  select
    coalesce(sum(l.amount) filter (where l.entry_type = 'earning'), 0),
    coalesce(sum(l.amount) filter (where l.entry_type = 'refund'),   0),
    coalesce(sum(l.amount) filter (where l.entry_type = 'payout'),   0),
    coalesce(sum(l.amount), 0),
    (select count(*)
       from public.orders o
      where o.vendor_id = p_vendor_id
        and o.payment_status = 'paid'::public.payment_status
        and o.refunded_at is null)
  from public.vendor_ledger l
  where l.vendor_id = p_vendor_id;
end;
$$;

revoke all on function public.vendor_financial_summary(uuid) from public, anon;
grant execute on function public.vendor_financial_summary(uuid) to authenticated;


-- Settlement triggers are invoked by the trigger system only. They are never
-- meant to be called directly, so remove the default PUBLIC execute grant.
revoke all on function public.recalc_order_financials() from public, anon, authenticated;
revoke all on function public.settle_order_financials() from public, anon, authenticated;
-- ============================================================================
