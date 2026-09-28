import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, SlidersHorizontal, X, Sparkles, Store } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSearch } from '../hooks/useSearch';
import { ProductCard } from '../components/ProductCard';
import { SearchFilters } from '../components/SearchFilters';
import { ProductSkeleton } from '../components/ProductSkeleton';
import { Button } from '../components/ui/button';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { ShoppingAssistantModal } from '../components/ai/ShoppingAssistantModal';

export function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAIAssistant, setShowAIAssistant] = useState(false);

  const query = searchParams.get('q') || '';
  const categoryId = searchParams.get('category') || undefined;
  // ?vendor=<uuid>. FeaturedVendors.tsx has always emitted this, but nothing read
  // it, so every card in that rail used to land on an unfiltered empty search.
  const vendorId = searchParams.get('vendor') || undefined;
  const productType = searchParams.get('type') || undefined;
  const brand = searchParams.get('brand') || undefined;
  const color = searchParams.get('color') || undefined;
  const minPriceParam = searchParams.get('minPrice');
  const maxPriceParam = searchParams.get('maxPrice');
  const rawMinPrice = minPriceParam ? Number(minPriceParam) : NaN;
  const rawMaxPrice = maxPriceParam ? Number(maxPriceParam) : NaN;
  const minPrice = Number.isFinite(rawMinPrice) && rawMinPrice >= 0 ? rawMinPrice : undefined;
  const maxPrice = Number.isFinite(rawMaxPrice) && rawMaxPrice >= 0 ? rawMaxPrice : undefined;
  const sortBy = (searchParams.get('sort') || 'newest') as any;
  const rawPage = Number(searchParams.get('page') || '1');
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const [showFilters, setShowFilters] = useState(false);

  // Resolve the store name behind ?vendor=. One primary-key lookup on
  // vendors.store_name, which is a public column that the anon key can read now
  // that 0033 restored table-level SELECT. Deliberately not derived from the
  // first result: a store with zero active products is exactly the case where
  // the user most needs to be told which store is hiding everything else.
  //
  // The fetched id is stored alongside the name and re-checked at read time,
  // rather than resetting state when vendorId clears. That avoids a synchronous
  // setState inside the effect, and it also stops a late response for the
  // previous store from labelling the new one - a store switch would otherwise
  // briefly show the old store's name under the new store's filter.
  const [vendorRecord, setVendorRecord] = useState<{ id: string; name: string | null } | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    // Two-arg then, not .then().catch(): PostgrestBuilder resolves to a
    // PromiseLike, which has no .catch in its type.
    supabase
      .from('vendors')
      .select('store_name')
      .eq('id', vendorId)
      .maybeSingle()
      .then(
        ({ data }) => {
          if (!cancelled) setVendorRecord({ id: vendorId, name: data?.store_name ?? null });
        },
        () => {
          if (!cancelled) setVendorRecord({ id: vendorId, name: null });
        }
      );
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const vendorName = vendorRecord && vendorRecord.id === vendorId ? vendorRecord.name : null;

  const { data, loading, error, totalCount, colorFallback } = useSearch(query, {
    categoryId,
    vendorId,
    productType,
    brand,
    color,
    minPrice,
    maxPrice,
    sortBy,
    page,
    limit: 20,
  });

  // vendorId counts as a filter so "Clear Filters" appears when the catalog is
  // narrowed by store alone. clearFilters() below already drops it, since it
  // rebuilds the params from scratch and only carries q forward.
  const hasFilters = !!(vendorId || categoryId || productType || brand || color || minPrice !== undefined || maxPrice !== undefined || sortBy !== 'newest');

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key !== 'page') next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    setSearchParams(next, { replace: true });
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / 20));

  const pageWindow = (() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let start = Math.max(1, page - 2);
    const end = start + 4;
    if (end > totalPages) {
      start = totalPages - 4;
    }
    return Array.from({ length: 5 }, (_, i) => start + i);
  })();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                {query ? (
                  <>Search results for "<span className="text-primary">{query}</span>"</>
                ) : vendorId ? (
                  <>{vendorName || 'Store'}</>
                ) : (
                  'Search Products'
                )}
              </h1>
              {(query || vendorId) && !loading && (
                <p className="text-muted-foreground">
                  {totalCount === 0
                    ? 'No products found'
                    : `Showing ${totalCount} result${totalCount !== 1 ? 's' : ''}`}
                </p>
              )}
            </div>
            <Button variant="outline" onClick={() => setShowAIAssistant(true)} className="gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Ask AI Assistant
            </Button>
          </div>
        </div>

        {colorFallback && color && !loading && (
          <div className="mb-4 bg-muted border border-border rounded-lg p-3 text-sm text-muted-foreground">
            No products matched color "<span className="text-foreground font-medium">{color}</span>".
            Showing results without the color filter instead.
          </div>
        )}

        {/* Active vendor filter. Without this the page looks identical whether the
            store filter is working, ignored, or quietly returning nothing - which
            is the failure mode that made the unmounted FeaturedVendors links
            useless in the first place. */}
        {vendorId && (
          <div className="mb-4 flex items-center gap-2 flex-wrap bg-muted border border-border rounded-lg p-3 text-sm">
            <Store className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground">Showing products from</span>
            <span className="font-medium text-foreground">
              {vendorName || 'this store'}
            </span>
            <button
              type="button"
              onClick={() => updateParam('vendor', '')}
              className="ml-auto inline-flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors"
              aria-label="Clear vendor filter"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        )}

        {/* Mobile filter toggle */}
        <div className="lg:hidden mb-4">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {showFilters ? <X className="w-4 h-4" /> : null}
          </Button>
        </div>

        <div className="flex gap-8">
          {/* Filters Sidebar */}
          <div className={`lg:block lg:w-64 flex-shrink-0 ${showFilters ? 'block' : 'hidden lg:block'}`}>
            <div className="lg:sticky lg:top-24">
              <SearchFilters
                categoryId={categoryId}
                productType={productType}
                brand={brand}
                color={color}
                minPrice={minPrice}
                maxPrice={maxPrice}
                sortBy={sortBy}
                onCategoryChange={(val) => updateParam('category', val)}
                onProductTypeChange={(val) => updateParam('type', val)}
                onBrandChange={(val) => updateParam('brand', val)}
                onColorChange={(val) => updateParam('color', val)}
                onMinPriceChange={(val) => updateParam('minPrice', val)}
                onMaxPriceChange={(val) => updateParam('maxPrice', val)}
                onSortChange={(val) => updateParam('sort', val)}
                onClear={clearFilters}
                hasFilters={hasFilters}
              />
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 min-w-0" aria-live="polite">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <ProductSkeleton key={i} />
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-16">
                <SearchIcon className="w-12 h-12 text-destructive mx-auto mb-4" />
                <p className="text-destructive text-lg mb-2">Something went wrong</p>
                <p className="text-muted-foreground text-sm">{error}</p>
              </div>
            ) : data.length === 0 ? (
              <div className="text-center py-16 bg-card border border-border rounded-xl">
                <SearchIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl text-foreground font-medium mb-2">No products found</h2>
                <p className="text-muted-foreground mb-2">
                  {vendorId
                    ? `${vendorName || 'This store'} has no active products right now.`
                    : query
                      ? `No results for "${query}". Try a broader term or remove a filter.`
                      : 'Try a keyword like “shoes”, “laptop”, or a brand like “Samsung”.'}
                </p>
                {query ? (
                  <p className="text-xs text-muted-foreground mb-6">
                    Tips: check spelling, use fewer filters, or try the AI Assistant for natural language search.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mb-6">
                    Use filters on the left to narrow by category, brand, or price — or ask the AI Assistant.
                  </p>
                )}
                <div className="flex gap-3 justify-center flex-wrap">
                  {hasFilters && (
                    <Button variant="outline" onClick={clearFilters}>
                      Clear Filters
                    </Button>
                  )}
                  <Button variant="default" onClick={() => setShowAIAssistant(true)} className="gap-2">
                    <Sparkles className="w-4 h-4" /> Try AI Assistant
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {data.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-12">
                    <Button
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => updateParam('page', String(page - 1))}
                    >
                      Previous
                    </Button>
                    {pageWindow.map((pageNum) => {
                      return (
                        <Button
                          key={pageNum}
                          variant={page === pageNum ? 'default' : 'outline'}
                          aria-current={page === pageNum ? 'page' : undefined}
                          onClick={() => updateParam('page', String(pageNum))}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                    {totalPages > 5 && <span className="text-muted-foreground">...</span>}
                    <Button
                      variant="outline"
                      disabled={page >= totalPages}
                      onClick={() => updateParam('page', String(page + 1))}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <ShoppingAssistantModal open={showAIAssistant} onOpenChange={setShowAIAssistant} initialCategoryId={categoryId} />
      <Footer />
    </div>
  );
}
