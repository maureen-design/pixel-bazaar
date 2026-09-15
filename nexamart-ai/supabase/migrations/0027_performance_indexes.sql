-- Performance indexes for order reconciliation and admin queries
-- Addresses N+1 sequential query patterns in reconcilers and admin dashboards

-- Composite index for orders table: payment_status + status
-- Used by: admin/Orders.tsx, vendor/Orders.tsx, daily payment reconciler
CREATE INDEX IF NOT EXISTS idx_orders_payment_status_status
  ON orders(payment_status, status);

-- Index for orders by payment_method
-- Used by: card/daily-reconciler, bank-transfer/daily-reconciler, paystack/daily-reconciler
CREATE INDEX IF NOT EXISTS idx_orders_payment_method
  ON orders(payment_method);

-- Unique constraint on vendors.user_id to prevent duplicate applications
-- Race condition: two simultaneous vendor applications from same user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendors_user_id_unique'
  ) THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_user_id_unique UNIQUE (user_id);
  END IF;
END $$;
