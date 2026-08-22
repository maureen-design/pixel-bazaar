-- Checkout Features Migration
-- Run this in Supabase SQL Editor

-- Delivery method
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_method TEXT DEFAULT 'standard';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_cost DECIMAL(10,2) DEFAULT 0;

-- Pay Later
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'now';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_deadline TIMESTAMPTZ;

-- Stock reservation helper (optional, falls back to direct update in code)
CREATE OR REPLACE FUNCTION decrement_stock(product_id UUID, quantity INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE products
  SET stock_quantity = GREATEST(0, stock_quantity - quantity)
  WHERE id = product_id;
END;
$$;
