import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Category } from '../types';

export function useCategories({ topLevelOnly = false } = {}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCategories() {
      try {
        let query = supabase
          .from('categories')
          .select('*')
          .order('name');

        if (topLevelOnly) {
          query = query.is('parent_id', null);
        }

        const { data, error } = await query;

        if (error) throw error;

        setCategories(data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchCategories();
  }, [topLevelOnly]);

  return { categories, loading, error };
}
