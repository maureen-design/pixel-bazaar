import { ArrowLeftRight, Check } from 'lucide-react';
import type { Product } from '../types';
import { useCompare } from '../context/CompareContext';
import { cn } from '../lib/utils';

interface CompareButtonProps {
  product: Product;
  className?: string;
}

export function CompareButton({ product, className }: CompareButtonProps) {
  const { addProduct, removeProduct, isSelected } = useCompare();
  const selected = isSelected(product.id);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selected) {
      removeProduct(product.id);
    } else {
      addProduct(product);
    }
  };

  return (
    <button
      onClick={handleClick}
      aria-label={selected ? `Remove ${product.name} from comparison` : `Add ${product.name} to comparison`}
      aria-pressed={selected}
      className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center transition-all',
        'bg-card/90 border border-border hover:border-primary/50',
        selected && 'bg-primary text-primary-foreground border-primary',
        className
      )}
    >
      {selected ? (
        <Check className="w-4 h-4" />
      ) : (
        <ArrowLeftRight className="w-4 h-4" />
      )}
    </button>
  );
}
