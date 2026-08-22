-- ============================================================================
-- NexaMart AI - 0007_cart_items_variant_unique.sql
-- Cart-line identity: allow distinct variants of the same product to coexist,
-- while still merging the SAME variant (and the same simple product).
--
-- Problem (audit finding):
--   cart_items had UNIQUE (user_id, product_id), so a customer could never
--   hold variant A and variant B of the SAME product: the second INSERT hit a
--   unique-constraint violation.
--
-- Design:
--   Replace the old constraint with a unique index on the ACTUAL cart-line
--   identity: (user_id, product_id, variant_id).
--
--   NULL handling (verified live on PostgreSQL 17.6):
--     * Plain UNIQUE(...) / UNIQUE index treats NULLs as DISTINCT, so two rows
--       with variant_id IS NULL (same simple product) would NOT conflict and
--       duplicate simple-product rows would be allowed -> BAD.
--     * NULLS NOT DISTINCT (PG15+) treats NULL variant_id as EQUAL, so:
--         - simple product + same simple product  -> rejected (merge instead)  OK
--         - product + variant A + variant B       -> both allowed              OK
--         - different user / different product    -> independent                OK
--
-- Idempotent: drop-if-exists + create-if-not-exists.
-- Additive for data: existing cart rows are untouched.
-- ============================================================================

-- 1. Drop the obsolete (user_id, product_id) unique constraint.
--    (Postgres auto-drops its backing unique index with it.)
alter table public.cart_items
  drop constraint if exists cart_items_user_id_product_id_key;

-- 2. New cart-line identity: unique per (user, product, variant).
--    NULLS NOT DISTINCT treats a simple product (variant_id IS NULL) as one
--    canonical line, preventing duplicate simple-product rows.
create unique index if not exists cart_items_user_product_variant_uidx
  on public.cart_items (user_id, product_id, variant_id)
  nulls not distinct;

-- ============================================================================
-- End of migration
-- ============================================================================