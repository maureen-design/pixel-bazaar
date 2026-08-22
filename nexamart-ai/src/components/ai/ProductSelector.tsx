import { useState } from 'react';
import { Search as SearchIcon, Check, X } from 'lucide-react';
import { useCompareProducts } from '../../hooks/useProducts';
import type { Product } from '../../types';
import { cn } from '../../lib/utils';

interface ProductSelectorProps {
  selected: Product[];
  onToggle: (product: Product) => void;
  max?: number;
}

export function ProductSelector({ selected, onToggle, max = 3 }: ProductSelectorProps) {
  const [query, setQuery] = useState('');
  const { products, loading } = useCompareProducts(query, selected.map((p) => p.id), 10);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(price);

  const filtered = products;

  return (
    <div>
      <div className="relative mb-3">
        <SearchIcon className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products to compare..."
          className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
        />
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selected.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-2 bg-primary/10 text-primary text-sm px-3 py-1.5 rounded-full"
            >
              {p.name}
              <button onClick={() => onToggle(p)} aria-label={`Remove ${p.name} from comparison`}>
                <X aria-hidden="true" className="w-4 h-4 hover:text-destructive" />
              </button>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div role="status" className="text-center py-4 text-muted-foreground text-sm">Loading products...</div>
      ) : query && filtered.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
          {filtered.slice(0, 10).map((p) => {
            const isSelected = selected.some((s) => s.id === p.id);
            const atMax = selected.length >= max && !isSelected;
            return (
              <button
                key={p.id}
                onClick={() => onToggle(p)}
                disabled={atMax}
                aria-pressed={isSelected}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 hover:bg-muted text-left',
                  isSelected && 'bg-primary/5',
                  atMax && 'opacity-50 cursor-not-allowed'
                )}
              >
                <img src={p.images?.[0]} alt={p.name} className="w-10 h-10 rounded-md object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(p.price)} · {p.category?.name}
                  </p>
                </div>
                {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      ) : query ? (
        <div className="text-center py-4 text-muted-foreground text-sm">No products found</div>
      ) : null}
    </div>
  );
}
