import { Link, useParams } from 'react-router-dom';
import { Store, ShieldCheck, Clock, MapPin, Package, AlertCircle } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { ProductCard } from '../components/ProductCard';
import { SafeImg } from '../components/SafeImg';
import { Badge } from '../components/ui/badge';
import { buttonVariants } from '../components/ui/button';
import { countryFlag } from '../utils/flags';

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function StoreSkeleton() {
  return (
    <div className="min-h-[60vh]">
      <div className="h-48 md:h-64 bg-muted animate-pulse" />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="h-8 w-56 bg-muted rounded animate-pulse mb-4" />
        <div className="h-4 w-80 bg-muted rounded animate-pulse mb-10" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function StorePage() {
  const { id = '' } = useParams<{ id: string }>();
  const { store, products, loading, error, notFound } = useStore(id);

  if (loading) return <StoreSkeleton />;

  // Distinguish a bad id from a failed read. A missing vendor is a 404-style
  // outcome; a network/RLS error is a retryable one.
  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-destructive" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Could not load this store</h1>
          <p className="text-muted-foreground mb-8">{error}</p>
          <Link to="/search" className={buttonVariants()}>
            Search Products
          </Link>
        </div>
      </div>
    );
  }

  if (notFound || !store) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
            <Store className="w-10 h-10 text-muted-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Store not found</h1>
          <p className="text-muted-foreground mb-8">
            We couldn't find a store at this address. It may have been removed.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/" className={buttonVariants({ variant: 'outline' })}>
              Back to Home
            </Link>
            <Link to="/search" className={buttonVariants()}>
              Search Products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const flag = countryFlag(store.country);
  const location = [store.city, store.country].filter(Boolean).join(', ');
  const memberSince = new Date(store.created_at).toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'long',
  });

  return (
    <div className="min-h-screen">
      {/* Cover */}
      <div className="relative h-48 md:h-64 bg-muted overflow-hidden">
        {store.store_cover ? (
          <SafeImg
            src={store.store_cover}
            alt={`${store.store_name} cover`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-brand to-brand-dark" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-background/10" />
      </div>

      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="relative -mt-12 md:-mt-16">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-card border-4 border-background overflow-hidden shrink-0 shadow-lg">
              {store.store_logo ? (
                <SafeImg
                  src={store.store_logo}
                  alt={store.store_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">
                    {getInitials(store.store_name || 'Store')}
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                  {store.store_name}
                </h1>
                {store.is_verified ? (
                  <Badge className="gap-1 bg-success/10 text-success border border-success/30">
                    <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    Verification pending
                  </Badge>
                )}
              </div>

              {store.business_name && store.business_name !== store.store_name && (
                <p className="text-sm text-muted-foreground mt-1">{store.business_name}</p>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                {location && (
                  <span className="inline-flex items-center gap-1.5">
                    {flag && (
                      <span role="img" aria-label={store.country ?? undefined}>
                        {flag}
                      </span>
                    )}
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                    {location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                  Member since {memberSince}
                </span>
              </div>
            </div>
          </div>

          {store.store_description && (
            <p className="text-muted-foreground mt-4 max-w-3xl leading-relaxed">
              {store.store_description}
            </p>
          )}
        </div>

        {/* Products */}
        <div className="mt-10 mb-16">
          <div className="flex items-center gap-2 mb-5">
            <Package className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-foreground">
              {products.length} {products.length === 1 ? 'product' : 'products'}
            </h2>
          </div>

          {products.length === 0 ? (
            <div className="bg-card rounded-xl border border-border py-16 px-6 text-center">
              <Store className="w-10 h-10 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
              <p className="text-foreground font-medium mb-1">No products available yet</p>
              <p className="text-muted-foreground text-sm mb-6">
                This store has nothing listed for sale right now.
              </p>
              <Link to="/search" className={buttonVariants({ variant: 'outline' })}>
                Browse all products
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
