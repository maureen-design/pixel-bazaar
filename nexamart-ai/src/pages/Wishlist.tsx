import { Link } from 'react-router-dom';
import { Heart, ChevronLeft, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Skeleton } from '../components/ui/skeleton';

export function Wishlist() {
  const { wishlistItems, isLoading, removeFromWishlist } = useWishlist();
  const { user } = useAuth();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(price);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
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
                ? 'Save your favorite items here to shop later.'
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
                  <ChevronLeft className="w-4 h-4 mr-2" />
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
          <Heart className="w-7 h-7 text-destructive" />
          <h1 className="text-2xl font-bold text-foreground">
            My Wishlist ({wishlistItems.length})
          </h1>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {wishlistItems.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card rounded-xl overflow-hidden border border-border hover:border-border transition-colors group"
            >
              <Link to={`/product/${item.products?.id}`}>
                <div className="aspect-square overflow-hidden bg-muted">
                  {item.products?.images?.[0] && (
                    <img
                      src={item.products.images[0]}
                      alt={item.products.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  )}
                </div>
              </Link>

              <div className="p-4">
                <Link to={`/product/${item.products?.id}`}>
                  <h3 className="text-foreground font-medium mb-1 line-clamp-2 hover:text-primary transition-colors">
                    {item.products?.name}
                  </h3>
                </Link>

                <p className="text-primary font-semibold text-lg mb-3">
                  {formatPrice(item.products?.price || 0)}
                </p>

                <Button
                  variant="outline"
                  className="w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive/80"
                  onClick={() => removeFromWishlist(item.product_id)}
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
