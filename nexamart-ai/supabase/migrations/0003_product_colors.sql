-- ============================================================================
-- NexaMart AI — 0003_product_colors.sql
-- Phase 2A: Color-aware search foundation.
-- Additive only. Does NOT drop or delete anything. Safe to run from an empty
-- 0001_base_schema.sql or on top of the live catalog (0001 + 0002 applied).
-- ----------------------------------------------------------------------------
-- Adds:
--   products.colors text[] DEFAULT '{}'   (controlled color vocabulary)
--   GIN index on products.colors for fast array-containment lookups
--   backfill of colors from existing products.variants JSONB where reliable
-- ----------------------------------------------------------------------------
-- IMPORTANT:
--   - Colors are derived ONLY from structured data (variants JSONB). No colors
--     are invented from prose or product names.
--   - Idempotent. Re-runnable via CREATE ... IF NOT EXISTS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Add column (nullable array => safe; existing rows get DEFAULT '{}')
-- ----------------------------------------------------------------------------
alter table public.products add column if not exists colors text[] default '{}';

-- ----------------------------------------------------------------------------
-- 2. GIN index for array containment (`colors @> '{black}'`, PostgREST `cs`)
-- ----------------------------------------------------------------------------
create index if not exists idx_products_colors_gin
  on public.products using gin (colors);

-- ----------------------------------------------------------------------------
-- 3. Backfill colors from existing variants JSONB
--    The only reliable structured color source today. For each product, collect
--    the distinct lowercase values of combinations[*].attributes.color.
--    Products with no variants (or no color attribute) keep colors = '{}'.
-- ----------------------------------------------------------------------------

-- 3a. Deterministic backfill for the two known variant products (documented).
update public.products
set colors = array['black', 'white', 'navy', 'red']
where slug = 'classic-cotton-tshirt';

update public.products
set colors = array['black', 'grey', 'olive']
where slug = 'premium-hoodie';

-- 3b. Generic backfill from variants JSONB (future-proof: covers any product
--     whose variants.combinations carry an attributes.color). Only populates
--     rows where a color attribute actually exists; everything else stays '{}'.
update public.products p
set colors = sub.colors
from (
  select
    id,
    array_agg(distinct lower(c -> 'attributes' ->> 'color'))
      filter (where c -> 'attributes' ->> 'color' is not null) as colors
  from public.products,
    jsonb_array_elements(
      case
        when jsonb_typeof(variants -> 'combinations') = 'array'
          then variants -> 'combinations'
        else '[]'::jsonb
      end
    ) as c
  group by id
) sub
where p.id = sub.id
  and sub.colors is not null
  and array_length(sub.colors, 1) > 0;

-- ============================================================================
-- End of migration
-- ============================================================================
