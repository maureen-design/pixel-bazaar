-- ============================================================================
-- NexaMart AI - 0011_system_settings_normalize.sql
-- Priority #17B: normalize live rows + harden RPC execute grants.
--
-- Live verification after 0010 found four `system_settings` rows stored as
-- `{"value": ...}` JSON envelopes instead of the scalar jsonb values expected
-- by src/lib/settings.ts / src/hooks/useSettings.ts:
--   site_name, site_description, currency, tax_rate
-- (`ON CONFLICT DO NOTHING` preserved pre-existing envelope rows.) This
-- migration rewrites those four rows to the exact scalars defined by the 0010
-- seed, and tightens EXECUTE on set_platform_settings so the anon role cannot
-- invoke it (permission denied), matching the intended security posture.
--
-- Smallest safe correction. Does NOT touch seed defaults, whitelist, type/range
-- validation, SECURITY DEFINER, or the orders payment trigger.
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Normalize the four envelope rows to scalars ------------------------------
-- Values are copied verbatim from the 0010 seed (and DEFAULT_SETTINGS in
-- src/lib/settings.ts). site_description intentionally uses the migration/seed
-- tagline, not the leftover "AI-assisted multi-vendor e-commerce marketplace"
-- envelope value.
update public.system_settings
set value = '"NexaMart AI"'::jsonb
where key = 'site_name'
  and value is distinct from '"NexaMart AI"'::jsonb;

update public.system_settings
set value = '"Your trusted multi-vendor marketplace for amazing products from trusted sellers."'::jsonb
where key = 'site_description'
  and value is distinct from '"Your trusted multi-vendor marketplace for amazing products from trusted sellers."'::jsonb;

update public.system_settings
set value = '"KES"'::jsonb
where key = 'currency'
  and value is distinct from '"KES"'::jsonb;

update public.system_settings
set value = '16'::jsonb
where key = 'tax_rate'
  and value is distinct from '16'::jsonb;

-- 2. Harden set_platform_settings EXECUTE -------------------------------------
-- 0010 revoked from public, but the live function was still callable by anon.
-- Explicitly strip EXECUTE from public/anon/service_role (every role is an
-- implicit member of PUBLIC), then re-grant only to authenticated. The
-- function body keeps its own admin check, so authenticated non-admins can
-- invoke but are rejected inside; anon gets a hard permission-denied.
revoke all on function public.set_platform_settings(jsonb) from public, anon, authenticated;
grant execute on function public.set_platform_settings(jsonb) to authenticated;

-- ============================================================================
-- End of migration
-- ============================================================================
