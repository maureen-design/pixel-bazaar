import { useState, useEffect } from 'react';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import type { ProductVariants, ProductVariantOption, ProductVariant } from '../../types';
import { toast } from 'sonner';

const COLOR_VOCABULARY = [
  'Black', 'White', 'Navy', 'Red', 'Blue', 'Green', 'Grey', 'Olive',
  'Brown', 'Beige', 'Yellow', 'Orange', 'Pink', 'Purple', 'Teal',
];

interface CombinationDraft {
  id: string;
  attributes: Record<string, string>;
  price: string;
  stock: string;
  sku: string;
  images: string[];
  image?: string;
}

interface VariantEditorProps {
  initialVariants?: ProductVariants | null;
  onChange: (variants: ProductVariants) => void;
}

const slugify = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const signature = (attributes: Record<string, string>, names: string[]) =>
  names.map((n) => attributes[n] || '').join('__');

const buildCombinations = (
  options: ProductVariantOption[],
  existing: CombinationDraft[]
): CombinationDraft[] => {
  if (options.length === 0) return [];
  let combos: Record<string, string>[] = [{}];
  for (const option of options) {
    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      for (const value of option.values) {
        next.push({ ...combo, [option.name]: value });
      }
    }
    combos = next;
  }
  const names = options.map((o) => o.name);
  return combos.map((attrs) => {
    const sig = signature(attrs, names);
    const existingCombo = existing.find((c) => signature(c.attributes, names) === sig);
    return {
      id: existingCombo?.id || names.map((n) => slugify(attrs[n])).join('-'),
      attributes: attrs,
      price: existingCombo ? String(existingCombo.price ?? '') : '',
      stock: existingCombo ? String(existingCombo.stock ?? '') : '',
      sku: existingCombo?.sku || '',
      images: existingCombo?.images || [],
      image: existingCombo?.image,
    };
  });
};

export function VariantEditor({ initialVariants, onChange }: VariantEditorProps) {
  const initialOptions: ProductVariantOption[] =
    initialVariants?.options?.length
      ? initialVariants.options.map((o) => ({ ...o, values: [...o.values] }))
      : [{ label: '', name: '', values: [] }];

  const [options, setOptions] = useState<ProductVariantOption[]>(initialOptions);
  const [combinations, setCombinations] = useState<CombinationDraft[]>(() => {
    const existing: CombinationDraft[] = (initialVariants?.combinations || []).map((c) => ({
      id: c.id,
      attributes: c.attributes,
      price: c.price === null || c.price === undefined ? '' : String(c.price),
      stock: String(c.stock ?? ''),
      sku: c.sku || '',
      images: c.images || [],
      image: c.image,
    }));
    return buildCombinations(initialOptions, existing);
  });
  const [valueDrafts, setValueDrafts] = useState<Record<number, string>>({});
  const [uploadingCombo, setUploadingCombo] = useState<string | null>(null);
  const [originalIds] = useState<Set<string>>(
    () => new Set((initialVariants?.combinations || []).map((c) => c.id))
  );

  const isBlankCombo = (c: CombinationDraft) =>
    c.price === '' && c.stock === '' && !c.sku.trim() && c.images.length === 0 && !c.image;

  useEffect(() => {
    const serializedOptions = options
      .filter((o) => o.name.trim() && o.values.some((v) => v.trim()))
      .map((o) => ({
        label: o.label || o.name.trim().replace(/^\w/, (c) => c.toUpperCase()),
        name: o.name.trim().toLowerCase(),
        values: o.values.map((v) => v.trim()).filter(Boolean),
      }));

    const keptCombinations = combinations.filter(
      (c) => originalIds.has(c.id) || !isBlankCombo(c)
    );

    const serializedCombinations: ProductVariant[] = keptCombinations.map((c) => {
      const variant: ProductVariant = {
        id: c.id,
        attributes: c.attributes,
        price: c.price === '' ? null : Number(c.price),
        stock: Number(c.stock) || 0,
      };
      if (c.sku.trim()) variant.sku = c.sku.trim();
      if (c.image) variant.image = c.image;
      variant.images = c.images;
      return variant;
    });

    onChange({ options: serializedOptions, combinations: serializedCombinations });
  }, [options, combinations, originalIds, onChange]);

  const updateOptions = (nextOptions: ProductVariantOption[]) => {
    setOptions(nextOptions);
    setCombinations((prev) => buildCombinations(nextOptions, prev));
  };

  const addOption = (name = '') => {
    const clean = name.trim().toLowerCase();
    if (clean && options.some((o) => o.name.trim().toLowerCase() === clean)) return;
    updateOptions([...options, { label: clean, name: clean, values: [] }]);
  };

  const addColorOption = () => {
    if (!options.some((o) => o.name.trim().toLowerCase() === 'color')) addOption('Color');
  };

  const addSizeOption = () => {
    if (!options.some((o) => o.name.trim().toLowerCase() === 'size')) addOption('Size');
  };

  const removeOption = (index: number) => {
    updateOptions(options.filter((_, i) => i !== index));
    setValueDrafts((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const renameOption = (index: number, name: string) => {
    updateOptions(options.map((o, i) => (i === index ? { ...o, name } : o)));
  };

  const addValue = (index: number) => {
    const val = (valueDrafts[index] || '').trim();
    if (!val) return;
    if (options[index].values.some((v) => v.toLowerCase() === val.toLowerCase())) return;
    updateOptions(
      options.map((o, i) => (i === index ? { ...o, values: [...o.values, val] } : o))
    );
    setValueDrafts((prev) => ({ ...prev, [index]: '' }));
  };

  const removeValue = (index: number, valueIndex: number) => {
    updateOptions(
      options.map((o, i) =>
        i === index ? { ...o, values: o.values.filter((_, vi) => vi !== valueIndex) } : o
      )
    );
  };

  const setComboField = (id: string, field: keyof CombinationDraft, value: string) => {
    setCombinations((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const removeComboImage = (id: string, imageIndex: number) => {
    setCombinations((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, images: c.images.filter((_, i) => i !== imageIndex) } : c
      )
    );
  };

  const handleComboUpload = async (comboId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingCombo(comboId);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const filePath = `${Math.random()}.${fileExt}`;
        const { error } = await supabase.storage.from('product-images').upload(filePath, file);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);
        urls.push(publicUrl);
      }
      setCombinations((prev) =>
        prev.map((c) =>
          c.id === comboId
            ? { ...c, images: [...c.images, ...urls], image: c.image || urls[0] }
            : c
        )
      );
      toast.success('Images uploaded successfully');
    } catch (error: unknown) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload images');
    } finally {
      setUploadingCombo(null);
      e.target.value = '';
    }
  };

  const summaryOptions = options.filter((o) => o.name.trim() && o.values.some((v) => v.trim()));

  return (
    <div className="space-y-5">
      <datalist id="variant-color-list">
        {COLOR_VOCABULARY.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* Options */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <Label className="text-sm">Variant Options</Label>
            <p className="text-xs text-muted-foreground">
              Define options like Color or Size, then add values for each.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addColorOption}>
              <Plus className="w-3.5 h-3.5" />
              Color
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={addSizeOption}>
              <Plus className="w-3.5 h-3.5" />
              Size
            </Button>
          </div>
        </div>

        {options.map((option, oi) => {
          const isColor = option.name.trim().toLowerCase() === 'color';
          return (
            <div key={oi} className="rounded-lg border border-border bg-muted/40 p-4 mb-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Option name</Label>
                    <Input
                      value={option.name}
                      onChange={(e) => renameOption(oi, e.target.value)}
                      placeholder="e.g., Color or Size"
                      className="bg-card border-border"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Values</Label>
                    <div className="flex gap-2">
                      <Input
                        value={valueDrafts[oi] || ''}
                        onChange={(e) =>
                          setValueDrafts((prev) => ({ ...prev, [oi]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addValue(oi);
                          }
                        }}
                        placeholder="Add value..."
                        list={isColor ? 'variant-color-list' : undefined}
                        className="bg-card border-border"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => addValue(oi)}>
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOption(oi)}
                  aria-label={`Remove ${option.name || 'option'}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              {option.values.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {option.values.map((value, vi) => (
                    <span
                      key={vi}
                      className="inline-flex items-center gap-1 bg-card border border-border rounded-full px-3 py-1 text-sm"
                    >
                      {value}
                      <button
                        type="button"
                        onClick={() => removeValue(oi, vi)}
                        aria-label={`Remove ${value}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Combinations */}
      {combinations.length > 0 && (
        <div className="space-y-3">
          <div>
            <Label className="text-sm">Combinations</Label>
            <p className="text-xs text-muted-foreground">
              {combinations.length} combination(s) generated from the selected options. Edit price,
              stock, SKU and images per combination.
            </p>
          </div>
          <div className="space-y-3">
            {combinations.map((combo) => (
              <div key={combo.id} className="rounded-lg border border-border bg-card p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end mb-3">
                  <div className="col-span-2 md:col-span-1">
                    <Label className="text-xs">Options</Label>
                    <div className="text-sm font-medium pt-2">
                      {Object.values(combo.attributes).join(' + ')}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Price (KES)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={combo.price}
                      onChange={(e) => setComboField(combo.id, 'price', e.target.value)}
                      placeholder="0.00"
                      className="bg-background border-border"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Stock</Label>
                    <Input
                      type="number"
                      min="0"
                      value={combo.stock}
                      onChange={(e) => setComboField(combo.id, 'stock', e.target.value)}
                      placeholder="0"
                      className="bg-background border-border"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">SKU</Label>
                    <Input
                      value={combo.sku}
                      onChange={(e) => setComboField(combo.id, 'sku', e.target.value)}
                      placeholder="SKU (optional)"
                      className="bg-background border-border"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Images</Label>
                  <div className="flex flex-wrap gap-2 mt-2 items-center">
                    {combo.images.map((url, i) => (
                      <div key={i} className="relative">
                        <img
                          src={url}
                          alt={`${Object.values(combo.attributes).join('-')} image ${i + 1}`}
                          className="w-16 h-16 object-cover rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => removeComboImage(combo.id, i)}
                          aria-label="Remove image"
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive rounded-full flex items-center justify-center"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ))}
                    <label className="flex items-center gap-1.5 px-3 py-2 bg-muted border border-border rounded-lg cursor-pointer hover:bg-accent text-sm">
                      <Upload className="w-4 h-4" />
                      {uploadingCombo === combo.id ? 'Uploading...' : 'Add image'}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled={uploadingCombo === combo.id}
                        onChange={(e) => handleComboUpload(combo.id, e)}
                      />
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {summaryOptions.length > 0 && combinations.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
          <p className="font-medium mb-2">Variants summary</p>
          {summaryOptions.map((o) => (
            <p key={o.name} className="text-secondary-foreground">
              <span className="capitalize">{o.name}</span>: {o.values.filter((v) => v.trim()).join(', ')}
            </p>
          ))}
          <p className="text-secondary-foreground">
            Combinations: {combinations.filter((c) => originalIds.has(c.id) || !isBlankCombo(c)).length}
            {combinations.some((c) => !originalIds.has(c.id) && isBlankCombo(c))
              ? ` (${combinations.length} generated; blank new ones are saved only when filled)`
              : ''}
          </p>
        </div>
      )}
    </div>
  );
}
