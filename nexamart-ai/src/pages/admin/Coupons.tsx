import { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Tag, Tags } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Pagination } from '../../components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { logActivity } from '../../utils/activityLogger';
import { useAuth } from '../../context/AuthContext';

const PAGE_SIZE = 15;

export function AdminCoupons() {
  const { user, profile } = useAuth();
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [form, setForm] = useState({
    code: '', description: '', discount_type: 'percentage', discount_value: '',
    min_spend: '0', max_discount: '', usage_limit: '', expires_at: '',
  });

  useEffect(() => { fetchCoupons(); }, []);

  const fetchCoupons = async () => {
    try {
      const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
      setCoupons(data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const openCreate = () => {
    setForm({ code: '', description: '', discount_type: 'percentage', discount_value: '', min_spend: '0', max_discount: '', usage_limit: '', expires_at: '' });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (c: any) => {
    setForm({
      code: c.code, description: c.description || '', discount_type: c.discount_type, discount_value: String(c.discount_value),
      min_spend: String(c.min_spend || 0), max_discount: c.max_discount ? String(c.max_discount) : '', usage_limit: c.usage_limit ? String(c.usage_limit) : '', expires_at: c.expires_at ? c.expires_at.slice(0, 16) : '',
    });
    setEditing(c);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.discount_value) { toast.error('Code and discount value are required'); return; }
    const payload = {
      code: form.code.toUpperCase(),
      description: form.description,
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value),
      min_spend: parseFloat(form.min_spend) || 0,
      max_discount: form.max_discount ? parseFloat(form.max_discount) : null,
      usage_limit: form.usage_limit ? parseInt(form.usage_limit) : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    };

    if (editing) {
      const { error } = await supabase.from('coupons').update(payload).eq('id', editing.id);
      if (error) { toast.error('Failed to update'); return; }
      toast.success('Coupon updated');
      logActivity(user?.id, profile?.email, 'coupon_update', { coupon_id: editing.id, code: form.code });
    } else {
      const { error } = await supabase.from('coupons').insert(payload);
      if (error) { toast.error('Failed to create'); return; }
      toast.success('Coupon created');
      logActivity(user?.id, profile?.email, 'coupon_create', { code: form.code });
    }
    setShowForm(false);
    fetchCoupons();
  };

  const toggleActive = async (coupon: any) => {
    const { error } = await supabase.from('coupons').update({ is_active: !coupon.is_active }).eq('id', coupon.id);
    if (error) { toast.error('Failed to toggle'); return; }
    toast.success(coupon.is_active ? 'Coupon deactivated' : 'Coupon activated');
    fetchCoupons();
  };

  const deleteCoupon = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('coupons').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Failed to delete'); setDeleteTarget(null); return; }
    toast.success('Coupon deleted');
    logActivity(user?.id, profile?.email, 'coupon_delete', { coupon_id: deleteTarget.id, code: deleteTarget.code });
    setDeleteTarget(null);
    fetchCoupons();
  };

  const filtered = coupons.filter((c) => c.code?.toLowerCase().includes(search.toLowerCase()) || c.description?.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString() : '-';

  useEffect(() => { setPage(1); }, [search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Coupons</h1>
          <p className="text-muted-foreground">Manage discount coupons and promotions</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> Add Coupon</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search coupons..." aria-label="Search coupons" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <div className="ml-auto flex gap-2">
                  <Skeleton className="h-8 w-8 rounded" />
                  <Skeleton className="h-8 w-8 rounded" />
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Tags className="w-12 h-12 mb-4 opacity-40" />
            <p className="text-lg font-medium">No coupons found</p>
            <p className="text-sm mt-1">{search ? 'Try a different search term' : 'Create your first coupon to get started'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-muted-foreground font-medium">Code</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Discount</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Min Spend</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Usage</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Expires</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((c) => {
                  const expired = c.expires_at && new Date(c.expires_at) < new Date();
                  return (
                    <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-muted/50">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <Tag className="w-5 h-5 text-primary" />
                          <span className="font-mono font-bold text-primary">{c.code}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        {c.discount_type === 'percentage' ? `${c.discount_value}%` : `KES ${c.discount_value}`}
                        {c.max_discount && <span className="text-xs text-muted-foreground ml-1">(max KES {c.max_discount})</span>}
                      </td>
                      <td className="p-4 text-muted-foreground">{c.min_spend > 0 ? `KES ${c.min_spend}` : '-'}</td>
                      <td className="p-4 text-muted-foreground">{c.used_count || 0}{c.usage_limit ? ` / ${c.usage_limit}` : ''}</td>
                      <td className="p-4 text-muted-foreground">{formatDate(c.expires_at)}</td>
                      <td className="p-4">
                        {expired ? <Badge variant="destructive">Expired</Badge>
                        : c.is_active ? <Badge variant="default">Active</Badge>
                        : <Badge variant="secondary">Inactive</Badge>}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => toggleActive(c)} aria-label={`${c.is_active ? 'Deactivate' : 'Activate'} coupon ${c.code}`}>
                            {c.is_active ? <ToggleRight aria-hidden="true" className="w-4 h-4" /> : <ToggleLeft aria-hidden="true" className="w-4 h-4" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(c)} aria-label={`Edit coupon ${c.code}`}><Edit2 aria-hidden="true" className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(c)} aria-label={`Delete coupon ${c.code}`}><Trash2 aria-hidden="true" className="w-4 h-4" /></Button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!loading && filtered.length > 0 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Coupon' : 'Add Coupon'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm text-muted-foreground mb-1 block">Code</label><Input value={form.code} onChange={(e) => setForm({...form, code: e.target.value.toUpperCase()})} placeholder="SUMMER2024" /></div>
            <div><label className="text-sm text-muted-foreground mb-1 block">Description</label><Input value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="Summer sale discount" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm text-muted-foreground mb-1 block">Type</label>
                <Select value={form.discount_type} onValueChange={(v) => setForm({...form, discount_type: v ?? ''})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><label className="text-sm text-muted-foreground mb-1 block">Value</label><Input type="number" value={form.discount_value} onChange={(e) => setForm({...form, discount_value: e.target.value})} placeholder="10" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm text-muted-foreground mb-1 block">Min Spend</label><Input type="number" value={form.min_spend} onChange={(e) => setForm({...form, min_spend: e.target.value})} /></div>
              <div><label className="text-sm text-muted-foreground mb-1 block">Max Discount</label><Input type="number" value={form.max_discount} onChange={(e) => setForm({...form, max_discount: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm text-muted-foreground mb-1 block">Usage Limit</label><Input type="number" value={form.usage_limit} onChange={(e) => setForm({...form, usage_limit: e.target.value})} /></div>
              <div><label className="text-sm text-muted-foreground mb-1 block">Expires At</label><Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({...form, expires_at: e.target.value})} /></div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSubmit}>{editing ? 'Update' : 'Create'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Coupon</DialogTitle><DialogDescription>Delete coupon "{deleteTarget?.code}"? This cannot be undone.</DialogDescription></DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteCoupon}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
