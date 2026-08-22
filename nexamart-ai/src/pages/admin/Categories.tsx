import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { CategoryIcon, CATEGORY_ICON_OPTIONS } from '../../utils/categoryIcons';

export function AdminCategories() {
  const [categories, setCategories] = useState<any[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [form, setForm] = useState({ name: '', slug: '', icon: '', description: '' });

  useEffect(() => { fetchCategories(); }, []);

  const fetchCategories = async () => {
    try {
      const { data } = await supabase.from('categories').select('*').order('name');
      setCategories(data || []);

      const { data: products } = await supabase.from('products').select('category_id');
      const counts: Record<string, number> = {};
      (products || []).forEach((p: any) => { counts[p.category_id] = (counts[p.category_id] || 0) + 1; });
      setProductCounts(counts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (cat: any) => {
    setForm({ name: cat.name, slug: cat.slug, icon: cat.icon || '', description: cat.description || '' });
    setEditing(cat);
    setShowForm(true);
  };

  const openCreate = () => {
    setForm({ name: '', slug: '', icon: '', description: '' });
    setEditing(null);
    setShowForm(true);
  };

  const generateSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    const slug = form.slug || generateSlug(form.name);

    if (editing) {
      const { error } = await supabase.from('categories').update({ name: form.name, slug, icon: form.icon, description: form.description }).eq('id', editing.id);
      if (error) { toast.error('Failed to update'); return; }
      toast.success('Category updated');
    } else {
      const { error } = await supabase.from('categories').insert({ name: form.name, slug, icon: form.icon, description: form.description });
      if (error) { toast.error('Failed to create'); return; }
      toast.success('Category created');
    }
    setShowForm(false);
    fetchCategories();
  };

  const deleteCategory = async () => {
    if (!deleteTarget) return;
    if ((productCounts[deleteTarget.id] || 0) > 0) {
      toast.error('Cannot delete category with existing products');
      setDeleteTarget(null);
      return;
    }
    const { error } = await supabase.from('categories').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Failed to delete'); setDeleteTarget(null); return; }
    toast.success('Category deleted');
    setDeleteTarget(null);
    fetchCategories();
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Categories</h1>
          <p className="text-muted-foreground">Manage product categories</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> Add Category</Button>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" /></div>
        ) : categories.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No categories yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-muted-foreground font-medium">Name</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Slug</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Description</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Products</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Created</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {categories.map((cat) => (
                  <motion.tr key={cat.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-muted/50">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                          <CategoryIcon icon={cat.icon} slug={cat.slug} className="w-5 h-5" />
                        </div>
                        <span className="font-medium">{cat.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground">{cat.slug}</td>
                    <td className="p-4 text-muted-foreground max-w-xs truncate">{cat.description || '-'}</td>
                    <td className="p-4"><Badge variant="secondary">{productCounts[cat.id] || 0}</Badge></td>
                    <td className="p-4 text-muted-foreground">{formatDate(cat.created_at)}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(cat)} aria-label={`Edit ${cat.name}`}><Edit2 aria-hidden="true" className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-red-300 hover:bg-destructive/10" onClick={() => setDeleteTarget(cat)} aria-label={`Delete ${cat.name}`}>
                          <Trash2 aria-hidden="true" className="w-4 h-4" />
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

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit Category' : 'Add Category'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: editing ? form.slug : generateSlug(e.target.value) })} placeholder="Category name" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Slug</label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="category-slug" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Icon</label>
              <div className="grid grid-cols-5 gap-2">
                {CATEGORY_ICON_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = form.icon === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      title={opt.label}
                      onClick={() => setForm({ ...form, icon: opt.value })}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-[10px] leading-none">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              {form.icon && (
                <p className="text-xs text-muted-foreground mt-2">
                  Selected: {CATEGORY_ICON_OPTIONS.find((o) => o.value === form.icon)?.label}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Description</label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Category description" />
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
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              {deleteTarget && (productCounts[deleteTarget.id] || 0) > 0
                ? `Cannot delete "${deleteTarget.name}" — it has ${productCounts[deleteTarget.id]} products. Move or delete those products first.`
                : `Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (productCounts[deleteTarget.id] || 0) === 0 && (
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={deleteCategory}>Delete</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
