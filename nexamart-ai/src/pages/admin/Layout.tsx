import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Package, ShoppingCart, Settings, Shield, Store, LogOut, Menu, X, ArrowLeft, Tag, MessageSquare, ClipboardList, Activity, FolderOpen, LineChart, Bell, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useSettings } from '../../hooks/useSettings';
import { supabase } from '../../lib/supabaseClient';

interface NavSection {
  title: string;
  items: { path: string; icon: any; label: string }[];
}

const navSections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    title: 'Manage',
    items: [
      { path: '/admin/vendors', icon: Store, label: 'Vendors' },
      { path: '/admin/users', icon: Users, label: 'Users' },
      { path: '/admin/products', icon: Package, label: 'Products' },
      { path: '/admin/categories', icon: FolderOpen, label: 'Categories' },
      { path: '/admin/inventory', icon: ClipboardList, label: 'Inventory' },
    ],
  },
  {
    title: 'Orders & Sales',
    items: [
      { path: '/admin/orders', icon: ShoppingCart, label: 'Orders' },
      { path: '/admin/coupons', icon: Tag, label: 'Coupons' },
      { path: '/admin/reviews', icon: MessageSquare, label: 'Reviews' },
    ],
  },
  {
    title: 'Insights',
    items: [
      { path: '/admin/reports', icon: LineChart, label: 'Reports' },
      { path: '/admin/activity-logs', icon: Activity, label: 'Activity Logs' },
      { path: '/admin/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

const COLLAPSE_KEY = 'admin-sidebar-collapsed';

function useNotificationCounts() {
  const [counts, setCounts] = useState({ pendingVendors: 0, lowStock: 0 });

  useEffect(() => {
    const fetchCounts = async () => {
      const [{ data: vendors }, { data: products }] = await Promise.all([
        supabase.from('vendors').select('id').eq('is_verified', false),
        supabase.from('products').select('id, stock_quantity, status'),
      ]);
      const lowStock = (products || []).filter(
        (p: any) => p.stock_quantity > 0 && p.stock_quantity <= 5 && p.status !== 'out_of_stock'
      ).length;
      setCounts({
        pendingVendors: vendors?.length || 0,
        lowStock,
      });
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);
    return () => clearInterval(interval);
  }, []);

  return counts;
}

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { settings } = useSettings();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === 'true'; } catch { return false; }
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const sidebarRef = useFocusTrap(sidebarOpen, () => setSidebarOpen(false));
  const notifRef = useRef<HTMLDivElement>(null!);
  const notifCounts = useNotificationCounts();
  const totalNotifications = notifCounts.pendingVendors + notifCounts.lowStock;

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, String(collapsed)); } catch {}
  }, [collapsed]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    if (notifOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notifOpen]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Skip to main content link */}
      <a
        href="#admin-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>

      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-primary" />
          <span className="font-semibold">{settings.siteName} Admin</span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell counts={notifCounts} total={totalNotifications} notifOpen={notifOpen} setNotifOpen={setNotifOpen} notifRef={notifRef} />
          <Button
            variant="ghost"
            size="icon"
            aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X aria-hidden="true" className="w-5 h-5" /> : <Menu aria-hidden="true" className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      <div className="flex">
        {/* Mobile Sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSidebarOpen(false)}
                className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              />
              <motion.aside
                ref={sidebarRef}
                role="dialog"
                aria-modal="true"
                aria-label="Admin navigation"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed left-0 top-0 h-full w-64 bg-card border-r border-border z-50 lg:hidden"
              >
                <SidebarContent
                  profile={profile} location={location} onSignOut={handleSignOut}
                  onClose={() => setSidebarOpen(false)} siteName={settings.siteName}
                  collapsed={false}
                  notifCounts={notifCounts} totalNotifications={totalNotifications}
                  notifOpen={notifOpen} setNotifOpen={setNotifOpen} notifRef={notifRef}
                />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Desktop Sidebar */}
        <aside className={`hidden lg:block bg-card border-r border-border min-h-screen sticky top-0 transition-all duration-300 ${collapsed ? 'w-[68px]' : 'w-64'}`}>
          <SidebarContent
            profile={profile} location={location} onSignOut={handleSignOut}
            siteName={settings.siteName} collapsed={collapsed}
            notifCounts={notifCounts} totalNotifications={totalNotifications}
            notifOpen={notifOpen} setNotifOpen={setNotifOpen} notifRef={notifRef}
          />
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute -right-3 top-20 z-10 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>
        </aside>

        {/* Main Content */}
        <main id="admin-main-content" className="flex-1 p-4 lg:p-8 min-w-0" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NotificationBell({ counts, total, notifOpen, setNotifOpen, notifRef }: {
  counts: { pendingVendors: number; lowStock: number };
  total: number;
  notifOpen: boolean;
  setNotifOpen: (v: boolean) => void;
  notifRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="relative" ref={notifRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setNotifOpen(!notifOpen)}
        aria-label={`Notifications${total > 0 ? ` (${total} pending)` : ''}`}
      >
        <Bell className="w-5 h-5" />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </Button>

      <AnimatePresence>
        {notifOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden"
          >
            <div className="p-4 border-b border-border">
              <p className="font-semibold text-sm">Notifications</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {total === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No pending notifications
                </div>
              ) : (
                <>
                  {counts.pendingVendors > 0 && (
                    <Link
                      to="/admin/vendors"
                      onClick={() => setNotifOpen(false)}
                      className="flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors border-b border-border"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Store className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Pending vendor applications</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{counts.pendingVendors} vendor{counts.pendingVendors !== 1 ? 's' : ''} awaiting approval</p>
                      </div>
                    </Link>
                  )}
                  {counts.lowStock > 0 && (
                    <Link
                      to="/admin/inventory"
                      onClick={() => setNotifOpen(false)}
                      className="flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Low stock alerts</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{counts.lowStock} product{counts.lowStock !== 1 ? 's' : ''} running low on stock</p>
                      </div>
                    </Link>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarContent({ profile, location, onSignOut, onClose, siteName, collapsed, notifCounts, totalNotifications, notifOpen, setNotifOpen, notifRef }: {
  profile: any; location: any; onSignOut: () => void; onClose?: () => void; siteName: string; collapsed: boolean;
  notifCounts: { pendingVendors: number; lowStock: number }; totalNotifications: number;
  notifOpen: boolean; setNotifOpen: (v: boolean) => void; notifRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className={`border-b border-border ${collapsed ? 'p-3' : 'px-6 py-5'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
            <Shield className="w-8 h-8 text-primary flex-shrink-0" />
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="font-bold text-lg truncate">{siteName}</h1>
                <p className="text-xs text-muted-foreground">Admin Portal</p>
              </div>
            )}
          </div>
          {!collapsed && (
            <NotificationBell counts={notifCounts} total={totalNotifications} notifOpen={notifOpen} setNotifOpen={setNotifOpen} notifRef={notifRef} />
          )}
        </div>
      </div>

      {profile && !collapsed && (
        <div className="p-4 border-b border-border">
          <p className="text-sm text-muted-foreground">Admin</p>
          <p className="font-medium text-sm truncate">{profile.full_name || profile.email}</p>
        </div>
      )}

      {collapsed && (
        <div className="p-2 border-b border-border flex justify-center">
          <NotificationBell counts={notifCounts} total={totalNotifications} notifOpen={notifOpen} setNotifOpen={setNotifOpen} notifRef={notifRef} />
        </div>
      )}

      <nav className="flex-1 p-2 space-y-3 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{section.title}</p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || (item.path !== '/admin/dashboard' && location.pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onClose}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 rounded-lg text-sm transition-colors ${
                      collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
                    } ${
                      isActive ? 'bg-primary text-primary-foreground' : 'text-secondary-foreground hover:bg-muted hover:text-accent-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={`border-t border-border ${collapsed ? 'p-2' : 'p-4'}`}>
        <Link
          to="/"
          onClick={onClose}
          title={collapsed ? 'Back to Store' : undefined}
          className={`flex items-center gap-3 rounded-lg transition-colors text-secondary-foreground hover:bg-muted hover:text-accent-foreground mb-1 ${
            collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
          }`}
        >
          <ArrowLeft className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Back to Store</span>}
        </Link>
        <Button
          variant="ghost"
          className={`w-full text-secondary-foreground hover:text-accent-foreground hover:bg-muted ${collapsed ? 'justify-center px-2' : 'justify-start'}`}
          onClick={onSignOut}
          title={collapsed ? 'Sign Out' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="ml-3">Sign Out</span>}
        </Button>
      </div>
    </div>
  );
}
