import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Product } from '../types';
import { toast } from 'sonner';

interface CompareContextType {
  products: Product[];
  addProduct: (product: Product) => void;
  removeProduct: (id: string) => void;
  clearAll: () => void;
  isSelected: (id: string) => boolean;
}

const CompareContext = createContext<CompareContextType | null>(null);

const STORAGE_KEY = 'nexamart-compare';
const MAX_PRODUCTS = 3;

export function CompareProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  }, [products]);

  const addProduct = useCallback((product: Product) => {
    setProducts((prev) => {
      if (prev.some((p) => p.id === product.id)) {
        toast.info('Product already in comparison');
        return prev;
      }
      if (prev.length >= MAX_PRODUCTS) {
        toast.error('You can compare up to 3 products at once');
        return prev;
      }
      const next = [...prev, product];
      if (next.length >= 2) {
        toast.success(`${next.length} products ready to compare`);
      } else {
        toast.success('Added to comparison');
      }
      return next;
    });
  }, []);

  const removeProduct = useCallback((id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setProducts([]);
  }, []);

  const isSelected = useCallback((id: string) => {
    return products.some((p) => p.id === id);
  }, [products]);

  return (
    <CompareContext.Provider value={{ products, addProduct, removeProduct, clearAll, isSelected }}>
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error('useCompare must be used within CompareProvider');
  return ctx;
}
