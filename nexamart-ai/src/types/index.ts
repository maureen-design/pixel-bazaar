export interface ProductVariant {
  id: string;
  attributes: Record<string, string>;
  price: number | null;
  stock: number;
  sku?: string;
  image?: string;
  images?: string[];
}

export interface ProductVariantOption {
  label: string;
  name: string;
  values: string[];
}

export interface ProductVariants {
  options: ProductVariantOption[];
  combinations: ProductVariant[];
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  compare_price: number;
  stock_quantity: number;
  images: string[];
  status: 'active' | 'draft' | 'out_of_stock';
  rating: number;
  product_type?: string;
  brand?: string;
  colors?: string[];
  vendor_id: string;
  category_id: string;
  variants?: ProductVariants;
  created_at: string;
  updated_at: string;
  vendor?: {
    id: string;
    store_name: string;
    store_logo: string;
    country?: string | null;
    /**
     * Only selected by hooks that need it (currently useProduct). Absent on the
     * others, so treat as optional and never assert on it without a fallback.
     */
    is_verified?: boolean;
  };
  category?: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  parent_id: string | null;
  created_at: string;
}

export interface Vendor {
  id: string;
  store_name: string;
  store_logo: string;
  store_description?: string | null;
  rating: number;
  country?: string | null;
}

/**
 * Public store profile for /store/:id.
 *
 * Deliberately an explicit allow-list rather than `Vendor`. Since migration
 * 0034, `vendors` holds nothing but public fields, but the storefront is still
 * readable by anon under a `using (true)` policy, so this allow-list is still
 * what stops a future column from reaching buyers by accident. Keep it in step
 * with the columns in `0034_vendor_private_split.sql` that were kept.
 */
export interface Store {
  id: string;
  store_name: string;
  store_description: string | null;
  store_logo: string | null;
  store_cover: string | null;
  country: string | null;
  city: string | null;
  business_name: string | null;
  is_verified: boolean;
  created_at: string;
}

export interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  product?: Product;
  variant_id?: string;
  variant_attributes?: Record<string, string>;
  variant_price?: number;
}

export interface Order {
  id: string;
  order_number: string;
  total_amount: number;
  status: string;
  created_at: string;
}
