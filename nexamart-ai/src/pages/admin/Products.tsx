import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Trash2, Eye, Download, PackageSearch, CheckSquare, Edit2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Skeleton } from '../../components/ui/skeleton';
import { Pagination } from '../../components/ui/pagination';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { formatPrice } from '../../config/pricing';

const PAGE_SIZE = 15;

export function AdminProducts() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState(false);
  const [bulkStatusTarget, setBulkStatusTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', price: '', stock_quantity: '', status: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    try {
      const { data } = await supabase
        .from('products')
        .select('*, vendors(store_name), categories(name)')
        .order('created_at', { ascending: false });
      setProducts(data || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load data');
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

  const bulkDeleteProducts = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const { error } = await supabase.from('products').delete().in('id', ids);
    if (error) { toast.error('Failed to delete products'); setBulkDeleteTarget(false); return; }
    toast.success(`${ids.length} product${ids.length > 1 ? 's' : ''} deleted`);
    setSelectedIds(new Set());
    setBulkDeleteTarget(false);
    fetchProducts();
  };

  const bulkUpdateStatus = async (status: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const { error } = await supabase.from('products').update({ status }).in('id', ids);
    if (error) { toast.error('Failed to update products'); setBulkStatusTarget(null); return; }
    toast.success(`${ids.length} product${ids.length > 1 ? 's' : ''} updated to ${status}`);
    setSelectedIds(new Set());
    setBulkStatusTarget(null);
    fetchProducts();
  };

  const openEdit = (p: any) => {
    setEditTarget(p);
    setEditForm({
      name: p.name || '',
      description: p.description || '',
      price: String(p.price || ''),
      stock_quantity: String(p.stock_quantity || 0),
      status: p.status || 'draft',
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const price = Number(editForm.price);
    const stock = Number(editForm.stock_quantity);
    if (!editForm.name.trim()) { toast.error('Product name is required'); return; }
    if (!Number.isFinite(price) || price < 0) { toast.error('Price must be a non-negative number'); return; }
    if (!Number.isFinite(stock) || stock < 0) { toast.error('Stock must be a non-negative number'); return; }
    setSavingEdit(true);
    try {
      const { error } = await supabase.from('products').update({
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        price,
        stock_quantity: stock,
        status: editForm.status,
      }).eq('id', editTarget.id);
      if (error) { toast.error('Failed to update product'); return; }
      toast.success('Product updated');
      setEditTarget(null);
      fetchProducts();
    } finally {
      setSavingEdit(false);
    }
  };

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (p.categories?.name) map.set(p.categories.name, p.categories.name);
    });
    return Array.from(map.values()).sort();
  }, [products]);

  const vendors = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (p.vendors?.store_name) map.set(p.vendors.store_name, p.vendors.store_name);
    });
    return Array.from(map.values()).sort();
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = p.name?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || p.categories?.name === categoryFilter;
      const matchesVendor = vendorFilter === 'all' || p.vendors?.store_name === vendorFilter;
      return matchesSearch && matchesStatus && matchesCategory && matchesVendor;
    });
  }, [products, search, statusFilter, categoryFilter, vendorFilter]);

  useEffect(() => { setPage(1); }, [search, statusFilter, categoryFilter, vendorFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allIds = new Set(paginated.map((p) => p.id));
      const allSelected = paginated.every((p) => prev.has(p.id));
      if (allSelected) {
        const next = new Set(prev);
        paginated.forEach((p) => next.delete(p.id));
        return next;
      }
      return new Set([...prev, ...allIds]);
    });
  }, [paginated]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const allPaginatedSelected = paginated.length > 0 && paginated.every((p) => selectedIds.has(p.id));

  useEffect(() => { setSelectedIds(new Set()); }, [search, statusFilter, categoryFilter, vendorFilter]);

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
           <Input placeholder="Search products by name…" aria-label="Search products" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
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
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
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
      </div>

      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="bg-primary/5 border-primary/20 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  <CheckSquare className="inline w-4 h-4 mr-2" />
                  {selectedIds.size} product{selectedIds.size > 1 ? 's' : ''} selected
                </p>
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                    Clear selection
                  </Button>
                  <Select value={bulkStatusTarget || '__none'} onValueChange={(v) => { if (v !== '__none') setBulkStatusTarget(v); }}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Change status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none" disabled>Change status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="destructive" size="sm" onClick={() => setBulkDeleteTarget(true)}>
                    <Trash2 className="w-4 h-4 mr-1" /> Delete selected
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Failed to load data</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {!error && (
        <Card className="bg-card border-border overflow-hidden">
          {loading ? (
            <div className="p-4" aria-live="polite" aria-busy="true">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-4 border-b border-border last:border-0">
                  <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-16 rounded" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground" role="status">
              <PackageSearch className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No products found</p>
              <p className="text-sm mt-1">Try adjusting your filters or search query</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="p-4 w-10">
                    <button onClick={toggleSelectAll} className="flex items-center justify-center">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${allPaginatedSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-muted-foreground/70'}`}>
                        {allPaginatedSelected && <CheckSquare className="w-3.5 h-3.5" />}
                      </div>
                    </button>
                  </th>
                  <th scope="col" className="text-left p-4 text-muted-foreground font-medium">Product</th>
                  <th scope="col" className="text-left p-4 text-muted-foreground font-medium">Vendor</th>
                  <th scope="col" className="text-left p-4 text-muted-foreground font-medium">Category</th>
                  <th scope="col" className="text-left p-4 text-muted-foreground font-medium">Price</th>
                  <th scope="col" className="text-left p-4 text-muted-foreground font-medium">Stock</th>
                  <th scope="col" className="text-left p-4 text-muted-foreground font-medium">Status</th>
                  <th scope="col" className="text-left p-4 text-muted-foreground font-medium">Created</th>
                  <th scope="col" className="text-right p-4 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((p) => (
                  <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`hover:bg-muted/50 ${selectedIds.has(p.id) ? 'bg-primary/5' : ''}`}>
                    <td className="p-4 w-10">
                      <button onClick={() => toggleSelect(p.id)} className="flex items-center justify-center">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${selectedIds.has(p.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-muted-foreground/70'}`}>
                          {selectedIds.has(p.id) && <CheckSquare className="w-3.5 h-3.5" />}
                        </div>
                      </button>
                    </td>
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
                    <td className="p-4">{p.stock_quantity}</td>
                    <td className="p-4"><Badge variant={getStatusVariant(p.status)}>{p.status}</Badge></td>
                    <td className="p-4 text-muted-foreground">{formatDate(p.created_at)}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Edit2 className="w-4 h-4" /></Button>
                        <Link to={`/product/${p.id}`}><Button size="sm" variant="ghost"><Eye className="w-4 h-4" /></Button></Link>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(p)}>
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
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} products
          </p>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

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

      <Dialog open={bulkDeleteTarget} onOpenChange={() => setBulkDeleteTarget(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Selected Products</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedIds.size} product{selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setBulkDeleteTarget(false)}>Cancel</Button>
            <Button variant="destructive" onClick={bulkDeleteProducts}>Delete {selectedIds.size} product{selectedIds.size > 1 ? 's' : ''}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bulkStatusTarget} onOpenChange={() => setBulkStatusTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Product Status</DialogTitle>
            <DialogDescription>
              Are you sure you want to set {selectedIds.size} product{selectedIds.size > 1 ? 's' : ''} to "{bulkStatusTarget}"?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setBulkStatusTarget(null)}>Cancel</Button>
            <Button onClick={() => { if (bulkStatusTarget) bulkUpdateStatus(bulkStatusTarget); }}>Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>Update "{editTarget?.name}"</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input label="Product Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Price (KES)" type="number" min={0} value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} />
              <Input label="Stock" type="number" min={0} value={editForm.stock_quantity} onChange={(e) => setEditForm({ ...editForm, stock_quantity: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
