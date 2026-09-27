import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Store, Lock, ArrowRight, Headphones, Search, ShoppingCart, PackageCheck, ShieldCheck, Heart, Sparkles, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { useMarketplaceStats } from '../hooks/useMarketplaceStats';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { countryFlag } from '../utils/flags';
import { formatPrice } from '../config/pricing';

interface HeroProduct {
  id: string;
  name: string;
  image: string;
  price: number;
  vendor?: {
    store_name: string;
    country?: string | null;
  };
}

interface HeroProps {
  userName?: string | null;
  isLoggedIn?: boolean;
}

const HOW_IT_STEPS = [
  { icon: Search, title: 'Browse & Search', desc: 'Explore thousands of products or ask our AI to find exactly what you need.' },
  { icon: ShoppingCart, title: 'Add to Cart & Pay', desc: 'Pay securely with M-Pesa, card, or bank transfer — your choice.' },
  { icon: PackageCheck, title: 'Get It Delivered', desc: 'Fast delivery across Kenya right to your door.' },
];

export function Hero({ userName, isLoggedIn }: HeroProps) {
  const { productCount, vendorCount } = useMarketplaceStats();
  const [heroProducts, setHeroProducts] = useState<HeroProduct[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from('products')
      .select('id, name, images, price, rating, vendor:vendors(store_name, country)')
      .eq('status', 'active')
      .not('images', 'is', null)
      .order('rating', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const withImages = data.filter(
          (p) => p.images && p.images.length > 0
        );
        setHeroProducts(
          withImages.slice(0, 5).map((p: any) => ({
            id: p.id,
            name: p.name,
            image: p.images[0],
            price: p.price,
            vendor: p.vendor,
          }))
        );
      });
  }, []);

  const scrollToProducts = () => {
    const element = document.getElementById('products');
    if (element) element.scrollIntoView({ behavior: 'smooth' });
  };

  const formatCount = (count: number | null) =>
    count === null ? '—' : count.toLocaleString('en-KE');

  // ─── VISITOR HERO ──────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div className="relative bg-gradient-to-br from-background via-primary/5 to-primary/10 overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — Visitor Hero Text */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 bg-ai/10 text-ai px-3 py-1.5 rounded-full text-xs font-medium mb-6">
                <ShieldCheck className="w-3.5 h-3.5" />
                Trusted by Kenyans nationwide
              </div>
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold text-foreground mb-6 leading-[1.1]">
                Discover.
                <br />
                <span className="bg-gradient-to-r from-brand to-brand-dark bg-clip-text text-transparent">
                  Shop. Get Delivered.
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-xl">
                Shop products from verified local vendors — with AI-powered search that finds exactly what you're looking for.
              </p>

              {/* How It Works — inline in hero */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {HOW_IT_STEPS.map((step, i) => (
                  <div key={step.title} className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-brand/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-brand">{i + 1}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{step.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-start gap-4">
                <motion.button
                  onClick={() => navigate('/signup')}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-brand to-brand-dark hover:from-brand-dark hover:to-brand text-white font-semibold rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-primary/25"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Get Started Free
                  <ArrowRight className="w-5 h-5" />
                </motion.button>
                <motion.button
                  onClick={scrollToProducts}
                  className="inline-flex items-center gap-2 px-8 py-4 border border-border bg-background/60 hover:bg-muted text-foreground font-semibold rounded-xl transition-all duration-300"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Browse Products
                </motion.button>
              </div>
            </motion.div>

            {/* Right — Curated Product Cluster (desktop) */}
            <motion.div
              className="relative hidden sm:flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.2 }}
            >
              <div className="relative w-full max-w-md">
                <div className="grid grid-cols-2 gap-3">
                  {heroProducts.map((product, i) => (
                    <motion.div
                      key={product.id}
                      className={`relative bg-card border border-border rounded-2xl overflow-hidden shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${
                        i === 0 ? 'row-span-2 aspect-[3/4]' : 'aspect-square'
                      }`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                    >
                      <Link to={`/product/${product.id}`} className="block w-full h-full">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          loading={i === 0 ? 'eager' : 'lazy'}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300" />
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Right — Compact Product Scroll (mobile) */}
            <motion.div
              className="sm:hidden -mx-4 px-4 overflow-x-auto scrollbar-hide"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="flex gap-3 w-max">
                {heroProducts.slice(0, 4).map((product) => (
                  <Link
                    key={product.id}
                    to={`/product/${product.id}`}
                    className="flex-shrink-0 w-36 bg-card border border-border rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-shadow"
                  >
                    <div className="aspect-square">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs font-medium text-foreground truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        KES {product.price.toLocaleString('en-KE')}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Trust Stats Bar */}
          <motion.div
            className="mt-12 sm:mt-16 border-t border-border/50 pt-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {[
                { icon: Store, label: 'Verified Vendors', sub: `${formatCount(vendorCount)}+ trusted sellers` },
                { icon: Package, label: 'Products', sub: `${formatCount(productCount)}+ curated items` },
                { icon: Lock, label: 'Secure Payments', sub: 'M-Pesa, card & bank' },
                { icon: Headphones, label: '24/7 Support', sub: 'Always here to help' },
              ].map((stat) => (
                <div key={stat.label} className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-brand/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <stat.icon aria-hidden="true" className="w-5 h-5 text-brand" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{stat.label}</div>
                    <div className="text-xs text-muted-foreground">{stat.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ─── LOGGED-IN HERO ────────────────────────────────────────────
  return (
    <div className="relative bg-gradient-to-br from-background via-primary/5 to-primary/10 overflow-hidden">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Welcome + AI badge + actions */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <h1 className="text-3xl sm:text-5xl font-bold text-foreground mb-2">
            Welcome back, {userName}
          </h1>
          <p className="text-lg text-muted-foreground mb-4">
            Here's what we think you'll like today.
          </p>
          <div className="inline-flex items-center gap-2 bg-ai/10 text-ai px-3 py-1.5 rounded-full text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            AI RECOMMENDATION
            <Info className="w-3.5 h-3.5 opacity-60" />
          </div>
          <div className="flex flex-col sm:flex-row items-start gap-3">
            <motion.button
              onClick={scrollToProducts}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-brand to-brand-dark hover:from-brand-dark hover:to-brand text-white font-semibold rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-primary/25"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <ShoppingCart className="w-4 h-4" />
              Continue Shopping
            </motion.button>
            <Link
              to="/wishlist"
              className="inline-flex items-center gap-2 px-6 py-3 border border-border bg-background/60 hover:bg-muted text-foreground font-semibold rounded-xl transition-all duration-300"
            >
              <Heart className="w-4 h-4" />
              View Wishlist
            </Link>
          </div>
        </motion.div>

        {/* Product recommendations - horizontal scroll */}
        {heroProducts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 -mx-4 px-4">
              {heroProducts.map((product, i) => (
                <motion.div
                  key={product.id}
                  className="flex-shrink-0 w-48 sm:w-56"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                >
                  <Link
                    to={`/product/${product.id}`}
                    className="block bg-card border border-border rounded-xl overflow-hidden hover:border-primary/50 hover:-translate-y-1 hover:shadow-lg transition-all group"
                  >
                    <div className="relative aspect-square overflow-hidden bg-muted">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading={i < 4 ? 'eager' : 'lazy'}
                      />
                      <div className="absolute top-2 left-2">
                        <span className="bg-ai/90 text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
                          Recommended for you
                        </span>
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className="text-sm font-medium text-foreground line-clamp-1 mb-1">
                        {product.name}
                      </h3>
                      {product.vendor && (
                        <p className="text-xs text-muted-foreground mb-2">
                          {countryFlag(product.vendor.country) && (
                            <span className="mr-1" role="img" aria-label={product.vendor.country ?? undefined}>
                              {countryFlag(product.vendor.country)}
                            </span>
                          )}
                          {product.vendor.store_name}
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-foreground">
                          {formatPrice(product.price)}
                        </span>
                        <button
                          className="p-1.5 rounded-full hover:bg-muted transition-colors"
                          aria-label="Add to wishlist"
                        >
                          <Heart className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
