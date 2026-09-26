import { supabase } from './supabaseClient';
import { LOW_STOCK_THRESHOLD, normalizeStock } from './stock';

export type CartStockIssueKind = 'unavailable' | 'insufficient';

export interface CartStockIssue {
  cartItemId: string;
  productId: string;
  name: string;
  variantLabel: string | null;
  requested: number;
  available: number;
  kind: CartStockIssueKind;
  message: string;
}

export interface CartStockNotice {
  cartItemId: string;
  message: string;
}

export interface CartStockReport {
  availableByCartItem: Record<string, number>;
  issues: CartStockIssue[];
  notices: CartStockNotice[];
  ok: boolean;
  /**
   * False when the live lookup could not run (network/RLS failure). Callers must
   * treat an unchecked report as "do not block" and defer to server-side
   * create_order, which remains the final authority.
   */
  checked: boolean;
}

export interface CartStockInput {
  id: string;
  product_id: string;
  quantity: number;
  variant_id?: string | null;
  variant_attributes?: Record<string, string> | null;
  products?: { name?: string | null } | null;
}

interface ProductStockRow {
  id: string;
  name: string;
  status: string;
  stock_quantity: number | null;
  variants?: {
    combinations?: { id: string; stock: number | null }[] | null;
  } | null;
}

function emptyReport(): CartStockReport {
  return { availableByCartItem: {}, issues: [], notices: [], ok: true, checked: true };
}

function formatVariant(attributes?: Record<string, string> | null): string | null {
  if (!attributes) return null;
  const values = Object.values(attributes).filter((value) => !!value);
  return values.length > 0 ? values.join(', ') : null;
}

/**
 * Reads current stock for every cart line and reports what can no longer be
 * purchased. Advisory only: create_order re-checks and locks stock server-side.
 */
export async function validateCartStock(items: CartStockInput[]): Promise<CartStockReport> {
  if (!items || items.length === 0) return emptyReport();

  const productIds = Array.from(new Set(items.map((item) => item.product_id).filter(Boolean)));
  if (productIds.length === 0) return emptyReport();

  let rows: ProductStockRow[];
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, status, stock_quantity, variants')
      .in('id', productIds);

    if (error) throw error;
    rows = (data || []) as ProductStockRow[];
  } catch {
    // Fail open rather than trapping a shopper on a network hiccup.
    return { ...emptyReport(), checked: false };
  }

  const productsById = new Map(rows.map((row) => [row.id, row]));
  const availableByCartItem: Record<string, number> = {};
  const issues: CartStockIssue[] = [];
  const notices: CartStockNotice[] = [];

  for (const item of items) {
    const product = productsById.get(item.product_id);
    const name = product?.name || item.products?.name || 'This item';
    const variantLabel = formatVariant(item.variant_attributes);
    const suffix = variantLabel ? ` (${variantLabel})` : '';
    const requested = Math.max(1, Number(item.quantity) || 1);

    const base = {
      cartItemId: item.id,
      productId: item.product_id,
      name,
      variantLabel,
      requested,
    };

    // A product that vanished or left the `active` state cannot be ordered.
    if (!product || product.status !== 'active') {
      availableByCartItem[item.id] = 0;
      issues.push({
        ...base,
        available: 0,
        kind: 'unavailable',
        message: `${name}${suffix} is no longer available. Remove it to continue.`,
      });
      continue;
    }

    const available = item.variant_id
      ? normalizeStock(
          product.variants?.combinations?.find((combo) => combo.id === item.variant_id)?.stock
        ) ?? 0
      : normalizeStock(product.stock_quantity) ?? 0;

    availableByCartItem[item.id] = available;

    if (available <= 0) {
      issues.push({
        ...base,
        available: 0,
        kind: 'unavailable',
        message: `${name}${suffix} is out of stock. Remove it to continue.`,
      });
    } else if (available < requested) {
      issues.push({
        ...base,
        available,
        kind: 'insufficient',
        message: `Only ${available} left of ${name}${suffix}. Reduce the quantity to ${available} to continue.`,
      });
    } else if (available <= LOW_STOCK_THRESHOLD) {
      notices.push({
        cartItemId: item.id,
        message: `Only ${available} left of ${name}${suffix}.`,
      });
    }
  }

  return {
    availableByCartItem,
    issues,
    notices,
    ok: issues.length === 0,
    checked: true,
  };
}
