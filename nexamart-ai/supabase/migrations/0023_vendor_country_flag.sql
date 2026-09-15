-- ============================================================================
-- NexaMart AI - 0023_vendor_country_flag.sql
-- Add country column to vendors for flag display on product cards.
-- Additive only; safe to re-run.
-- ============================================================================

alter table public.vendors
  add column if not exists country text;

comment on column public.vendors.country is 'ISO 3166-1 alpha-2 country code (e.g. KE, NG, US) for flag display';

-- ============================================================================
-- End of migration
-- ============================================================================
