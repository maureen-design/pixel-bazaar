import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { VendorProtectedRoute } from './components/VendorProtectedRoute';
import { AdminProtectedRoute } from './components/AdminProtectedRoute';
import { Login } from './pages/auth/Login';
import { Signup } from './pages/auth/Signup';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { ResetPassword } from './pages/auth/ResetPassword';
import { AuthCallback } from './pages/auth/AuthCallback';
import { Homepage } from './pages/Homepage';
import { ProductDetail } from './pages/ProductDetail';
import { Cart } from './pages/Cart';
import { Checkout } from './pages/Checkout';
import { OrderConfirmation } from './pages/OrderConfirmation';
import { VendorApply } from './pages/vendor/Apply';
import { VendorLayout } from './pages/vendor/Layout';
import { VendorDashboard } from './pages/vendor/Dashboard';
import { VendorProducts } from './pages/vendor/Products';
import { VendorOrders } from './pages/vendor/Orders';
import { VendorAnalytics } from './pages/vendor/Analytics';
import { Profile } from './pages/Profile';
import { Orders } from './pages/Orders';
import { Wishlist } from './pages/Wishlist';
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';
import { Compare } from './pages/Compare';
import { AdminLayout } from './pages/admin/Layout';
import { AdminDashboard } from './pages/admin/Dashboard';
import { AdminVendors } from './pages/admin/Vendors';
import { AdminUsers } from './pages/admin/Users';
import { AdminProducts } from './pages/admin/Products';
import { AdminCategories } from './pages/admin/Categories';
import { AdminOrders } from './pages/admin/Orders';
import { AdminReports } from './pages/admin/Reports';
import { AdminSettings } from './pages/admin/Settings';
import { AdminCoupons } from './pages/admin/Coupons';
import { AdminReviews } from './pages/admin/Reviews';
import { AdminInventory } from './pages/admin/Inventory';
import { AdminActivityLogs } from './pages/admin/ActivityLogs';
import { useSettings } from './hooks/useSettings';

function SiteIdentity() {
  const { settings } = useSettings();

  useEffect(() => {
    document.title = settings.siteName;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', settings.siteDescription);
  }, [settings.siteName, settings.siteDescription]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
          <SiteIdentity />
          <Toaster position="top-right" richColors />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:bg-card focus:text-foreground focus:px-4 focus:py-2 focus:rounded-lg focus:ring-2 focus:ring-primary"
          >
            Skip to content
          </a>
          <main id="main-content" className="outline-none">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            {/* Public storefront */}
            <Route path="/" element={<Homepage />} />
            <Route path="/search" element={<Search />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order-confirmation/:orderId" element={<OrderConfirmation />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/vendor/apply" element={<VendorApply />} />
              <Route element={<AdminProtectedRoute />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="vendors" element={<AdminVendors />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="products" element={<AdminProducts />} />
                  <Route path="categories" element={<AdminCategories />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="settings" element={<AdminSettings />} />
                  <Route path="coupons" element={<AdminCoupons />} />
                  <Route path="reviews" element={<AdminReviews />} />
                  <Route path="inventory" element={<AdminInventory />} />
                  <Route path="activity-logs" element={<AdminActivityLogs />} />
                </Route>
              </Route>
              <Route element={<VendorProtectedRoute />}>
                <Route path="/vendor" element={<VendorLayout />}>
                  <Route index element={<VendorDashboard />} />
                  <Route path="dashboard" element={<VendorDashboard />} />
                  <Route path="products" element={<VendorProducts />} />
                  <Route path="orders" element={<VendorOrders />} />
                  <Route path="analytics" element={<VendorAnalytics />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </main>
          </WishlistProvider>
        </CartProvider>
        </AuthProvider>
    </BrowserRouter>
  );
}

export default App;