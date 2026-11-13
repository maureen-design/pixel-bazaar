import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, User, UserCircle, LogOut, Settings, Heart, Shield, Sun, Moon, Sparkles, X, ChevronDown, Package, LayoutDashboard } from 'lucide-react';
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
import { useCategories } from '../hooks/useCategories';
import { formatPrice } from '../config/pricing';

const HEADER_CATEGORY_LIMIT = 6;

export function Navbar() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const { user, signOut, isVendor, isAdmin } = useAuth();
  const { cartItems, cartCount, cartTotal, removeFromCart } = useCart();
  const { wishlistCount } = useWishlist();
  const { settings } = useSettings();
  const { categories } = useCategories();
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
    if (localStorage.getItem('high-contrast') === 'true') {
      document.documentElement.classList.add('high-contrast');
    }
    if (localStorage.getItem('text-scale-large') === 'true') {
      document.documentElement.classList.add('text-scale-large');
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

  const headerCategories = categories.slice(0, HEADER_CATEGORY_LIMIT);
  const moreCategories = categories.slice(HEADER_CATEGORY_LIMIT);

  return (
    <nav className="glass sticky top-0 z-50">
      {/* Main header row */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 flex-shrink-0">
            <Monogram className="w-9 h-9" />
            <span className="text-xl font-bold text-foreground">
              {settings.siteName}
            </span>
          </Link>

          {/* Desktop Search Bar */}
          <div className="hidden md:flex items-center flex-1 max-w-md mx-6">
            <AISearchBar />
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-1">
            {/* Wishlist */}
            <Link
              to="/wishlist"
              aria-label={`Wishlist, ${wishlistCount} item${wishlistCount === 1 ? '' : 's'}`}
              className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Heart aria-hidden="true" className="w-5 h-5" />
              {wishlistCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-destructive text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-medium">
                  {wishlistCount}
                </span>
              )}
            </Link>

            {/* Ask AI */}
            <button
              onClick={() => setIsAIOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-ai/15 text-ai hover:bg-ai/25 rounded-full text-sm font-medium transition-colors"
            >
              <Sparkles aria-hidden="true" className="w-3.5 h-3.5" />
              Ask AI
            </button>
            <button
              onClick={() => setIsAIOpen(true)}
              className="sm:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
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

            {/* Cart */}
            <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
              <SheetTrigger
                render={
                  <button
                    aria-label={`Shopping cart with ${cartCount} item${cartCount === 1 ? '' : 's'}`}
                    className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ShoppingCart aria-hidden="true" className="w-5 h-5" />
                    {cartCount > 0 && (
                      <span key={cartCount} className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-medium animate-bounce">
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

            {/* User Menu */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      aria-label="Open user menu"
                      className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="w-8 h-8 bg-gradient-to-br from-brand to-brand-dark rounded-full flex items-center justify-center">
                        <User aria-hidden="true" className="w-4 h-4 text-white" />
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
                    <Package className="w-4 h-4 mr-2" />
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
                      <LayoutDashboard className="w-4 h-4 mr-2" />
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
                  className="flex items-center gap-2 px-3 py-2 hover:bg-muted rounded-lg transition-colors text-sm"
                >
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign In</span>
                </Link>
                <Link
                  to="/signup"
                  className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground hover:bg-primary/80 rounded-lg transition-colors text-sm font-medium"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Category Navigation Bar */}
      <div className="border-t border-border/50 hidden md:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-10">
            {/* Scrollable category links */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1">
              {headerCategories.map((category) => (
                <Link
                  key={category.id}
                  to={`/search?category=${category.id}`}
                  className="flex-shrink-0 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted"
                >
                  {category.name}
                </Link>
              ))}
            </div>
            {/* More dropdown — outside overflow container */}
            {moreCategories.length > 0 && (
              <div
                className="relative flex-shrink-0 ml-1"
                ref={(el) => {
                  if (el) {
                    el.onblur = (e) => {
                      if (!el.contains(e.relatedTarget as Node)) {
                        setTimeout(() => setIsMoreOpen(false), 150);
                      }
                    };
                  }
                }}
              >
                <button
                  aria-expanded={isMoreOpen}
                  aria-haspopup="menu"
                  tabIndex={0}
                  onClick={() => setIsMoreOpen((prev) => !prev)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setIsMoreOpen((prev) => !prev);
                    }
                    if (e.key === 'Escape') setIsMoreOpen(false);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted"
                >
                  More
                  <ChevronDown className="w-3 h-3" />
                </button>
                {isMoreOpen && (
                  <div
                    role="menu"
                    className="absolute top-full right-0 mt-0 pt-1 bg-popover border border-border rounded-lg shadow-lg py-1 z-50 min-w-[180px]"
                  >
                    {moreCategories.map((category) => (
                      <Link
                        key={category.id}
                        role="menuitem"
                        to={`/search?category=${category.id}`}
                        onClick={() => setIsMoreOpen(false)}
                        onMouseDown={(e) => e.preventDefault()}
                        className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        {category.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Category Navigation */}
      {categories.length > 0 && (
        <div className="border-t border-border/50 md:hidden">
          <div className="max-w-7xl mx-auto px-4">
            <nav aria-label="Product categories" className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-2">
              {categories.map((category) => (
                <Link
                  key={category.id}
                  to={`/search?category=${category.id}`}
                  className="flex-shrink-0 inline-flex items-center min-h-11 px-3.5 rounded-full border border-border bg-card/60 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {category.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Search Bar Section - Mobile */}
      <div className="border-t border-border/50 md:hidden">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <AISearchBar />
        </div>
      </div>

      <ShoppingAssistantModal open={isAIOpen} onOpenChange={setIsAIOpen} />
    </nav>
  );
}
