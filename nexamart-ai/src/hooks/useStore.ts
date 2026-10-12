import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Product, Store } from '../types';

const STORAGE_URL = 'https://jsdynslcjnfdulzgvamj.supabase.co/storage/v1/object/public/product-images';
const PLACEHOLDER_IMAGE = 'https://placehold.co/400x400/1e293b/64748b?text=No+Image';

// Public store fields only. `vendors_select_policy` is `using (true)` and anon
// holds table-level SELECT (0033, which PostgREST's embeds require), so the
// field list is the safeguard against a future column reaching buyers.
const STORE_FIELDS = 'id, store_name, store_description, store_logo, store_cover, country, city, business_name, is_verified, created_at';

// Copied verbatim from useProducts.ts. The `vendor:` / `category:` aliases are
// load-bearing: the Product type declares singular keys, and PostgREST returns
// an embed under the name used in the select string. Dropping an alias here
// silently blanks the store name and category on every card.
const PRODUCT_SELECT = `
  *,
  vendor:vendors!inner (
    id,
    store_name,
    store_logo
  ),
  category:categories!inner (
    id,
    name,
    slug
  )
`;

function withAbsoluteImages(products: any[] | null): Product[] {
  return (products || []).map((product: any) => ({
    ...product,
    images:
      product.images && product.images.length > 0
        ? product.images.map((img: string) => (img.startsWith('http') ? img : `${STORAGE_URL}/${img}`))
        : [PLACEHOLDER_IMAGE],
  }));
}

export function useStore(id: string) {
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchStore() {
      if (!id) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setNotFound(false);

      try {
        const { data: storeRow, error: storeError } = await supabase
          .from('vendors')
          .select(STORE_FIELDS)
          .eq('id', id)
          .maybeSingle();

        if (storeError) throw storeError;

        if (cancelled) return;

        // A vendor with no row is a bad id. A vendor that exists but has no
        // live products still gets a page, just an empty product grid.
        if (!storeRow) {
          setNotFound(true);
          setStore(null);
          setProducts([]);
          return;
        }

        setStore(storeRow as Store);

        // Only active products. A pending vendor's storefront therefore shows
        // whatever is actually for sale, with the pending badge on the header.
        const { data: productRows, error: productError } = await supabase
          .from('products')
          .select(PRODUCT_SELECT)
          .eq('vendor_id', id)
          .eq('status', 'active')
          .eq('vendor.is_verified', true)
          .order('created_at', { ascending: false });

        if (productError) throw productError;

        if (cancelled) return;

        setProducts(withAbsoluteImages(productRows));
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load store');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStore();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return { store, products, loading, error, notFound };
}
