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
        const [productsRes, categoriesRes] = await Promise.all([
          supabase
            .from('products')
            .select('category_id, vendor:vendors!inner(is_verified)')
            .eq('status', 'active')
            .eq('vendor.is_verified', true),
          supabase
            .from('categories')
            .select('id, parent_id'),
        ]);

        if (productsRes.error) throw productsRes.error;
        if (categoriesRes.error) throw categoriesRes.error;

        const categories = categoriesRes.data || [];
        const childToParent: Record<string, string> = {};
        categories.forEach((cat) => {
          if (cat.parent_id) childToParent[cat.id] = cat.parent_id;
        });

        const countMap: Record<string, number> = {};
        (productsRes.data || []).forEach((p) => {
          const parentId = childToParent[p.category_id] || p.category_id;
          countMap[parentId] = (countMap[parentId] || 0) + 1;
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
        let filterCategoryIds: string[] | null = null;

        if (categoryId) {
          const { data: children } = await supabase
            .from('categories')
            .select('id')
            .eq('parent_id', categoryId);

          filterCategoryIds = [categoryId, ...(children?.map((c) => c.id) || [])];
        }

        let query = supabase
          .from('products')
          .select(`
            *,
            vendor:vendors!inner (
              id,
              store_name,
              store_logo,
              country
            ),
            category:categories!inner (
              id,
              name,
              slug
            )
          `)
          .eq('status', 'active')
          .eq('vendor.is_verified', true);

        if (filterCategoryIds) {
          query = query.in('category_id', filterCategoryIds);
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
