import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'sonner';

export function AISearchBar() {
  const [query, setQuery] = useState('');
  const [aiMode, setAiMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    if (aiMode) {
      // AI-parsed search
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('ai-assistant', {
          body: { action: 'parse_search', data: { query: trimmed } },
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'AI search failed');

        const filters = data.data;
        const params = new URLSearchParams();

        if (filters.keywords) params.set('q', filters.keywords);
        if (filters.category) params.set('category', filters.category);

        const readCleanString = (v: any, maxLen = 40): string | undefined => {
          if (typeof v !== 'string' || v.trim().length === 0 || v.trim().length > maxLen) return undefined;
          return v.trim();
        };

        const productType = readCleanString(filters.productType);
        const brand = readCleanString(filters.brand);
        if (productType) params.set('type', productType);
        if (brand) params.set('brand', brand);

        const COLOR_VOCAB = ['black', 'white', 'navy', 'red', 'blue', 'green', 'grey', 'olive', 'brown', 'beige', 'yellow', 'orange', 'pink', 'purple', 'teal'];
        const rawColor = readCleanString(filters.color, 20);
        const color = rawColor ? rawColor.toLowerCase() : undefined;
        if (color && COLOR_VOCAB.includes(color)) params.set('color', color);

        const readPrice = (v: any): number | undefined => {
          if (v === null || v === undefined || v === '') return undefined;
          const n = Number(v);
          return Number.isFinite(n) && n >= 0 ? n : undefined;
        };

        const aiMin = readPrice(filters.minPrice);
        const aiMax = readPrice(filters.maxPrice);

        let minPrice = aiMin;
        let maxPrice = aiMax;
        if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
          minPrice = undefined;
          maxPrice = undefined;
        }

        if (minPrice !== undefined) params.set('minPrice', String(minPrice));
        if (maxPrice !== undefined) params.set('maxPrice', String(maxPrice));
        if (filters.sortBy) params.set('sort', filters.sortBy);

        if (params.size === 0) {
          throw new Error('AI search parsed no usable filters');
        }

        navigate(`/search?${params.toString()}`);
      } catch (err: any) {
        toast.error('AI search unavailable, using regular search');
        navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      } finally {
        setLoading(false);
      }
    } else {
      // Regular text search
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full" aria-busy={loading}>
      <div className="relative flex items-center">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading ? (
            <Loader2 aria-hidden="true" className="w-5 h-5 text-muted-foreground animate-spin" />
          ) : (
            <Search aria-hidden="true" className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <span role="status" className="sr-only">
          {loading ? 'Searching...' : ''}
        </span>
        <input
          ref={inputRef}
          type="text"
          placeholder={aiMode ? 'Describe what you want...' : 'Search products...'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`w-full pl-10 pr-20 py-2 bg-muted border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all ${
            aiMode ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border'
          }`}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => { setAiMode(!aiMode); setQuery(''); inputRef.current?.focus(); }}
            aria-pressed={aiMode}
            aria-label={aiMode ? 'Switch to regular search' : 'Switch to AI search'}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
              aiMode
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title={aiMode ? 'Switch to regular search' : 'Switch to AI search'}
          >
            <Sparkles className={`w-3 h-3 ${aiMode ? 'animate-pulse' : ''}`} />
            AI
          </button>
        </div>
      </div>
    </form>
  );
}
