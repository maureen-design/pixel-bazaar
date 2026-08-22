-- ============================================================================
-- NexaMart AI - 0014_orders_rls_tighten.sql
-- Orders RLS tightening (Priority #18B-1, Phase 2).
--
-- Apply ONLY AFTER the frontend has switched order creation to
-- public.create_order(...) (see 0013_orders_payment_integrity.sql) and that
-- path has been verified. This migration is the "lockdown" step:
--
--   1) Remove the permissive direct INSERT policies on orders (orders may only
--      be created via the SECURITY DEFINER create_order RPC).
--   2) Replace the permissive owner/vendor UPDATE policy with a vendor
--      fulfillment-only policy (customers get NO update access). Column-level
--      immutability is enforced by trg_orders_protect_payment_fields (0013);
--      the admin UPDATE policy from 0006 is preserved unchanged.
--   3) Revoke direct EXECUTE of decrement_stock from anon/authenticated. Stock
--      decrement now happens inside create_order; release_stock_for_order and
--      the service-role M-Pesa/card edges are unaffected.
--
-- SELECT policies (owner / vendor / admin) are unchanged.
--
-- Idempotent: safe to re-run (drop policy if exists + create).
-- ============================================================================

-- 1. Close direct INSERT ------------------------------------------------------
drop policy if exists "Users can insert orders" on public.orders;
drop policy if exists "orders_insert_policy" on public.orders;

-- 2. Replace the permissive UPDATE policy -------------------------------------
drop policy if exists "orders_update_policy" on public.orders;

-- Vendors may update their own vendor's orders. The payment-field protection
-- trigger (0013) restricts those updates to fulfillment status transitions.
create policy "orders_vendor_update_policy"
  on public.orders for update
  using (
    auth.uid() in (
      select vendors.user_id from public.vendors where vendors.id = orders.vendor_id
    )
  )
  with check (
    auth.uid() in (
      select vendors.user_id from public.vendors where vendors.id = orders.vendor_id
    )
  );

-- 3. Lock down the direct stock-decrement helper ------------------------------
revoke all on function public.decrement_stock(uuid, integer) from public;
revoke execute on function public.decrement_stock(uuid, integer) from anon, authenticated;

-- ============================================================================
-- End of migration
-- ============================================================================
