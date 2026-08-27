import { useNavigate, Link } from 'react-router-dom';
import { Check, X, ArrowRight, ShoppingCart, BadgeCheck } from 'lucide-react';
import { Button } from '../ui/button';
import { useCart } from '../../context/CartContext';
import { SafeImg } from '../SafeImg';
import type { ProductVariants } from '../../types';

export interface Recommendation {
  product_id: string;
  reason: string;
  match_score: number;
  pros: string[];
  cons: string[];
  product: {
    id: string;
    name: string;
    price: number;
    images: string[];
    rating: number;
    stock_quantity: number;
    variants?: ProductVariants;
  };
}

interface ProductRecommendationCardProps {
  recommendation: Recommendation;
  index: number;
}

export function ProductRecommendationCard({ recommendation, index }: ProductRecommendationCardProps) {
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(price);
  };

  const product = recommendation.product;

  const hasVariants = !!product.variants?.options?.length;
  const isOutOfStock = hasVariants
    ? !product.variants!.combinations?.some((c) => (c.stock || 0) > 0)
    : product.stock_quantity === 0;

  const handleAddToCart = async () => {
    await addToCart(product.id, 1, undefined, undefined, undefined, product);
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
<div className="flex gap-4 p-4">
          <Link
            to={`/product/${product.id}`}
            className="w-24 h-24 bg-muted rounded-lg overflow-hidden flex-shrink-0 block"
            aria-label={`View ${product.name}`}
          >
            {product.images?.[0] && (
              <SafeImg src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
            )}
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <Link
                to={`/product/${product.id}`}
                className="text-foreground font-semibold line-clamp-2 hover:text-primary"
              >
                #{index + 1} {product.name}
              </Link>
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success text-xs font-medium px-2 py-0.5 shrink-0">
              <BadgeCheck className="w-3 h-3" />
              {Math.round(recommendation.match_score)}% match
            </span>
          </div>
          <p className="text-primary font-bold text-lg mt-1">{formatPrice(product.price)}</p>
          {product.rating > 0 && (
            <p className="text-xs text-muted-foreground">Rating: {product.rating} / 5</p>
          )}
        </div>
      </div>

      <div className="px-4 pb-3">
        <p className="text-sm text-secondary-foreground">{recommendation.reason}</p>

        {(recommendation.pros?.length > 0 || recommendation.cons?.length > 0) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {recommendation.pros?.slice(0, 3).map((pro) => (
              <span key={pro} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-success/10 text-success">
                <Check className="w-3 h-3" /> {pro}
              </span>
            ))}
            {recommendation.cons?.slice(0, 3).map((con) => (
              <span key={con} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-destructive/10 text-destructive">
                <X className="w-3 h-3" /> {con}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 px-4 pb-4">
        <Button variant="outline" size="sm" onClick={() => navigate(`/product/${product.id}`)} className="flex-1">
          View Product
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
        <Button size="sm" onClick={handleAddToCart} className="flex-1" disabled={isOutOfStock}>
          <ShoppingCart className="w-4 h-4 mr-1" />
          Add to Cart
        </Button>
      </div>
    </div>
  );
}
