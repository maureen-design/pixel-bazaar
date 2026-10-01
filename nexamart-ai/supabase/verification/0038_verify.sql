-- ============================================================================
-- NexaMart AI - verification/0038_verify.sql
-- ============================================================================
-- Run AFTER 0038_payouts_and_refunds.sql (and 0037).
-- Read-only except in the clearly marked PROBE sections.
-- Sections 1-5 must report ok = true.
-- ============================================================================


-- 1. No client write path on the money tables -----------------------------
-- Payouts and refunds must be writable ONLY through the RPCs, which re-check
-- the admin role. Any INSERT/UPDATE/DELETE policy here is a hole.
select 'no client write policies' as check,
       not exists (
         select 1 from pg_policies
          where schemaname = 'public'
            and tablename in ('vendor_payouts', 'order_refunds', 'vendor_ledger')
            and cmd in ('INSERT', 'UPDATE', 'DELETE')
       ) as ok;
-- Expect ok = true.


-- 2. anon has no access at all -------------------------------------------
select 'anon locked out' as check,
       not exists (
         select 1 from information_schema.role_table_grants
          where grantee = 'anon' and table_schema = 'public'
            and table_name in ('vendor_payouts', 'order_refunds', 'vendor_ledger')
       ) as ok;
-- Expect ok = true.


-- 3. Ledger still balances against orders --------------------------------
-- Every paid, unrefunded order must have exactly one earning, and every
-- refunded order exactly one reversal. Catches a settlement regression.
select 'ledger matches orders' as check,
       count(*) = 0 as ok,
       string_agg(coalesce(o.order_number, '?'), ', ') as offenders
  from public.orders o
  left join public.vendor_ledger l
         on l.order_id = o.id and l.entry_type = 'earning'
 where o.payment_status = 'paid'::public.payment_status
   and o.refunded_at is null
 group by o.id, o.order_number
having count(l.id) <> 1;

select 'every refund is reversed exactly once' as check,
       count(*) = 0 as ok
  from public.orders o
  left join public.vendor_ledger l
         on l.order_id = o.id and l.entry_type = 'refund'
 where o.refunded_at is not null
 group by o.id
having count(l.id) <> 1;


-- 4. Idempotency indexes exist -------------------------------------------
-- These are what make a double credit physically impossible, not just
-- unlikely. If one is missing, concurrent callbacks can pay a vendor twice.
select 'idempotency indexes present' as check,
       count(*) = 3 as ok,
       string_agg(indexname, ', ' order by indexname) as found
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('vendor_ledger_earning_per_order',
                     'vendor_ledger_refund_per_order',
                     'vendor_ledger_payout_per_payout');
-- Expect ok = true, all three names listed.


-- 5. Balance is derived, not stored --------------------------------------
-- There must be no cached balance column anywhere that could drift from the
-- ledger. vendor_ledger.balance_after is allowed to be null/vestigial; the
-- truth is sum(vendor_ledger.amount).
select 'balances are derived' as check,
       not exists (
         select 1 from information_schema.columns
          where table_schema = 'public'
            and column_name in ('balance', 'outstanding', 'amount_due', 'total_earnings')
            and table_name in ('vendors', 'vendor_payouts')
       ) as ok;
-- Expect ok = true.


-- 6. Per-vendor position ------------------------------------------------
select
  v.store_name,
  coalesce(sum(l.amount) filter (where l.entry_type = 'earning'), 0) as earnings,
  coalesce(sum(l.amount) filter (where l.entry_type = 'refund'),   0) as refunds,
  coalesce(sum(l.amount) filter (where l.entry_type = 'payout'),   0) as paid_out,
  coalesce(sum(l.amount), 0) as outstanding,
  (select count(*) from public.vendor_payouts p
    where p.vendor_id = v.id and p.status = 'pending') as pending_payouts
from public.vendors v
left join public.vendor_ledger l on l.vendor_id = v.id
group by v.id, v.store_name
order by v.store_name;


-- 7. Payout summary ----------------------------------------------------
select * from public.admin_payout_summary(null, null);


-- ============================================================================
-- 8. PROBE - payout round trip (admin only) ------------------------------
-- ============================================================================
--   A. As an ADMIN, create a pending payout:
--        select public.create_vendor_payout(
--          '<vendor-id>', 1000, 'bank_transfer', 'TEST-REF', 'probe');
--      Expect: a uuid. Check the balance in section 6 is UNCHANGED, because a
--      pending payout is only a reservation.
--
--   B. Mark it paid:
--        select public.mark_vendor_payout_paid('<payout-uuid>', 'TRACE-1');
--      Expect: true. Balance now down by exactly 1000.
--
--   C. Marking it paid AGAIN must fail:
--        select public.mark_vendor_payout_paid('<payout-uuid>');
--      Expect: ERROR "Payout is already paid".
--
--   D. Overdrawing must fail:
--        create a payout for a huge amount, then mark it paid.
--      Expect: ERROR "Insufficient balance".
--
--   E. As a VENDOR (not admin), every one of these must fail:
--        select public.create_vendor_payout('<own-vendor-id>', 500, 'mpesa');
--      Expect: ERROR "Only admins can create payouts".
--      Same for mark_vendor_payout_paid and void_vendor_payout.
--
--   F. As a VENDOR, reading your own balance must SUCCEED:
--        select public.vendor_balance('<own-vendor-id>');
--      Reading ANOTHER vendor's id must fail with "Not authorised".
-- ============================================================================


-- ============================================================================
-- 9. PROBE - full-order refund (admin only) ------------------------------
-- ============================================================================
-- Use a throwaway paid order worth a known amount, e.g. merchandise 1000,
-- tax 160, shipping 250, so total_amount = 1410 and at 15% commission:
-- earnings = 850.00, commission = 150.00.
--
--   A. Record before:
--        select merchandise_subtotal, commission_amount, vendor_earnings,
--               total_amount, payment_status
--          from public.orders where order_number = '<probe>';
--
--   B. Refund:
--        select public.refund_order('<order-uuid>', 'probe', 'RF-1', true);
--      Expect: 1410.00 -- the FULL amount paid, including tax and shipping.
--
--   C. Verify state:
--        - payment_status = 'refunded'
--        - refunded_at is set, refund_amount = 1410.00
--        - a refund ledger row of -850.00 exists (vendor reversal only)
--        - product stock_quantity is back up by the ordered quantity
--        - an order_refunds row exists with restocked = true
--
--   D. Refunding AGAIN must fail:
--        select public.refund_order('<order-uuid>');
--      Expect: ERROR "has already been refunded".
--
--   E. Negative balance is ALLOWED and intended. If the vendor was already
--      paid out in step 8, their outstanding may now be negative. That is the
--      designed behaviour: it carries forward to the next payout and must NOT
--      be 'fixed' by blocking the refund.
--
--   F. The guard must not be a one-way door. As a non-admin, attempt:
--        update public.orders set payment_status = 'paid'
--         where order_number = '<probe>';
--      Expect: ERROR "Payment-owned order fields are immutable".
--      And an admin cannot launder a refund back to paid either, because the
--      refund flag only permits a move TO 'refunded'.
-- ============================================================================


-- ============================================================================
-- 10. PROBE - cancellation must still work (0029 regression guard) -------
-- ============================================================================
-- 0037 rebuilt protect_orders_payment_fields(). It must NOT have weakened
-- 0029. Check all four still hold:
--
--   1. Cancel an UNPAID order -> stock released, stock_released = true.
--   2. Try to cancel a PAID order:
--        update public.orders set status = 'cancelled' where order_number = '<paid>';
--      Expect: ERROR "Cannot cancel a paid order: refund the payment first".
--   3. Try to un-cancel a cancelled order (status = 'processing'):
--      Expect: ERROR "Cannot change status of a cancelled order".
--   4. As a CUSTOMER, place a real order through the app. It MUST succeed.
--      If you see "Customers cannot update orders", the settlement flag in
--      section 8 of 0037 is broken and every checkout is broken.
-- ============================================================================
