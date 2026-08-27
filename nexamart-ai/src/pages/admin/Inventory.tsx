import { useState, useEffect, useMemo } from 'react';
import { Search, Package, AlertTriangle, AlertCircle, CheckCircle, Download, Inbox, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { Pagination } from '../../components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { motion } from 'motion/react';
import { toast } from 'sonner';

const PAGE_SIZE = 15;

export function AdminInventory() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [threshold] = useState(5);
  const [adjustTarget, setAdjustTarget] = useState<any>(null);
  const [adjustValue, setAdjustValue] = useState('');
  const [savingAdjust, setSavingAdjust] = useState(false);

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

  const vendors = useMemo(() => {
    const names = new Set(products.map((p) => p.vendors?.store_name).filter(Boolean));
    return Array.from(names).sort() as string[];
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = p.name?.toLowerCase().includes(search.toLowerCase()) || p.vendors?.store_name?.toLowerCase().includes(search.toLowerCase());
      const matchesStock = stockFilter === 'all'
        || (stockFilter === 'out_of_stock' && (p.stock_quantity === 0 || p.status === 'out_of_stock'))
        || (stockFilter === 'low_stock' && p.stock_quantity > 0 && p.stock_quantity <= threshold && p.status !== 'out_of_stock')
        || (stockFilter === 'in_stock' && p.stock_quantity > threshold && p.status === 'active');
      const matchesVendor = vendorFilter === 'all' || p.vendors?.store_name === vendorFilter;
      return matchesSearch && matchesStock && matchesVendor;
    });
  }, [products, search, stockFilter, vendorFilter, threshold]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, stockFilter, vendorFilter]);

  const formatPrice = (p: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(p);

  const exportCsv = () => {
    const header = 'Name,Vendor,Stock,Status,Value\n';
    const rows = filtered.map((p) => {
      const isOut = p.stock_quantity === 0 || p.status === 'out_of_stock';
      const isLow = p.stock_quantity > 0 && p.stock_quantity <= threshold;
      const status = isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock';
      const value = p.price * p.stock_quantity;
      return `"${(p.name ?? '').replace(/"/g, '""')}","${(p.vendors?.store_name ?? '').replace(/"/g, '""')}",${p.stock_quantity},${status},${value}`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const openAdjust = (p: any) => {
    setAdjustTarget(p);
    setAdjustValue(String(p.stock_quantity));
  };

  const saveAdjust = async () => {
    if (!adjustTarget) return;
    const qty = Number(adjustValue);
    if (!Number.isFinite(qty) || qty < 0) { toast.error('Stock must be a non-negative number'); return; }
    setSavingAdjust(true);
    try {
      const { error } = await supabase.from('products').update({ stock_quantity: qty }).eq('id', adjustTarget.id);
      if (error) { toast.error('Failed to update stock'); return; }
      toast.success(`Stock updated to ${qty} for "${adjustTarget.name}"`);
      setAdjustTarget(null);
      fetchProducts();
    } finally {
      setSavingAdjust(false);
    }
  };

  const skeletonRows = Array.from({ length: 8 });

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
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Vendors" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vendors</SelectItem>
            {vendors.map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv} className="gap-2">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-0" aria-live="polite" aria-busy="true">
            {skeletonRows.map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-4 border-b border-border last:border-0">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 flex-1 max-w-[200px]" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Inbox className="w-12 h-12" />
            <p className="text-lg font-medium">No products found</p>
            <p className="text-sm">Try adjusting your search or filter criteria</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="text-left p-4 text-muted-foreground font-medium">Product</th>
                    <th scope="col" className="text-left p-4 text-muted-foreground font-medium">Vendor</th>
                    <th scope="col" className="text-left p-4 text-muted-foreground font-medium">Stock</th>
                    <th scope="col" className="text-left p-4 text-muted-foreground font-medium">Status</th>
                    <th scope="col" className="text-left p-4 text-muted-foreground font-medium">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paged.map((p) => {
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
                          <div className="flex items-center gap-2">
                            <span className={`font-mono font-bold ${isOut ? 'text-destructive' : isLowStock ? 'text-warning' : 'text-success'}`}>
                              {p.stock_quantity}
                            </span>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openAdjust(p)} aria-label={`Adjust stock for ${p.name}`}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </div>
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
            </div>
            <div className="border-t border-border py-3">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
      </Card>

      <Dialog open={!!adjustTarget} onOpenChange={() => setAdjustTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
            <DialogDescription>Set stock quantity for "{adjustTarget?.name}"</DialogDescription>
          </DialogHeader>
          <Input
            label="New Stock Quantity"
            type="number"
            min={0}
            value={adjustValue}
            onChange={(e) => setAdjustValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveAdjust(); }}
          />
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>Cancel</Button>
            <Button onClick={saveAdjust} disabled={savingAdjust}>{savingAdjust ? 'Saving...' : 'Update Stock'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
