import { useEffect, useState } from 'react';

interface AccessibilityPreferences {
  isHighContrast: boolean;
  isLargeText: boolean;
}

const readPreferences = (): AccessibilityPreferences => ({
  isHighContrast: localStorage.getItem('high-contrast') === 'true',
  isLargeText: localStorage.getItem('text-scale-large') === 'true',
});

function applyPreferences(preferences: AccessibilityPreferences) {
  const root = document.documentElement;
  root.classList.toggle('high-contrast', preferences.isHighContrast);
  root.classList.toggle('text-scale-large', preferences.isLargeText);
}

export function useAccessibilityPreferences() {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(readPreferences);

  useEffect(() => {
    const sync = () => setPreferences(readPreferences());
    window.addEventListener('nexamart:accessibility-change', sync);
    window.addEventListener('storage', sync);
    applyPreferences(readPreferences());
    return () => {
      window.removeEventListener('nexamart:accessibility-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const update = (key: keyof AccessibilityPreferences) => {
    const next = { ...readPreferences(), [key]: !preferences[key] };
    localStorage.setItem(key === 'isHighContrast' ? 'high-contrast' : 'text-scale-large', String(next[key]));
    applyPreferences(next);
    setPreferences(next);
    window.dispatchEvent(new Event('nexamart:accessibility-change'));
  };

  return {
    ...preferences,
    toggleHighContrast: () => update('isHighContrast'),
    toggleLargeText: () => update('isLargeText'),
  };
}
