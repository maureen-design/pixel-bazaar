import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { ShoppingAssistantModal } from './ShoppingAssistantModal';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

interface AIShoppingAssistantProps {
  initialCategoryId?: string | null;
  variant?: 'floating' | 'cta';
}

export function AIShoppingAssistant({ initialCategoryId, variant = 'floating' }: AIShoppingAssistantProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const handleClick = () => setOpen(true);

  if (variant === 'cta') {
    return (
      <>
        <button
          onClick={handleClick}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand to-brand-dark text-white font-medium rounded-xl hover:from-brand-dark hover:to-brand transition-all shadow-lg shadow-primary/25"
        >
          <Sparkles aria-hidden="true" className="w-4 h-4" />
          Ask Nexa
        </button>
        <ShoppingAssistantModal open={open} onOpenChange={setOpen} initialCategoryId={initialCategoryId} />
      </>
    );
  }

  return (
    <>
      <button
        onClick={handleClick}
        aria-label="Open Nexa Shopping Assistant"
        className={cn(
          'fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full',
          'bg-gradient-to-br from-brand to-brand-dark text-white',
          'flex items-center justify-center shadow-xl shadow-primary/30',
          'hover:scale-110 active:scale-95 transition-transform'
        )}
      >
        {open ? <X aria-hidden="true" className="w-6 h-6" /> : <Sparkles aria-hidden="true" className="w-6 h-6" />}
      </button>
      <ShoppingAssistantModal open={open} onOpenChange={setOpen} initialCategoryId={initialCategoryId} />
    </>
  );
}
