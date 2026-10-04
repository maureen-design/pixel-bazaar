-- ============================================================================
-- 0041_admin_net_commission_double_subtract.sql
-- ============================================================================
-- FIXES A BUG FOUND BY supabase/verification/e2e_order_money_flow.sql
--
-- THE BUG
--   admin_financial_summary computed net_platform_revenue as:
--
--       sum(commission_amount) filter (refunded_at is null)      -- live
--     - sum(commission_amount) filter (refunded_at is not null)  -- gone
--
--   Once an order is refunded it stops being 'live', so the first term drops
--   to zero, and then the second term subtracts its commission again. The
--   clawback is counted twice: once by removing the order from live, and once
--   by the explicit subtraction.
--
--   Measured on a real paid-then-refunded order:
--       commission 1350.00, then refunded
--       net_platform_revenue = -1350.00     (expected 0.00)
--
--   The order should contribute +1350.00 while live and 0.00 once refunded.
--   It never went negative in any test because every prior run had zero paid
--   orders, so the expression evaluated to 0 - 0 = 0.
--
-- WHY IT MATTERS
--   1. The admin Dashboard card reads this column directly
--      (src/pages/admin/Dashboard.tsx, '30-Day Commission'), as does
--      src/pages/admin/Reports.tsx. A single refund made the platform's
--      commission for the window read as negative money.
--   2. It breaks the reconciliation that check 021 asserts
--      (net + vendor_earnings = gmv). With real refund data, net goes
--      negative while vendor_earnings and gmv both exclude the refunded
--      order, so the three no longer agree. Check 021 passed previously only
--      because 0 + 0 = 0 held vacuously.
--
-- THE FIX
--   Net commission must be measured against every order in the window, then
--   have the refunded ones removed:
--
--       sum(commission_amount) over scoped   -- every paid order in the window
--     - sum(commission_amount) over gone     -- the ones since refunded
--
--   Since every 'gone' order is also in 'scoped' (both are bounded by the
--   same paid_at range and payment_status filter), this equals the live sum
--   by construction and can never go negative for a fully refunded order.
--   It also keeps 0040's intended semantics: an order contributes its
--   commission to the window it was paid in, less its refund if it has since
--   been refunded.
--
--   platform_commission, gmv, vendor_earnings_paid and refunded_amount are
--   deliberately left alone. They are already correct, and the e2e probe
--   verifies each of them against hand-computed figures.
--
-- WHY A NEW FILE
--   0040 is already applied in production, so editing it would not take
--   effect. This is additive and keeps the migration history honest.
-- ============================================================================


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
    -- Every paid or refunded order whose paid_at falls in the window.
    select o.*
      from public.orders o
     where o.payment_status in ('paid'::public.payment_status, 'refunded'::public.payment_status)
       and coalesce(o.paid_at, o.created_at) >= coalesce(p_from, '-infinity'::timestamptz)
       and coalesce(o.paid_at, o.created_at) <  coalesce(p_to,   'infinity'::timestamptz)
  ),
  live as (
    -- Still-earning orders. These drive orders_paid, gmv, tax, shipping,
    -- platform_commission and vendor_earnings_paid.
    select * from scoped where refunded_at is null
  ),
  gone as (
    -- Paid in this window and refunded since. These drive refunded_amount,
    -- and are subtracted from the FULL scoped commission to reach net.
    select * from scoped where refunded_at is not null
  )
  select
    (select count(*) from live),
    coalesce((select sum(merchandise_subtotal) from live), 0),
    coalesce((select sum(tax_amount)           from live), 0),
    coalesce((select sum(coalesce(shipping_cost,0) + coalesce(delivery_cost,0)) from live), 0),
    coalesce((select sum(commission_amount)    from live), 0),
    coalesce((select sum(coalesce(refund_amount, merchandise_subtotal)) from gone), 0),
    -- FIXED. Was: live sum MINUS gone sum, which subtracted the clawback a
    -- second time for orders already excluded from live. Measured -1350.00 on
    -- a real refunded order where 0.00 is correct.
    --
    -- scoped includes gone, so this is equivalent to the live sum and is
    -- written this way to make the subtraction explicit and auditable.
    coalesce((select sum(commission_amount)    from scoped), 0)
      - coalesce((select sum(commission_amount) from gone), 0),
    coalesce((select sum(vendor_earnings)      from live), 0);
end;
$$;

revoke all on function public.admin_financial_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_financial_summary(timestamptz, timestamptz) to authenticated;