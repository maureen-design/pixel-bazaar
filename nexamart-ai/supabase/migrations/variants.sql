-- Product Variants Migration
-- Run this in Supabase SQL Editor

-- Add variants column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '{}'::jsonb;

-- Add variant columns to cart_items table
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS variant_id TEXT;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS variant_attributes JSONB;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS variant_price NUMERIC(10,2);

-- Add variant columns to order_items table
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_attributes JSONB;

-- Add index for variant lookups
CREATE INDEX IF NOT EXISTS idx_cart_items_variant ON cart_items (variant_id);

-- Seed sample products with variants
-- Classic Cotton T-Shirt
INSERT INTO products (id, vendor_id, category_id, name, slug, description, price, stock_quantity, images, status, rating, variants)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM vendors LIMIT 1),
  (SELECT id FROM categories WHERE slug = 'fashion'),
  'Classic Cotton T-Shirt',
  'classic-cotton-tshirt',
  'Premium cotton t-shirt available in multiple colors and sizes.',
  49.99,
  0,
  ARRAY['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab'],
  'active',
  4.5,
  '{
    "options": [
      { "label": "Color", "name": "color", "values": ["Black", "White", "Navy", "Red"] },
      { "label": "Size", "name": "size", "values": ["S", "M", "L", "XL"] }
    ],
    "combinations": [
      { "id": "blk-m", "attributes": { "color": "Black", "size": "M" }, "price": 49.99, "stock": 10 },
      { "id": "blk-l", "attributes": { "color": "Black", "size": "L" }, "price": 49.99, "stock": 5 },
      { "id": "wht-m", "attributes": { "color": "White", "size": "M" }, "price": 49.99, "stock": 8 },
      { "id": "navy-m", "attributes": { "color": "Navy", "size": "M" }, "price": 54.99, "stock": 6 },
      { "id": "red-m", "attributes": { "color": "Red", "size": "M" }, "price": 49.99, "stock": 0 }
    ]
  }'::jsonb
) ON CONFLICT DO NOTHING;

-- Hoodie with variants
INSERT INTO products (id, vendor_id, category_id, name, slug, description, price, stock_quantity, images, status, rating, variants)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM vendors LIMIT 1),
  (SELECT id FROM categories WHERE slug = 'fashion'),
  'Premium Hoodie',
  'premium-hoodie',
  'Comfortable premium hoodie in multiple colors and sizes.',
  79.99,
  0,
  ARRAY['https://images.unsplash.com/photo-1556821840-3a63f95609a7'],
  'active',
  4.7,
  '{
    "options": [
      { "label": "Color", "name": "color", "values": ["Black", "Grey", "Olive"] },
      { "label": "Size", "name": "size", "values": ["M", "L", "XL"] }
    ],
    "combinations": [
      { "id": "blk-l", "attributes": { "color": "Black", "size": "L" }, "price": 79.99, "stock": 7 },
      { "id": "blk-xl", "attributes": { "color": "Black", "size": "XL" }, "price": 79.99, "stock": 4 },
      { "id": "gry-l", "attributes": { "color": "Grey", "size": "L" }, "price": 84.99, "stock": 3 },
      { "id": "olv-m", "attributes": { "color": "Olive", "size": "M" }, "price": 79.99, "stock": 6 }
    ]
  }'::jsonb
) ON CONFLICT DO NOTHING;
