import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, ArrowRight, Star, Sparkles, Check } from 'lucide-react';
import { SafeImg } from '../SafeImg';
import { Button } from '../ui/button';
import { useCart } from '../../context/CartContext';
import { formatPrice } from '../../config/pricing';
import { getProductStockSummary, getStockState } from '../../lib/stock';
import type { ShoppingConversationProduct } from '../../lib/aiAssistantClient';

interface ConversationalProductCardProps {
  product: ShoppingConversationProduct;
  onAskAbout?: (question: string) => void;
}

export function ConversationalProductCard({ product, onAskAbout }: ConversationalProductCardProps) {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const stockSummary = getProductStockSummary(product);
  const totalStock = stockSummary.hasVariants
    ? stockSummary.aggregateVariantStock
    : stockSummary.baseStock;
  const stockState = getStockState(totalStock, { productStatus: product.status });
  const isUnavailable = !stockSummary.canPurchaseAny;
  const isOutOfStock = stockState === 'out_of_stock';
  const unavailableLabel =
    product.status === 'out_of_stock' || (product.status === 'active' && isOutOfStock)
      ? 'Out of stock'
      : 'Unavailable';
  const isLowStock = stockState === 'low';

  const stockAccessibleText = isUnavailable
    ? unavailableLabel
    : isLowStock
      ? totalStock !== null
        ? `Low stock, only ${totalStock} units left`
        : 'Low stock'
      : stockSummary.hasVariants
        ? 'Multiple options available'
        : 'In stock';

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isUnavailable || isAdding) return;

    if (stockSummary.hasVariants) {
      navigate(`/product/${product.id}`);
      return;
    }

    try {
      setIsAdding(true);
      await addToCart(product.id, 1, undefined, undefined, undefined, product);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 2000);
    } finally {
      setIsAdding(false);
    }
  };

  const handleAskDetails = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onAskAbout) {
      onAskAbout(`Explain the details and highlights of ${product.name}`);
    }
  };

  const imageUrl = Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : '';
  const priceText = formatPrice(product.price);
  const ratingText = typeof product.rating === 'number' && product.rating > 0
    ? `Rating: ${product.rating.toFixed(1)} out of 5 stars`
    : 'No customer reviews yet';

  return (
    <article
      aria-label={`Product recommendation: ${product.name}, price ${priceText}, ${ratingText}, ${stockAccessibleText}`}
      className="bg-card/90 hover:bg-card border border-border/80 hover:border-primary/40 rounded-xl p-3 sm:p-4 shadow-xs transition-all flex flex-col justify-between text-left focus-within:ring-2 focus-within:ring-primary"
    >
      <div>
        <div className="flex gap-3 items-start mb-2.5">
          <Link
            to={`/product/${product.id}`}
            className="w-18 h-18 sm:w-20 sm:h-20 bg-muted/60 rounded-lg overflow-hidden shrink-0 border border-border/50 block relative group focus:outline-hidden focus:ring-2 focus:ring-primary"
            aria-label={`View full details for ${product.name}`}
          >
            {imageUrl ? (
              <SafeImg
                src={imageUrl}
                alt={`${product.name} product photo`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground" aria-hidden="true">
                No image
              </div>
            )}
          </Link>

          <div className="flex-1 min-w-0">
            <Link
              to={`/product/${product.id}`}
              className="font-medium text-sm text-foreground line-clamp-2 hover:text-primary transition-colors block focus:outline-hidden focus:ring-1 focus:ring-primary rounded-xs"
              title={product.name}
            >
              {product.name}
            </Link>

            <div className="flex items-center gap-2 mt-1" aria-label={`Price: ${priceText}`}>
              <span className="font-bold text-sm text-primary">
                {priceText}
              </span>
              {typeof product.rating === 'number' && product.rating > 0 && (
                <div
                  className="flex items-center text-xs text-muted-foreground gap-0.5"
                  aria-label={ratingText}
                >
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" aria-hidden="true" />
                  <span aria-hidden="true">{product.rating.toFixed(1)}</span>
                </div>
              )}
            </div>

            {/* Inventory / Stock status with accessible text */}
            <div className="mt-1 text-xs" role="status" aria-label={`Inventory status: ${stockAccessibleText}`}>
              {isUnavailable ? (
                <span className="text-destructive font-medium">{unavailableLabel}</span>
              ) : isLowStock ? (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  {totalStock !== null ? `Low stock (${totalStock} left)` : 'Low stock'}
                </span>
              ) : stockSummary.hasVariants ? (
                <span className="text-muted-foreground">Options available</span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">In stock</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="pt-2 border-t border-border/60 flex items-center gap-2 mt-1">
        {onAskAbout && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleAskDetails}
            aria-label={`Ask Nexa to explain ${product.name}`}
            className="text-xs h-8 px-2.5 text-muted-foreground hover:text-foreground shrink-0 focus-visible:ring-2 focus-visible:ring-primary"
            title="Ask Nexa for more details on this product"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1 text-primary" aria-hidden="true" />
            Explain
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate(`/product/${product.id}`)}
          aria-label={`View details page for ${product.name}`}
          className="text-xs h-8 px-2.5 flex-1 focus-visible:ring-2 focus-visible:ring-primary"
        >
          View
          <ArrowRight className="w-3 h-3 ml-1" aria-hidden="true" />
        </Button>

        <Button
          type="button"
          size="sm"
          disabled={isUnavailable || isAdding}
          onClick={handleAddToCart}
          aria-label={
            justAdded
              ? `Added ${product.name} to cart`
              : isUnavailable
                ? `${product.name} is ${unavailableLabel}`
                : stockSummary.hasVariants
                  ? `Choose options for ${product.name}`
                  : `Add ${product.name} to cart`
          }
          className={`text-xs h-8 px-3 flex-1 focus-visible:ring-2 focus-visible:ring-primary ${
            justAdded ? 'bg-emerald-600 hover:bg-emerald-600 text-white' : ''
          }`}
        >
          {justAdded ? (
            <>
              <Check className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
              Added
            </>
          ) : isUnavailable ? (
            unavailableLabel
          ) : stockSummary.hasVariants ? (
            'Options'
          ) : (
            <>
              <ShoppingCart className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
              Add
            </>
          )}
        </Button>
      </div>
    </article>
  );
}
