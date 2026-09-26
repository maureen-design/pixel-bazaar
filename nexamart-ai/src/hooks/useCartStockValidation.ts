import { useEffect, useMemo, useState } from 'react';
import { validateCartStock } from '../lib/cartStock';
import type { CartStockInput, CartStockReport } from '../lib/cartStock';

const EMPTY_REPORT: CartStockReport = {
  availableByCartItem: {},
  issues: [],
  notices: [],
  ok: true,
  checked: true,
};

interface ValidationState {
  key: string;
  report: CartStockReport;
}

/** Identifies the cart contents a report belongs to, so stale results are never shown. */
function cartKey(items: CartStockInput[]): string {
  return items
    .map((item) => `${item.id}:${item.product_id}:${item.variant_id ?? 'base'}:${item.quantity}`)
    .sort()
    .join('|');
}

/**
 * Re-checks live stock whenever the contents of the cart change. Advisory only:
 * `create_order` remains the authority that locks stock and rejects the order.
 */
export function useCartStockValidation(
  items: CartStockInput[],
  options: { enabled?: boolean } = {}
) {
  const { enabled = true } = options;
  const [state, setState] = useState<ValidationState>({ key: '', report: EMPTY_REPORT });

  const key = useMemo(() => cartKey(items), [items]);
  const active = enabled && key !== '';

  useEffect(() => {
    if (!active) return;

    let live = true;
    const run = async () => {
      const report = await validateCartStock(items);
      if (live) setState({ key, report });
    };

    void run();
    return () => {
      live = false;
    };
  }, [active, items, key]);

  const current = state.key === key ? state.report : EMPTY_REPORT;

  return {
    report: current,
    checking: active && state.key !== key,
  };
}
