import { Link } from 'react-router-dom';
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { getDeliveryBaseCost } from '../lib/settings';
import { useSettings } from '../hooks/useSettings';

export function Cart() {
  const { cartItems, cartTotal, removeFromCart, updateQuantity, loading } = useCart();
  const { user } = useAuth();
  const { settings } = useSettings();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(price);
  };

  const itemPrice = (item: (typeof cartItems)[number]) => {
    return item.variant_price ?? item.products?.price ?? 0;
  };

  const getCartItemStock = (item: (typeof cartItems)[number]): number => {
    if (item.variant_id) {
      const combinations = item.products?.variants?.combinations;
      const combo = combinations?.find((c) => c.id === item.variant_id);
      return combo ? Math.max(0, combo.stock || 0) : 0;
    }
    return Math.max(0, item.products?.stock_quantity || 0);
  };

  const formatVariantAttributes = (attributes?: Record<string, string>) => {
    if (!attributes) return '';
    return Object.values(attributes).join(', ');
  };

  const estimatedShipping = getDeliveryBaseCost('standard', settings);
  const taxRate = settings.taxRate / 100;
  const tax = Math.round(cartTotal * taxRate * 100) / 100;
  const total = cartTotal + estimatedShipping + tax;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold mb-8">Shopping Cart</h1>

        {!user && cartItems.length > 0 && (
          <p className="text-sm text-muted-foreground -mt-6 mb-6">
            Your cart is saved on this device. Sign in at checkout to keep it connected to your
            account.
          </p>
        )}

        {cartItems.length === 0 ? (
          <div className="bg-card rounded-xl p-12 border border-border text-center">
            <ShoppingBag className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2">
              {user ? 'Your cart is empty' : 'Your cart is waiting'}
            </h2>
            <p className="text-muted-foreground mb-6">
              {user
                ? "Looks like you haven't added any items to your cart yet."
                : 'Explore the marketplace and find something you love.'}
            </p>
            {!user && (
              <p className="text-sm text-muted-foreground mb-6">
                Your cart connects to your account at checkout.{' '}
                <Link to="/login?next=/cart" className="text-primary hover:text-primary/80">
                  Sign in
                </Link>{' '}
                to keep it with you.
              </p>
            )}
            <Link to="/">
              <Button>
                {user ? 'Continue Shopping' : 'Start Shopping'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-4">
              {cartItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-card rounded-xl p-6 border border-border"
                >
                  <div className="flex gap-4">
                    <div className="w-24 h-24 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                      {item.products?.images && item.products.images[0] && (
                        <img
                          src={item.products.images[0]}
                          alt={item.products.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="text-foreground font-medium mb-1">
                            {item.products?.name}
                          </h3>
                          {item.variant_attributes && (
                            <p className="text-muted-foreground text-xs mb-1">
                              {formatVariantAttributes(item.variant_attributes)}
                            </p>
                          )}
                          <p className="text-muted-foreground text-sm">
                            {item.products?.price && formatPrice(itemPrice(item))}
                          </p>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          aria-label={`Remove ${item.products?.name || 'item'} from cart`}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 aria-hidden="true" className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-muted rounded-lg border border-border">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            aria-label={`Decrease quantity of ${item.products?.name || 'item'}`}
                            className="p-2 hover:bg-accent transition-colors"
                            disabled={item.quantity <= 1}
                          >
                            <Minus aria-hidden="true" className="w-4 h-4" />
                          </button>
                          <span className="w-8 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            aria-label={`Increase quantity of ${item.products?.name || 'item'}`}
                            className="p-2 hover:bg-accent transition-colors"
                            disabled={item.quantity >= getCartItemStock(item)}
                          >
                            <Plus aria-hidden="true" className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <p className="text-primary font-semibold">
                          {formatPrice(itemPrice(item) * item.quantity)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="bg-card rounded-xl p-6 border border-border sticky top-24">
                <h2 className="text-xl font-semibold mb-6">Order Summary</h2>
                
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="text-foreground">{formatPrice(cartTotal)}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estimated Shipping</span>
                    <span className="text-foreground">{formatPrice(estimatedShipping)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-2">
                    {formatPrice(estimatedShipping)}. Final shipping calculated at checkout.
                  </p>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax ({(taxRate * 100).toFixed(0)}%)</span>
                    <span className="text-foreground">{formatPrice(tax)}</span>
                  </div>
                  
                  <div className="border-t border-border pt-4">
                    <div className="flex justify-between">
                      <span className="text-foreground font-semibold">Estimated Total</span>
                      <span className="text-foreground font-bold text-xl">{formatPrice(total)}</span>
                    </div>
                  </div>
                </div>

                <Link to="/checkout" className="block">
                  <Button className="w-full py-4 text-lg">
                    Proceed to Checkout
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>

                <Link to="/" className="block mt-4">
                  <Button variant="outline" className="w-full">
                    Continue Shopping
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
