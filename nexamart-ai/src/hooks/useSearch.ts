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

// ── Stemming: plural → singular for common e-commerce terms ──────────────────
const PLURAL_MAP: Record<string, string> = {
  blouses: 'blouse',
  phones: 'phone',
  dresses: 'dress',
  shirts: 'shirt',
  jackets: 'jacket',
  hoodies: 'hoodie',
  sneakers: 'sneaker',
  laptops: 'laptop',
  tablets: 'tablet',
  monitors: 'monitor',
  speakers: 'speaker',
  keyboards: 'keyboard',
  cameras: 'camera',
  headphones: 'headphone',
};

// ── Synonyms: expand a token into additional search terms ────────────────────
const SYNONYM_MAP: Record<string, string[]> = {
  phone: ['smartphone'],
  phones: ['smartphone'],
  footwear: ['shoes'],
  tops: ['tshirt', 'blouse', 'hoodie'],
  top: ['tshirt', 'blouse', 'hoodie'],
};

function getExpandedTerms(token: string): string[] {
  const lower = token.toLowerCase();
  const terms = new Set<string>();
  terms.add(lower);

  // Apply stemming
  const stemmed = PLURAL_MAP[lower];
  if (stemmed) terms.add(stemmed);

  // Apply synonyms (on both original and stemmed form)
  const syns = SYNONYM_MAP[lower] || (stemmed ? SYNONYM_MAP[stemmed] : undefined);
  if (syns) syns.forEach((s) => terms.add(s));

  return Array.from(terms);
}

// ── Build a single token's filter: expanded terms × columns, all ORed ────────
function buildTokenFilter(token: string): string {
  const expanded = getExpandedTerms(token);
  return expanded
    .flatMap((term) => {
      const escaped = escapeLike(term);
      return SEARCH_COLUMNS.map((col) => `${col}.ilike.%${escaped}%`);
    })
    .join(',');
}

// ── Relevance scoring (client-side) ──────────────────────────────────────────
function scoreProduct(product: any, tokens: string[]): number {
  let score = 0;
  const name = (product.name || '').toLowerCase();
  const productType = (product.product_type || '').toLowerCase();
  const brand = (product.brand || '').toLowerCase();
  const description = (product.description || '').toLowerCase();

  for (const token of tokens) {
    const expanded = getExpandedTerms(token);
    for (const term of expanded) {
      if (name === term || name.startsWith(term + ' ') || name.endsWith(' ' + term)) score += 12;
      else if (name.includes(term)) score += 8;

      if (productType === term) score += 10;
      else if (productType.includes(term)) score += 6;

      if (brand === term) score += 10;
      else if (brand.includes(term)) score += 6;

      if (description.includes(term)) score += 2;
    }
  }

  // Small boost for higher-rated products
  score += (product.rating || 0) * 0.3;

  return score;
}

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

    // ── Category matching (precision-first) ────────────────────────────────
    // Only include category-based results when:
    //   a) single token that matches a category name/slug, OR
    //   b) the full search term matches a category name/slug (e.g. "home living")
    // This prevents "fashion blouse" from returning ALL Fashion products.
    let categoryMatchIds: string[] | null = null;
    if (hasSearchTerm) {
      try {
        const { data: allCategories } = await supabase
          .from('categories')
          .select('id, name, slug');
        if (allCategories) {
          const searchNorm = searchTermClean.toLowerCase();
          const searchSlug = searchNorm.replace(/\s+/g, '-');

          // Check if the full term matches a category name or slug exactly
          const fullMatch = allCategories.find(
            (cat) =>
              cat.slug.toLowerCase() === searchSlug ||
              cat.name.toLowerCase().replace(/\s+/g, '-') === searchSlug
          );

          if (fullMatch) {
            // Full-term match: include this category regardless of token count
            categoryMatchIds = [fullMatch.id];
          } else if (tokens.length === 1) {
            // Single token: check if it matches any category
            const t = tokens[0].toLowerCase();
            const matched = allCategories.filter(
              (cat) =>
                cat.name.toLowerCase().includes(t) ||
                cat.slug.toLowerCase().includes(t)
            );
            if (matched.length > 0) {
              categoryMatchIds = matched.map((c) => c.id);
            }
          }
          // Multi-token, no full match: don't use category OR (relies on text search)
        }
      } catch {
        // Non-critical — continue with text-only search
      }
    }

    const buildQuery = (withColor: boolean) => {
      let query = supabase
        .from('products')
        .select(
          `
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
        `,
          { count: 'exact' }
        )
        .eq('status', 'active');

      if (hasSearchTerm) {
        // Each token is expanded (stemmed + synonyms) and searched across all columns.
        // Expanded terms within a token are ORed; tokens are ANDed.
        const tokenFilters = tokens.map(buildTokenFilter);
        const textFilter = tokenFilters.join(').and(');

        if (categoryMatchIds && categoryMatchIds.length > 0) {
          // Text matches OR belonging to a matched category
          query = query.or(`(${textFilter}),(category_id.in.(${categoryMatchIds.join(',')}))`);
        } else {
          query = query.or(textFilter);
        }
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

      // For relevance-sorted queries, fetch all matching rows then sort client-side.
      // For explicit user-selected sorts, apply the DB sort.
      const isDefaultSort = sortBy === 'newest' || sortBy === undefined;
      if (!isDefaultSort) {
        if (sortBy === 'name_asc') {
          query = query.order('name', { ascending: true });
        } else if (sortBy === 'price_asc') {
          query = query.order('price', { ascending: true });
        } else if (sortBy === 'price_desc') {
          query = query.order('price', { ascending: false });
        } else if (sortBy === 'rating') {
          query = query.order('rating', { ascending: false });
        }
      }

      // Fetch a larger pool for relevance sorting, then paginate client-side
      if (isDefaultSort && hasSearchTerm) {
        // Retrieve up to 200 rows for scoring, then slice to page
        query = query.order('created_at', { ascending: false }).range(0, 199);
      } else {
        query = query.range(offset, offset + limit - 1);
      }

      return query;
    };

    const mapProducts = (results: any[] | null) =>
      (results || []).map((product: any) => ({
        ...product,
        images:
          product.images && product.images.length > 0
            ? product.images.map((img: string) => (img.startsWith('http') ? img : `${STORAGE_URL}/${img}`))
            : [PLACEHOLDER_IMAGE],
      }));

    try {
      let finalData: any[] | null = null;
      let finalCount: number | null = null;
      let usedFallback = false;

      if (normalizedColor) {
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

      // ── Relevance sort (client-side) for default sort ────────────────────
      const isDefaultSort = sortBy === 'newest' || sortBy === undefined;
      let displayData = finalData || [];
      let displayCount = finalCount || 0;

      if (isDefaultSort && hasSearchTerm && displayData.length > 0) {
        // Score and sort
        const scored = displayData.map((p: any) => ({ product: p, score: scoreProduct(p, tokens) }));
        scored.sort((a: any, b: any) => b.score - a.score);

        // Total count is the full scored set before pagination
        displayCount = scored.length;

        // Paginate
        const pageStart = offset;
        const pageEnd = pageStart + limit;
        displayData = scored.slice(pageStart, pageEnd).map((s: any) => s.product);
      } else if (!isDefaultSort) {
        // DB-sorted results are already paginated
        displayData = displayData;
      }

      setData(mapProducts(displayData));
      setTotalCount(displayCount);
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
