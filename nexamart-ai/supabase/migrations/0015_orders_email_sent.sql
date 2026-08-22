-- ============================================================================
-- NexaMart AI - 0015_orders_email_sent.sql
-- Idempotent confirmation-email guard (Priority #18A email lifecycle).
--
--   1) orders.email_sent boolean NOT NULL DEFAULT false
--      -> authoritative "customer confirmation email delivered" flag so a
--         duplicate M-Pesa callback or a reconcile retry can never send a
--         duplicate confirmation email. Set by send-order-email (service role)
--         only after the customer email sendMail succeeds.
--
--     * create_order (0013) does not set this column -> default false, i.e.
--       a freshly created order is always "not yet emailed".
--     * mpesa-reconcile sweeps paid + email_sent = false orders to retry
--       independent of the payment state.
--
-- Additive only; safe to re-run.
-- ============================================================================

alter table public.orders
  add column if not exists email_sent boolean not null default false;

-- ============================================================================
-- End of migration
-- ============================================================================
