import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useMarketplaceStats() {
  const [productCount, setProductCount] = useState<number | null>(null);
  const [vendorCount, setVendorCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      const { count: products } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // `id` rather than `*`: migration 0032 revoked SELECT on several vendors
      // columns for anon, and a star would expand to them even on a head count.
      const { count: vendors } = await supabase
        .from('vendors')
        .select('id', { count: 'exact', head: true })
        .eq('is_verified', true);

      if (!cancelled) {
        setProductCount(typeof products === 'number' ? products : null);
        setVendorCount(typeof vendors === 'number' ? vendors : null);
      }
    }

    fetchStats();
    return () => { cancelled = true; };
  }, []);

  return { productCount, vendorCount };
}
