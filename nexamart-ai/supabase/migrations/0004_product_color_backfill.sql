-- ============================================================================
-- NexaMart AI — 0004_product_color_backfill.sql
-- Phase 2A.1: Evidence-only color backfill.
-- Additive only. Does NOT drop or delete anything. Safe to run on top of
-- 0003 (applied live). Idempotent via NOT (colors @> ...) guards.
-- ----------------------------------------------------------------------------
-- Adds:
--   products.colors = ['white'] for ikea-malm-desk
--     Evidence: description states "140x65cm, white finish."
-- ----------------------------------------------------------------------------
-- IMPORTANT:
--   - Only 3 products carry colors after this migration. The other 88 have
--     NO reliable color evidence in name/description/variants/images, so
--     they intentionally stay empty (no invented colors).
--   - classic-cotton-tshirt (black/white/navy/red) and premium-hoodie
--     (black/grey/olive) are already populated by 0003 and are re-asserted
--     here for determinism; the guard makes re-runs no-ops.
--   - No changes to product_type, brand, prices, stock, images, descriptions,
--     vendors, categories, orders, or variants.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Re-assert variant-derived colors (already applied by 0003; guard = no-op
--    on re-run).
-- ----------------------------------------------------------------------------
update public.products
set colors = array['black', 'white', 'navy', 'red']
where slug = 'classic-cotton-tshirt'
  and not (colors @> array['black', 'white', 'navy', 'red']);

update public.products
set colors = array['black', 'grey', 'olive']
where slug = 'premium-hoodie'
  and not (colors @> array['black', 'grey', 'olive']);

-- ----------------------------------------------------------------------------
-- 2. Evidence-only backfill: description explicitly states "white finish".
-- ----------------------------------------------------------------------------
update public.products
set colors = array['white']
where slug = 'ikea-malm-desk'
  and not (colors @> array['white']);

-- ============================================================================
-- End of migration
-- ============================================================================
