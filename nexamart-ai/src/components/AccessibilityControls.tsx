import { Eye, Type } from 'lucide-react';
import { useAccessibilityPreferences } from '../hooks/useAccessibilityPreferences';

export function AccessibilityControls() {
  const { isHighContrast, isLargeText, toggleHighContrast, toggleLargeText } = useAccessibilityPreferences();

  return (
    <details className="relative">
      <summary
        aria-label="Accessibility options"
        className="list-none cursor-pointer inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Eye aria-hidden="true" className="h-5 w-5" />
        <span className="hidden lg:inline">Accessibility</span>
      </summary>
      <div className="absolute right-0 top-full z-[70] mt-2 w-64 rounded-xl border border-border bg-card p-4 text-foreground shadow-xl">
        <p className="mb-3 text-sm font-semibold">Accessibility preferences</p>
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2 text-sm">
          <span className="flex items-center gap-2"><Eye aria-hidden="true" className="h-4 w-4" />High contrast</span>
          <input type="checkbox" checked={isHighContrast} onChange={toggleHighContrast} className="h-4 w-4 accent-[var(--brand)]" />
        </label>
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2 text-sm">
          <span className="flex items-center gap-2"><Type aria-hidden="true" className="h-4 w-4" />Larger text</span>
          <input type="checkbox" checked={isLargeText} onChange={toggleLargeText} className="h-4 w-4 accent-[var(--brand)]" />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">These settings are available without an account and are saved on this device.</p>
      </div>
    </details>
  );
}
