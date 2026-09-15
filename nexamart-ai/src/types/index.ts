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
  description: string;
  rating: number;
  country?: string | null;
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
