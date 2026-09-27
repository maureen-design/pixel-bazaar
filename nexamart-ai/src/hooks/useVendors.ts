import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface VendorSummary {
  id: string;
  store_name: string;
  store_logo: string;
  store_description: string;
  rating: number;
  product_count: number;
}

export function useFeaturedVendors(limit = 6) {
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const { data: vendorsData, error } = await supabase
          .from('vendors')
          .select('id, store_name, store_logo, store_description, rating, country')
          .eq('is_verified', true)
          .order('rating', { ascending: false })
          .limit(limit);

        if (error) throw error;

        const vendorIds = (vendorsData || []).map((v) => v.id);
        if (vendorIds.length === 0) {
          setVendors([]);
          return;
        }

        const { data: productCounts } = await supabase
          .from('products')
          .select('vendor_id')
          .eq('status', 'active')
          .in('vendor_id', vendorIds);

        const countMap: Record<string, number> = {};
        (productCounts || []).forEach((p) => {
          countMap[p.vendor_id] = (countMap[p.vendor_id] || 0) + 1;
        });

        setVendors(
          (vendorsData || []).map((v) => ({
            ...v,
            product_count: countMap[v.id] || 0,
          }))
        );
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }

    fetch();
  }, [limit]);

  return { vendors, loading };
}
