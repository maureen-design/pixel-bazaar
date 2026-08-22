-- 0012_fix_demo_product_prices.sql
-- Correct the two demo/gallery product prices from USD-style demo values to
-- the intended KES catalog prices (project owner decision, 2026-08-15).
--
-- Classic Cotton T-Shirt: 49.99 -> 6,500 (pricier combo navy-m 54.99 -> 7,150)
-- Premium Hoodie:        79.99 -> 9,500 (pricier combo gry-l  84.99 -> 10,100)
--
-- Only these two product ids are touched. Runs as postgres (migration), so RLS
-- does not apply. base price is set equal to the min variant price so the
-- storefront convention (products.price == cheapest combination) is preserved.

BEGIN;

UPDATE products
SET price = 6500.00,
    variants = jsonb_set(
      variants,
      '{combinations}',
      (
        SELECT jsonb_agg(
          CASE
            WHEN (combo->>'price')::numeric = 54.99 THEN combo || '{"price": 7150.00}'::jsonb
            ELSE combo || '{"price": 6500.00}'::jsonb
          END
        )
        FROM jsonb_array_elements(variants->'combinations') combo
      )
    )
WHERE id = 'a35ce4bd-a63e-4fda-844d-0a555f07e52c'
  AND jsonb_typeof(variants) = 'object'
  AND jsonb_typeof(variants->'combinations') = 'array';

UPDATE products
SET price = 9500.00,
    variants = jsonb_set(
      variants,
      '{combinations}',
      (
        SELECT jsonb_agg(
          CASE
            WHEN (combo->>'price')::numeric = 84.99 THEN combo || '{"price": 10100.00}'::jsonb
            ELSE combo || '{"price": 9500.00}'::jsonb
          END
        )
        FROM jsonb_array_elements(variants->'combinations') combo
      )
    )
WHERE id = 'daae882a-3ad1-4c70-81a1-e5b0999e1eff'
  AND jsonb_typeof(variants) = 'object'
  AND jsonb_typeof(variants->'combinations') = 'array';

COMMIT;
