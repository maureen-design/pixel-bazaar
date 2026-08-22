import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Product } from '../types';

const STORAGE_URL = 'https://jsdynslcjnfdulzgvamj.supabase.co/storage/v1/object/public/product-images';
const PLACEHOLDER_IMAGE = 'https://placehold.co/400x400/1e293b/64748b?text=No+Image';

export function useCategoryCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCounts() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('category_id')
          .eq('status', 'active');

        if (error) throw error;

        const countMap: Record<string, number> = {};
        (data || []).forEach((p) => {
          countMap[p.category_id] = (countMap[p.category_id] || 0) + 1;
        });

        setCounts(countMap);
      } catch (err) {
        console.error('Error fetching category counts:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchCounts();
  }, []);

  return { counts, loading };
}

export function useCategoryFilter(categoryId: string | null) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from('products')
          .select(`
            *,
            vendors!inner (
              id,
              store_name,
              store_logo
            ),
            categories!inner (
              id,
              name,
              slug
            )
          `)
          .eq('status', 'active');

        if (categoryId) {
          query = query.eq('category_id', categoryId);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

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
  }, [categoryId]);

  return { products, loading, error };
}
