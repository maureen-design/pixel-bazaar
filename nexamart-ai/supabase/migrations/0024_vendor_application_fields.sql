-- Migration: Add phone, city, and main_categories to vendors table
-- These fields are collected during vendor application but were not being stored.

-- Add phone column
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS phone text;

-- Add city/location column
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS city text;

-- Add main product categories column
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS main_categories text;

-- Add rejection reason column (for admin to provide reason when rejecting)
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Add reapplication tracking
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS rejection_count integer default 0;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS last_rejected_at timestamptz;
