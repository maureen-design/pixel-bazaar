import { Link } from 'react-router-dom';
import { ShoppingCart, X, ChevronRight } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { Button } from './ui/button';

interface CartDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CartDropdown({ isOpen, onClose }: CartDropdownProps) {
  const { cartItems, cartCount, cartTotal } = useCart();

  if (!isOpen) return null;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(price);
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-4 top-20 w-96 bg-card border border-border rounded-lg shadow-xl z-50">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-foreground font-semibold flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Cart ({cartCount})
          </h3>
          <button
            onClick={onClose}
            aria-label="Close cart"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>

        {cartItems.length === 0 ? (
          <div className="p-8 text-center">
            <ShoppingCart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Your cart is empty</p>
          </div>
        ) : (
          <>
            <div className="max-h-80 overflow-y-auto p-4 space-y-4">
              {cartItems.slice(0, 3).map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="w-16 h-16 bg-card rounded-lg overflow-hidden flex-shrink-0">
                    {item.products?.images && item.products.images[0] && (
                      <img
                        src={item.products.images[0]}
                        alt={item.products.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-medium text-sm truncate">
                    {item.products?.name}
                  </p>
                  {item.variant_attributes && (
                    <p className="text-muted-foreground text-xs">
                      {Object.values(item.variant_attributes).join(', ')}
                    </p>
                  )}
                  <p className="text-muted-foreground text-sm">
                    Qty: {item.quantity}
                  </p>
                  <p className="text-primary font-semibold text-sm">
                    {formatPrice((item.variant_price || item.products?.price || 0) * item.quantity)}
                  </p>
                </div>
                </div>
              ))}
              
              {cartItems.length > 3 && (
                <p className="text-muted-foreground text-sm text-center">
                  +{cartItems.length - 3} more items
                </p>
              )}
            </div>

            <div className="p-4 border-t border-border space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-foreground font-semibold">{formatPrice(cartTotal)}</span>
              </div>
              
              <Link to="/cart" onClick={onClose}>
                <Button className="w-full" variant="outline">
                  View Cart
                </Button>
              </Link>
              
              <Link to="/checkout" onClick={onClose}>
                <Button className="w-full">
                  Proceed to Checkout
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
