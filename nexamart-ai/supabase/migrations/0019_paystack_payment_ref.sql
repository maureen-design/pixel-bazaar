-- ============================================================================
-- NexaMart AI - 0019_paystack_payment_ref.sql
-- Real card payments via Paystack Checkout (test mode).
--
-- Adds a payment_ref column so create-paystack-checkout can persist the unique
-- Paystack transaction reference on the order, and paystack-webhook can look
-- the order back up by reference (charge.success).
--
-- Writes to this column come exclusively from Edge Functions running with the
-- service-role key (trusted writers; protect_orders_payment_fields exempts
-- auth.uid() IS NULL actors), so no policy changes are needed.
--
-- Idempotent: safe to re-run.
-- ============================================================================

alter table public.orders add column if not exists payment_ref text;

create index if not exists orders_payment_ref_idx on public.orders (payment_ref);

-- ============================================================================
-- End of migration
-- ============================================================================
