import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, User, UserCircle, LogOut, Settings, Heart, Shield, Sun, Moon, Sparkles, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { AISearchBar } from './AISearchBar';
import { ShoppingAssistantModal } from './ai/ShoppingAssistantModal';
import { Button } from './ui/button';
import { Monogram } from './Monogram';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';
import { Separator } from './ui/separator';
import { useSettings } from '../hooks/useSettings';

export function Navbar() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const { user, signOut, isVendor, isAdmin } = useAuth();
  const { cartItems, cartCount, cartTotal, removeFromCart } = useCart();
  const { wishlistCount } = useWishlist();
  const { settings } = useSettings();
  const navigate = useNavigate();

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    if (document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(price);
  };

  return (
    <nav className="glass sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <Monogram />
            <span className="text-xl font-bold bg-gradient-to-r from-brand to-brand-dark bg-clip-text text-transparent">
              {settings.siteName}
            </span>
          </Link>

          {/* Search Bar - Desktop */}
          <div className="hidden md:flex flex-1 max-w-lg mx-8">
            <AISearchBar />
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            {/* Wishlist */}
            <Link
              to="/wishlist"
              aria-label={`Wishlist, ${wishlistCount} item${wishlistCount === 1 ? '' : 's'}`}
              className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Heart aria-hidden="true" className="w-6 h-6" />
              {wishlistCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-destructive text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  {wishlistCount}
                </span>
              )}
            </Link>

            {/* AI Assistant */}
            <button
              onClick={() => setIsAIOpen(true)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Open AI shopping assistant"
            >
              <Sparkles aria-hidden="true" className="w-5 h-5" />
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun aria-hidden="true" className="w-5 h-5" /> : <Moon aria-hidden="true" className="w-5 h-5" />}
            </button>

            {/* Cart - Sheet Trigger */}
            <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
              <SheetTrigger
                render={
                  <button
                    aria-label={`Shopping cart with ${cartCount} item${cartCount === 1 ? '' : 's'}`}
                    className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ShoppingCart aria-hidden="true" className="w-6 h-6" />
                    {cartCount > 0 && (
                      <span key={cartCount} className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center animate-bounce">
                        {cartCount}
                      </span>
                    )}
                  </button>
                }
              />
              <SheetContent side="right" className="w-96">
                <SheetHeader>
                  <SheetTitle>Shopping Cart ({cartCount})</SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto py-4">
                  {cartItems.length === 0 ? (
                    <div className="text-center py-8 px-4">
                      <ShoppingCart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-foreground font-medium mb-1">Your cart is empty</p>
                      <p className="text-muted-foreground text-sm mb-4">
                        {user
                          ? "You haven't added any items yet."
                          : 'Explore the marketplace and find something you love.'}
                      </p>
                      <Link
                        to="/"
                        onClick={() => setIsCartOpen(false)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/80 transition-colors"
                      >
                        Start Shopping
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {cartItems.slice(0, 3).map((item) => (
                        <div key={item.id} className="flex gap-3 px-4">
                          <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                            {item.products?.images && item.products.images[0] && (
                              <img
                                src={item.products.images[0]}
                                alt={item.products.name}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-foreground font-medium text-sm truncate">
                                {item.products?.name}
                              </p>
                              <button
                                onClick={() => removeFromCart(item.id)}
                                className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 p-0.5"
                                aria-label={`Remove ${item.products?.name || 'item'} from cart`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {item.variant_attributes && (
                              <p className="text-muted-foreground text-xs">
                                {Object.values(item.variant_attributes).join(', ')}
                              </p>
                            )}
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-muted-foreground text-sm">
                                Qty: {item.quantity}
                              </p>
                              <p className="text-primary font-semibold text-sm">
                                {formatPrice((item.variant_price || item.products?.price || 0) * item.quantity)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                      {cartItems.length > 3 && (
                        <p className="text-muted-foreground text-sm text-center">
                          +{cartItems.length - 3} more items
                        </p>
                      )}
                    </div>
                  )}
                  {cartItems.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-3 p-4">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="text-foreground font-semibold">{formatPrice(cartTotal)}</span>
                        </div>
                        <Button variant="outline" className="w-full" onClick={() => { navigate('/cart'); setIsCartOpen(false); }}>
                          View Cart
                        </Button>
                        <Button className="w-full" onClick={() => { navigate(user ? '/checkout' : '/login?next=/checkout'); setIsCartOpen(false); }}>
                          {user ? 'Proceed to Checkout' : 'Sign In to Checkout'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            {/* User Menu - DropdownMenu */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      aria-label="Open user menu"
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="w-8 h-8 bg-gradient-to-br from-brand to-brand-dark rounded-full flex items-center justify-center">
                        <User aria-hidden="true" className="w-5 h-5 text-white" />
                      </div>
                    </button>
                  }
                />
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm text-muted-foreground">Signed in as</p>
                        <p className="text-sm font-medium text-foreground truncate">{user.email}</p>
                      </div>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <Separator />
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    <UserCircle className="w-4 h-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/orders')}>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    My Orders
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => navigate('/admin/dashboard')}>
                      <Shield className="w-4 h-4 mr-2" />
                      Admin Panel
                    </DropdownMenuItem>
                  )}
                  {isVendor && (
                    <DropdownMenuItem onClick={() => navigate('/vendor/dashboard')}>
                      <Settings className="w-4 h-4 mr-2" />
                      Vendor Dashboard
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => navigate('/settings')}>
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <Separator />
                  <DropdownMenuItem onClick={handleSignOut} variant="destructive">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="flex items-center gap-2 px-4 py-2 hover:bg-muted rounded-lg transition-colors"
                >
                  <User className="w-4 h-4" />
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/80 rounded-lg transition-colors"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Search Bar - Mobile */}
        <div className="md:hidden pb-4">
          <AISearchBar />
        </div>
      </div>
      <ShoppingAssistantModal open={isAIOpen} onOpenChange={setIsAIOpen} />
    </nav>
  );
}