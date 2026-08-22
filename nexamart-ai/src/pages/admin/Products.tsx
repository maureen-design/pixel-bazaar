import { useState, useEffect } from 'react';
import { Search, Trash2, Eye, Download } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

export function AdminProducts() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    try {
      const { data } = await supabase
        .from('products')
        .select('*, vendors(store_name), categories(name)')
        .order('created_at', { ascending: false });
      setProducts(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const deleteProduct = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('products').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Failed to delete product'); setDeleteTarget(null); return; }
    toast.success('Product deleted');
    setDeleteTarget(null);
    fetchProducts();
  };

  const formatPrice = (p: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(p);

  const filtered = products.filter((p) => {
    const matchesSearch = p.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusVariant = (s: string) => {
    if (s === 'active') return 'default' as const;
    if (s === 'draft') return 'secondary' as const;
    if (s === 'out_of_stock') return 'destructive' as const;
    return 'secondary' as const;
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString();

  const exportCSV = () => {
    const headers = 'Name,Description,Price,Stock,Category,Vendor,Status\n';
    const rows = filtered.map((p) =>
      `"${p.name}","${(p.description || '').replace(/"/g, '""')}",${p.price},${p.stock_quantity},"${p.categories?.name || ''}","${p.vendors?.store_name || ''}",${p.status}`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Products</h1>
          <p className="text-muted-foreground">Manage all products on the platform</p>
        </div>
        <Button onClick={exportCSV} variant="outline" className="gap-2"><Download className="w-4 h-4" /> Export CSV</Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="out_of_stock">Out of Stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No products found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-muted-foreground font-medium">Product</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Vendor</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Category</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Price</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Created</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((p) => (
                  <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-muted/50">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                          {p.images?.[0] && <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />}
                        </div>
                        <span className="font-medium line-clamp-1">{p.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground">{p.vendors?.store_name}</td>
                    <td className="p-4 text-muted-foreground">{p.categories?.name}</td>
                    <td className="p-4">{formatPrice(p.price)}</td>
                    <td className="p-4"><Badge variant={getStatusVariant(p.status)}>{p.status}</Badge></td>
                    <td className="p-4 text-muted-foreground">{formatDate(p.created_at)}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/product/${p.id}`}><Button size="sm" variant="ghost"><Eye className="w-4 h-4" /></Button></Link>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-red-300 hover:bg-destructive/10" onClick={() => setDeleteTarget(p)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
            <DialogDescription>Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteProduct}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
