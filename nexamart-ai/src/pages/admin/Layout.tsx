import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Package, ShoppingCart, BarChart3, Settings, Shield, Store, LogOut, Menu, X, ArrowLeft, Tag, MessageSquare, ClipboardList, Activity } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useSettings } from '../../hooks/useSettings';

const navItems = [
  { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/admin/vendors', icon: Store, label: 'Vendors' },
  { path: '/admin/users', icon: Users, label: 'Users' },
  { path: '/admin/products', icon: Package, label: 'Products' },
  { path: '/admin/categories', icon: BarChart3, label: 'Categories' },
  { path: '/admin/inventory', icon: ClipboardList, label: 'Inventory' },
  { path: '/admin/orders', icon: ShoppingCart, label: 'Orders' },
  { path: '/admin/coupons', icon: Tag, label: 'Coupons' },
  { path: '/admin/reviews', icon: MessageSquare, label: 'Reviews' },
  { path: '/admin/reports', icon: BarChart3, label: 'Reports' },
  { path: '/admin/activity-logs', icon: Activity, label: 'Activity Logs' },
  { path: '/admin/settings', icon: Settings, label: 'Settings' },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { settings } = useSettings();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useFocusTrap(sidebarOpen, () => setSidebarOpen(false));

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-primary" />
          <span className="font-semibold">{settings.siteName} Admin</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X aria-hidden="true" className="w-5 h-5" /> : <Menu aria-hidden="true" className="w-5 h-5" />}
        </Button>
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
                <SidebarContent profile={profile} navItems={navItems} location={location} onSignOut={handleSignOut} onClose={() => setSidebarOpen(false)} siteName={settings.siteName} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 bg-card border-r border-border min-h-screen sticky top-0">
          <SidebarContent profile={profile} navItems={navItems} location={location} onSignOut={handleSignOut} siteName={settings.siteName} />
        </aside>

        {/* Main Content */}
        <div className="flex-1 p-4 lg:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function SidebarContent({ profile, navItems, location, onSignOut, onClose, siteName }: { profile: any; navItems: any[]; location: any; onSignOut: () => void; onClose?: () => void; siteName: string }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" />
          <div>
            <h1 className="font-bold text-lg">{siteName}</h1>
            <p className="text-xs text-muted-foreground">Admin Portal</p>
          </div>
        </div>
      </div>

      {profile && (
        <div className="p-4 border-b border-border">
          <p className="text-sm text-muted-foreground">Admin</p>
          <p className="font-medium text-sm truncate">{profile.full_name || profile.email}</p>
        </div>
      )}

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || (item.path !== '/admin/dashboard' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive ? 'bg-primary text-primary-foreground' : 'text-secondary-foreground hover:bg-muted hover:text-accent-foreground'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

<div className="p-4 border-t border-border">
        <Link
          to="/"
          onClick={onClose}
          className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-secondary-foreground hover:bg-muted hover:text-accent-foreground mb-2"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Store
        </Link>
        <Button variant="ghost" className="w-full justify-start text-secondary-foreground hover:text-accent-foreground hover:bg-muted" onClick={onSignOut}>
          <LogOut className="w-4 h-4 mr-3" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
