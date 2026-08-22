import { useState, useEffect } from 'react';
import { Search, Package, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { motion } from 'motion/react';

export function AdminInventory() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [threshold] = useState(5);

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    try {
      const { data } = await supabase
        .from('products')
        .select('*, vendors(store_name)')
        .order('stock_quantity', { ascending: true });
      setProducts(data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const outOfStock = products.filter((p) => p.stock_quantity === 0 || p.status === 'out_of_stock').length;
  const lowStock = products.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= threshold && p.status !== 'out_of_stock').length;
  const totalValue = products.reduce((s: number, p: any) => s + (p.price * p.stock_quantity), 0);

  const filtered = products.filter((p) => {
    const matchesSearch = p.name?.toLowerCase().includes(search.toLowerCase()) || p.vendors?.store_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStock = stockFilter === 'all'
      || (stockFilter === 'out_of_stock' && (p.stock_quantity === 0 || p.status === 'out_of_stock'))
      || (stockFilter === 'low_stock' && p.stock_quantity > 0 && p.stock_quantity <= threshold && p.status !== 'out_of_stock')
      || (stockFilter === 'in_stock' && p.stock_quantity > threshold && p.status === 'active');
    return matchesSearch && matchesStock;
  });

  const formatPrice = (p: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(p);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Inventory</h1>
        <p className="text-muted-foreground">Monitor stock levels across all products</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{products.length}</p>
              <p className="text-xs text-muted-foreground">Total Products</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-warning" />
            <div>
              <p className="text-2xl font-bold">{lowStock}</p>
              <p className="text-xs text-muted-foreground">Low Stock (&le;{threshold})</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <div>
              <p className="text-2xl font-bold">{outOfStock}</p>
              <p className="text-xs text-muted-foreground">Out of Stock</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-success" />
            <div>
              <p className="text-2xl font-bold">{formatPrice(totalValue)}</p>
              <p className="text-xs text-muted-foreground">Inventory Value</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={stockFilter} onValueChange={setStockFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            <SelectItem value="in_stock">In Stock</SelectItem>
            <SelectItem value="low_stock">Low Stock</SelectItem>
            <SelectItem value="out_of_stock">Out of Stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {loading ? <div className="p-8 text-center"><div className="h-8 w-8 animate-spin mx-auto border-4 border-primary border-t-transparent rounded-full" /></div>
        : filtered.length === 0 ? <div className="p-8 text-center text-muted-foreground">No products found</div>
        : <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-muted-foreground font-medium">Product</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Vendor</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Stock</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((p) => {
                  const isLowStock = p.stock_quantity > 0 && p.stock_quantity <= threshold;
                  const isOut = p.stock_quantity === 0 || p.status === 'out_of_stock';
                  return (
                    <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className={`hover:bg-muted/50 ${isOut ? 'bg-destructive/5' : isLowStock ? 'bg-warning/5' : ''}`}>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <Package className={`w-5 h-5 ${isOut ? 'text-destructive' : isLowStock ? 'text-warning' : 'text-success'}`} />
                          <span className="font-medium line-clamp-1">{p.name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">{p.vendors?.store_name}</td>
                      <td className="p-4">
                        <span className={`font-mono font-bold ${isOut ? 'text-destructive' : isLowStock ? 'text-warning' : 'text-success'}`}>
                          {p.stock_quantity}
                        </span>
                      </td>
                      <td className="p-4">
                        {isOut ? <Badge variant="destructive">Out of Stock</Badge>
                        : isLowStock ? <Badge variant="secondary">Low Stock</Badge>
                        : <Badge variant="default">In Stock</Badge>}
                      </td>
                      <td className="p-4 text-muted-foreground">{formatPrice(p.price * p.stock_quantity)}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
      </Card>
    </div>
  );
}
