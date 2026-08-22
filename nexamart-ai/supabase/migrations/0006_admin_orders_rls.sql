-- ============================================================================
-- NexaMart AI - 0006_admin_orders_rls.sql
-- Admin access to all orders + order_items (Priority #2).
--
-- Additive only: does NOT modify the existing buyer/vendor policies on
-- orders / order_items. Admin role check matches the schema-wide pattern:
--   exists (select 1 from public.profiles where profiles.id = auth.uid()
--           and profiles.role = 'admin')
-- (already used by categories / coupons / audit_logs / activity_logs).
--
-- Idempotent: safe to re-run (drop if exists + create).
-- ============================================================================

-- Admin: SELECT all orders ------------------------------------------------------
drop policy if exists "orders_admin_select_policy" on public.orders;
create policy "orders_admin_select_policy"
  on public.orders for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Admin: UPDATE orders (status / payment fields via existing admin Orders UI) ---
drop policy if exists "orders_admin_update_policy" on public.orders;
create policy "orders_admin_update_policy"
  on public.orders for update
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Admin: SELECT all order_items -------------------------------------------------
drop policy if exists "order_items_admin_select_policy" on public.order_items;
create policy "order_items_admin_select_policy"
  on public.order_items for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- ============================================================================
-- End of migration
-- ============================================================================
