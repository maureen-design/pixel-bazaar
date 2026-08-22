import { ShoppingCart } from 'lucide-react';
import { useCart } from '../context/CartContext';
import type { GuestProductSnapshot } from '../context/CartContext';
import { Button } from './ui/button';

interface AddToCartButtonProps {
  productId: string;
  quantity?: number;
  disabled?: boolean;
  disabledText?: string;
  className?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variantId?: string;
  variantAttributes?: Record<string, string>;
  variantPrice?: number;
  product?: GuestProductSnapshot;
}

export function AddToCartButton({
  productId,
  quantity = 1,
  disabled = false,
  disabledText = 'Out of Stock',
  className,
  variant = 'default',
  size = 'default',
  variantId,
  variantAttributes,
  variantPrice,
  product,
}: AddToCartButtonProps) {
  const { addToCart } = useCart();

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await addToCart(productId, quantity, variantId, variantAttributes, variantPrice, product);
  };

  return (
    <Button
      className={className}
      disabled={disabled}
      variant={variant}
      size={size}
      onClick={handleAddToCart}
    >
      <ShoppingCart className="w-4 h-4 mr-2" />
      {disabled ? disabledText : 'Add to Cart'}
    </Button>
  );
}
