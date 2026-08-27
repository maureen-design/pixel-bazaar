import { Link } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';

function getMonogram(siteName: string): string {
  const words = siteName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
  const initials = ((words[0]?.[0] || '') + (words[1]?.[0] || '')).toUpperCase();
  return initials || 'NM';
}

const SHOP = [
  { to: '/', label: 'Home' },
  { to: '/search', label: 'Browse Products' },
  { to: '/cart', label: 'Cart' },
  { to: '/wishlist', label: 'Wishlist' },
];

const ACCOUNT = [
  { to: '/orders', label: 'My Orders' },
  { to: '/profile', label: 'Profile' },
  { to: '/vendor/apply', label: 'Become a Vendor' },
];

const COMPANY = [
  { to: '/about', label: 'About Us' },
  { to: '/contact', label: 'Contact' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
];

function PaymentBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border border-gray-200 bg-white shadow-sm"
      style={{ color }}
    >
      {label}
    </span>
  );
}

export function Footer() {
  const { settings } = useSettings();

  return (
    <footer className="bg-[#050810] border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-brand to-brand-dark rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">{getMonogram(settings.siteName)}</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-brand to-brand-dark bg-clip-text text-transparent">
                {settings.siteName}
              </span>
            </div>
            <p className="text-slate-500 text-sm mb-4 max-w-xs">{settings.siteDescription}</p>
            <p className="text-slate-500 text-xs">© {new Date().getFullYear()} {settings.siteName}. All rights reserved.</p>
          </div>

          {/* Shop */}
          <div>
            <h3 className="text-white font-semibold mb-4">Shop</h3>
            <ul className="space-y-2">
              {SHOP.map((link) => (
                <li key={link.to + link.label}>
                  <Link to={link.to} className="text-slate-400 text-sm hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Account */}
          <div>
            <h3 className="text-white font-semibold mb-4">Account</h3>
            <ul className="space-y-2">
              {ACCOUNT.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-slate-400 text-sm hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company + Payment */}
          <div>
            <h3 className="text-white font-semibold mb-4">Company</h3>
            <ul className="space-y-2 mb-6">
              {COMPANY.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-slate-400 text-sm hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <h3 className="text-white font-semibold mb-3">We Accept</h3>
            <div className="flex flex-wrap gap-2">
              {settings.mpesaEnabled && <PaymentBadge label="M-Pesa" color="#4CAF50" />}
              {settings.cardEnabled && <PaymentBadge label="Visa" color="#1A1F71" />}
              {settings.cardEnabled && <PaymentBadge label="Mastercard" color="#EB001B" />}
              {settings.bankTransferEnabled && <PaymentBadge label="Bank" color="#A78BFA" />}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
