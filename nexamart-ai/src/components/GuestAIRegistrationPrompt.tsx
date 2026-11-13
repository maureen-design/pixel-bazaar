import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';

export function GuestAIRegistrationPrompt() {
  const [visible, setVisible] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleLimit = () => setVisible(true);
    window.addEventListener('nexamart:guest-ai-limit', handleLimit);
    return () => window.removeEventListener('nexamart:guest-ai-limit', handleLimit);
  }, []);

  if (!visible) return null;

  const nextPath = location.pathname + location.search;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed bottom-24 right-4 z-[90] w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl"
    >
      <div className="flex items-start gap-3">
        <Sparkles aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Experience more with NexaMart AI</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a free account to experience more of our AI shopping assistance and personalized recommendations.
          </p>
          <Link
            to={`/signup?next=${encodeURIComponent(nextPath)}`}
            className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Create a free account
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Dismiss registration invitation"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
