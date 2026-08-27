import { useState, useEffect } from 'react';
import { X, CreditCard, Truck } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';

const DISMISS_KEY = 'nexamart-banner-dismissed';

export function AnnouncementBanner() {
  const { settings } = useSettings();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    const dismissedDate = dismissed ? new Date(dismissed) : null;
    const isNewDay = !dismissedDate || dismissedDate.toDateString() !== new Date().toDateString();
    if (isNewDay) setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setVisible(false);
  };

  if (!visible) return null;

  const methods: string[] = [];
  if (settings.mpesaEnabled) methods.push('M-Pesa');
  if (settings.cardEnabled) methods.push('Card');
  if (settings.bankTransferEnabled) methods.push('Bank Transfer');

  return (
    <div className="bg-gradient-to-r from-brand/10 via-background to-ai/10 border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-4 flex-wrap justify-center">
            {methods.length > 0 && (
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-brand" />
                Pay with {methods.join(' or ')}
              </span>
            )}
            <span className="hidden sm:inline text-border">·</span>
            <span className="flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-brand" />
              Fast delivery across Kenya
            </span>
          </div>
          <button
            onClick={dismiss}
            className="absolute right-4 sm:relative sm:right-auto p-1 hover:text-foreground transition-colors ml-2"
            aria-label="Dismiss banner"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
