import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Product } from '../types';

const STORAGE_URL = 'https://jsdynslcjnfdulzgvamj.supabase.co/storage/v1/object/public/product-images';
const PLACEHOLDER_IMAGE = 'https://placehold.co/400x400/1e293b/64748b?text=No+Image';

export interface SearchFilters {
  categoryId?: string;
  productType?: string;
  brand?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'name_asc' | 'price_asc' | 'price_desc' | 'rating' | 'newest';
  page?: number;
  limit?: number;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const SEARCH_COLUMNS = ['name', 'description', 'product_type', 'brand'];

export function useSearch(searchTerm: string, filters: SearchFilters = {}) {
  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [colorFallback, setColorFallback] = useState(false);

  const {
    categoryId,
    productType,
    brand,
    color,
    minPrice,
    maxPrice,
    sortBy = 'newest',
    page = 1,
    limit = 20,
  } = filters;

  const offset = (page - 1) * limit;

  const fetchResults = useCallback(async () => {
    const searchTermClean = searchTerm.trim();
    const tokens = searchTermClean.split(/\s+/).filter(Boolean);
    const hasSearchTerm = tokens.length > 0;
    const safeMinPrice = typeof minPrice === 'number' && Number.isFinite(minPrice) && minPrice >= 0 ? minPrice : undefined;
    const safeMaxPrice = typeof maxPrice === 'number' && Number.isFinite(maxPrice) && maxPrice >= 0 ? maxPrice : undefined;
    const normalizedColor = typeof color === 'string' && color.trim() ? color.trim().toLowerCase() : undefined;
    const hasFilters = !!(categoryId || productType || brand || normalizedColor || safeMinPrice !== undefined || safeMaxPrice !== undefined);

    if (!hasSearchTerm && !hasFilters) {
      setData([]);
      setTotalCount(0);
      setLoading(false);
      setColorFallback(false);
      return;
    }

    setLoading(true);
    setError(null);
    setColorFallback(false);

    const buildQuery = (withColor: boolean) => {
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
        `, { count: 'exact' })
        .eq('status', 'active');

      if (hasSearchTerm) {
        // Each token must match at least one indexed column (name, description,
        // product_type, brand). Tokens are ANDed, columns are ORed within a token.
        // PostgREST parses `or=(g1).and(g2)`; .or() adds the outer parens, so the
        // first group must stay unwrapped — hence the ').and(' join.
        const tokenExpressions = tokens.map((token) => {
          const escaped = escapeLike(token);
          return SEARCH_COLUMNS.map((col) => `${col}.ilike.%${escaped}%`).join(',');
        });
        query = query.or(tokenExpressions.join(').and('));
      }

      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }

      if (productType) {
        query = query.eq('product_type', productType);
      }

      if (brand) {
        query = query.eq('brand', brand);
      }

      if (withColor && normalizedColor) {
        query = query.contains('colors', [normalizedColor]);
      }

      if (safeMinPrice !== undefined) {
        query = query.gte('price', safeMinPrice);
      }

      if (safeMaxPrice !== undefined) {
        query = query.lte('price', safeMaxPrice);
      }

      if (sortBy === 'name_asc') {
        query = query.order('name', { ascending: true });
      } else if (sortBy === 'price_asc') {
        query = query.order('price', { ascending: true });
      } else if (sortBy === 'price_desc') {
        query = query.order('price', { ascending: false });
      } else if (sortBy === 'rating') {
        query = query.order('rating', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      query = query.range(offset, offset + limit - 1);

      return query;
    };

    const mapProducts = (results: any[] | null) => (results || []).map((product: any) => ({
      ...product,
      images: product.images && product.images.length > 0
        ? product.images.map((img: string) => img.startsWith('http') ? img : `${STORAGE_URL}/${img}`)
        : [PLACEHOLDER_IMAGE],
    }));

    try {
      let finalData: any[] | null = null;
      let finalCount: number | null = null;
      let usedFallback = false;

      if (normalizedColor) {
        // First pass: the intended color-filtered query. On zero results OR when
        // the color column is unavailable (migration pending / column missing),
        // retry WITHOUT the color filter so the search experience is preserved.
        // UI is notified via `colorFallback` so it never claims color matches.
        const colorQuery = buildQuery(true);
        const { data: colorData, error: colorError, count: colorCount } = await colorQuery;

        if (colorError || !colorData || colorData.length === 0) {
          const fallbackQuery = buildQuery(false);
          const { data: fbData, error: fbError, count: fbCount } = await fallbackQuery;
          if (fbError) throw fbError;
          usedFallback = true;
          finalData = fbData;
          finalCount = fbCount;
        } else {
          finalData = colorData;
          finalCount = colorCount;
        }
      } else {
        const query = buildQuery(false);
        const { data: results, error: queryError, count } = await query;
        if (queryError) throw queryError;
        finalData = results;
        finalCount = count;
      }

      setData(mapProducts(finalData));
      setTotalCount(finalCount || 0);
      setColorFallback(usedFallback);
    } catch (err: any) {
      setError(err.message);
      setData([]);
      setTotalCount(0);
      setColorFallback(false);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, categoryId, productType, brand, color, minPrice, maxPrice, sortBy, offset, limit]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  return { data, loading, error, totalCount, colorFallback };
}
