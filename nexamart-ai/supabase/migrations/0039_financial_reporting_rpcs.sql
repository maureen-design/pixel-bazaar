-- ============================================================================
-- 0039_financial_reporting_rpcs.sql
-- ============================================================================
-- WHY
--   0037 fixed the MONEY (commission split, settlement, ledger, refunds) and
--   added two totals RPCs. But four UI files still computed revenue as
--   sum(orders.total_amount) with no payment_status filter, so unpaid, failed,
--   cancelled and fully-refunded orders all counted as revenue. 0037's totals
--   RPCs were never actually called by the app.
--
--   0037's admin_financial_summary has no time-series, and
--   vendor_financial_summary is lifetime-only, so neither can feed a daily
--   chart. This migration adds the missing shapes. It does NOT modify 0037:
--   0037 is already applied in production, so editing it would change nothing
--   and silently diverge the repo from the live database.
--
-- DATE SEMANTICS - this is the part worth arguing about
--   * Admin figures are bucketed on orders.created_at, matching
--     0037's admin_financial_summary. That is "orders created in the window
--     that are paid". It is a sales-activity view, not an accrual view.
--   * Vendor figures are bucketed on orders.paid_at, because a vendor has
--     earned nothing until the money is actually collected. Using created_at
--     here would let a vendor book revenue for orders that were never paid.
--   The asymmetry is deliberate. If you want both on paid_at, change
--   admin_financial_summary in a later migration - it cannot be retrofitted
--   here because the live database already holds the created_at version.
--
-- TIMEZONE
--   All day buckets are computed in Africa/Nairobi. Bucketing in UTC puts
--   orders paid between 00:00 and 03:00 EAT on the previous day, which shows up
--   as a visible dip then spike at the edges of every chart.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Admin: daily commission and GMV.
--
-- commission is summed over LIVE orders only (refunded_at is null) so a
-- refunded order removes its commission from the day it was refunded. gmv is
-- merchandise_subtotal: tax and shipping are pass-through and are not money
-- the marketplace ever took a cut of.
-- ---------------------------------------------------------------------------
create or replace function public.admin_daily_commission(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  day        date,
  commission numeric,
  gmv        numeric,
  orders     bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := coalesce(p_from, now() - interval '90 days');
  v_to   timestamptz := coalesce(p_to,   now());
begin
  -- SECURITY DEFINER bypasses RLS, so authorisation must happen here. Without
  -- this check any signed-in customer could read platform commission by day.
  if not exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.role = 'admin'::public.user_role
  ) then
    raise exception 'Not authorised to view platform financials'
      using errcode = '42501';
  end if;

  if v_to <= v_from then
    raise exception 'p_to must be after p_from' using errcode = '22023';
  end if;

  return query
  with bounds as (
    select
      (v_from at time zone 'Africa/Nairobi')::date                              as d0,
      ((v_to - interval '1 microsecond') at time zone 'Africa/Nairobi')::date   as d1
  ),
  -- generate_series rather than grouping the orders, so days with no sales
  -- come back as explicit zeroes. Without this a quiet week collapses the
  -- chart line and makes a revenue dip look like missing data.
  calendar as (
    select g::date as day
      from bounds, generate_series(bounds.d0, bounds.d1, interval '1 day') g
  ),
  paid as (
    select
      (o.created_at at time zone 'Africa/Nairobi')::date as day,
      o.merchandise_subtotal,
      o.commission_amount,
      (o.refunded_at is null) as is_live
      from public.orders o
     where o.payment_status in ('paid'::public.payment_status, 'refunded'::public.payment_status)
       and o.created_at >= v_from
       and o.created_at <  v_to
  )
  select
    c.day,
    coalesce(sum(p.commission_amount) filter (where p.is_live), 0),
    coalesce(sum(p.merchandise_subtotal) filter (where p.is_live), 0),
    count(p.day) filter (where p.is_live)
    from calendar c
    left join paid p on p.day = c.day
   group by c.day
   order by c.day;
end;
$$;

revoke all on function public.admin_daily_commission(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_daily_commission(timestamptz, timestamptz) to authenticated;


-- ---------------------------------------------------------------------------
-- Vendor: earnings inside a date range, on paid_at.
--
-- 0037's vendor_financial_summary stays lifetime-only and remains the source
-- for the balance card (it also covers payouts, which are not order-scoped).
-- This function is only for the "last N days" trend.
-- ---------------------------------------------------------------------------
create or replace function public.vendor_financial_summary_range(
  p_vendor_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
)
returns table (
  earnings numeric,
  refunds  numeric,
  orders   bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := coalesce(p_from, now() - interval '90 days');
  v_to   timestamptz := coalesce(p_to,   now());
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
    coalesce(sum(o.vendor_earnings) filter (where o.refunded_at is null), 0),
    coalesce(sum(coalesce(o.refund_amount, 0)) filter (where o.refunded_at is not null), 0),
    count(*) filter (where o.refunded_at is null)
    from public.orders o
   where o.vendor_id = p_vendor_id
     and o.payment_status in ('paid'::public.payment_status, 'refunded'::public.payment_status)
     and o.paid_at >= v_from
     and o.paid_at <  v_to;
end;
$$;

revoke all on function public.vendor_financial_summary_range(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.vendor_financial_summary_range(uuid, timestamptz, timestamptz) to authenticated;


-- ---------------------------------------------------------------------------
-- Vendor: daily earnings series, for the chart.
-- Zero-filled like the admin version.
-- ---------------------------------------------------------------------------
create or replace function public.vendor_daily_earnings(
  p_vendor_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
)
returns table (
  day      date,
  earnings numeric,
  orders   bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := coalesce(p_from, now() - interval '90 days');
  v_to   timestamptz := coalesce(p_to,   now());
begin
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
  with bounds as (
    select
      (v_from at time zone 'Africa/Nairobi')::date                              as d0,
      ((v_to - interval '1 microsecond') at time zone 'Africa/Nairobi')::date   as d1
  ),
  calendar as (
    select g::date as day
      from bounds, generate_series(bounds.d0, bounds.d1, interval '1 day') g
  ),
  earned as (
    select
      (o.paid_at at time zone 'Africa/Nairobi')::date as day,
      o.vendor_earnings
      from public.orders o
     where o.vendor_id = p_vendor_id
       and o.payment_status in ('paid'::public.payment_status, 'refunded'::public.payment_status)
       and o.paid_at >= v_from
       and o.paid_at <  v_to
       and o.refunded_at is null
  )
  select
    c.day,
    coalesce(sum(e.vendor_earnings), 0),
    count(e.day)
    from calendar c
    left join earned e on e.day = c.day
   group by c.day
   order by c.day;
end;
$$;

revoke all on function public.vendor_daily_earnings(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.vendor_daily_earnings(uuid, timestamptz, timestamptz) to authenticated;

-- ============================================================================
-- NOTES FOR THE UI WORK THAT USES THESE
--   * Every RPC here is money read straight from the database. Do not
--     recompute revenue from orders.total_amount in the client - that is the
--     bug this migration exists to remove.
--   * orders.total_amount includes tax and shipping, neither of which is
--     money the platform or the vendor keeps. Show merchandise_subtotal for
--     GMV and vendor_earnings for vendor money.
--   * A refunded order keeps payment_status = 'refunded' forever, so it stays
--     visible in gross figures with refunded_at set. Filter on refunded_at,
--     not on payment_status, when you want live money.
-- ============================================================================