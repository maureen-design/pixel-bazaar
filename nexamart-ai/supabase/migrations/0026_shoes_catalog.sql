-- Migration: Complete Shoes Category — reassign existing + add new products + variants
-- Step 2: Reassign existing footwear to Shoes category
-- Steps 3-6: Add new shoe products with variety, images, variants

-- ============================================================================
-- STEP 2: Reassign existing 6 shoe products to Shoes category
-- ============================================================================

UPDATE public.products SET category_id = '009fcce6-8084-4545-a2a1-38ea80750618'
WHERE id = '9780bb80-f7f3-4a3a-ba65-ac08136705a7'; -- Handmade Leather Sandals

UPDATE public.products SET category_id = '009fcce6-8084-4545-a2a1-38ea80750618'
WHERE id = 'a235c663-1583-4bce-af6a-68d460594c25'; -- Men's Formal Leather Shoes

UPDATE public.products SET category_id = '009fcce6-8084-4545-a2a1-38ea80750618'
WHERE id = '48a81f3b-2569-40f9-b8c6-49086d4d12b0'; -- Men's Sneakers

UPDATE public.products SET category_id = '009fcce6-8084-4545-a2a1-38ea80750618'
WHERE id = 'b4141732-1f52-42f5-8e0b-08ae7d2c81d7'; -- Nike Air Max 270

UPDATE public.products SET category_id = '009fcce6-8084-4545-a2a1-38ea80750618'
WHERE id = 'e42379d2-490e-4165-9060-29a2572661c9'; -- Women's Casual Sandals

UPDATE public.products SET category_id = '009fcce6-8084-4545-a2a1-38ea80750618'
WHERE id = '2b50ccef-30bd-4bc8-b655-d83c3a632adf'; -- Women's Heels

-- ============================================================================
-- STEP 3-6: Add new shoe products
-- Vendor IDs:
--   dff21d64-bbd2-4a84-a712-7d295508a2e7 = TechWorld Kenya
--   8f16cb5c-067d-4f3a-82a3-04398321c11f = Nairobi Living Co.
--   734a7e21-d3f3-4dab-9bdb-512b26372a70 = Zawadi Crafts
-- Shoes category: 009fcce6-8084-4545-a2a1-38ea80750618
-- ============================================================================

-- --- SNEAKERS (3 new) ---

INSERT INTO public.products (id, vendor_id, category_id, name, slug, description, price, compare_price, stock_quantity, images, status, rating, product_type, brand, variants)
VALUES (
  'a1000001-0000-0000-0000-000000000001',
  'dff21d64-bbd2-4a84-a712-7d295508a2e7',
  '009fcce6-8084-4545-a2a1-38ea80750618',
  'Adidas Ultraboost 22',
  'adidas-ultraboost-22',
  'Premium running sneakers with responsive Boost cushioning and Primeknit upper. Designed for comfort and performance with a sleek modern silhouette.',
  12000.00,
  14000.00,
  35,
  ARRAY['https://images.unsplash.com/photo-1608231387042-66d1773070a5?fm=jpg&q=60&w=800&fit=crop', 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?fm=jpg&q=60&w=800&fit=crop'],
  'active',
  4.70,
  'sneakers',
  'Adidas',
  '{"options":[{"label":"Color","name":"color","values":["Black","White","Grey"]},{"label":"Size","name":"size","values":["40","41","42","43","44"]}],"combinations":[{"id":"adb-blk-40","attributes":{"color":"Black","size":"40"},"price":12000,"stock":8},{"id":"adb-blk-41","attributes":{"color":"Black","size":"41"},"price":12000,"stock":10},{"id":"adb-blk-42","attributes":{"color":"Black","size":"42"},"price":12000,"stock":7},{"id":"adb-blk-43","attributes":{"color":"Black","size":"43"},"price":12000,"stock":5},{"id":"adb-blk-44","attributes":{"color":"Black","size":"44"},"price":12000,"stock":5},{"id":"adb-wht-40","attributes":{"color":"White","size":"40"},"price":12000,"stock":6},{"id":"adb-wht-41","attributes":{"color":"White","size":"41"},"price":12000,"stock":8},{"id":"adb-wht-42","attributes":{"color":"White","size":"42"},"price":12000,"stock":5},{"id":"adb-wht-43","attributes":{"color":"White","size":"43"},"price":12000,"stock":4},{"id":"adb-wht-44","attributes":{"color":"White","size":"44"},"price":12000,"stock":3},{"id":"adb-gry-40","attributes":{"color":"Grey","size":"40"},"price":12000,"stock":5},{"id":"adb-gry-41","attributes":{"color":"Grey","size":"41"},"price":12000,"stock":6},{"id":"adb-gry-42","attributes":{"color":"Grey","size":"42"},"price":12000,"stock":4},{"id":"adb-gry-43","attributes":{"color":"Grey","size":"43"},"price":12000,"stock":3},{"id":"adb-gry-44","attributes":{"color":"Grey","size":"44"},"price":12000,"stock":2}]}'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products (id, vendor_id, category_id, name, slug, description, price, compare_price, stock_quantity, images, status, rating, product_type, brand, variants)
VALUES (
  'a1000001-0000-0000-0000-000000000002',
  '8f16cb5c-067d-4f3a-82a3-04398321c11f',
  '009fcce6-8084-4545-a2a1-38ea80750618',
  'Puma RS-X Reinvention',
  'puma-rsx-reinvention',
  'Retro-inspired sneakers with bold colorblocking and RS foam cushioning. A chunky silhouette that combines vintage aesthetics with modern comfort technology.',
  8500.00,
  NULL,
  28,
  ARRAY['https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?fm=jpg&q=60&w=800&fit=crop', 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?fm=jpg&q=60&w=800&fit=crop'],
  'active',
  4.40,
  'sneakers',
  'Puma',
  '{}'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products (id, vendor_id, category_id, name, slug, description, price, compare_price, stock_quantity, images, status, rating, product_type, brand, variants)
VALUES (
  'a1000001-0000-0000-0000-000000000003',
  '8f16cb5c-067d-4f3a-82a3-04398321c11f',
  '009fcce6-8084-4545-a2a1-38ea80750618',
  'New Balance 574 Classic',
  'new-balance-574-classic',
  'The iconic 574 silhouette with ENCAP midsole cushioning and suede/mesh upper. A timeless casual sneaker that pairs well with any outfit.',
  9500.00,
  11000.00,
  32,
  ARRAY['https://images.unsplash.com/photo-1539185441755-769473a23570?fm=jpg&q=60&w=800&fit=crop', 'https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?fm=jpg&q=60&w=800&fit=crop'],
  'active',
  4.50,
  'sneakers',
  'New Balance',
  '{}'
)
ON CONFLICT (slug) DO NOTHING;

-- --- FORMAL SHOES (1 new) ---

INSERT INTO public.products (id, vendor_id, category_id, name, slug, description, price, compare_price, stock_quantity, images, status, rating, product_type, brand, variants)
VALUES (
  'a1000001-0000-0000-0000-000000000004',
  '8f16cb5c-067d-4f3a-82a3-04398321c11f',
  '009fcce6-8084-4545-a2a1-38ea80750618',
  'Derby Oxford Dress Shoes',
  'derby-oxford-dress-shoes',
  'Handcrafted leather derby shoes with Goodyear welt construction. Features a classic cap-toe design and premium leather sole for the modern gentleman.',
  7500.00,
  NULL,
  20,
  ARRAY['https://images.unsplash.com/photo-1614252369475-531eba835eb1?fm=jpg&q=60&w=800&fit=crop', 'https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?fm=jpg&q=60&w=800&fit=crop'],
  'active',
  4.60,
  'formal_shoes',
  NULL,
  '{"options":[{"label":"Size","name":"size","values":["40","41","42","43","44"]}],"combinations":[{"id":"derby-40","attributes":{"size":"40"},"price":7500,"stock":4},{"id":"derby-41","attributes":{"size":"41"},"price":7500,"stock":5},{"id":"derby-42","attributes":{"size":"42"},"price":7500,"stock":4},{"id":"derby-43","attributes":{"size":"43"},"price":7500,"stock":4},{"id":"derby-44","attributes":{"size":"44"},"price":7500,"stock":3}]}'
)
ON CONFLICT (slug) DO NOTHING;

-- --- SANDALS (1 new) ---

INSERT INTO public.products (id, vendor_id, category_id, name, slug, description, price, compare_price, stock_quantity, images, status, rating, product_type, brand, variants)
VALUES (
  'a1000001-0000-0000-0000-000000000005',
  '734a7e21-d3f3-4dab-9bdb-512b26372a70',
  '009fcce6-8084-4545-a2a1-38ea80750618',
  'Platform Woven Sandals',
  'platform-woven-sandals',
  'Handwoven leather platform sandals with cushioned footbed. Artisan-crafted with natural materials for breathability and all-day comfort.',
  4500.00,
  NULL,
  15,
  ARRAY['https://images.unsplash.com/photo-1603487742131-4160ec999306?fm=jpg&q=60&w=800&fit=crop', 'https://images.unsplash.com/photo-1605733160314-4fc7dac4bb16?fm=jpg&q=60&w=800&fit=crop'],
  'active',
  4.30,
  'sandals',
  NULL,
  '{}'
)
ON CONFLICT (slug) DO NOTHING;

-- --- HEELS (1 new) ---

INSERT INTO public.products (id, vendor_id, category_id, name, slug, description, price, compare_price, stock_quantity, images, status, rating, product_type, brand, variants)
VALUES (
  'a1000001-0000-0000-0000-000000000006',
  '8f16cb5c-067d-4f3a-82a3-04398321c11f',
  '009fcce6-8084-4545-a2a1-38ea80750618',
  'Stiletto Pointed-Toe Heels',
  'stiletto-pointed-toe-heels',
  'Elegant stiletto heels with pointed-toe silhouette and slim 4-inch heel. Premium faux leather upper with cushioned insole for extended wear.',
  6200.00,
  7500.00,
  25,
  ARRAY['https://images.unsplash.com/photo-1543163521-1bf539c55dd2?fm=jpg&q=60&w=800&fit=crop', 'https://images.unsplash.com/photo-1560343090-f0409e92791a?fm=jpg&q=60&w=800&fit=crop'],
  'active',
  4.20,
  'heels',
  NULL,
  '{"options":[{"label":"Color","name":"color","values":["Black","Nude","Red"]},{"label":"Size","name":"size","values":["36","37","38","39","40"]}],"combinations":[{"id":"stl-blk-36","attributes":{"color":"Black","size":"36"},"price":6200,"stock":5},{"id":"stl-blk-37","attributes":{"color":"Black","size":"37"},"price":6200,"stock":6},{"id":"stl-blk-38","attributes":{"color":"Black","size":"38"},"price":6200,"stock":5},{"id":"stl-blk-39","attributes":{"color":"Black","size":"39"},"price":6200,"stock":4},{"id":"stl-blk-40","attributes":{"color":"Black","size":"40"},"price":6200,"stock":3},{"id":"stl-nd-36","attributes":{"color":"Nude","size":"36"},"price":6200,"stock":4},{"id":"stl-nd-37","attributes":{"color":"Nude","size":"37"},"price":6200,"stock":5},{"id":"stl-nd-38","attributes":{"color":"Nude","size":"38"},"price":6200,"stock":4},{"id":"stl-nd-39","attributes":{"color":"Nude","size":"39"},"price":6200,"stock":3},{"id":"stl-nd-40","attributes":{"color":"Nude","size":"40"},"price":6200,"stock":2},{"id":"stl-red-36","attributes":{"color":"Red","size":"36"},"price":6200,"stock":3},{"id":"stl-red-37","attributes":{"color":"Red","size":"37"},"price":6200,"stock":4},{"id":"stl-red-38","attributes":{"color":"Red","size":"38"},"price":6200,"stock":3},{"id":"stl-red-39","attributes":{"color":"Red","size":"39"},"price":6200,"stock":2},{"id":"stl-red-40","attributes":{"color":"Red","size":"40"},"price":6200,"stock":2}]}'
)
ON CONFLICT (slug) DO NOTHING;

-- --- BOOTS (2 new) ---

INSERT INTO public.products (id, vendor_id, category_id, name, slug, description, price, compare_price, stock_quantity, images, status, rating, product_type, brand, variants)
VALUES (
  'a1000001-0000-0000-0000-000000000007',
  '8f16cb5c-067d-4f3a-82a3-04398321c11f',
  '009fcce6-8084-4545-a2a1-38ea80750618',
  'Chelsea Ankle Boots',
  'chelsea-ankle-boots',
  'Classic Chelsea boots with elastic side panels and pull tab. Full-grain leather upper with durable rubber sole. Versatile enough for casual and semi-formal occasions.',
  8500.00,
  NULL,
  22,
  ARRAY['https://images.unsplash.com/photo-1638247025967-b4e38f787b76?fm=jpg&q=60&w=800&fit=crop', 'https://images.unsplash.com/photo-1605812860327-8b4e930ccb9e?fm=jpg&q=60&w=800&fit=crop'],
  'active',
  4.60,
  'boots',
  NULL,
  '{"options":[{"label":"Color","name":"color","values":["Black","Brown"]},{"label":"Size","name":"size","values":["40","41","42","43","44"]}],"combinations":[{"id":"chls-blk-40","attributes":{"color":"Black","size":"40"},"price":8500,"stock":5},{"id":"chls-blk-41","attributes":{"color":"Black","size":"41"},"price":8500,"stock":5},{"id":"chls-blk-42","attributes":{"color":"Black","size":"42"},"price":8500,"stock":4},{"id":"chls-blk-43","attributes":{"color":"Black","size":"43"},"price":8500,"stock":3},{"id":"chls-blk-44","attributes":{"color":"Black","size":"44"},"price":8500,"stock":3},{"id":"chls-brn-40","attributes":{"color":"Brown","size":"40"},"price":8500,"stock":4},{"id":"chls-brn-41","attributes":{"color":"Brown","size":"41"},"price":8500,"stock":4},{"id":"chls-brn-42","attributes":{"color":"Brown","size":"42"},"price":8500,"stock":3},{"id":"chls-brn-43","attributes":{"color":"Brown","size":"43"},"price":8500,"stock":3},{"id":"chls-brn-44","attributes":{"color":"Brown","size":"44"},"price":8500,"stock":2}]}'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products (id, vendor_id, category_id, name, slug, description, price, compare_price, stock_quantity, images, status, rating, product_type, brand, variants)
VALUES (
  'a1000001-0000-0000-0000-000000000008',
  'dff21d64-bbd2-4a84-a712-7d295508a2e7',
  '009fcce6-8084-4545-a2a1-38ea80750618',
  'Combat Lace-Up Boots',
  'combat-lace-up-boots',
  'Rugged combat boots with lace-up front and padded collar. Water-resistant leather upper with thick rubber sole. Built for durability and style.',
  9200.00,
  10500.00,
  18,
  ARRAY['https://images.unsplash.com/photo-1608256246200-53e635b5b65f?fm=jpg&q=60&w=800&fit=crop', 'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?fm=jpg&q=60&w=800&fit=crop'],
  'active',
  4.40,
  'boots',
  NULL,
  '{}'
)
ON CONFLICT (slug) DO NOTHING;

-- --- LOAFERS (2 new) ---

INSERT INTO public.products (id, vendor_id, category_id, name, slug, description, price, compare_price, stock_quantity, images, status, rating, product_type, brand, variants)
VALUES (
  'a1000001-0000-0000-0000-000000000009',
  '8f16cb5c-067d-4f3a-82a3-04398321c11f',
  '009fcce6-8084-4545-a2a1-38ea80750618',
  'Classic Penny Loafers',
  'classic-penny-loafers',
  'Timeless penny loafer design in smooth leather with hand-stitched moc toe. Leather lining and cushioned insole for all-day comfort. Slip-on convenience meets refined style.',
  6800.00,
  NULL,
  24,
  ARRAY['https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?fm=jpg&q=60&w=800&fit=crop', 'https://images.unsplash.com/photo-1614252369475-531eba835eb1?fm=jpg&q=60&w=800&fit=crop'],
  'active',
  4.50,
  'loafers',
  NULL,
  '{}'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products (id, vendor_id, category_id, name, slug, description, price, compare_price, stock_quantity, images, status, rating, product_type, brand, variants)
VALUES (
  'a1000001-0000-0000-0000-000000000010',
  'dff21d64-bbd2-4a84-a712-7d295508a2e7',
  '009fcce6-8084-4545-a2a1-38ea80750618',
  'Suede Tassel Loafers',
  'suede-tassel-loafers',
  'Premium suede tassel loafers with hand-sewn tassels and leather sole. A sophisticated slip-on that transitions seamlessly from office to evening.',
  7200.00,
  8500.00,
  16,
  ARRAY['https://images.unsplash.com/photo-1605733160314-4fc7dac4bb16?fm=jpg&q=60&w=800&fit=crop', 'https://images.unsplash.com/photo-1603487742131-4160ec999306?fm=jpg&q=60&w=800&fit=crop'],
  'active',
  4.30,
  'loafers',
  NULL,
  '{}'
)
ON CONFLICT (slug) DO NOTHING;

-- --- SPORTS/RUNNING (2 new) ---

INSERT INTO public.products (id, vendor_id, category_id, name, slug, description, price, compare_price, stock_quantity, images, status, rating, product_type, brand, variants)
VALUES (
  'a1000001-0000-0000-0000-000000000011',
  'dff21d64-bbd2-4a84-a712-7d295508a2e7',
  '009fcce6-8084-4545-a2a1-38ea80750618',
  'Nike Air Zoom Pegasus 40',
  'nike-air-zoom-pegasus-40',
  'Responsive running shoes with Zoom Air unit and breathable mesh upper. Flywire cables integrate with laces for a secure, adaptive fit. Ideal for daily training runs.',
  11000.00,
  13000.00,
  30,
  ARRAY['https://images.unsplash.com/photo-1542291026-7eec264c27ff?fm=jpg&q=60&w=800&fit=crop', 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?fm=jpg&q=60&w=800&fit=crop'],
  'active',
  4.80,
  'sneakers',
  'Nike',
  '{"options":[{"label":"Color","name":"color","values":["Black","Blue","White"]},{"label":"Size","name":"size","values":["40","41","42","43","44"]}],"combinations":[{"id":"peg-blk-40","attributes":{"color":"Black","size":"40"},"price":11000,"stock":7},{"id":"peg-blk-41","attributes":{"color":"Black","size":"41"},"price":11000,"stock":8},{"id":"peg-blk-42","attributes":{"color":"Black","size":"42"},"price":11000,"stock":6},{"id":"peg-blk-43","attributes":{"color":"Black","size":"43"},"price":11000,"stock":5},{"id":"peg-blk-44","attributes":{"color":"Black","size":"44"},"price":11000,"stock":4},{"id":"peg-blu-40","attributes":{"color":"Blue","size":"40"},"price":11000,"stock":5},{"id":"peg-blu-41","attributes":{"color":"Blue","size":"41"},"price":11000,"stock":6},{"id":"peg-blu-42","attributes":{"color":"Blue","size":"42"},"price":11000,"stock":5},{"id":"peg-blu-43","attributes":{"color":"Blue","size":"43"},"price":11000,"stock":4},{"id":"peg-blu-44","attributes":{"color":"Blue","size":"44"},"price":11000,"stock":3},{"id":"peg-wht-40","attributes":{"color":"White","size":"40"},"price":11000,"stock":4},{"id":"peg-wht-41","attributes":{"color":"White","size":"41"},"price":11000,"stock":5},{"id":"peg-wht-42","attributes":{"color":"White","size":"42"},"price":11000,"stock":4},{"id":"peg-wht-43","attributes":{"color":"White","size":"43"},"price":11000,"stock":3},{"id":"peg-wht-44","attributes":{"color":"White","size":"44"},"price":11000,"stock":3}]}'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products (id, vendor_id, category_id, name, slug, description, price, compare_price, stock_quantity, images, status, rating, product_type, brand, variants)
VALUES (
  'a1000001-0000-0000-0000-000000000012',
  '8f16cb5c-067d-4f3a-82a3-04398321c11f',
  '009fcce6-8084-4545-a2a1-38ea80750618',
  'Under Armour HOVR Phantom',
  'under-armour-hovr-phantom',
  'Zero-gravity feel with UA HOVR cushioning that returns energy. Connected fitness via MapMyRun. Breathable knit upper with molded heel for locked-in support.',
  10500.00,
  NULL,
  26,
  ARRAY['https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?fm=jpg&q=60&w=800&fit=crop', 'https://images.unsplash.com/photo-1539185441755-769473a23570?fm=jpg&q=60&w=800&fit=crop'],
  'active',
  4.60,
  'sneakers',
  'Under Armour',
  '{}'
)
ON CONFLICT (slug) DO NOTHING;

-- --- CASUAL (2 new) ---

INSERT INTO public.products (id, vendor_id, category_id, name, slug, description, price, compare_price, stock_quantity, images, status, rating, product_type, brand, variants)
VALUES (
  'a1000001-0000-0000-0000-000000000013',
  '8f16cb5c-067d-4f3a-82a3-04398321c11f',
  '009fcce6-8084-4545-a2a1-38ea80750618',
  'Canvas Slip-On Sneakers',
  'canvas-slip-on-sneakers',
  'Lightweight canvas slip-ons with elastic side panels and memory foam insole. Perfect for quick outings and casual weekends. Easy on, easy off.',
  3500.00,
  NULL,
  40,
  ARRAY['https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?fm=jpg&q=60&w=800&fit=crop', 'https://images.unsplash.com/photo-1560769629-975ec94e6a86?fm=jpg&q=60&w=800&fit=crop'],
  'active',
  4.10,
  'sneakers',
  NULL,
  '{}'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products (id, vendor_id, category_id, name, slug, description, price, compare_price, stock_quantity, images, status, rating, product_type, brand, variants)
VALUES (
  'a1000001-0000-0000-0000-000000000014',
  '734a7e21-d3f3-4dab-9bdb-512b26372a70',
  '009fcce6-8084-4545-a2a1-38ea80750618',
  'Handwoven Espadrille Flats',
  'handwoven-espadrille-flats',
  'Traditional handwoven espadrilles with jute sole and cotton canvas upper. Lightweight and breathable, perfect for warm weather. Artisan-made with natural fibers.',
  3800.00,
  NULL,
  12,
  ARRAY['https://images.unsplash.com/photo-1605733160314-4fc7dac4bb16?fm=jpg&q=60&w=800&fit=crop', 'https://images.unsplash.com/photo-1603487742131-4160ec999306?fm=jpg&q=60&w=800&fit=crop'],
  'active',
  4.20,
  'sandals',
  NULL,
  '{}'
)
ON CONFLICT (slug) DO NOTHING;
