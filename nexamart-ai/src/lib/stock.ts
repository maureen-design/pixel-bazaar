import type { ProductVariants } from '../types';

export const LOW_STOCK_THRESHOLD = 5;

export type StockState = 'out_of_stock' | 'low' | 'in_stock' | 'unknown';

export function normalizeStock(stock: number | null | undefined): number | null {
  if (stock === null || stock === undefined || Number.isNaN(Number(stock))) return null;
  const value = Number(stock);
  if (value <= 0) return 0;
  return Math.floor(value);
}

export function getStockState(
  stock: number | null | undefined,
  options: { threshold?: number; productStatus?: string } = {}
): StockState {
  const { threshold = LOW_STOCK_THRESHOLD, productStatus } = options;
  if (productStatus === 'out_of_stock') return 'out_of_stock';
  const value = normalizeStock(stock);
  if (value === null) return 'unknown';
  if (value === 0) return 'out_of_stock';
  if (value <= threshold) return 'low';
  return 'in_stock';
}

export function hasVariants(variants?: ProductVariants | null): boolean {
  return !!variants && !!variants.options && variants.options.length > 0;
}

export function getAvailableStock(
  variants: ProductVariants | undefined | null,
  baseStock: number | null | undefined
): number | null {
  if (!hasVariants(variants)) return normalizeStock(baseStock);
  const combinations = variants?.combinations ?? [];
  if (combinations.length === 0) return 0;
  return combinations.reduce((total, combination) => total + (normalizeStock(combination.stock) ?? 0), 0);
}

export function getCardStockState(
  product: { status?: string; stock_quantity?: number | null; variants?: ProductVariants | null },
  options: { threshold?: number } = {}
): StockState {
  return getStockState(getAvailableStock(product.variants, product.stock_quantity), {
    threshold: options.threshold,
    productStatus: product.status,
  });
}
