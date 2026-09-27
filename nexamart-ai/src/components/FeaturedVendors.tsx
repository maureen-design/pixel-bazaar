import { Link } from 'react-router-dom';
import { Store, Star, ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useFeaturedVendors } from '../hooks/useVendors';

export function FeaturedVendors() {
  const { vendors, loading } = useFeaturedVendors(6);
  const prefersReduced = useReducedMotion();

  if (loading) {
    return (
      <section className="mb-16" aria-labelledby="featured-vendors-heading">
        <h2 id="featured-vendors-heading" className="text-2xl font-bold mb-6">Top Vendors</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-muted rounded-lg" />
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded w-24 mb-2" />
                  <div className="h-3 bg-muted rounded w-16" />
                </div>
              </div>
              <div className="h-3 bg-muted rounded w-full mb-2" />
              <div className="h-3 bg-muted rounded w-2/3" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (vendors.length === 0) return null;

  return (
    <section className="mb-16" aria-labelledby="featured-vendors-heading">
      <div className="flex items-center justify-between mb-6">
        <h2 id="featured-vendors-heading" className="text-2xl font-bold">Top Vendors</h2>
        <Link
          to="/search"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          View All
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {vendors.map((vendor, i) => (
          <motion.div
            key={vendor.id}
            initial={prefersReduced ? false : { opacity: 0, y: 20 }}
            whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
          >
            <Link
              to={`/search?vendor=${vendor.id}`}
              className="block bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:-translate-y-1 hover:shadow-lg transition-all group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                  {vendor.store_logo ? (
                    <img
                      src={vendor.store_logo}
                      alt={vendor.store_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Store className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate group-hover:text-primary transition-colors">
                    {vendor.store_name}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="w-3 h-3 fill-warning text-warning" />
                    <span>{vendor.rating > 0 ? vendor.rating.toFixed(1) : 'New'}</span>
                    <span>·</span>
                    <span>{vendor.product_count} product{vendor.product_count === 1 ? '' : 's'}</span>
                  </div>
                </div>
              </div>
              {vendor.store_description && (
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {vendor.store_description}
                </p>
              )}
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
