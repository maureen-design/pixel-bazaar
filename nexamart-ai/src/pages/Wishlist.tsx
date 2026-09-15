import { Link, useNavigate } from 'react-router-dom';
import { Heart, X, Star, StarHalf, ShoppingCart, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useWishlist } from '../context/WishlistContext';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Skeleton } from '../components/ui/skeleton';
import { toast } from 'sonner';
import { formatPrice } from '../config/pricing';

function renderStars(rating: number) {
  if (rating <= 0) return null;
  const stars = [];
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  for (let i = 0; i < fullStars; i++) {
    stars.push(<Star key={i} className="w-3.5 h-3.5 fill-warning text-warning" />);
  }
  if (hasHalfStar) {
    stars.push(<StarHalf key="half" className="w-3.5 h-3.5 fill-warning text-warning" />);
  }
  const emptyStars = 5 - Math.ceil(rating);
  for (let i = 0; i < emptyStars; i++) {
    stars.push(<Star key={`empty-${i}`} className="w-3.5 h-3.5 text-muted-foreground" />);
  }
  return stars;
}

export function Wishlist() {
  const { wishlistItems, isLoading, removeFromWishlist } = useWishlist();
  const { addToCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleAddToCart = async (productId: string, inStock: boolean) => {
    if (!inStock) {
      toast.error('This item is out of stock');
      return;
    }
    await addToCart(productId, 1);
    toast.success('Added to cart', {
      action: { label: 'View Cart', onClick: () => navigate('/cart') },
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl overflow-hidden border border-border">
                <Skeleton className="aspect-square rounded-none" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (wishlistItems.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-24 px-4">
          <div className="text-center max-w-md mx-auto">
            <div className="w-20 h-20 bg-card rounded-full flex items-center justify-center mx-auto mb-6 border border-border">
              <Heart className="w-10 h-10 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {user ? 'Your Wishlist is Empty' : 'Your wishlist is empty'}
            </h1>
            <p className="text-muted-foreground mb-8">
              {user
                ? "Save your favorite items here to shop later."
                : 'Sign in to save products and access them anytime.'}
            </p>
            {!user ? (
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link to="/login?next=/wishlist">
                  <Button>Sign In</Button>
                </Link>
                <Link to="/signup?next=/wishlist">
                  <Button variant="outline">Create Account</Button>
                </Link>
              </div>
            ) : (
              <Link to="/">
                <Button>
                  <ShoppingBag className="w-4 h-4 mr-2" />
                  Continue Shopping
                </Button>
              </Link>
            )}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Heart className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">
            My Wishlist ({wishlistItems.length})
          </h1>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <AnimatePresence mode="popLayout">
            {wishlistItems.map((item) => {
              const product = item.products;
              if (!product) return null;
              const inStock = (product.stock_quantity || 0) > 0;
              const hasDiscount = product.compare_price && product.compare_price > product.price;
              const discountPct = hasDiscount
                ? Math.round(((product.compare_price! - product.price) / product.compare_price!) * 100)
                : 0;

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                  className="bg-card rounded-xl overflow-hidden border border-border group"
                >
                  {/* Image */}
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    <Link to={`/product/${product.id}`}>
                      {product.images?.[0] && (
                        <img
                          src={product.images[0]}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      )}
                    </Link>

                    {/* Remove X button — top-right */}
                    <button
                      onClick={() => removeFromWishlist(item.product_id)}
                      className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-background transition-all opacity-0 group-hover:opacity-100"
                      aria-label={`Remove ${product.name} from wishlist`}
                    >
                      <X className="w-4 h-4" />
                    </button>

                    {/* Discount badge */}
                    {hasDiscount && (
                      <span className="absolute top-2 left-2 bg-destructive text-destructive-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                        -{discountPct}%
                      </span>
                    )}

                    {/* Stock badge */}
                    {!inStock && (
                      <span className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-sm text-destructive text-xs font-medium px-2 py-0.5 rounded-full border border-destructive/30">
                        Out of Stock
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <Link to={`/product/${product.id}`}>
                      <h3 className="text-foreground font-medium mb-1 line-clamp-2 hover:text-primary transition-colors text-sm">
                        {product.name}
                      </h3>
                    </Link>

                    {/* Vendor */}
                    {product.vendors?.store_name && (
                      <p className="text-xs text-muted-foreground mb-1.5">{product.vendors.store_name}</p>
                    )}

                    {/* Rating */}
                    {product.rating > 0 && (
                      <div className="flex items-center gap-1 mb-1.5">
                        {renderStars(product.rating)}
                        <span className="text-xs text-muted-foreground ml-0.5">({product.rating})</span>
                      </div>
                    )}

                    {/* Price */}
                    <div className="flex items-center gap-2 mb-3">
                      <p className="text-primary font-semibold">{formatPrice(product.price)}</p>
                      {hasDiscount && (
                        <p className="text-muted-foreground text-xs line-through">{formatPrice(product.compare_price!)}</p>
                      )}
                    </div>

                    {/* Add to Cart button */}
                    <Button
                      className="w-full gap-2"
                      disabled={!inStock}
                      onClick={() => handleAddToCart(item.product_id, inStock)}
                    >
                      <ShoppingCart className="w-4 h-4" />
                      {inStock ? 'Add to Cart' : 'Out of Stock'}
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
      <Footer />
    </div>
  );
}
