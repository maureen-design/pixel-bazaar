import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeftRight, X, Trash2 } from 'lucide-react';
import { useCompare } from '../context/CompareContext';
import { Button } from './ui/button';
import { motion, AnimatePresence } from 'motion/react';

export function CompareBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { products, removeProduct, clearAll } = useCompare();

  if (products.length === 0 || location.pathname === '/compare') return null;

  const ids = products.map((p) => p.id).join(',');

  const categories = products.map((p) => p.category?.name).filter(Boolean);
  const mixedCategories = categories.length > 1 && new Set(categories).size > 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          {mixedCategories && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
              These products are from different categories. Comparison may be less useful.
            </p>
          )}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <ArrowLeftRight className="w-5 h-5 text-primary shrink-0" />
              <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto">
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 shrink-0"
                  >
                    <img
                      src={p.images?.[0]}
                      alt={p.name}
                      className="w-8 h-8 rounded-md object-cover"
                    />
                    <span className="text-sm font-medium truncate max-w-[120px]">{p.name}</span>
                    <button
                      onClick={() => removeProduct(p.id)}
                      aria-label={`Remove ${p.name}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                aria-label="Clear all products from comparison"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear
              </Button>
              <Button
                size="sm"
                disabled={products.length < 2}
                onClick={() => navigate(`/compare?ids=${ids}`)}
              >
                Compare Now
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
