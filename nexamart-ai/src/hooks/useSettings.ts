import { useEffect, useState } from 'react';
import { getSettings, type PlatformSettings, DEFAULT_SETTINGS } from '../lib/settings';

export function useSettings() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getSettings().then((result) => {
      if (!active) return;
      setSettings(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { settings, loading };
}
