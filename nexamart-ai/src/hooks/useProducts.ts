import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Product } from '../types';

const STORAGE_URL = 'https://jsdynslcjnfdulzgvamj.supabase.co/storage/v1/object/public/product-images';
const PLACEHOLDER_IMAGE = 'https://placehold.co/400x400/1e293b/64748b?text=No+Image';

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProducts() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select(`
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
          `)
          .eq('status', 'active')
          .eq('vendor.is_verified', true)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const productsWithImages = (data || []).map((product: any) => ({
          ...product,
          images: product.images && product.images.length > 0 
            ? product.images.map((img: string) => img.startsWith('http') ? img : `${STORAGE_URL}/${img}`)
            : [PLACEHOLDER_IMAGE]
        }));

        setProducts(productsWithImages);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, []);

  return { products, loading, error };
}

export type SortOption = 'rating' | 'price_asc' | 'price_desc' | 'newest';

export function useFeaturedProducts(categoryId?: string | null, page: number = 1, limit: number = 12, sortBy: SortOption = 'rating') {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    async function fetchFeatured() {
      setLoading(true);
      try {
        let query = supabase
          .from('products')
          .select(`
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
          `, { count: 'exact' })
          .eq('status', 'active')
          .eq('vendor.is_verified', true);

        if (categoryId) {
          query = query.eq('category_id', categoryId);
        }

        // Apply sorting
        switch (sortBy) {
          case 'price_asc':
            query = query.order('price', { ascending: true });
            break;
          case 'price_desc':
            query = query.order('price', { ascending: false });
            break;
          case 'newest':
            query = query.order('created_at', { ascending: false });
            break;
          case 'rating':
          default:
            query = query.order('rating', { ascending: false });
            break;
        }

        const offset = (page - 1) * limit;
        const { data, error, count } = await query.range(offset, offset + limit - 1);

        if (error) throw error;

        const productsWithImages = (data || []).map((product: any) => ({
          ...product,
          images: product.images && product.images.length > 0 
            ? product.images.map((img: string) => img.startsWith('http') ? img : `${STORAGE_URL}/${img}`)
            : [PLACEHOLDER_IMAGE]
        }));

        setProducts(productsWithImages);
        setTotalCount(count || 0);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchFeatured();
  }, [categoryId, page, limit, sortBy]);

  return { products, loading, error, totalCount };
}

export function useNewArrivals(categoryId?: string | null, page: number = 1, limit: number = 12) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    async function fetchNewArrivals() {
      setLoading(true);
      try {
        let query = supabase
          .from('products')
          .select(`
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
          `, { count: 'exact' })
          .eq('status', 'active')
          .eq('vendor.is_verified', true);

        if (categoryId) {
          query = query.eq('category_id', categoryId);
        }

        const offset = (page - 1) * limit;
        const { data, error, count } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        const productsWithImages = (data || []).map((product: any) => ({
          ...product,
          images: product.images && product.images.length > 0 
            ? product.images.map((img: string) => img.startsWith('http') ? img : `${STORAGE_URL}/${img}`)
            : [PLACEHOLDER_IMAGE]
        }));

        setProducts(productsWithImages);
        setTotalCount(count || 0);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchNewArrivals();
  }, [categoryId, page, limit]);

  return { products, loading, error, totalCount };
}

export function useProduct(id: string) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProduct() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select(`
            *,
            vendor:vendors!inner (
              id,
              store_name,
              store_logo,
              country,
              is_verified
            ),
            category:categories!inner (
              id,
              name,
              slug
            )
          `)
          .eq('id', id)
          .eq('vendor.is_verified', true)
          .single();

        if (error) throw error;

        const productWithImages = data ? {
          ...data,
          images: data.images && data.images.length > 0
            ? data.images.map((img: string) => img.startsWith('http') ? img : `${STORAGE_URL}/${img}`)
            : [PLACEHOLDER_IMAGE]
        } : null;

        setProduct(productWithImages);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchProduct();
    }
  }, [id]);

  return { product, loading, error };
}

const mapProductImages = (product: any) => ({
  ...product,
  images: product.images && product.images.length > 0
    ? product.images.map((img: string) => img.startsWith('http') ? img : `${STORAGE_URL}/${img}`)
    : [PLACEHOLDER_IMAGE],
});

export function useCompareProducts(searchTerm: string, selectedIds: string[], limit = 10) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedIdsKey = selectedIds.join(',');

  useEffect(() => {
    let cancelled = false;

    async function fetchResults() {
      setLoading(true);
      setError(null);
      try {
        const term = searchTerm.trim();

        const baseSelect = `
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

        let query = supabase
          .from('products')
          .select(baseSelect)
          .eq('status', 'active')
          .eq('vendor.is_verified', true);

        if (term) {
          query = query.ilike('name', `%${term}%`);
        }
        query = query.limit(limit);

        const { data, error: queryError } = await query;
        if (queryError) throw queryError;

        const results = (data || []).map(mapProductImages);

        const selectedProducts: Product[] = [];
        if (!term && selectedIds.length > 0) {
          const { data: byIds, error: idError } = await supabase
            .from('products')
            .select(baseSelect)
            .in('id', selectedIds)
            .eq('status', 'active')
            .eq('vendor.is_verified', true);
          if (idError) throw idError;
          selectedProducts.push(...(byIds || []).map(mapProductImages));
        }

        const seen = new Set<string>();
        const merged = [...selectedProducts, ...results].filter((p: Product) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });

        if (!cancelled) setProducts(merged);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchResults();
    return () => {
      cancelled = true;
    };
  }, [searchTerm, selectedIdsKey, limit]);

  return { products, loading, error };
}

export function usePopularPicks(limit = 8) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchPicks() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select(`
            *,
            vendor:vendors!inner (id, store_name, store_logo, country),
            category:categories!inner (id, name, slug)
          `)
          .eq('status', 'active')
          .eq('vendor.is_verified', true)
          .gt('rating', 0)
          .order('rating', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;

        if (!cancelled) {
          setProducts(
            (data || []).map((product: any) => ({
              ...product,
              images: product.images && product.images.length > 0
                ? product.images.map((img: string) =>
                    img.startsWith('http') ? img : `${STORAGE_URL}/${img}`
                  )
                : [PLACEHOLDER_IMAGE],
            }))
          );
        }
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPicks();
    return () => { cancelled = true; };
  }, [limit]);

  return { products, loading };
}
