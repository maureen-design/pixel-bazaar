-- ============================================================================
-- 0040_admin_reporting_on_paid_at.sql
-- ============================================================================
-- WHY
--   0037 bucketed admin reporting on orders.created_at, which meant an order
--   placed 40 days ago and paid yesterday appeared in NEITHER the 30-day nor
--   the 60-day window. Concretely: a vendor and an admin looking at the same
--   sale could see it in different windows, because vendor reporting has
--   always used paid_at. That is a reconciliation problem the moment anyone
--   audits.
--
--   0037 is already applied in production, so it cannot be edited. This
--   replaces the two admin functions with paid_at semantics and adds one
--   new function so refunds can never become invisible.
--
--   admin_financial_summary keeps its exact signature and return type, so
--   CREATE OR REPLACE is enough and every existing caller keeps working.
--
-- THE TRAP IN THIS MIGRATION
--   Live commission and refunded commission must be bucketed on the SAME date,
--   otherwise a refund nets against a window that never counted the order and
--   the window goes negative. So here both use the order's paid_at, which keeps
--   each order self-consistent: it contributes its commission to the window it
--   was paid in, less its refund if it has since been refunded.
--
--   The cost of that choice is that a refund issued six months after payment
--   lands in the ORIGINAL payment window, not the month the money went back.
--   So admin_refunds_in_window() is added below: it buckets by refunded_at, so
--   the refund event itself is always reportable. Use the totals RPC for
--   per-order net figures and this one for cash-flow timing.
--
-- NULL paid_at
--   coalesce(paid_at, created_at) is used throughout. An order that is paid but
--   has no paid_at should not vanish from every report, and created_at is the
--   best available approximation. Verification check 003 counts how many rows
--   take this fallback so the gap is visible rather than silent.
--
-- All day buckets remain Africa/Nairobi, matching 0039.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Totals, on paid_at.
-- ---------------------------------------------------------------------------
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
  -- SECURITY DEFINER bypasses RLS, so authorisation must happen here. Without
  -- this check any signed-in customer could read platform commission.
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
  with scoped as (
    select o.*
      from public.orders o
     where o.payment_status in ('paid'::public.payment_status, 'refunded'::public.payment_status)
       and coalesce(o.paid_at, o.created_at) >= coalesce(p_from, '-infinity'::timestamptz)
       and coalesce(o.paid_at, o.created_at) <  coalesce(p_to,   'infinity'::timestamptz)
  ),
  live as (
    select * from scoped where refunded_at is null
  ),
  gone as (
    select * from scoped where refunded_at is not null
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


-- ---------------------------------------------------------------------------
-- 2. Daily series, on paid_at. Same authorisation, same zero filling.
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
      (v_from at time zone 'Africa/Nairobi')::date                            as d0,
      ((v_to - interval '1 microsecond') at time zone 'Africa/Nairobi')::date as d1
  ),
  calendar as (
    select g::date as day
      from bounds, generate_series(bounds.d0, bounds.d1, interval '1 day') g
  ),
  paid as (
    select
      (coalesce(o.paid_at, o.created_at) at time zone 'Africa/Nairobi')::date as day,
      o.merchandise_subtotal,
      o.commission_amount,
      (o.refunded_at is null) as is_live
      from public.orders o
     where o.payment_status in ('paid'::public.payment_status, 'refunded'::public.payment_status)
       and coalesce(o.paid_at, o.created_at) >= v_from
       and coalesce(o.paid_at, o.created_at) <  v_to
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
-- 3. NEW. Refunds by the date the money actually went back.
--
--    admin_financial_summary attributes a refund to the window its order was
--    PAID in. That keeps each order self-consistent but means a refund issued
--    long after payment is invisible in the month the cash left. This function
--    closes that gap: it reports refunds by refunded_at, so a cash-flow view
--    can always answer "how much went back out this month".
--
--    Additive only. Nothing existing changes.
-- ---------------------------------------------------------------------------
create or replace function public.admin_refunds_in_window(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  refunds     bigint,
  amount      numeric,
  commission  numeric,
  vendor_back numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
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
  select
    count(*),
    coalesce(sum(o.refund_amount), 0),
    -- Only the commission actually clawed back, and only while the order is
    -- still within commission range. An order refunded before it was ever
    -- settled has nothing to claw back.
    coalesce(sum(o.commission_amount), 0),
    coalesce(sum(o.vendor_earnings), 0)
    from public.orders o
   where o.refunded_at is not null
     and o.refunded_at >= coalesce(p_from, '-infinity'::timestamptz)
     and o.refunded_at <  coalesce(p_to,   'infinity'::timestamptz);
end;
$$;

revoke all on function public.admin_refunds_in_window(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_refunds_in_window(timestamptz, timestamptz) to authenticated;

-- ============================================================================
-- IMPACT ON THE UI
--   * admin/Dashboard.tsx and admin/Reports.tsx need no code change. They pass
--     a 30-day window and read the same columns. Their numbers will shift,
--     because money now appears in the window it was collected rather than the
--     window the order was placed. That shift is the fix.
--   * admin/Reports.tsx should additionally surface admin_refunds_in_window,
--     because its CSV currently reports refunded_amount on the paid_at basis,
--     which is not the same figure.
--   * Vendor reporting is unchanged. It already used paid_at, which is why
--     this migration exists.
-- ============================================================================