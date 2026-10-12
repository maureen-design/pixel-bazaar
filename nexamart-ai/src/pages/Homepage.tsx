import { useSearchParams, Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Sparkles, UserPlus, Package, Store, ArrowRight, X } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { AnnouncementBanner } from '../components/AnnouncementBanner';
import { Hero } from '../components/Hero';
import { CategoryStrip } from '../components/CategoryStrip';
import { ProductCard } from '../components/ProductCard';
import { ProductSkeleton } from '../components/ProductSkeleton';
import { Button } from '../components/ui/button';
import { Footer } from '../components/Footer';
import { WhyUs } from '../components/WhyUs';
import { AIShoppingAssistant } from '../components/ai/AIShoppingAssistant';
import { useFeaturedProducts, useNewArrivals, usePopularPicks, type SortOption } from '../hooks/useProducts';
import { useCategoryCounts } from '../hooks/useCategoryFilter';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { usePageMeta } from '../hooks/usePageMeta';

const PAGE_SIZE = 12;

export function Homepage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCategory = searchParams.get('category') || null;
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const prefersReduced = useReducedMotion();
  const { user, profile, isVendor } = useAuth();
  const [vendorStats, setVendorStats] = useState<{ productCount: number; pendingOrders: number } | null>(null);
  const [showSignUpPrompt, setShowSignUpPrompt] = useState(false);
  const [hasScrolledPast, setHasScrolledPast] = useState(false);
  const [heroProductIds, setHeroProductIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>('rating');

  usePageMeta({
    title: 'Home',
    description: 'Discover amazing products at NexaMart AI. Shop electronics, fashion, home goods and more with AI-powered recommendations.',
  });

  useEffect(() => {
    if (!user || !isVendor) return;
    Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('vendor_id', user.id),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('vendor_id', user.id).eq('status', 'pending'),
    ]).then(([products, orders]) => {
      setVendorStats({
        productCount: products.count ?? 0,
        pendingOrders: orders.count ?? 0,
      });
    });
  }, [user, isVendor]);

  // Fetch hero product IDs to exclude from other sections
  useEffect(() => {
    supabase
      .from('products')
      .select('id, vendor:vendors!inner(is_verified)')
      .eq('status', 'active')
      .eq('vendor.is_verified', true)
      .not('images', 'is', null)
      .order('rating', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (data) {
          setHeroProductIds(new Set(data.map(p => p.id)));
        }
      });
  }, []);

  const handleScroll = useCallback(() => {
    if (!user && !hasScrolledPast && window.scrollY > 400) {
      setHasScrolledPast(true);
      setShowSignUpPrompt(true);
    }
  }, [user, hasScrolledPast]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

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

  const { products: featuredProducts, loading: featuredLoading, totalCount: featuredTotal } = useFeaturedProducts(selectedCategory, currentPage, PAGE_SIZE, sortBy);
  const { products: newArrivals, loading: newArrivalsLoading } = useNewArrivals(selectedCategory, 1, 4);
  const { products: popularPicks, loading: popularLoading } = usePopularPicks(8);
  const { counts } = useCategoryCounts();

  const selectedCategoryName = selectedCategory
    ? featuredProducts[0]?.category?.name || 'Category'
    : null;

  const totalPages = Math.ceil(featuredTotal / PAGE_SIZE);

  const renderPageNumbers = () => {
    const pages: React.ReactNode[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
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
      <AnnouncementBanner />
      <Hero userName={profile?.full_name?.split(' ')[0] || null} isLoggedIn={!!user} />

      {/* Quick actions for logged-in users */}
      {user && (
        <motion.div
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
          initial={prefersReduced ? false : { opacity: 0, y: 20 }}
          animate={prefersReduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              to="/orders"
              className="flex items-center gap-4 bg-card border border-border rounded-xl p-4 hover:border-primary/50 hover:-translate-y-1 hover:shadow-lg transition-all group"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-brand to-brand-dark rounded-xl flex items-center justify-center flex-shrink-0">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">Orders</p>
                <p className="text-xs text-muted-foreground">Track, manage & return orders</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
            {isVendor && (
              <Link
                to="/vendor/dashboard"
                className="flex items-center gap-4 bg-card border border-border rounded-xl p-4 hover:border-primary/50 hover:-translate-y-1 hover:shadow-lg transition-all group"
              >
                <div className="w-12 h-12 bg-gradient-to-br from-vendor to-vendor/80 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Store className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">Seller Dashboard</p>
                  <p className="text-xs text-muted-foreground">
                    {vendorStats ? (
                      <>
                        {vendorStats.productCount} product{vendorStats.productCount === 1 ? '' : 's'}
                        {vendorStats.pendingOrders > 0 && <> · <span className="text-warning">{vendorStats.pendingOrders} pending order{vendorStats.pendingOrders === 1 ? '' : 's'}</span></>}
                      </>
                    ) : (
                      'Manage store, orders & analytics'
                    )}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
            )}
            {!isVendor && (
              <Link
                to="/vendor/apply"
                className="flex items-center gap-4 bg-card border border-border rounded-xl p-4 hover:border-primary/50 hover:-translate-y-1 hover:shadow-lg transition-all group"
              >
                <div className="w-12 h-12 bg-gradient-to-br from-vendor to-vendor/80 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Store className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">Become a Seller</p>
                  <p className="text-xs text-muted-foreground">Start selling on NexaMart</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
            )}
          </div>
        </motion.div>
      )}

      {/* Visitor sign-up nudge */}
      {!user && (
        <motion.div
          className="bg-gradient-to-r from-brand/5 via-transparent to-ai/5 border-y border-border"
          initial={prefersReduced ? false : { opacity: 0 }}
          animate={prefersReduced ? undefined : { opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm">
            <p className="text-muted-foreground">
              <span className="text-foreground font-medium">Join NexaMart</span> — save items, track orders, and get AI-powered recommendations.
            </p>
            <Link
              to="/signup"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Sign Up Free
            </Link>
          </div>
        </motion.div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Category Strip */}
        <motion.div
          id="categories"
          className="mb-8"
          initial={prefersReduced ? false : { opacity: 0, y: 20 }}
          whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
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
          initial={prefersReduced ? false : { opacity: 0, y: 30 }}
          whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">
                {selectedCategoryName ? (
                  <>{selectedCategoryName} Products</>
                ) : (
                  'Featured Products'
                )}
              </h2>
              <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-ai bg-ai/10 px-2.5 py-1 rounded-full">
                <Sparkles className="w-3 h-3" />
                Featured
              </span>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-1.5 text-sm bg-card border border-border rounded-lg text-foreground cursor-pointer hover:bg-muted transition-colors"
            >
              <option value="rating">Top Rated</option>
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>
          {featuredLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <ProductSkeleton key={i} />
              ))}
            </div>
          ) : featuredProducts.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {featuredProducts
                  .filter(p => !heroProductIds.has(p.id))
                  .slice(0, 8)
                  .map((product) => (
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
              <p className="text-muted-foreground">No products in this category yet. Check back soon!</p>
            </div>
          )}
        </motion.section>

        {/* New Arrivals */}
        <motion.section
          className="mb-16"
          initial={prefersReduced ? false : { opacity: 0, y: 30 }}
          whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-2xl font-bold">New Arrivals</h2>
            <span className="text-xs font-medium uppercase tracking-wider text-ai bg-ai/10 px-2.5 py-1 rounded-full">
              Just Listed
            </span>
          </div>
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
              <p className="text-muted-foreground">No new arrivals in this category yet. Check back soon!</p>
            </div>
          )}
        </motion.section>

        {/* Popular Picks */}
        <motion.section
          className="mb-16"
          initial={prefersReduced ? false : { opacity: 0, y: 30 }}
          whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-2xl font-bold">Popular Picks</h2>
            <span className="text-xs font-medium uppercase tracking-wider text-ai bg-ai/10 px-2.5 py-1 rounded-full">
              Top Rated
            </span>
          </div>
          {popularLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <ProductSkeleton key={i} />
              ))}
            </div>
          ) : popularPicks.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {popularPicks
                .filter(p => !heroProductIds.has(p.id))
                .slice(0, 8)
                .map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-lg p-8 border border-border text-center">
              <p className="text-muted-foreground">No popular picks yet. Check back soon!</p>
            </div>
          )}
        </motion.section>

        {/* Why Us */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 30 }}
          whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5 }}
        >
          <WhyUs />
        </motion.div>
      </div>

      <Footer />
      <AIShoppingAssistant />

      {/* Exit-intent sign-up prompt for visitors */}
      {!user && showSignUpPrompt && (
        <motion.div
          className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ duration: 0.3 }}
        >
          <div className="max-w-2xl mx-auto bg-card border border-border rounded-2xl shadow-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-brand to-brand-dark rounded-xl flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Create an account to save your favorites</p>
                <p className="text-sm text-muted-foreground">Track orders, get AI recommendations, and more.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/signup"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors text-sm whitespace-nowrap"
              >
                Sign Up Free
              </Link>
              <button
                onClick={() => setShowSignUpPrompt(false)}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}