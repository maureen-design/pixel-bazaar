import { Link, useNavigate } from 'react-router-dom';
import { Star, StarHalf, ShoppingCart, Store } from 'lucide-react';
import { motion } from 'motion/react';
import type { Product } from '../types';
import { AddToCartButton } from './AddToCartButton';
import { WishlistButton } from './WishlistButton';
import { CompareButton } from './CompareButton';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { SafeImg } from './SafeImg';
import { countryFlag } from '../utils/flags';
import { formatPrice } from '../config/pricing';
import { getAvailableStock, getCardStockState } from '../lib/stock';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const navigate = useNavigate();

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < fullStars; i++) {
      stars.push(<Star key={i} className="w-4 h-4 fill-warning text-warning" />);
    }
    if (hasHalfStar) {
      stars.push(<StarHalf key="half" className="w-4 h-4 fill-warning text-warning" />);
    }
    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<Star key={`empty-${i}`} className="w-4 h-4 text-muted-foreground" />);
    }

    return stars;
  };

  const hasVariants = !!product.variants && !!product.variants.options && product.variants.options.length > 0;
  const variantCount = hasVariants && product.variants?.combinations ? product.variants.combinations.length : 0;
  const totalStock = getAvailableStock(product.variants, product.stock_quantity);
  const stockState = getCardStockState(product);
  const isOutOfStock = stockState === 'out_of_stock';
  const isLowStock = stockState === 'low';

  const discountPercent =
    product.compare_price && product.compare_price > product.price
      ? Math.round(((product.compare_price - product.price) / product.compare_price) * 100)
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="group relative bg-card rounded-xl border border-border overflow-hidden hover:border-primary/50 hover:-translate-y-1 hover:shadow-lg transition-all motion-spring">
        {/*
          Stretched link: the card stays one big click target without wrapping
          the whole card in an <a>, which would nest the store link, wishlist
          and compare buttons inside an anchor (invalid HTML, and screen
          readers announce one link with no distinct target).
        */}
        <Link
          to={`/product/${product.id}`}
          className="absolute inset-0 z-0 rounded-xl"
          aria-label={product.name}
        >
          <span className="sr-only">{product.name}</span>
        </Link>

        <div className="relative aspect-square overflow-hidden bg-muted pointer-events-none">
          <SafeImg
            src={product.images?.[0]}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
          {isOutOfStock && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <Badge variant="destructive" className="text-sm px-3 py-1">
                Out of Stock
              </Badge>
            </div>
          )}
          {discountPercent > 0 && (
            <div className="absolute top-2 left-2">
              <Badge variant="destructive" className="text-xs font-bold">
                -{discountPercent}%
              </Badge>
            </div>
          )}
          {hasVariants && (
            <div className="absolute bottom-2 left-2">
              <Badge variant="secondary" className="bg-card/90 text-foreground border-border">
                {variantCount} options
              </Badge>
            </div>
          )}
          <div className="absolute top-2 right-2 flex flex-col gap-1 pointer-events-auto">
            <CompareButton product={product} />
            <WishlistButton productId={product.id} />
          </div>
        </div>

        {/*
          Unpositioned on purpose: a positioned ancestor would paint above the
          stretched link and swallow clicks on the title and price. Interactive
          children opt back in with relative z-10 below.
        */}
        <div className="p-4">
          <h3 className="text-foreground font-medium mb-2 line-clamp-2 min-h-[2.5rem]">
            {product.name}
          </h3>
          
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {product.vendor ? (
              <Link
                to={`/store/${product.vendor.id}`}
                className="relative z-10 pointer-events-auto inline-flex items-center gap-1.5 text-sm bg-muted/60 border border-border rounded-full px-2.5 py-1 hover:border-primary/50 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <Store className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                {countryFlag(product.vendor.country) && (
                  <span role="img" aria-label={product.vendor.country ?? undefined}>
                    {countryFlag(product.vendor.country)}
                  </span>
                )}
                <span className="font-medium text-foreground">{product.vendor.store_name}</span>
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm bg-muted/60 border border-border rounded-full px-2.5 py-1">
                <Store className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium text-foreground">NexaMart</span>
              </span>
            )}
            <span className="text-xs text-muted-foreground/60">{timeAgo(product.created_at)}</span>
          </div>
          
          <div className="flex items-center gap-1 mb-3">
            {renderStars(product.rating)}
            <span className="text-muted-foreground text-sm ml-1">({product.rating})</span>
          </div>
          
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-foreground font-bold text-lg">
                {formatPrice(product.price)}
              </span>
              {product.compare_price && product.compare_price > product.price && (
                <span className="text-muted-foreground text-sm line-through ml-2">
                  {formatPrice(product.compare_price)}
                </span>
              )}
            </div>
          </div>

          {isOutOfStock ? (
            <p className="text-sm font-medium text-muted-foreground mb-3">
              Out of stock
              <span className="font-normal"> — check back later or view similar items</span>
            </p>
          ) : isLowStock && totalStock !== null ? (
            <p className="text-sm font-medium text-warning mb-3">Only {totalStock} left</p>
          ) : null}

          <div className="relative z-10 pointer-events-auto transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
            {hasVariants ? (
              <Button
                variant="default"
                className="w-full"
                disabled={isOutOfStock}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate(`/product/${product.id}`);
                }}
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                {isOutOfStock ? 'Out of Stock' : 'Select Options'}
              </Button>
            ) : (
              <AddToCartButton
                productId={product.id}
                product={product}
                quantity={1}
                disabled={isOutOfStock}
                disabledText={isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
                className="w-full"
              />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}