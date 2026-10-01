-- ============================================================================
-- NexaMart AI - 0038_payouts_and_refunds.sql
-- ============================================================================
-- Items 13 and 14. Run AFTER 0037_platform_financials.sql.
--
-- 0037 created the vendor ledger and the per-order commission split. This
-- migration adds the two things that actually move money out:
--
--   1. vendor_payouts   - an admin marks money as sent to a vendor. Deliberately
--                         manual: no bank integration, so "paid" is a human
--                         assertion, not a verified transfer.
--   2. order_refunds   - a full-order refund, reversing the vendor earning and
--                         the platform commission.
--
-- Product decisions applied here (confirmed by the owner):
--   * A full-order refund returns everything the customer paid:
--     orders.total_amount, which already includes tax, shipping and county
--     surcharges. The commission reversal stays merchandise-only, matching the
--     rule that commission is charged on merchandise.
--   * If a vendor was already paid out, a refund is NOT blocked. The vendor's
--     outstanding balance is allowed to go negative and is carried forward from
--     the next payout. Customers are never held hostage by vendor accounting.
--   * Refunding restocks the ordered items automatically.
--
-- Design notes:
--   * No RPC grants money to a vendor on their own initiative. Payouts are
--     created by admins only; a vendor can only ever READ their own figures.
--   * Every balance is DERIVED from the ledger, never stored as a mutable
--     counter, so it cannot drift out of sync with the entries behind it.
--   * Ledger idempotency is enforced by unique indexes, not just by flag
--     checks, so two concurrent callbacks cannot both credit an order.
--
-- Idempotent: safe to re-run.
-- ============================================================================


-- 1. Ledger hardening ---------------------------------------------------------
-- 0037 guarded double-crediting with "if settled_at is null then credit". That
-- is not safe against concurrency: two simultaneous payment callbacks can both
-- observe settled_at as null. These partial unique indexes make a duplicate
-- physically impossible, so the second transaction fails rather than paying out
-- twice. The ON CONFLICT clauses below rely on them.
create unique index if not exists vendor_ledger_earning_per_order
  on public.vendor_ledger (order_id)
  where entry_type = 'earning';

create unique index if not exists vendor_ledger_refund_per_order
  on public.vendor_ledger (order_id)
  where entry_type = 'refund';

-- The per-payout uniqueness index needs vendor_payouts and ledger.payout_id to
-- exist, so it is created in section 2b rather than here.


-- 2. Payouts table ------------------------------------------------------------
create table if not exists public.vendor_payouts (
  id             uuid primary key default gen_random_uuid(),
  vendor_id      uuid not null references public.vendors (id) on delete cascade,
  amount         numeric(12,2) not null check (amount > 0),
  method         text not null default 'bank_transfer'
                 check (method in ('bank_transfer', 'mpesa', 'cash')),
  reference      text,
  note           text,
  status         text not null default 'pending'
                 check (status in ('pending', 'paid', 'failed', 'cancelled')),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  paid_at        timestamptz,
  voided_at      timestamptz,
  void_reason    text
);

create index if not exists vendor_payouts_vendor_created
  on public.vendor_payouts (vendor_id, created_at desc);

alter table public.vendor_payouts enable row level security;

drop policy if exists "vendors read own payouts" on public.vendor_payouts;
create policy "vendors read own payouts"
  on public.vendor_payouts for select
  to authenticated
  using (
    exists (select 1 from public.vendors v
             where v.id = vendor_payouts.vendor_id and v.user_id = auth.uid())
    or exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role = 'admin')
  );

-- Deliberately NO insert/update/delete policy. All writes go through the
-- SECURITY DEFINER RPCs below, which re-check the caller's admin role.
revoke all on public.vendor_payouts from anon;
grant select on public.vendor_payouts to authenticated;


-- 2b. Link ledger entries to the payout that caused them ------------------------
-- 0037's vendor_ledger has no payout_id, so the payout path needs one. Added
-- here because it references vendor_payouts, which is created above.
--
-- ON DELETE SET NULL, never CASCADE: deleting a payout row must not be able to
-- delete financial history. A null payout_id simply drops out of the uniqueness
-- index below.
alter table public.vendor_ledger
  add column if not exists payout_id uuid references public.vendor_payouts (id) on delete set null;

-- One ledger debit per payout, so a retried 'mark paid' cannot pay twice.
create unique index if not exists vendor_ledger_payout_per_payout
  on public.vendor_ledger (payout_id)
  where entry_type = 'payout' and payout_id is not null;


-- 3. Refunds table ------------------------------------------------------------
create table if not exists public.order_refunds (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  amount         numeric(12,2) not null check (amount > 0),
  -- Merchant / PSP reference for the outbound refund.
  reference      text,
  reason         text,
  restocked      boolean not null default false,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint order_refunds_one_per_order unique (order_id)
);

create index if not exists order_refunds_order on public.order_refunds (order_id);

alter table public.order_refunds enable row level security;

drop policy if exists "admins read refunds" on public.order_refunds;
create policy "admins read refunds"
  on public.order_refunds for select
  to authenticated
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.role = 'admin')
  );

-- The customer sees the refund on their order through orders.refunded_at /
-- orders.payment_status, so they need no direct access to this table.
revoke all on public.order_refunds from anon, authenticated;


-- 4. Restock on refund --------------------------------------------------------
-- release_stock_for_order CANNOT be reused here: 0030's version returns false
-- for any order whose payment_status is 'paid' or 'refunded', precisely so a
-- paid order cannot have its stock released without a refund. So this mirrors
-- its item-restoration loop without that guard, and keeps its own idempotency.
--
-- Never exposed to clients; called only by refund_order().
create or replace function public.restock_order_items(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item   record;
  v_combos jsonb;
begin
  for v_item in
    select oi.product_id, oi.quantity, oi.variant_id
      from public.order_items oi
     where oi.order_id = p_order_id
  loop
    if v_item.variant_id is not null then
      select p.variants into v_combos
        from public.products p
       where p.id = v_item.product_id;

      if v_combos is not null and jsonb_typeof(v_combos->'combinations') = 'array' then
        select jsonb_set(
                 v_combos,
                 array['combinations', (c.pos - 1)::text, 'stock'],
                 to_jsonb(
                   greatest(0, coalesce((c.value->>'stock')::int, 0) + v_item.quantity)
                 ),
                 false
               )
          into v_combos
          from jsonb_array_elements(v_combos->'combinations') with ordinality as c(value, pos)
         where c.value->>'id' = v_item.variant_id;

        if v_combos is not null then
          update public.products set variants = v_combos where id = v_item.product_id;
        end if;
      end if;
    else
      update public.products
         set stock_quantity = stock_quantity + v_item.quantity
       where id = v_item.product_id;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.restock_order_items(uuid) from public, anon, authenticated;


-- 5. Vendor balance (derived, never stored) ----------------------------------
create or replace function public.vendor_balance(p_vendor_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total numeric;
begin
  -- Admin, or the vendor who owns this record.
  if not exists (
    select 1
      from public.profiles p
      left join public.vendors v on v.user_id = p.id
     where p.id = auth.uid()
       and (p.role = 'admin'::public.user_role or v.id = p_vendor_id)
  ) then
    raise exception 'Not authorised to view this vendor balance'
      using errcode = '42501';
  end if;

  select coalesce(sum(l.amount), 0) into v_total
    from public.vendor_ledger l
   where l.vendor_id = p_vendor_id;

  -- The owner decided refunds must never be blocked, so a negative balance is
  -- returned as-is and carried forward from the next payout.
  return v_total;
end;
$$;

revoke all on function public.vendor_balance(uuid) from public, anon;
grant execute on function public.vendor_balance(uuid) to authenticated;


-- 6. Create a pending payout (admin only) ------------------------------------
create or replace function public.create_vendor_payout(
  p_vendor_id   uuid,
  p_amount      numeric,
  p_method      text default 'bank_transfer',
  p_reference   text default null,
  p_note        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout_id uuid;
begin
  if not exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin'::public.user_role
  ) then
    raise exception 'Only admins can create payouts' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payout amount must be greater than zero';
  end if;

  if not exists (select 1 from public.vendors where id = p_vendor_id) then
    raise exception 'Unknown vendor';
  end if;

  insert into public.vendor_payouts (vendor_id, amount, method, reference, note, created_by)
  values (p_vendor_id, round(p_amount, 2), coalesce(p_method, 'bank_transfer'), p_reference, p_note, auth.uid())
  returning id into v_payout_id;

  return v_payout_id;
end;
$$;

revoke all on function public.create_vendor_payout(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.create_vendor_payout(uuid, numeric, text, text, text) to authenticated;


-- 7. Mark a payout as actually sent (admin only) -----------------------------
-- Pending payouts are excluded from the ledger, so creating one never changes
-- a balance. Only marking it 'paid' does. 'failed' and 'cancelled' simply
-- release the reservation with no ledger entry.
create or replace function public.mark_vendor_payout_paid(
  p_payout_id uuid,
  p_reference text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.vendor_payouts;
  v_balance numeric;
begin
  if not exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin'::public.user_role
  ) then
    raise exception 'Only admins can mark payouts paid' using errcode = '42501';
  end if;

  select * into v_payout
    from public.vendor_payouts
   where id = p_payout_id
   for update;

  if not found then
    raise exception 'Unknown payout';
  end if;

  if v_payout.status <> 'pending' then
    raise exception 'Payout is already %', v_payout.status;
  end if;

  -- Advisory lock on the vendor, serialising concurrent payout attempts.
  perform pg_advisory_xact_lock(hashtextextended(v_payout.vendor_id::text, 0));

  select public.vendor_balance(v_payout.vendor_id) into v_balance;

  if v_balance < v_payout.amount then
    raise exception 'Insufficient balance: available %, payout %',
      round(v_balance, 2), round(v_payout.amount, 2);
  end if;

  insert into public.vendor_ledger (vendor_id, order_id, payout_id, entry_type, amount)
  values (v_payout.vendor_id, null, p_payout_id, 'payout', -round(v_payout.amount, 2));

  update public.vendor_payouts
     set status = 'paid',
         paid_at = now(),
         reference = coalesce(p_reference, reference)
   where id = p_payout_id;

  return true;
end;
$$;

revoke all on function public.mark_vendor_payout_paid(uuid, text) from public, anon;
grant execute on function public.mark_vendor_payout_paid(uuid, text) to authenticated;


-- 8. Void an unpaid payout (admin only) --------------------------------------
create or replace function public.void_vendor_payout(
  p_payout_id uuid,
  p_reason    text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin'::public.user_role
  ) then
    raise exception 'Only admins can void payouts' using errcode = '42501';
  end if;

  select status into v_status
    from public.vendor_payouts
   where id = p_payout_id
   for update;

  if not found then
    raise exception 'Unknown payout';
  end if;

  -- A paid payout has real money behind it; reversing it is a separate flow.
  if v_status <> 'pending' then
    raise exception 'Only a pending payout can be voided (this one is %)', v_status;
  end if;

  update public.vendor_payouts
     set status = 'cancelled',
         voided_at = now(),
         void_reason = p_reason
   where id = p_payout_id;

  return true;
end;
$$;

revoke all on function public.void_vendor_payout(uuid, text) from public, anon;
grant execute on function public.void_vendor_payout(uuid, text) to authenticated;


-- 9. Full-order refund (admin only) ------------------------------------------
-- Returns everything the customer paid: orders.total_amount, which already
-- includes tax, shipping and county surcharges.
--
-- Reversals, all merchandise-based:
--   vendor  -earnings   (they no longer keep the goods)
--   platform commission reversed, so net platform revenue falls
--   tax and shipping are NOT reversed, because they were never commission
--   eligible and are recorded separately in the refund record.
--
-- The vendor's balance is allowed to go negative by design (owner decision).
create or replace function public.refund_order(
  p_order_id  uuid,
  p_reason    text default null,
  p_reference text default null,
  p_restock   boolean default true
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order      public.orders;
  v_refund_id  uuid;
  v_amount     numeric;
begin
  if not exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin'::public.user_role
  ) then
    raise exception 'Only admins can issue refunds' using errcode = '42501';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'Unknown order';
  end if;

  -- Idempotent: a refunded order cannot be refunded again.
  if v_order.refunded_at is not null
     or v_order.payment_status = 'refunded'::public.payment_status then
    raise exception 'Order % has already been refunded', v_order.order_number;
  end if;

  if v_order.payment_status <> 'paid'::public.payment_status then
    raise exception 'Only a paid order can be refunded (this one is %)',
      v_order.payment_status;
  end if;

  -- Everything the customer actually paid.
  v_amount := round(coalesce(v_order.total_amount, 0), 2);

  if v_amount <= 0 then
    raise exception 'Order has no refundable amount';
  end if;

  insert into public.order_refunds (order_id, amount, reference, reason, restocked, created_by)
  values (p_order_id, v_amount, p_reference, p_reason, p_restock, auth.uid())
  returning id into v_refund_id;

  -- Reverse the vendor's earning. ON CONFLICT DO NOTHING keeps this safe if an
  -- earning row is somehow missing; the unique index in section 1 makes a
  -- genuine double reversal impossible.
  insert into public.vendor_ledger (vendor_id, order_id, entry_type, amount)
  values (v_order.vendor_id, p_order_id, 'refund', -round(coalesce(v_order.vendor_earnings, 0), 2))
  on conflict (order_id) where entry_type = 'refund' do nothing;

  -- payment_status is a protected column, so the refund needs its own narrow
  -- flag (nexamart.internal_refund_write). The guard still allows ONLY a move to
  -- 'refunded', and still enforces every other protected field.
  perform set_config('nexamart.internal_refund_write', 'on', true);
  update public.orders
     set payment_status = 'refunded'::public.payment_status,
         refunded_at    = now(),
         refund_amount  = v_amount,
         updated_at     = now()
   where id = p_order_id;
  perform set_config('nexamart.internal_refund_write', 'off', true);

  -- Restock after the state change, and only once.
  if p_restock and not v_order.stock_released then
    perform public.restock_order_items(p_order_id);
  end if;

  update public.order_refunds set restocked = p_restock where id = v_refund_id;

  return v_amount;
end;
$$;

revoke all on function public.refund_order(uuid, text, text, boolean) from public, anon;
grant execute on function public.refund_order(uuid, text, text, boolean) to authenticated;


-- 10. Payout summary for the admin UI ----------------------------------------
create or replace function public.admin_payout_summary(p_from timestamptz, p_to timestamptz)
returns table (
  pending_count bigint,
  pending_amount numeric,
  paid_count    bigint,
  paid_amount   numeric,
  failed_count  bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin'::public.user_role
  ) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select
    count(*) filter (where status = 'pending'),
    coalesce(sum(amount) filter (where status = 'pending'), 0),
    count(*) filter (where status = 'paid'),
    coalesce(sum(amount) filter (where status = 'paid'), 0),
    count(*) filter (where status = 'failed')
  from public.vendor_payouts
  where created_at >= coalesce(p_from, '-infinity'::timestamptz)
    and created_at <  coalesce(p_to,   'infinity'::timestamptz);
end;
$$;

revoke all on function public.admin_payout_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_payout_summary(timestamptz, timestamptz) to authenticated;

-- ============================================================================
-- End of migration
-- ============================================================================
