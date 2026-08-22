import { useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Hero } from '../components/Hero';
import { CategoryStrip } from '../components/CategoryStrip';
import { ProductCard } from '../components/ProductCard';
import { ProductSkeleton } from '../components/ProductSkeleton';
import { Button } from '../components/ui/button';
import { Footer } from '../components/Footer';
import { AIShoppingAssistant } from '../components/ai/AIShoppingAssistant';
import { Sparkles } from 'lucide-react';
import { useFeaturedProducts, useNewArrivals } from '../hooks/useProducts';
import { useCategoryCounts } from '../hooks/useCategoryFilter';

const PAGE_SIZE = 12;

export function Homepage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCategory = searchParams.get('category') || null;
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  const setSelectedCategory = (categoryId: string | null) => {
    const next = new URLSearchParams();
    if (categoryId) next.set('category', categoryId);
    setSearchParams(next, { replace: true });
  };

  const goToPage = (page: number) => {
    const next = new URLSearchParams(searchParams);
    if (page > 1) next.set('page', String(page));
    else next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const { products: featuredProducts, loading: featuredLoading, totalCount: featuredTotal } = useFeaturedProducts(selectedCategory, currentPage, PAGE_SIZE);
  const { products: newArrivals, loading: newArrivalsLoading } = useNewArrivals(selectedCategory, 1, 4);
  const { counts } = useCategoryCounts();

  const selectedCategoryName = selectedCategory
    ? featuredProducts[0]?.category?.name || 'Category'
    : null;

  const totalPages = Math.ceil(featuredTotal / PAGE_SIZE);

  const renderPageNumbers = () => {
    const pages: React.ReactNode[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    if (start > 1) {
      pages.push(<span key="start-ellipsis" className="text-muted-foreground px-1">...</span>);
    }

    for (let i = start; i <= end; i++) {
      pages.push(
        <Button
          key={i}
          variant={i === currentPage ? 'default' : 'outline'}
          size="sm"
          onClick={() => goToPage(i)}
          className="min-w-[2.25rem]"
        >
          {i}
        </Button>
      );
    }

    if (end < totalPages) {
      pages.push(<span key="end-ellipsis" className="text-muted-foreground px-1">...</span>);
    }

    return pages;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <Hero />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Category Strip */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <CategoryStrip
            selectedCategory={selectedCategory}
            onCategorySelect={setSelectedCategory}
            counts={counts}
          />
        </motion.div>

        {/* Featured Products */}
        <motion.section
          id="products"
          className="mb-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-2xl font-bold mb-6">
            {selectedCategoryName ? (
              <>{selectedCategoryName} Products</>
            ) : (
              'Featured Products'
            )}
          </h2>
          {featuredLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <ProductSkeleton key={i} />
              ))}
            </div>
          ) : featuredProducts.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {featuredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-10">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Previous page"
                    disabled={currentPage <= 1}
                    onClick={() => goToPage(currentPage - 1)}
                  >
                    <ChevronLeft aria-hidden="true" className="w-4 h-4" />
                  </Button>
                  {renderPageNumbers()}
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Next page"
                    disabled={currentPage >= totalPages}
                    onClick={() => goToPage(currentPage + 1)}
                  >
                    <ChevronRight aria-hidden="true" className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="bg-card rounded-lg p-8 border border-border text-center">
              <p className="text-muted-foreground">No featured products found in this category</p>
            </div>
          )}
        </motion.section>

        {/* New Arrivals */}
        <motion.section
          className="mb-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h2 className="text-2xl font-bold mb-6">
            {selectedCategoryName ? (
              <>New {selectedCategoryName}</>
            ) : (
              'New Arrivals'
            )}
          </h2>
          {newArrivalsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <ProductSkeleton key={i} />
              ))}
            </div>
          ) : newArrivals.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {newArrivals.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-lg p-8 border border-border text-center">
              <p className="text-muted-foreground">No new arrivals in this category</p>
            </div>
          )}
        </motion.section>

        {/* AI Assistant CTA */}
        <motion.div
          className="bg-card border border-border rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-brand to-brand-dark rounded-xl flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-semibold text-lg">Can't find what you're looking for?</p>
              <p className="text-muted-foreground text-sm">
                Ask our AI assistant to recommend the perfect product for your needs.
              </p>
            </div>
          </div>
          <AIShoppingAssistant variant="cta" />
        </motion.div>
      </div>

      <Footer />
      <AIShoppingAssistant />
    </div>
  );
}