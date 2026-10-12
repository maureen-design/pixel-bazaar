import { useMemo, useEffect, useState } from 'react';
import { useCategories } from '../hooks/useCategories';
import { Select as ShadSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { supabase } from '../lib/supabaseClient';

const PRODUCT_TYPE_FALLBACK = [
  { value: 'tshirt', label: 'T-Shirt' },
  { value: 'hoodie', label: 'Hoodie' },
  { value: 'dress', label: 'Dress' },
  { value: 'blouse', label: 'Blouse' },
  { value: 'blazer', label: 'Blazer' },
  { value: 'jacket', label: 'Jacket' },
  { value: 'trousers', label: 'Trousers' },
  { value: 'jeans', label: 'Jeans' },
  { value: 'sneakers', label: 'Sneakers' },
  { value: 'heels', label: 'Heels' },
  { value: 'formal_shoes', label: 'Formal Shoes' },
  { value: 'sandals', label: 'Sandals' },
  { value: 'boots', label: 'Boots' },
  { value: 'loafers', label: 'Loafers' },
  { value: 'handmade_footwear', label: 'Handmade Footwear' },
  { value: 'handbag', label: 'Handbag' },
  { value: 'smartphone', label: 'Smartphone' },
  { value: 'laptop', label: 'Laptop' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'headphones', label: 'Headphones' },
  { value: 'speaker', label: 'Speaker' },
  { value: 'keyboard', label: 'Keyboard' },
  { value: 'mouse', label: 'Mouse' },
  { value: 'monitor', label: 'Monitor' },
  { value: 'gaming_console', label: 'Gaming Console' },
  { value: 'camera', label: 'Camera' },
  { value: 'smartwatch', label: 'Smartwatch' },
  { value: 'storage', label: 'Storage' },
  { value: 'charger', label: 'Charger' },
];

const BRAND_FALLBACK = [
  'Apple', 'Samsung', 'Sony', 'Google', 'Xiaomi', 'OnePlus', 'Lenovo', 'Dell', 'ASUS',
  'HP', 'Microsoft', 'LG', 'Garmin', 'Bose', 'JBL', 'Sonos', 'Ultimate Ears', 'Logitech',
  'Razer', 'Keychron', 'Anker', 'SanDisk', 'Canon', 'Nike', 'Dior', 'IKEA', 'Adidas',
].map((brand) => ({ value: brand, label: brand }));

function useFilterOptions() {
  const [brands, setBrands] = useState<{ value: string; label: string }[] | null>(null);
  const [productTypes, setProductTypes] = useState<{ value: string; label: string }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('brand, product_type, vendor:vendors!inner(is_verified)')
          .eq('status', 'active')
          .eq('vendor.is_verified', true)
          .limit(1000);
        if (error || !data || cancelled) return;
        const brandSet = new Set<string>();
        const typeSet = new Set<string>();
        for (const r of data) {
          if (r.brand && typeof r.brand === 'string' && r.brand.trim()) brandSet.add(r.brand.trim());
          if (r.product_type && typeof r.product_type === 'string' && r.product_type.trim()) typeSet.add(r.product_type.trim());
        }
        const labelForType = (v: string) => {
          const hit = PRODUCT_TYPE_FALLBACK.find((o) => o.value === v);
          if (hit) return hit.label;
          return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        };
        if (!cancelled && brandSet.size > 0) setBrands(Array.from(brandSet).sort().map((b) => ({ value: b, label: b })));
        if (!cancelled && typeSet.size > 0) setProductTypes(Array.from(typeSet).sort().map((v) => ({ value: v, label: labelForType(v) })));
      } catch { /* fallback */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return {
    brandOptions: brands ?? BRAND_FALLBACK,
    productTypeOptions: productTypes ?? PRODUCT_TYPE_FALLBACK,
  };
}

const COLOR_OPTIONS = [
  'black', 'white', 'navy', 'red', 'blue', 'green', 'grey', 'olive',
  'brown', 'beige', 'yellow', 'orange', 'pink', 'purple', 'teal',
].map((color) => ({ value: color, label: color.charAt(0).toUpperCase() + color.slice(1) }));

interface SearchFiltersProps {
  categoryId?: string;
  productType?: string;
  brand?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: string;
  onCategoryChange: (val: string) => void;
  onProductTypeChange: (val: string) => void;
  onBrandChange: (val: string) => void;
  onColorChange: (val: string) => void;
  onMinPriceChange: (val: string) => void;
  onMaxPriceChange: (val: string) => void;
  onSortChange: (val: string) => void;
  onClear: () => void;
  hasFilters: boolean;
}

export function SearchFilters({
  categoryId,
  productType,
  brand,
  color,
  minPrice,
  maxPrice,
  sortBy,
  onCategoryChange,
  onProductTypeChange,
  onBrandChange,
  onColorChange,
  onMinPriceChange,
  onMaxPriceChange,
  onSortChange,
  onClear,
  hasFilters,
}: SearchFiltersProps) {
  const { categories } = useCategories();
  const { brandOptions, productTypeOptions } = useFilterOptions();

  const sortOptions = useMemo(() => [
    { value: 'name_asc', label: 'Name (A-Z)' },
    { value: 'price_asc', label: 'Price: Low to High' },
    { value: 'price_desc', label: 'Price: High to Low' },
    { value: 'rating', label: 'Rating' },
    { value: 'newest', label: 'Newest' },
  ], []);

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-foreground font-semibold text-lg">Filters</h2>
        {hasFilters && (
          <button
            onClick={onClear}
            className="text-sm text-primary hover:text-primary/80 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Category</label>
        <ShadSelect value={categoryId || ''} onValueChange={onCategoryChange}>
          <SelectTrigger className="w-full bg-muted border-border text-foreground" aria-label="Filter by category">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent className="bg-muted border-border">
            <SelectItem value="">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </ShadSelect>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Product Type</label>
        <ShadSelect value={productType || ''} onValueChange={onProductTypeChange}>
          <SelectTrigger className="w-full bg-muted border-border text-foreground" aria-label="Filter by product type">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent className="bg-muted border-border">
            <SelectItem value="">All Types</SelectItem>
            {productTypeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </ShadSelect>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Brand</label>
        <ShadSelect value={brand || ''} onValueChange={onBrandChange}>
          <SelectTrigger className="w-full bg-muted border-border text-foreground" aria-label="Filter by brand">
            <SelectValue placeholder="All Brands" />
          </SelectTrigger>
          <SelectContent className="bg-muted border-border">
            <SelectItem value="">All Brands</SelectItem>
            {brandOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </ShadSelect>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Color</label>
        <ShadSelect value={color || ''} onValueChange={onColorChange}>
          <SelectTrigger className="w-full bg-muted border-border text-foreground" aria-label="Filter by color">
            <SelectValue placeholder="All Colors" />
          </SelectTrigger>
          <SelectContent className="bg-muted border-border">
            <SelectItem value="">All Colors</SelectItem>
            {COLOR_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </ShadSelect>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Price Range</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            aria-label="Minimum price"
            value={minPrice ?? ''}
            onChange={(e) => onMinPriceChange(e.target.value)}
            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
          <span className="text-muted-foreground">-</span>
          <input
            type="number"
            placeholder="Max"
            aria-label="Maximum price"
            value={maxPrice ?? ''}
            onChange={(e) => onMaxPriceChange(e.target.value)}
            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Sort By</label>
          <ShadSelect value={sortBy || 'newest'} onValueChange={onSortChange}>
          <SelectTrigger className="w-full bg-muted border-border text-foreground" aria-label="Sort products by">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent className="bg-muted border-border">
            {sortOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </ShadSelect>
      </div>
    </div>
  );
}
