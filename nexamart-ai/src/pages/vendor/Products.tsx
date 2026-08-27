import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Package, ArrowUpDown, ArrowUp, ArrowDown, Copy, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { ProductForm } from '../../components/vendor/ProductForm';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { motion } from 'motion/react';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  compare_price: number | null;
  stock_quantity: number;
  status: string;
  images: string[];
  categories: { name: string };
  created_at: string;
}

type SortKey = 'date' | 'name' | 'price' | 'stock';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'active' | 'draft' | 'out_of_stock';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'draft', label: 'Draft' },
  { key: 'out_of_stock', label: 'Out of Stock' },
];

export function VendorProducts() {
  const { vendor } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    if (vendor) {
      fetchProducts();
    }
  }, [vendor]);

  const fetchProducts = async () => {
    try {
      const { data } = await supabase
        .from('products')
        .select('*, categories(name)')
        .eq('vendor_id', vendor.id)
        .order('created_at', { ascending: false });

      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (product: Product) => {
    const newStatus = product.status === 'active' ? 'draft' : 'active';
    try {
      const { error } = await supabase
        .from('products')
        .update({ status: newStatus })
        .eq('id', product.id);

      if (error) throw error;
      setProducts(prev =>
        prev.map(p => p.id === product.id ? { ...p, status: newStatus } : p)
      );
      toast.success(`Product ${newStatus === 'active' ? 'published' : 'unpublished'}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status');
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;
      toast.success('Product deleted');
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete product');
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setSelectedProduct(null);
    fetchProducts();
  };

  const handleDuplicate = async (product: Product) => {
    try {
      const { id: _id, ...cloneData } = product;
      const baseSlug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const { data, error } = await supabase
        .from('products')
        .insert({
          ...cloneData,
          name: `${product.name} (Copy)`,
          slug: `${baseSlug}-copy-${Date.now().toString(36)}`,
          status: 'draft',
          vendor_id: vendor.id,
        })
        .select()
        .single();

      if (error) throw error;
      toast.success('Product duplicated');
      fetchProducts();
      setSelectedProduct(data);
      setShowForm(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to duplicate product');
    }
  };

  const handleExport = () => {
    const headers = ['Name', 'Category', 'Price', 'Compare Price', 'Stock', 'Status'];
    const rows = filteredProducts.map(p => [
      p.name,
      p.categories?.name || '',
      p.price,
      p.compare_price || '',
      p.stock_quantity,
      p.status,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Products exported');
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => {
    if (!active) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />;
  };

  const filteredProducts = useMemo(() => {
    const filtered = products.filter(product => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || product.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    return filtered.sort((a, b) => {
      const mult = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'name':
          return mult * a.name.localeCompare(b.name);
        case 'price':
          return mult * (a.price - b.price);
        case 'stock':
          return mult * (a.stock_quantity - b.stock_quantity);
        case 'date':
        default:
          return mult * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
    });
  }, [products, searchQuery, statusFilter, sortKey, sortDir]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(price);
  };

  const getStockBadge = (qty: number) => {
    if (qty === 0) return 'bg-destructive/20 text-destructive';
    if (qty <= 5) return 'bg-warning/20 text-warning';
    return 'bg-success/20 text-success';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between animate-pulse">
          <div className="space-y-2">
            <div className="h-8 w-40 bg-muted rounded" />
            <div className="h-4 w-56 bg-muted rounded" />
          </div>
          <div className="h-10 w-36 bg-muted rounded-lg" />
        </div>
        <div className="h-12 bg-muted rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-72 bg-muted rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Products</h1>
          <p className="text-muted-foreground">
            {products.length} product{products.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Button onClick={() => { setSelectedProduct(null); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Product
        </Button>
      </div>

      {/* Status Tabs + Export */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {STATUS_TABS.map(tab => {
            const count = tab.key === 'all'
              ? products.length
              : products.filter(p => p.status === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  statusFilter === tab.key
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  statusFilter === tab.key ? 'bg-foreground/10' : 'bg-muted'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Search + Sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value) setSearchParams({ q: e.target.value }, { replace: true });
              else setSearchParams({}, { replace: true });
            }}
            className="pl-10 bg-card border-border"
          />
        </div>
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {([
            { key: 'date' as SortKey, label: 'Date' },
            { key: 'name' as SortKey, label: 'Name' },
            { key: 'price' as SortKey, label: 'Price' },
            { key: 'stock' as SortKey, label: 'Stock' },
          ]).map(opt => (
            <button
              key={opt.key}
              onClick={() => toggleSort(opt.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                sortKey === opt.key
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
              <SortIcon active={sortKey === opt.key} dir={sortDir} />
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <Card className="p-12 bg-card border-border text-center">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
          <h3 className="text-lg font-semibold mb-2">No products found</h3>
          <p className="text-muted-foreground text-sm mb-6">
            {searchQuery ? 'Try a different search term' : 'Add your first product to get started'}
          </p>
          {!searchQuery && (
            <Button onClick={() => { setSelectedProduct(null); setShowForm(true); }} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Product
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="bg-card border-border overflow-hidden group">
                {/* Image */}
                <div className="relative aspect-video bg-muted">
                  {product.images && product.images.length > 0 ? (
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-8 h-8 text-muted-foreground opacity-30" />
                    </div>
                  )}
                  {/* Status toggle overlay */}
                  <div className="absolute top-3 right-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleStatus(product); }}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center backdrop-blur-sm transition-all ${
                        product.status === 'active'
                          ? 'bg-success/80 text-white hover:bg-success'
                          : 'bg-muted/80 text-muted-foreground hover:bg-muted border border-border'
                      }`}
                      aria-label={`${product.status === 'active' ? 'Unpublish' : 'Publish'} ${product.name}`}
                      title={product.status === 'active' ? 'Click to unpublish' : 'Click to publish'}
                    >
                      <div className={`w-3 h-3 rounded-full ${product.status === 'active' ? 'bg-white' : 'bg-muted-foreground'}`} />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-1.5">
                    <h3 className="font-semibold line-clamp-1 flex-1">{product.name}</h3>
                  </div>

                  <p className="text-xs text-muted-foreground mb-3 line-clamp-1">
                    {product.categories?.name || 'Uncategorized'}
                  </p>

                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-baseline gap-2">
                      <p className="font-bold">{formatPrice(product.price)}</p>
                      {product.compare_price && product.compare_price > product.price && (
                        <p className="text-xs text-muted-foreground line-through">
                          {formatPrice(product.compare_price)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stock */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getStockBadge(product.stock_quantity)}`}>
                      {product.stock_quantity === 0
                        ? 'Out of Stock'
                        : product.stock_quantity <= 5
                          ? `${product.stock_quantity} left`
                          : `${product.stock_quantity} in stock`}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => { setSelectedProduct(product); setShowForm(true); }}
                    >
                      <Edit className="w-3.5 h-3.5 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDuplicate(product)}
                      aria-label={`Duplicate ${product.name}`}
                      title="Duplicate product"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                      onClick={() => handleDelete(product.id)}
                      aria-label={`Delete ${product.name}`}
                    >
                      <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Product Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <ProductForm
            product={selectedProduct}
            onSuccess={handleFormSuccess}
            onCancel={() => { setShowForm(false); setSelectedProduct(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
