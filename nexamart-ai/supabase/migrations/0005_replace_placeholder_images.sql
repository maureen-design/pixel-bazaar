-- ============================================================================
-- NexaMart AI — 0005_replace_placeholder_images.sql
-- Phase 2A.2: Replace placehold.co placeholder images with verified real
-- Unsplash CDN URLs for the 8 products that still carried placeholders.
-- Additive only. Does NOT drop or delete anything. Does NOT touch schema or
-- any other product data (name, slug, colors, prices, stock, variants, etc.).
-- Idempotent via `images && array[...]` guards: re-running after success is a
-- no-op because the placeholder URL is no longer present in images.
-- ----------------------------------------------------------------------------
-- Source verification (2026-08-09):
--   Every replacement URL below was HTTP-verified live: 200 image/jpeg.
--   Sources are Unsplash CDN URLs (images.unsplash.com/photo-...) under the
--   Unsplash License.
-- ----------------------------------------------------------------------------
-- NOTE on atomic-habits:
--   No licensed Unsplash image of the actual (copyrighted) Atomic Habits book
--   cover exists. Per product-owner guidance we do NOT invent/scrape/substitute
--   an unlicensed reproduction of the cover. Instead we use a neutral generic
--   book image (stack of books) that is a properly licensed Unsplash asset.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Replace placeholders with verified Unsplash image URLs.
--    Guard: only update while the placeholder URL is still present, so this
--    migration is safe to re-run and never overwrites a later real image.
-- ----------------------------------------------------------------------------
update public.products
set images = array['https://images.unsplash.com/photo-1767187861728-942f561b7103?fm=jpg&q=60&w=800&fit=crop&ixlib=rb-4.1.0']
where slug = 'dior-sauvage'
  and images && array['https://placehold.co/400x400/1e293b/ffffff?text=Dior+Sauvage'];

update public.products
set images = array['https://images.unsplash.com/photo-1656259145847-81bcdac8f0f3?fm=jpg&q=60&w=800&fit=crop&ixlib=rb-4.1.0']
where slug = 'ikea-malm-desk'
  and images && array['https://placehold.co/400x400/1e293b/ffffff?text=MALM+Desk'];

update public.products
set images = array['https://images.unsplash.com/photo-1722105350593-0a95a3e81376?fm=jpg&q=60&w=800&fit=crop&ixlib=rb-4.1.0']
where slug = 'atomic-habits'
  and images && array['https://placehold.co/400x400/1e293b/ffffff?text=Atomic+Habits'];

update public.products
set images = array['https://images.unsplash.com/photo-1498049860654-af1a5c566876?fm=jpg&q=60&w=800&fit=crop&ixlib=rb-4.1.0']
where slug = 'apple-macbook-pro-16'
  and images && array['https://placehold.co/400x400/1e293b/ffffff?text=MacBook+Pro'];

update public.products
set images = array['https://images.unsplash.com/photo-1678911820864-e2c567c655d7?fm=jpg&q=60&w=800&fit=crop&ixlib=rb-4.1.0']
where slug = 'samsung-galaxy-s24-ultra'
  and images && array['https://placehold.co/400x400/1e293b/ffffff?text=S24+Ultra'];

update public.products
set images = array['https://images.unsplash.com/photo-1505740106531-4243f3831c78?fm=jpg&q=60&w=800&fit=crop&ixlib=rb-4.1.0']
where slug = 'sony-wh-1000xm5'
  and images && array['https://placehold.co/400x400/1e293b/ffffff?text=WH-1000XM5'];

update public.products
set images = array['https://images.unsplash.com/photo-1626379616459-b2ce1d9decbc?fm=jpg&q=60&w=800&fit=crop&ixlib=rb-4.1.0']
where slug = 'nike-air-max-270'
  and images && array['https://placehold.co/400x400/1e293b/ffffff?text=Air+Max+270'];

update public.products
set images = array['https://images.unsplash.com/photo-1614632537197-38a17061c2bd?fm=jpg&q=60&w=800&fit=crop&ixlib=rb-4.1.0']
where slug = 'adidas-football'
  and images && array['https://placehold.co/400x400/1e293b/ffffff?text=Adidas+Football'];

-- ============================================================================
-- End of migration
-- ============================================================================
