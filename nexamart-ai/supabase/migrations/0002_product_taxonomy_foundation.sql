-- ============================================================================
-- NexaMart AI â€” 0002_product_taxonomy_foundation.sql
-- Phase 1: Product taxonomy & search data foundation.
-- Additive only. Does NOT drop or delete anything. Safe to run from an empty
-- 0001_base_schema.sql or on top of the live catalog.
-- ----------------------------------------------------------------------------
-- Adds:
--   products.product_type TEXT  (nullable controlled vocabulary)
--   products.brand TEXT         (nullable)
--   btree indexes on product_type / brand
--   pg_trgm GIN indexes on name / description
--   Fashion subcategories: Men's / Women's (parent_id -> Fashion)
--   deterministic backfill of the current 91 live products by slug
-- ----------------------------------------------------------------------------
-- IMPORTANT: idempotent. Re-runnable via CREATE ... IF NOT EXISTS / ON CONFLICT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extension for trigram search indexes
-- ----------------------------------------------------------------------------
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- 1. Add columns (nullable => safe)
-- ----------------------------------------------------------------------------
alter table public.products add column if not exists product_type text;
alter table public.products add column if not exists brand text;

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_products_product_type on public.products using btree (product_type);
create index if not exists idx_products_brand on public.products using btree (brand);
create index if not exists idx_products_name_trgm on public.products using gin (name gin_trgm_ops);
create index if not exists idx_products_description_trgm on public.products using gin (description gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 3. Fashion gender subcategories (Fashion -> Men's / Women's)
--    parent_id points at the existing Fashion category. ON CONFLICT slug keeps
--    the INSERT re-runnable.
-- ----------------------------------------------------------------------------
insert into public.categories (name, slug, description, parent_id, icon, image_url)
values
  ('Men''s Fashion',   'fashion-mens',   'Men''s fashion products',   (select id from public.categories where slug = 'fashion'), null, null),
  ('Women''s Fashion', 'fashion-womens', 'Women''s fashion products', (select id from public.categories where slug = 'fashion'), null, null)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Backfill product_type (deterministic, by unique slug)
-- ----------------------------------------------------------------------------

-- Electronics
update public.products set product_type = 'smartphone'    where slug in ('iphone-16-pro', 'samsung-galaxy-s24-ultra', 'galaxy-s25-ultra', 'pixel-10', 'oneplus-14', 'xiaomi-16');
update public.products set product_type = 'laptop'        where slug in ('apple-macbook-pro-16', 'macbook-air-m4', 'dell-xps-14', 'thinkpad-x1-carbon', 'rog-zephyrus', 'hp-spectre-x360', 'surface-pro');
update public.products set product_type = 'tablet'        where slug in ('ipad-pro', 'galaxy-tab-s10');
update public.products set product_type = 'smartwatch'    where slug in ('apple-watch-series-11', 'galaxy-watch-ultra', 'pixel-watch-4', 'garmin-venu-4');
update public.products set product_type = 'headphones'    where slug in ('sony-wh-1000xm5', 'sony-wh1000xm6', 'airpods-pro-3', 'jbl-live-770nc', 'bose-qc-ultra');
update public.products set product_type = 'speaker'       where slug in ('jbl-flip-6', 'sonos-era-300', 'ue-boom');
update public.products set product_type = 'keyboard'      where slug in ('logitech-mx-keys', 'keychron-k8');
update public.products set product_type = 'mouse'         where slug in ('logitech-mx-master-3s', 'razer-deathadder');
update public.products set product_type = 'monitor'       where slug in ('lg-ultragear-27', 'dell-ultrasharp-27');
update public.products set product_type = 'gaming_console' where slug in ('ps5-slim', 'xbox-series-x');
update public.products set product_type = 'gaming_accessory' where slug = 'dualsense-controller';
update public.products set product_type = 'camera'        where slug in ('canon-eos-r8', 'sony-a7-iv');
update public.products set product_type = 'storage'       where slug in ('samsung-t7-ssd', 'sandisk-extreme');
update public.products set product_type = 'charger'       where slug in ('anker-powerbank', 'apple-magsafe-charger');

-- Fashion
update public.products set product_type = 'tshirt'        where slug in ('classic-cotton-tshirt', 'mens-casual-tshirt');
update public.products set product_type = 'hoodie'        where slug = 'premium-hoodie';
update public.products set product_type = 'dress'         where slug = 'ankara-dress';
update public.products set product_type = 'blouse'        where slug = 'womens-blouse';
update public.products set product_type = 'blazer'        where slug = 'womens-blazer';
update public.products set product_type = 'jacket'        where slug = 'mens-denim-jacket';
update public.products set product_type = 'trousers'      where slug = 'mens-chino-trousers';
update public.products set product_type = 'jeans'         where slug = 'womens-jeans';
update public.products set product_type = 'sneakers'      where slug in ('nike-air-max-270', 'mens-sneakers');
update public.products set product_type = 'heels'         where slug = 'womens-heels';
update public.products set product_type = 'formal_shoes'  where slug = 'mens-formal-shoes';
update public.products set product_type = 'sandals'       where slug = 'womens-sandals';
update public.products set product_type = 'handbag'       where slug = 'leather-handbag';

-- Books
update public.products set product_type = 'fiction'       where slug = 'novel-fiction';
update public.products set product_type = 'self_help'     where slug in ('atomic-habits', 'self-help-bestseller');
update public.products set product_type = 'education'     where slug = 'business-strategy-book';
update public.products set product_type = 'childrens_book' where slug = 'childrens-picture-book';

-- Home & Living
update public.products set product_type = 'furniture'     where slug in ('ikea-malm-desk', 'office-chair', 'study-desk');
update public.products set product_type = 'lighting'      where slug = 'table-lamp';
update public.products set product_type = 'organization'  where slug = 'bookshelf';

-- Sports
update public.products set product_type = 'football'      where slug in ('adidas-football', 'football-official');
update public.products set product_type = 'basketball'    where slug = 'basketball-official';
update public.products set product_type = 'yoga'          where slug = 'yoga-mat';
update public.products set product_type = 'fitness'       where slug = 'dumbbell-set';

-- Automotive
update public.products set product_type = 'car_accessory' where slug in ('car-dash-cam', 'car-vacuum', 'car-phone-mount', 'tire-inflator');

-- Toys
update public.products set product_type = 'rc_vehicle'     where slug = 'remote-control-car';
update public.products set product_type = 'building_blocks' where slug = 'building-blocks-set';
update public.products set product_type = 'plush_toy'      where slug = 'plush-teddy-bear';
update public.products set product_type = 'puzzle'         where slug = 'puzzle-game-set';

-- Beauty
update public.products set product_type = 'fragrance'      where slug in ('dior-sauvage', 'perfume-bottle');
update public.products set product_type = 'skincare'       where slug = 'skincare-set';
update public.products set product_type = 'makeup'         where slug = 'makeup-palette';

-- Local Handmade
update public.products set product_type = 'jewelry'        where slug = 'beaded-jewelry';
update public.products set product_type = 'craft'          where slug = 'wooden-carving';
update public.products set product_type = 'basket'         where slug = 'woven-basket';
update public.products set product_type = 'handmade_footwear' where slug = 'handmade-sandals';

-- Digital Products
update public.products set product_type = 'design_asset'   where slug = 'ui-kit-icon';
update public.products set product_type = 'ebook'          where slug = 'ebook-icon';
update public.products set product_type = 'online_course'  where slug = 'online-course-icon';

-- ----------------------------------------------------------------------------
-- 5. Backfill brand (only clearly identifiable from the product name)
-- ----------------------------------------------------------------------------
update public.products set brand = 'Apple'     where slug in ('apple-macbook-pro-16', 'iphone-16-pro', 'macbook-air-m4', 'ipad-pro', 'apple-watch-series-11', 'airpods-pro-3', 'apple-magsafe-charger');
update public.products set brand = 'Samsung'   where slug in ('samsung-galaxy-s24-ultra', 'galaxy-s25-ultra', 'galaxy-tab-s10', 'samsung-t7-ssd', 'galaxy-watch-ultra');
update public.products set brand = 'Sony'      where slug in ('sony-wh-1000xm5', 'sony-wh1000xm6', 'sony-a7-iv', 'ps5-slim', 'dualsense-controller');
update public.products set brand = 'Google'    where slug in ('pixel-10', 'pixel-watch-4');
update public.products set brand = 'Xiaomi'    where slug = 'xiaomi-16';
update public.products set brand = 'OnePlus'   where slug = 'oneplus-14';
update public.products set brand = 'Lenovo'    where slug = 'thinkpad-x1-carbon';
update public.products set brand = 'Dell'      where slug in ('dell-xps-14', 'dell-ultrasharp-27');
update public.products set brand = 'ASUS'      where slug = 'rog-zephyrus';
update public.products set brand = 'HP'        where slug = 'hp-spectre-x360';
update public.products set brand = 'Microsoft' where slug in ('surface-pro', 'xbox-series-x');
update public.products set brand = 'LG'        where slug = 'lg-ultragear-27';
update public.products set brand = 'Garmin'    where slug = 'garmin-venu-4';
update public.products set brand = 'Bose'      where slug = 'bose-qc-ultra';
update public.products set brand = 'JBL'       where slug in ('jbl-live-770nc', 'jbl-flip-6');
update public.products set brand = 'Sonos'     where slug = 'sonos-era-300';
update public.products set brand = 'Ultimate Ears' where slug = 'ue-boom';
update public.products set brand = 'Logitech'  where slug in ('logitech-mx-keys', 'logitech-mx-master-3s');
update public.products set brand = 'Razer'     where slug = 'razer-deathadder';
update public.products set brand = 'Keychron'  where slug = 'keychron-k8';
update public.products set brand = 'Anker'     where slug = 'anker-powerbank';
update public.products set brand = 'SanDisk'   where slug = 'sandisk-extreme';
update public.products set brand = 'Canon'     where slug = 'canon-eos-r8';
update public.products set brand = 'Nike'      where slug = 'nike-air-max-270';
update public.products set brand = 'Dior'      where slug = 'dior-sauvage';
update public.products set brand = 'IKEA'      where slug = 'ikea-malm-desk';
update public.products set brand = 'Adidas'    where slug = 'adidas-football';

-- ----------------------------------------------------------------------------
-- 6. Reassign clearly gender-specific Fashion products to the new subcategories.
--    Gender-neutral items (Nike Air Max 270, Leather Handbag, Premium Hoodie,
--    Classic Cotton T-Shirt) intentionally remain under Fashion.
-- ----------------------------------------------------------------------------
update public.products
set category_id = (select id from public.categories where slug = 'fashion-mens')
where slug in ('mens-sneakers', 'mens-chino-trousers', 'mens-casual-tshirt', 'mens-formal-shoes', 'mens-denim-jacket');

update public.products
set category_id = (select id from public.categories where slug = 'fashion-womens')
where slug in ('ankara-dress', 'womens-heels', 'womens-blouse', 'womens-jeans', 'womens-blazer', 'womens-sandals');

-- ============================================================================
-- End of migration
-- ============================================================================