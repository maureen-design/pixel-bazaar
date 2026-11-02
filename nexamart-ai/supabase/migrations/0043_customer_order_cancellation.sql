-- ============================================================================
-- NexaMart AI - 0043_customer_order_cancellation.sql
-- Adds customer self-service order cancellation capability.
--
-- Eligibility rules (enforced in RPC):
--   1. Caller must be the order owner (user_id = auth.uid())
--   2. Order must be unpaid (payment_status != 'paid' and != 'refunded')
--   3. Order must be within 30 minutes of creation
--   4. Order must not be in a terminal state (cancelled, delivered, processing)
--   5. Stock release is automatic via existing trigger trg_orders_release_stock_on_cancel
--
-- Leverages existing:
--   - cancellation_reason column (0025_order_cancellation_reason.sql)
--   - cancelled_by column (0025_order_cancellation_reason.sql)
--   - release_stock_on_cancel trigger (0029_order_cancellation_integrity.sql)
--   - protect_orders_payment_fields trigger (0029_order_cancellation_integrity.sql)
--
-- No schema changes (cancellation_reason and cancelled_by already exist).
-- Email notification uses existing send-order-status-email Edge Function.
-- ============================================================================

-- RPC: customer_cancel_order
-- Allows a customer to cancel their own order within eligibility constraints.
create or replace function public.customer_cancel_order(
  p_order_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_caller uuid := auth.uid();
  v_minutes_elapsed numeric;
begin
  -- Fetch the order with row lock to prevent race conditions
  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Order not found');
  end if;

  -- Rule 1: Caller must be the order owner
  if v_order.user_id is distinct from v_caller then
    return jsonb_build_object('success', false, 'error', 'You can only cancel your own orders');
  end if;

  -- Rule 2: Order must be unpaid (cannot cancel paid or refunded orders)
  if v_order.payment_status in ('paid', 'refunded') then
    return jsonb_build_object('success', false, 'error', 'Cannot cancel a paid order. Contact support for refunds.');
  end if;

  -- Rule 3: Order must be within 30 minutes of creation
  v_minutes_elapsed := extract(epoch from (now() - v_order.created_at)) / 60;
  if v_minutes_elapsed > 30 then
    return jsonb_build_object('success', false, 'error', 'Orders can only be cancelled within 30 minutes of placement. Contact support for assistance.');
  end if;

  -- Rule 4: Order must not be in a terminal state
  if v_order.status in ('cancelled', 'delivered', 'processing') then
    return jsonb_build_object('success', false, 'error', 'This order cannot be cancelled in its current state');
  end if;

  -- Cancel the order
  update public.orders
     set status = 'cancelled',
         cancellation_reason = p_reason,
         cancelled_by = v_caller
   where id = p_order_id;

  -- Stock release is automatic via trg_orders_release_stock_on_cancel trigger
  -- Email notification is handled by the caller (Edge Function)

  return jsonb_build_object('success', true, 'order_id', p_order_id);
end;
$$;

-- Grant execute to authenticated users
grant execute on function public.customer_cancel_order(uuid, text) to authenticated;
