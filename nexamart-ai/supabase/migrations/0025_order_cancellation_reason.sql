-- Migration: Add cancellation_reason to orders table
-- Allows vendor/admin to provide a reason when cancelling an order.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Update orders type enum to include cancellation reason
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_by uuid references public.profiles (id) on delete set null;
