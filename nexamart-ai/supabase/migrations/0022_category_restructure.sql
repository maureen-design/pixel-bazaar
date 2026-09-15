-- ============================================================================
-- NexaMart AI - 0022_category_restructure.sql
-- Add Shoes as top-level category; document existing base categories.
--
-- The 10 base categories were inserted directly into the live database
-- without a migration. This migration:
--   1) Seeds them idempotently (ON CONFLICT DO NOTHING)
--   2) Adds "Shoes" as a new top-level category
--   3) Adds icon mappings for fashion-mens / fashion-womens
--
-- Additive only; safe to re-run.
-- ============================================================================

-- Seed the 10 base categories (idempotent)
insert into public.categories (name, slug, description, icon, parent_id, image_url)
values
  ('Electronics',      'electronics',      'Phones, gadgets, and tech',           'smartphone', null, null),
  ('Fashion',          'fashion',          'Clothing, shoes, and accessories',    'shirt',      null, null),
  ('Home & Living',    'home-living',      'Furniture, decor, and household',     'sofa',       null, null),
  ('Books',            'books',            'Books, stationery, and reading',      'book-open',  null, null),
  ('Beauty',           'beauty',           'Skincare, makeup, and wellness',      'sparkles',   null, null),
  ('Sports & Fitness', 'sports',           'Sports gear and fitness equipment',   'dumbbell',   null, null),
  ('Toys',             'toys',             'Toys and games',                      'toy-brick',  null, null),
  ('Automotive',       'automotive',       'Car parts and accessories',           'car',        null, null),
  ('Digital Products', 'digital-products', 'Software, courses, and digital goods','cpu',        null, null),
  ('Local Handmade',   'local-handmade',   'Handcrafted and artisan products',    'hammer',     null, null)
on conflict (slug) do nothing;

-- Add Shoes as a new top-level category
insert into public.categories (name, slug, description, icon, parent_id, image_url)
values
  ('Shoes', 'shoes', 'Sneakers, heels, sandals, and footwear', 'shopping-bag', null, null)
on conflict (slug) do nothing;

-- Ensure fashion subcategories have icons (they may have been created without one)
update public.categories
set icon = 'shirt'
where slug in ('fashion-mens', 'fashion-womens') and (icon is null or icon = '');

-- ============================================================================
-- End of migration
-- ============================================================================
