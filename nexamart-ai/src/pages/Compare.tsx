import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Button } from '../components/ui/button';
import { invokeAIAssistant, isGuestAILimitError } from '../lib/aiAssistantClient';
import { useCompareProducts } from '../hooks/useProducts';
import type { Product } from '../types';
import { ProductSelector } from '../components/ai/ProductSelector';
import { Loader2, Sparkles, Check, ArrowLeftRight, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { formatPrice } from '../config/pricing';
import { SpeakButton } from '../components/ui/SpeakButton';
import { useCompare } from '../context/CompareContext';

interface CompareResult {
  summary: string;
  comparisons: { use_case: string; product_id: string; why: string }[];
  trade_offs: string[];
}

export function Compare() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlIds = searchParams.get('ids')?.split(',').filter(Boolean) || [];
  const { products: contextProducts, clearAll: clearCompareContext } = useCompare();
  const { products, loading } = useCompareProducts('', urlIds, 10);
  const [selected, setSelected] = useState<Product[]>([]);
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);

  const urlIdsKey = urlIds.join(',');

  // Hydrate the selection from the ?ids= param during render instead of in an
  // effect. React documents this as the way to "adjust state when a prop
  // changes", and it avoids a cascading render on mount.
  const [previousUrlIdsKey, setPreviousUrlIdsKey] = useState(urlIdsKey);
  if (previousUrlIdsKey !== urlIdsKey) {
    setPreviousUrlIdsKey(urlIdsKey);
    if (!loading && urlIds.length >= 2 && products.length > 0) {
      const matches = products.filter((p) => urlIds.includes(p.id)).slice(0, 3);
      if (matches.length >= 2) {
        setSelected(matches);
        setResult(null);
      }
    }
  }

  // Drain the compare context into the URL. Navigation flips urlIds above,
  // which hydrates `selected` on the next render.
  useEffect(() => {
    if (loading) return;
    if (urlIds.length > 0) return;
    if (contextProducts.length < 2) return;

    const ids = contextProducts.map((p) => p.id).join(',');
    clearCompareContext();
    navigate(`/compare?ids=${ids}`, { replace: true });
  }, [loading, urlIds.length, contextProducts, navigate, clearCompareContext]);

  const toggleProduct = (product: Product) => {
    setResult(null);
    setSelected((prev) => {
      if (prev.some((s) => s.id === product.id)) {
        return prev.filter((s) => s.id !== product.id);
      }
      if (prev.length >= 3) {
        toast.error('You can compare up to 3 products at once');
        return prev;
      }
      return [...prev, product];
    });
  };

  const runCompare = async () => {
    if (selected.length < 2) {
      toast.error('Select at least 2 products to compare');
      return;
    }
    setComparing(true);
    setResult(null);
    try {
      const { data, error } = await invokeAIAssistant('compare', { productIds: selected.map((p) => p.id) });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Comparison failed');

      setResult(data.data);
    } catch (err) {
      if (!isGuestAILimitError(err)) toast.error('AI comparison failed. Try again later.');
    } finally {
      setComparing(false);
    }
  };

  // get returns ReactNode, not string, so the Vendor row can render a Link.
  const specRows: { label: string; get: (p: Product) => React.ReactNode }[] = [
    { label: 'Price', get: (p) => formatPrice(p.price) },
    {
      label: 'Compare Price',
      get: (p) => (p.compare_price ? formatPrice(p.compare_price) : '—'),
    },
    { label: 'Rating', get: (p) => (p.rating ? `${p.rating} / 5` : '—') },
    { label: 'Stock', get: (p) => `${p.stock_quantity} in stock` },
    { label: 'Category', get: (p) => p.category?.name || '—' },
    {
      label: 'Vendor',
      get: (p) =>
        p.vendor ? (
          <Link
            to={`/store/${p.vendor.id}`}
            className="text-primary hover:underline"
          >
            {p.vendor.store_name}
          </Link>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center gap-3 mb-2">
          <ArrowLeftRight className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-bold">Compare Products</h1>
        </div>
        <p className="text-muted-foreground mb-8">
          Select 2–3 products and let AI highlight what matters before you decide.
        </p>

        {/* Product selector */}
        <div className="bg-card border border-border rounded-xl p-4 mb-8">
          <ProductSelector selected={selected} onToggle={toggleProduct} max={3} />
          <Button onClick={runCompare} disabled={selected.length < 2 || comparing} className="mt-3">
            {comparing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
            {comparing ? 'Comparing...' : 'Compare with AI'}
          </Button>
        </div>

        {/* Comparison table */}
        {selected.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-x-auto mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-4 text-left font-medium text-muted-foreground w-40">Specification</th>
                  {selected.map((p) => (
                    <th key={p.id} className="p-4 text-left min-w-[16rem]">
                      <div className="flex items-start gap-3">
                        <img
                          src={p.images?.[0]}
                          alt={p.name}
                          className="w-12 h-12 rounded-lg object-cover cursor-pointer"
                          onClick={() => navigate(`/product/${p.id}`)}
                        />
                        <div>
                          <p
                            className="font-semibold cursor-pointer hover:text-primary line-clamp-2"
                            onClick={() => navigate(`/product/${p.id}`)}
                          >
                            {p.name}
                          </p>
                          <Button variant="outline" size="sm" className="mt-1" onClick={() => navigate(`/product/${p.id}`)}>
                            View Details
                          </Button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {specRows.map((row) => (
                  <tr key={row.label} className="border-b border-border last:border-0">
                    <td className="p-4 font-medium text-muted-foreground">{row.label}</td>
                    {selected.map((p) => (
                      <td key={p.id} className="p-4">{row.get(p)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* AI result */}
        {comparing && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
            <p className="text-lg font-medium">AI is analyzing these products...</p>
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">AI Summary</h2>
                <SpeakButton
                  text={[
                    result.summary,
                    ...result.comparisons?.map((c) => {
                      const product = selected.find((s) => s.id === c.product_id);
                      return `${c.use_case}: ${product?.name}. ${c.why}`;
                    }) || [],
                    ...(result.trade_offs?.length ? ['Trade-offs:'] : []),
                    ...(result.trade_offs || []),
                  ].join('. ')}
                  label="Read full comparison aloud"
                />
              </div>
              <p className="text-secondary-foreground">{result.summary}</p>
            </div>

            {result.comparisons?.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4">Use Case Recommendations</h2>
                <div className="space-y-4">
                  {result.comparisons.map((c) => {
                    const product = selected.find((s) => s.id === c.product_id);
                    if (!product) return null;
                    return (
                      <div key={c.use_case} className="flex gap-3 items-start">
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary mt-0.5 shrink-0">
                          <Check className="w-3 h-3" />
                          {c.use_case}
                        </span>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-muted-foreground">{c.why}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {result.trade_offs?.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4">Key Trade-offs</h2>
                <div className="space-y-2">
                  {result.trade_offs.map((t, i) => (
                    <div key={i} className="flex gap-2 items-start text-sm text-secondary-foreground">
                      <Minus className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && urlIds.length >= 2 && products.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            Could not load the selected products. Please pick them from the list above.
          </div>
        )}
      </div>
      <Footer />

    </div>
  );
}
