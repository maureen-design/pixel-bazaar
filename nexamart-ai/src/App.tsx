import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { CompareProvider } from './context/CompareContext';
import { CompareBar } from './components/CompareBar';
import { GuestAIRegistrationPrompt } from './components/GuestAIRegistrationPrompt';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import { VendorProtectedRoute } from './components/VendorProtectedRoute';
import { AdminProtectedRoute } from './components/AdminProtectedRoute';
import { ScrollToTop } from './components/ScrollToTop';
import { useSettings } from './hooks/useSettings';

const Login = lazy(() => import('./pages/auth/Login').then(m => ({ default: m.Login })));
const Signup = lazy(() => import('./pages/auth/Signup').then(m => ({ default: m.Signup })));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword').then(m => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword').then(m => ({ default: m.ResetPassword })));
const AuthCallback = lazy(() => import('./pages/auth/AuthCallback').then(m => ({ default: m.AuthCallback })));
const AuthRedirect = lazy(() => import('./pages/auth/AuthRedirect').then(m => ({ default: m.AuthRedirect })));
const Homepage = lazy(() => import('./pages/Homepage').then(m => ({ default: m.Homepage })));
const ProductDetail = lazy(() => import('./pages/ProductDetail').then(m => ({ default: m.ProductDetail })));
const StorePage = lazy(() => import('./pages/StorePage').then(m => ({ default: m.StorePage })));
const Cart = lazy(() => import('./pages/Cart').then(m => ({ default: m.Cart })));
const Checkout = lazy(() => import('./pages/Checkout').then(m => ({ default: m.Checkout })));
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation').then(m => ({ default: m.OrderConfirmation })));
const VendorApply = lazy(() => import('./pages/vendor/Apply').then(m => ({ default: m.VendorApply })));
const VendorLayout = lazy(() => import('./pages/vendor/Layout').then(m => ({ default: m.VendorLayout })));
const VendorDashboard = lazy(() => import('./pages/vendor/Dashboard').then(m => ({ default: m.VendorDashboard })));
const VendorProducts = lazy(() => import('./pages/vendor/Products').then(m => ({ default: m.VendorProducts })));
const VendorOrders = lazy(() => import('./pages/vendor/Orders').then(m => ({ default: m.VendorOrders })));
const VendorAnalytics = lazy(() => import('./pages/vendor/Analytics').then(m => ({ default: m.VendorAnalytics })));
const VendorSettings = lazy(() => import('./pages/vendor/Settings').then(m => ({ default: m.VendorSettings })));
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const Orders = lazy(() => import('./pages/Orders').then(m => ({ default: m.Orders })));
const Wishlist = lazy(() => import('./pages/Wishlist').then(m => ({ default: m.Wishlist })));
const Search = lazy(() => import('./pages/Search').then(m => ({ default: m.Search })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Compare = lazy(() => import('./pages/Compare').then(m => ({ default: m.Compare })));
const About = lazy(() => import('./pages/About').then(m => ({ default: m.About })));
const Contact = lazy(() => import('./pages/Contact').then(m => ({ default: m.Contact })));
const Privacy = lazy(() => import('./pages/Privacy').then(m => ({ default: m.Privacy })));
const Terms = lazy(() => import('./pages/Terms').then(m => ({ default: m.Terms })));
const NotFound = lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })));
const AdminLayout = lazy(() => import('./pages/admin/Layout').then(m => ({ default: m.AdminLayout })));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard').then(m => ({ default: m.AdminDashboard })));
const AdminVendors = lazy(() => import('./pages/admin/Vendors').then(m => ({ default: m.AdminVendors })));
const AdminUsers = lazy(() => import('./pages/admin/Users').then(m => ({ default: m.AdminUsers })));
const AdminProducts = lazy(() => import('./pages/admin/Products').then(m => ({ default: m.AdminProducts })));
const AdminCategories = lazy(() => import('./pages/admin/Categories').then(m => ({ default: m.AdminCategories })));
const AdminOrders = lazy(() => import('./pages/admin/Orders').then(m => ({ default: m.AdminOrders })));
const AdminReports = lazy(() => import('./pages/admin/Reports').then(m => ({ default: m.AdminReports })));
const AdminSettings = lazy(() => import('./pages/admin/Settings').then(m => ({ default: m.AdminSettings })));
const AdminCoupons = lazy(() => import('./pages/admin/Coupons').then(m => ({ default: m.AdminCoupons })));
const AdminReviews = lazy(() => import('./pages/admin/Reviews').then(m => ({ default: m.AdminReviews })));
const AdminInventory = lazy(() => import('./pages/admin/Inventory').then(m => ({ default: m.AdminInventory })));
const AdminActivityLogs = lazy(() => import('./pages/admin/ActivityLogs').then(m => ({ default: m.AdminActivityLogs })));

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

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
    <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
          <CompareProvider>
          <SiteIdentity />
          <ScrollToTop />
          <Toaster position="top-right" richColors />
          <CompareBar />
          <GuestAIRegistrationPrompt />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:bg-card focus:text-foreground focus:px-4 focus:py-2 focus:rounded-lg focus:ring-2 focus:ring-primary"
          >
            Skip to content
          </a>
           <main id="main-content" className="outline-none">
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/redirect" element={<AuthRedirect />} />
            {/* Public storefront */}
            <Route path="/" element={<Homepage />} />
            <Route path="/search" element={<Search />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/store/:id" element={<StorePage />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order-confirmation/:orderId" element={<OrderConfirmation />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/:orderNumber" element={<Orders />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/vendor/apply" element={<VendorApply />} />
              <Route element={<AdminProtectedRoute />}>
                <Route path="/admin" element={
                  <ErrorBoundary>
                    <AdminLayout />
                  </ErrorBoundary>
                }>
                  <Route index element={
                    <ErrorBoundary>
                      <AdminDashboard />
                    </ErrorBoundary>
                  } />
                  <Route path="dashboard" element={
                    <ErrorBoundary>
                      <AdminDashboard />
                    </ErrorBoundary>
                  } />
                  <Route path="vendors" element={
                    <ErrorBoundary>
                      <AdminVendors />
                    </ErrorBoundary>
                  } />
                  <Route path="users" element={
                    <ErrorBoundary>
                      <AdminUsers />
                    </ErrorBoundary>
                  } />
                  <Route path="products" element={
                    <ErrorBoundary>
                      <AdminProducts />
                    </ErrorBoundary>
                  } />
                  <Route path="categories" element={
                    <ErrorBoundary>
                      <AdminCategories />
                    </ErrorBoundary>
                  } />
                  <Route path="orders" element={
                    <ErrorBoundary>
                      <AdminOrders />
                    </ErrorBoundary>
                  } />
                  <Route path="reports" element={
                    <ErrorBoundary>
                      <AdminReports />
                    </ErrorBoundary>
                  } />
                  <Route path="settings" element={
                    <ErrorBoundary>
                      <AdminSettings />
                    </ErrorBoundary>
                  } />
                  <Route path="coupons" element={
                    <ErrorBoundary>
                      <AdminCoupons />
                    </ErrorBoundary>
                  } />
                  <Route path="reviews" element={
                    <ErrorBoundary>
                      <AdminReviews />
                    </ErrorBoundary>
                  } />
                  <Route path="inventory" element={
                    <ErrorBoundary>
                      <AdminInventory />
                    </ErrorBoundary>
                  } />
                  <Route path="activity-logs" element={
                    <ErrorBoundary>
                      <AdminActivityLogs />
                    </ErrorBoundary>
                  } />
                </Route>
              </Route>
              <Route element={<VendorProtectedRoute />}>
                <Route path="/vendor" element={
                  <ErrorBoundary>
                    <VendorLayout />
                  </ErrorBoundary>
                }>
                  <Route index element={
                    <ErrorBoundary>
                      <VendorDashboard />
                    </ErrorBoundary>
                  } />
                  <Route path="dashboard" element={
                    <ErrorBoundary>
                      <VendorDashboard />
                    </ErrorBoundary>
                  } />
                  <Route path="products" element={
                    <ErrorBoundary>
                      <VendorProducts />
                    </ErrorBoundary>
                  } />
                  <Route path="orders" element={
                    <ErrorBoundary>
                      <VendorOrders />
                    </ErrorBoundary>
                  } />
                  <Route path="analytics" element={
                    <ErrorBoundary>
                      <VendorAnalytics />
                    </ErrorBoundary>
                  } />
                  <Route path="settings" element={
                    <ErrorBoundary>
                      <VendorSettings />
                    </ErrorBoundary>
                  } />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </main>
          </CompareProvider>
          </WishlistProvider>
        </CartProvider>
        </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;