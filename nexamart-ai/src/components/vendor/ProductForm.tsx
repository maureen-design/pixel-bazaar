import { useState, useEffect } from 'react';
import { X, Upload, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { VariantEditor } from './VariantEditor';
import type { ProductVariants } from '../../types';
import { toast } from 'sonner';

const PRODUCT_TYPES = [
  'smartphone', 'laptop', 'tablet', 'smartwatch', 'headphones', 'speaker', 'keyboard',
  'mouse', 'monitor', 'gaming_console', 'gaming_accessory', 'camera', 'storage', 'charger',
  'tshirt', 'hoodie', 'dress', 'blouse', 'blazer', 'jacket', 'trousers', 'jeans', 'sneakers',
  'heels', 'formal_shoes', 'sandals', 'handbag', 'footwear', 'fragrance', 'skincare', 'makeup',
  'jewelry', 'craft', 'basket', 'furniture', 'lighting', 'organization', 'football',
  'basketball', 'yoga', 'fitness', 'car_accessory', 'rc_vehicle', 'building_blocks',
  'plush_toy', 'puzzle', 'fiction', 'self_help', 'education', 'childrens_book',
  'design_asset', 'ebook', 'online_course',
];

const generateSlug = (name: string) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

interface ProductFormProps {
  product?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

interface Category {
  id: string;
  name: string;
}

interface ProductPayload {
  name: string;
  description: string;
  price: number;
  compare_price: number | null;
  stock_quantity: number;
  category_id: string;
  images: string[];
  status: string;
  product_type: string | null;
  brand: string | null;
  variants?: ProductVariants | null;
  colors?: string[];
}

export function ProductForm({ product, onSuccess, onCancel }: ProductFormProps) {
  const { vendor } = useAuth();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>(product?.images || []);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price || '',
    compare_price: product?.compare_price || '',
    stock_quantity: product?.stock_quantity || '',
    category_id: product?.category_id || '',
    status: product?.status || 'draft',
    product_type: product?.product_type || '',
    brand: product?.brand || '',
  });

  const [variantsEnabled, setVariantsEnabled] = useState(
    !!(product?.variants?.options && product.variants.options.length > 0)
  );
  const [variantsPayload, setVariantsPayload] = useState<ProductVariants | null>(
    product?.variants?.options?.length ? product.variants : null
  );

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiForm, setAiForm] = useState({
    productName: product?.name || '',
    category: '',
    features: '',
    audience: '',
  });

  const handleGenerateDescription = async () => {
    if (!aiForm.productName.trim()) { toast.error('Product name is required'); return; }
    setAiGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { action: 'generate_description', data: aiForm },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Generation failed');

      setFormData(prev => ({ ...prev, description: data.data.description }));
      setAiModalOpen(false);
      toast.success('Description generated!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate description. Try again.');
    } finally {
      setAiGenerating(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('categories')
      .select('id, name')
      .order('name');
    setCategories(data || []);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);

        setImageUrls(prev => [...prev, publicUrl]);
      }

      toast.success('Images uploaded successfully');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload images');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    setImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  const validateVariants = (): string | null => {
    const options = variantsPayload?.options || [];
    const combos = variantsPayload?.combinations || [];

    if (options.length === 0) return 'Add at least one variant option with values';

    const optionNames = new Set<string>();
    for (const option of options) {
      const name = option.name.trim().toLowerCase();
      if (!name) return 'Variant option name is required';
      if (optionNames.has(name)) return `Duplicate variant option "${option.name}"`;
      optionNames.add(name);
      if (option.values.length === 0) return `Add at least one value for "${option.name}"`;
      const values = new Set<string>();
      for (const value of option.values) {
        const val = value.trim().toLowerCase();
        if (!val) return `Empty value in option "${option.name}"`;
        if (values.has(val)) return `Duplicate value "${value}" in option "${option.name}"`;
        values.add(val);
      }
    }

    if (combos.length === 0) return 'No combinations generated from the selected options';
    for (const combo of combos) {
      if (typeof combo.price === 'number' && combo.price < 0) {
        return 'Combination price cannot be negative';
      }
      if (combo.stock < 0) return 'Combination stock cannot be negative';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.price || !formData.category_id) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (variantsEnabled) {
      const variantError = validateVariants();
      if (variantError) {
        toast.error(variantError);
        return;
      }
    }

    setLoading(true);

    try {
      const productData: ProductPayload = {
        name: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        compare_price: formData.compare_price ? parseFloat(formData.compare_price) : null,
        stock_quantity: parseInt(formData.stock_quantity) || 0,
        category_id: formData.category_id,
        images: imageUrls,
        status: formData.status,
        product_type: formData.product_type.trim()
          ? formData.product_type.trim().toLowerCase().replace(/\s+/g, '_')
          : null,
        brand: formData.brand.trim() ? formData.brand.trim() : null,
      };

      if (variantsEnabled && variantsPayload) {
        productData.variants = variantsPayload;
        const colorOption = variantsPayload.options.find(
          (option) => option.name.toLowerCase() === 'color'
        );
        if (colorOption) {
          const derivedColors = [
            ...new Set(
              colorOption.values
                .map((v) => v.trim().toLowerCase().replace(/\bgray\b/g, 'grey'))
                .filter(Boolean)
            ),
          ];
          const existingColors = (product?.colors || []).slice().sort();
          const nextColors = derivedColors.slice().sort();
          if (JSON.stringify(existingColors) !== JSON.stringify(nextColors)) {
            productData.colors = derivedColors;
          }
        }
      } else if (product?.variants?.options?.length) {
        // Vendor explicitly turned variants off — remove them. For products that
        // never had variants, leave the column untouched.
        productData.variants = null;
      }

      if (product) {
        // Update existing product
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', product.id);

        if (error) throw error;
        toast.success('Product updated successfully');
      } else {
        // Create new product
        const baseSlug = generateSlug(formData.name);
        const slug = `${baseSlug}-${Date.now().toString(36)}`;

        const { error } = await supabase
          .from('products')
          .insert({
            ...productData,
            vendor_id: vendor?.id,
            slug,
          });

        if (error) throw error;
        toast.success('Product created successfully');
      }

      onSuccess();
    } catch (error: any) {
      console.error('Error saving product:', error);
      toast.error(error.message || 'Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card rounded-xl p-6 border border-border">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">
          {product ? 'Edit Product' : 'Add New Product'}
        </h2>
        <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Close product form">
          <X aria-hidden="true" className="w-5 h-5" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Product Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Product name"
              required
            />
          </div>

          <div>
            <Label htmlFor="category">Category *</Label>
            <Select
              value={formData.category_id}
              onValueChange={(value: string) => setFormData({ ...formData, category_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="product_type">Product Type</Label>
            <Input
              id="product_type"
              value={formData.product_type}
              onChange={(e) => setFormData({ ...formData, product_type: e.target.value })}
              placeholder="e.g., tshirt, smartphone, furniture"
              list="product-type-list"
            />
            <datalist id="product-type-list">
              {PRODUCT_TYPES.map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>
          </div>

          <div>
            <Label htmlFor="brand">Brand</Label>
            <Input
              id="brand"
              value={formData.brand}
              onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
              placeholder="e.g., Nike, Samsung"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label htmlFor="description">Description *</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setAiForm(prev => ({ ...prev, productName: formData.name }));
                setAiModalOpen(true);
              }}
              className="gap-1.5 text-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate with AI
            </Button>
          </div>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Product description"
            rows={4}
            className="w-full px-4 py-3 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="price">Price (KES) *</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <Label htmlFor="compare_price">Compare Price (KES)</Label>
            <Input
              id="compare_price"
              type="number"
              step="0.01"
              value={formData.compare_price}
              onChange={(e) => setFormData({ ...formData, compare_price: e.target.value })}
              placeholder="0.00"
            />
          </div>

          <div>
            <Label htmlFor="stock">Stock Quantity *</Label>
            <Input
              id="stock"
              type="number"
              value={formData.stock_quantity}
              onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
              placeholder="0"
              required
            />
          </div>
        </div>

        <div>
          <Label htmlFor="status">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value: string) => setFormData({ ...formData, status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="out_of_stock">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Product Images</Label>
          <div className="mt-2">
            <label className="flex items-center gap-2 px-4 py-3 bg-muted border border-border rounded-lg cursor-pointer hover:bg-accent transition-colors">
              <Upload className="w-5 h-5" />
              <span>{uploading ? 'Uploading...' : 'Upload Images'}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>

          {imageUrls.length > 0 && (
            <div className="grid grid-cols-4 gap-4 mt-4">
              {imageUrls.map((url, index) => (
                <div key={index} className="relative group">
                  <img
                    src={url}
                    alt={`Product image ${index + 1}`}
                    className="w-full h-24 object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 w-6 h-6 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Variant Configuration */}
        <div className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-base">Product has variants</Label>
              <p className="text-xs text-muted-foreground">
                Enable for products with options like Color or Size.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={variantsEnabled}
              aria-label="Toggle product variants"
              onClick={() => setVariantsEnabled(!variantsEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                variantsEnabled ? 'bg-primary' : 'bg-muted border border-border'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  variantsEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {variantsEnabled && product?.variants?.options?.length ? (
            <p className="text-xs text-amber-600">
              Editing {product.variants.options.length} existing option(s). Turning variants off
              and saving will remove them.
            </p>
          ) : variantsEnabled ? (
            <p className="text-xs text-muted-foreground">
              Configure variant options below. Variants are optional — leave this off for simple
              products.
            </p>
          ) : null}

          {variantsEnabled && (
            <VariantEditor
              initialVariants={product?.variants || null}
              onChange={setVariantsPayload}
            />
          )}
        </div>

        <div className="flex gap-4">
          <Button type="submit" disabled={loading || uploading}>
            {loading ? 'Saving...' : product ? 'Update Product' : 'Create Product'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>

      {/* AI Description Generator Modal */}
      <Dialog open={aiModalOpen} onOpenChange={setAiModalOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Generate Description with AI</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Product Name *</Label>
              <Input
                value={aiForm.productName}
                onChange={(e) => setAiForm(prev => ({ ...prev, productName: e.target.value }))}
                placeholder="Product name"
                className="bg-muted border-border"
              />
            </div>
            <div>
              <Label>Category</Label>
              <Input
                value={aiForm.category}
                onChange={(e) => setAiForm(prev => ({ ...prev, category: e.target.value }))}
                placeholder="e.g., Electronics, Fashion"
                className="bg-muted border-border"
              />
            </div>
            <div>
              <Label>Key Features</Label>
              <textarea
                value={aiForm.features}
                onChange={(e) => setAiForm(prev => ({ ...prev, features: e.target.value }))}
                placeholder="e.g., 4GB RAM, 64GB storage, 48MP camera"
                rows={3}
                className="w-full px-4 py-3 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <Label>Target Audience</Label>
              <Input
                value={aiForm.audience}
                onChange={(e) => setAiForm(prev => ({ ...prev, audience: e.target.value }))}
                placeholder="e.g., Students, Professionals"
                className="bg-muted border-border"
              />
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                onClick={handleGenerateDescription}
                disabled={aiGenerating}
                className="flex-1 gap-2"
              >
                {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {aiGenerating ? 'Generating...' : 'Generate'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setAiModalOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
