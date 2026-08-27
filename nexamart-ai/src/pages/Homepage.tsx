import { useSearchParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Sparkles, UserPlus, Search, ShoppingCart, Heart, Package } from 'lucide-react';
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
import { useFeaturedProducts, useNewArrivals } from '../hooks/useProducts';
import { useCategoryCounts } from '../hooks/useCategoryFilter';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabaseClient';

const PAGE_SIZE = 12;

export function Homepage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCategory = searchParams.get('category') || null;
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const prefersReduced = useReducedMotion();
  const { user, profile } = useAuth();
  const { wishlistCount } = useWishlist();
  const { cartCount } = useCart();
  const [activeOrders, setActiveOrders] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['pending', 'confirmed', 'processing', 'shipped'])
      .then(({ count }) => setActiveOrders(count ?? 0));
  }, [user]);

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
      <AnnouncementBanner />
      <Hero />

      {/* Logged-in personalization bar */}
      {user && (
        <motion.div
          className="bg-gradient-to-r from-brand/5 via-card to-ai/5 border-y border-border"
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={prefersReduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <p className="text-foreground text-sm">
              Welcome back, <span className="font-semibold text-brand">{profile?.full_name?.split(' ')[0] || 'there'}</span>.
              {activeOrders > 0 && <span className="text-muted-foreground ml-1">You have {activeOrders} active order{activeOrders === 1 ? '' : 's'}.</span>}
              {activeOrders === 0 && <span className="text-muted-foreground ml-1"> Ready to find something great?</span>}
            </p>
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
              <span className="text-foreground font-medium">Create an account</span> to save items, track orders, and get personalized recommendations.
            </p>
            <Link
              to="/signup"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-brand/10 text-brand font-medium rounded-lg hover:bg-brand/20 transition-colors whitespace-nowrap"
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

        {/* Why Us (visitors) / Continue Shopping (logged-in) */}
        {user ? (
          <motion.div
            className="mb-16"
            initial={prefersReduced ? false : { opacity: 0, y: 30 }}
            whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-2xl font-bold mb-6">Continue Shopping</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { to: '/search', icon: Search, label: 'Browse All', desc: 'Find something new', show: true },
                { to: '/cart', icon: ShoppingCart, label: 'Your Cart', desc: cartCount > 0 ? `${cartCount} item${cartCount === 1 ? '' : 's'} waiting` : 'Start adding items', show: true },
                { to: '/wishlist', icon: Heart, label: 'Wishlist', desc: wishlistCount > 0 ? `${wishlistCount} saved item${wishlistCount === 1 ? '' : 's'}` : 'Save items you love', show: true },
                { to: '/orders', icon: Package, label: 'Orders', desc: activeOrders > 0 ? `${activeOrders} in progress` : 'View order history', show: true },
              ].filter((item) => item.show).map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:-translate-y-1 hover:shadow-lg transition-all group"
                >
                  <div className="w-10 h-10 bg-brand/10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-brand/20 transition-colors">
                    <item.icon className="w-5 h-5 text-brand" />
                  </div>
                  <p className="font-semibold text-foreground text-sm mb-1">{item.label}</p>
                  <p className="text-muted-foreground text-xs">{item.desc}</p>
                </Link>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 30 }}
            whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5 }}
          >
            <WhyUs />
          </motion.div>
        )}

        {/* AI Assistant CTA */}
        <motion.div
          className="bg-gradient-to-br from-brand/10 via-card to-ai/10 border border-transparent ring-1 ring-brand/25 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg"
          initial={prefersReduced ? false : { opacity: 0, y: 30 }}
          whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-brand to-brand-dark rounded-xl flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-semibold text-lg">Not sure what to buy?</p>
              <p className="text-muted-foreground text-sm">
                Let our AI assistant find the perfect product for you.
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