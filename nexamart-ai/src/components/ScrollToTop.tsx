import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Resets scroll position on route change — standard SPA behavior so navigating
// from a deep-scrolled page doesn't land the user mid-page on the next one.
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
