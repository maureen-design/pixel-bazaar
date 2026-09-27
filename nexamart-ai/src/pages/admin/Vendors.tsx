import { useState, useEffect } from 'react';
import { Search, Store, Check, X, Eye, StoreIcon, CheckSquare, MessageSquare, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Pagination } from '../../components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';


const PAGE_SIZE = 15;

export function AdminVendors() {
  const { user } = useAuth();
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedVendor, setSelectedVendor] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState<'approve' | 'reject' | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState<{ vendorId: string; vendorName: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchVendors(); }, []);

  const fetchVendors = async () => {
    try {
      // admin_list_vendors() replaces `select('*, profiles!inner(full_name,
      // email, created_at))`. Migration 0032 revoked SELECT on phone /
      // rejection_* / user_id for authenticated sessions, which breaks the star
      // and also breaks the embed, since PostgREST resolves that join through
      // vendors.user_id. The definer returns the private columns plus the
      // applicant identity, so the profiles embed is no longer needed.
      const { data, error } = await supabase.rpc('admin_list_vendors');
      if (error) throw error;
      setVendors(data || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const approveVendor = async (id: string) => {
    const { error } = await supabase.rpc('approve_vendor', { target_vendor_id: id });
    if (error) { toast.error('Failed to approve'); return; }
    // Log the action
    await supabase.from('activity_logs').insert({
      user_id: user?.id || null,
      user_email: user?.email || null,
      action: 'vendor_approve',
      details: { vendor_id: id, vendor_name: vendors.find(v => v.id === id)?.business_name || vendors.find(v => v.id === id)?.store_name },
    });
    toast.success('Vendor approved');
    supabase.functions.invoke('send-vendor-lifecycle', { body: { vendor_id: id, action: 'approved' } }).catch(() => {});
    fetchVendors();
  };

  const rejectVendor = async (id: string, reason?: string) => {
    const { error } = await supabase.rpc('reject_vendor', { target_vendor_id: id });
    if (error) { toast.error('Failed to reject'); return; }
    // Update rejection count and timestamp.
    // rejection_reason / last_rejected_at moved off vendors to vendor_private in
    // migration 0034, so anon can hold table-level SELECT on vendors (which the
    // product embeds require) without being able to read moderation history.
    await supabase.from('vendor_private').update({
      rejection_reason: reason || null,
      last_rejected_at: new Date().toISOString(),
    }).eq('vendor_id', id);
    // Log the action
    await supabase.from('activity_logs').insert({
      user_id: user?.id || null,
      user_email: user?.email || null,
      action: 'vendor_reject',
      details: { vendor_id: id, vendor_name: vendors.find(v => v.id === id)?.business_name || vendors.find(v => v.id === id)?.store_name, reason: reason || null },
    });
    toast.success('Vendor rejected');
    supabase.functions.invoke('send-vendor-lifecycle', { body: { vendor_id: id, action: 'rejected', reason: reason || null } }).catch(() => {});
    fetchVendors();
  };

  const filtered = vendors.filter((v) => {
    const matchesSearch = v.business_name?.toLowerCase().includes(search.toLowerCase()) || v.applicant_email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'approved' && v.is_verified) || (statusFilter === 'pending' && !v.is_verified);
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const formatDate = (d: string) => new Date(d).toLocaleDateString();

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
    setSelectedIds(new Set());
  };

  const allPaginatedSelected = paginated.length > 0 && paginated.every((v) => selectedIds.has(v.id));

  const toggleSelectAll = () => {
    if (allPaginatedSelected) {
      const next = new Set(selectedIds);
      paginated.forEach((v) => next.delete(v.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      paginated.forEach((v) => next.add(v.id));
      setSelectedIds(next);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const clearSelection = () => setSelectedIds(new Set());

  const executeBulkAction = async () => {
    if (!bulkConfirmOpen) return;
    setBulkProcessing(true);
    const ids = Array.from(selectedIds);
    const action = bulkConfirmOpen === 'approve' ? 'approve_vendor' : 'reject_vendor';
    let failures = 0;

    for (const id of ids) {
      const { error } = await supabase.rpc(action, { target_vendor_id: id });
      if (error) {
        failures++;
      } else {
        // Log the action
        await supabase.from('activity_logs').insert({
          user_id: user?.id || null,
          user_email: user?.email || null,
          action: bulkConfirmOpen === 'approve' ? 'vendor_approve' : 'vendor_reject',
          details: { vendor_id: id, vendor_name: vendors.find(v => v.id === id)?.business_name || vendors.find(v => v.id === id)?.store_name, bulk: true },
        });
      }
    }

    if (failures > 0) {
      toast.error(`Failed to ${bulkConfirmOpen} ${failures} vendor(s)`);
    } else {
      toast.success(`${ids.length} vendor(s) ${bulkConfirmOpen === 'approve' ? 'approved' : 'rejected'}`);
    }

    setBulkProcessing(false);
    setBulkConfirmOpen(null);
    setSelectedIds(new Set());
    fetchVendors();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Vendors</h1>
        <p className="text-muted-foreground">Manage vendor applications and stores</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search vendors by business name or email…" aria-label="Search vendors" value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="bg-primary/5 border-primary/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckSquare className="w-5 h-5 text-primary" />
                  <span className="font-medium">{selectedIds.size} vendor{selectedIds.size !== 1 ? 's' : ''} selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={clearSelection}>Clear selection</Button>
                  <Button size="sm" className="gap-1" onClick={() => setBulkConfirmOpen('approve')}>
                    <Check className="w-4 h-4" /> Approve selected
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => setBulkConfirmOpen('reject')}>
                    <X className="w-4 h-4" /> Reject selected
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
            <div className="p-4">
              <div className="space-y-3">
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-[40px]" />
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-4 w-[120px]" />
                  <Skeleton className="h-4 w-[180px]" />
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-4 w-[60px]" />
                  <Skeleton className="h-4 w-[100px]" />
                  <Skeleton className="h-4 w-[100px]" />
                </div>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-10 w-[40px]" />
                    <Skeleton className="h-10 w-[200px]" />
                    <Skeleton className="h-10 w-[120px]" />
                    <Skeleton className="h-10 w-[180px]" />
                    <Skeleton className="h-10 w-[80px]" />
                    <Skeleton className="h-10 w-[60px]" />
                    <Skeleton className="h-10 w-[100px]" />
                    <Skeleton className="h-10 w-[100px]" />
                  </div>
                ))}
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
              <StoreIcon className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-lg font-medium">No vendors found</p>
              <p className="text-sm">Try adjusting your search or filter criteria</p>
            </div>
          ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 text-muted-foreground font-medium w-[50px]">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="flex items-center justify-center w-full"
                        aria-label={allPaginatedSelected ? 'Deselect all' : 'Select all'}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${allPaginatedSelected ? 'bg-primary border-primary' : 'border-muted-foreground/50'}`}>
                          {allPaginatedSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                      </button>
                    </th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Store</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Owner</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Email</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Status</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Rating</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Total Sales</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Joined</th>
                    <th className="text-right p-4 text-muted-foreground font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map((v) => {
                    const isChecked = selectedIds.has(v.id);
                    return (
                      <motion.tr key={v.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`hover:bg-muted/50 ${isChecked ? 'bg-muted/30' : ''}`}>
                        <td className="p-4 w-[50px]">
                          <button
                            type="button"
                            onClick={() => toggleSelect(v.id)}
                            className="flex items-center justify-center w-full"
                            aria-label={`Select ${v.business_name || v.store_name}`}
                          >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isChecked ? 'bg-primary border-primary' : 'border-muted-foreground/50'}`}>
                              {isChecked && <Check className="w-3 h-3 text-primary-foreground" />}
                            </div>
                          </button>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {v.store_logo ? (
                              <img src={v.store_logo} alt={v.business_name || v.store_name} className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                <Store className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <span className="font-medium">{v.business_name || v.store_name}</span>
                          </div>
                        </td>
                        <td className="p-4">{v.applicant_full_name}</td>
                        <td className="p-4 text-muted-foreground">{v.applicant_email}</td>
                        <td className="p-4">
                          <Badge variant={v.is_verified ? 'default' : 'secondary'}>{v.is_verified ? 'Approved' : 'Pending'}</Badge>
                        </td>
                        <td className="p-4">{v.rating > 0 ? Number(v.rating).toFixed(1) : '-'}</td>
                        <td className="p-4">{v.total_sales > 0 ? v.total_sales.toLocaleString() : '-'}</td>
                        <td className="p-4 text-muted-foreground">{formatDate(v.created_at)}</td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setSelectedVendor(v)} aria-label={`View ${v.business_name || v.store_name}`}><Eye aria-hidden="true" className="w-4 h-4" /></Button>
                            {!v.is_verified ? (
                              <>
                                <Button size="sm" className="gap-1" onClick={() => approveVendor(v.id)} aria-label={`Approve ${v.business_name || v.store_name}`}><Check aria-hidden="true" className="w-4 h-4" /></Button>
                                <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => { setRejectionReason(''); setRejectDialogOpen({ vendorId: v.id, vendorName: v.business_name || v.store_name }); }} aria-label={`Reject ${v.business_name || v.store_name}`}><X aria-hidden="true" className="w-4 h-4" /></Button>
                              </>
                            ) : (
                              <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => { setRejectionReason(''); setRejectDialogOpen({ vendorId: v.id, vendorName: v.business_name || v.store_name }); }}><X className="w-4 h-4" /> Revoke</Button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="p-4" />
          </>
        )}
      </Card>
      )}

      <Dialog open={!!selectedVendor} onOpenChange={() => setSelectedVendor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Vendor Details</DialogTitle></DialogHeader>
          {selectedVendor && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {selectedVendor.store_logo ? (
                  <img src={selectedVendor.store_logo} alt={selectedVendor.business_name || selectedVendor.store_name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <Store className="w-12 h-12 text-primary" />
                )}
                <div>
                  <h3 className="text-lg font-semibold">{selectedVendor.business_name || selectedVendor.store_name}</h3>
                  <p className="text-muted-foreground">{selectedVendor.applicant_email}</p>
                </div>
              </div>
              {selectedVendor.store_description && (
                <div>
                  <span className="text-muted-foreground text-sm">Description:</span>
                  <p className="mt-1 text-sm">{selectedVendor.store_description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Owner:</span> <span className="text-foreground ml-2">{selectedVendor.applicant_full_name}</span></div>
                <div><span className="text-muted-foreground">Rating:</span> <span className="text-foreground ml-2">{selectedVendor.rating > 0 ? Number(selectedVendor.rating).toFixed(1) + ' / 5' : 'No ratings yet'}</span></div>
                <div><span className="text-muted-foreground">Total Sales:</span> <span className="text-foreground ml-2">{selectedVendor.total_sales > 0 ? selectedVendor.total_sales.toLocaleString() : 'N/A'}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={selectedVendor.is_verified ? 'default' : 'secondary'} className="ml-2">{selectedVendor.is_verified ? 'Approved' : 'Pending'}</Badge></div>
                <div><span className="text-muted-foreground">Joined:</span> <span className="text-foreground ml-2">{formatDate(selectedVendor.created_at)}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={bulkConfirmOpen !== null} onOpenChange={() => { if (!bulkProcessing) setBulkConfirmOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bulkConfirmOpen === 'approve' ? 'Approve' : 'Reject'} {selectedIds.size} Vendor{selectedIds.size !== 1 ? 's' : ''}?</DialogTitle>
            <DialogDescription>
              {bulkConfirmOpen === 'approve'
                ? `This will approve ${selectedIds.size} selected vendor(s). They will be able to operate on the platform.`
                : `This will reject ${selectedIds.size} selected vendor(s). They will no longer be able to operate on the platform.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setBulkConfirmOpen(null)} disabled={bulkProcessing}>Cancel</Button>
            <Button
              variant={bulkConfirmOpen === 'approve' ? 'default' : 'destructive'}
              onClick={executeBulkAction}
              disabled={bulkProcessing}
            >
              {bulkProcessing ? 'Processing...' : bulkConfirmOpen === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rejection Reason Dialog */}
      <Dialog open={rejectDialogOpen !== null} onOpenChange={() => { if (!bulkProcessing) { setRejectDialogOpen(null); setRejectionReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejectDialogOpen?.vendorName}</DialogTitle>
            <DialogDescription>
              Provide a reason for rejection. This will be included in the email sent to the vendor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Rejection Reason (optional)
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Please provide more details about your business and product categories."
                rows={3}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setRejectDialogOpen(null); setRejectionReason(''); }}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (rejectDialogOpen) {
                    rejectVendor(rejectDialogOpen.vendorId, rejectionReason.trim() || undefined);
                    setRejectDialogOpen(null);
                    setRejectionReason('');
                  }
                }}
              >
                Reject Vendor
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
