import { useState, useEffect, useMemo } from 'react';
import { Search, Package, ChevronDown, ChevronUp, CheckCircle2, XCircle, Download, Inbox, CheckSquare } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Skeleton } from '../../components/ui/skeleton';
import { Pagination } from '../../components/ui/pagination';
import { OrderTimeline } from '../../components/OrderTimeline';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { formatShippingAddress, formatOrderDate } from '../../utils/formatUtils';

const statuses = ['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const PAGE_SIZE = 10;

const dateRanges = [
  { label: 'All', days: null },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

export function AdminOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState('All');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [confirmDialog, setConfirmDialog] = useState<{ orderId: string; newStatus: string } | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);
  const [bulkConfirmDialog, setBulkConfirmDialog] = useState<string | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  useEffect(() => { fetchOrders(); }, []);

  const fetchOrders = async () => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, profiles(full_name, email), order_items(id, quantity, product_price, products(name, images))')
        .order('created_at', { ascending: false });
      setOrders(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (orderId: string, status: string) => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
    if (error) { toast.error('Failed to update status'); return; }
    toast.success(`Order status updated to ${status}`);
    fetchOrders();
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandedOrders);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedOrders(next);
  };

  const handleVerifyPayment = async (orderId: string) => {
    setVerifying(orderId);
    try {
      const { error } = await supabase.rpc('verify_bank_payment', {
        p_order_id: orderId,
        p_admin_ref: `admin-verified-${new Date().toISOString()}`,
      });
      if (error) throw error;
      const { error: emailError } = await supabase.functions.invoke('send-order-email', {
        body: { order_id: orderId },
      });
      if (emailError) {
        toast.warning('Payment verified, but the confirmation email failed to send.');
      } else {
        toast.success('Payment verified. Confirmation email sent.');
      }
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify payment');
    } finally {
      setVerifying(null);
    }
  };

  const handleRejectPayment = async (orderId: string) => {
    setRejecting(orderId);
    try {
      const { error } = await supabase.rpc('reject_bank_payment', {
        p_order_id: orderId,
        p_reason: 'Payment not received or verification failed',
      });
      if (error) throw error;
      const { error: emailError } = await supabase.functions.invoke('send-order-email', {
        body: { order_id: orderId, cancellation: true },
      });
      if (emailError) {
        toast.warning('Payment rejected, but the cancellation email failed to send.');
      } else {
        toast.success('Payment rejected. Order cancelled and customer notified.');
      }
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject payment');
    } finally {
      setRejecting(null);
    }
  };

  const formatPrice = (p: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(p);

  const getStatusColor = (s: string) => {
    const map: Record<string, string> = { pending: 'bg-warning/20 text-warning', processing: 'bg-primary/20 text-primary', shipped: 'bg-ai/20 text-ai', delivered: 'bg-success/20 text-success', cancelled: 'bg-destructive/20 text-destructive' };
    return map[s] || 'bg-muted text-muted-foreground';
  };

  const filtered = useMemo(() => {
    const selectedDays = dateRanges.find((d) => d.label === dateRange)?.days;
    const cutoff = selectedDays ? new Date(Date.now() - selectedDays * 86400000) : null;

    return orders.filter((o) => {
      const matchesSearch = o.order_number?.toLowerCase().includes(search.toLowerCase()) || o.profiles?.full_name?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
      const matchesDate = !cutoff || new Date(o.created_at) >= cutoff;
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [orders, search, statusFilter, dateRange]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const paginatedIds = useMemo(() => paginated.map((o) => o.id), [paginated]);
  const allPageSelected = paginatedIds.length > 0 && paginatedIds.every((id) => selectedIds.has(id));
  const somePageSelected = paginatedIds.some((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allPageSelected) {
      paginatedIds.forEach((id) => next.delete(id));
    } else {
      paginatedIds.forEach((id) => next.add(id));
    }
    setSelectedIds(next);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkStatusChange = (newStatus: string) => {
    setBulkStatus(newStatus);
    setBulkConfirmDialog(newStatus);
  };

  const confirmBulkStatusChange = async () => {
    if (!bulkConfirmDialog) return;
    setBulkUpdating(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from('orders').update({ status: bulkConfirmDialog }).in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} order(s) updated to ${bulkConfirmDialog}`);
      setSelectedIds(new Set());
      setBulkConfirmDialog(null);
      setBulkStatus(null);
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update orders');
    } finally {
      setBulkUpdating(false);
    }
  };

  useEffect(() => { setPage(1); }, [search, statusFilter, dateRange]);

  const exportCsv = () => {
    const esc = (v: any) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const header = 'Order #,Customer,Email,Status,Payment,Total,Date\n';
    const rows = filtered.map((o) =>
      [
        esc(o.order_number),
        esc(o.profiles?.full_name),
        esc(o.profiles?.email),
        esc(o.status),
        esc(o.payment_status),
        esc(o.total_amount),
        esc(new Date(o.created_at).toISOString()),
      ].join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Orders</h1>
        <p className="text-muted-foreground">Manage all platform orders</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search orders..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {statuses.map((s) => <SelectItem key={s} value={s}>{s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {dateRanges.map((d) => <SelectItem key={d.label} value={d.label}>{d.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv} className="shrink-0">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
        {!loading && filtered.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={allPageSelected}
              aria-label="Select all orders on this page"
              onClick={toggleSelectAll}
              className="flex items-center justify-center w-5 h-5 rounded border border-border bg-background hover:bg-muted/50 transition-colors"
            >
              {allPageSelected && <CheckSquare className="w-4 h-4 text-primary" />}
              {!allPageSelected && somePageSelected && <div className="w-2.5 h-2.5 rounded-sm bg-primary" />}
            </button>
            <span className="text-sm text-muted-foreground whitespace-nowrap">Select all</span>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <Card className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">{selectedIds.size} order{selectedIds.size !== 1 ? 's' : ''} selected</span>
                <Button variant="ghost" size="sm" onClick={clearSelection}>Clear selection</Button>
              </div>
              <Select value={bulkStatus || ''} onValueChange={(val) => handleBulkStatusChange(val)}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Change status to..." /></SelectTrigger>
                <SelectContent>
                  {statuses.filter((s) => s !== 'all').map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="bg-card border-border overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <Skeleton className="w-5 h-5 rounded" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-3">
            <Inbox className="w-12 h-12" />
            <p className="text-lg font-medium">No orders found</p>
            <p className="text-sm">Try adjusting your filters or search term.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {paginated.map((o) => (
                <motion.div key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div
                    className="p-4 hover:bg-muted/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    role="button"
                    tabIndex={0}
                    aria-expanded={expandedOrders.has(o.id)}
                    aria-controls={`order-details-${o.id}`}
                    onClick={() => toggleExpand(o.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpand(o.id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={selectedIds.has(o.id)}
                          aria-label={`Select order ${o.order_number}`}
                          onClick={(e) => { e.stopPropagation(); toggleSelect(o.id); }}
                          className="flex items-center justify-center w-5 h-5 rounded border border-border bg-background hover:bg-muted/50 transition-colors shrink-0"
                        >
                          {selectedIds.has(o.id) && <CheckSquare className="w-4 h-4 text-primary" />}
                        </button>
                        <Package className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium">#{o.order_number}</p>
                          <p className="text-sm text-muted-foreground">{o.profiles?.full_name || o.profiles?.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-medium">{formatPrice(o.total_amount)}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(o.status)}`}>{o.status}</span>
                        <span className="text-xs text-muted-foreground">{formatOrderDate(o.created_at)}</span>
                        {expandedOrders.has(o.id) ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedOrders.has(o.id) && (
                      <motion.div id={`order-details-${o.id}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-4 pb-4 border-t border-border pt-4">
                          <OrderTimeline status={o.status} paymentStatus={o.payment_status || 'unpaid'} />

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Order Items</h4>
                              <div className="space-y-2">
                                {o.order_items?.map((item: any) => (
                                  <div key={item.id} className="flex items-center gap-3 bg-muted/50 rounded-lg p-2">
                                    <div className="w-10 h-10 bg-accent rounded overflow-hidden flex-shrink-0">
                                      {item.products?.images?.[0] && <img src={item.products.images[0]} alt="" className="w-full h-full object-cover" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm truncate">{item.products?.name}</p>
                                      <p className="text-xs text-muted-foreground">Qty: {item.quantity} x {formatPrice(item.product_price)}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Customer</h4>
                              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1 mb-4">
                                <p>{o.profiles?.full_name || 'N/A'}</p>
                                <p className="text-muted-foreground">{o.profiles?.email || 'No email'}</p>
                                {o.shipping_address?.phone && <p className="text-muted-foreground">{o.shipping_address.phone}</p>}
                              </div>

                              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Update Status</h4>
                              <Select value={o.status} onValueChange={(val: string) => setConfirmDialog({ orderId: o.id, newStatus: val })}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {statuses.filter((s) => s !== 'all').map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                                </SelectContent>
                              </Select>

                              {o.shipping_address && (
                                <div className="mt-4">
                                  <h4 className="text-sm font-semibold text-muted-foreground mb-1">Shipping Address</h4>
                                  <p className="text-sm text-secondary-foreground whitespace-pre-line">{formatShippingAddress(o.shipping_address)}</p>
                                </div>
                              )}
                              <div className="mt-2">
                                <h4 className="text-sm font-semibold text-muted-foreground mb-1">Payment</h4>
                                <p className="text-sm text-secondary-foreground">{o.payment_method || 'Not specified'}</p>
                                <p className="text-sm text-secondary-foreground">Status: <span className={`font-medium ${o.payment_status === 'paid' ? 'text-success' : o.payment_status === 'failed' ? 'text-destructive' : 'text-warning'}`}>{o.payment_status || 'N/A'}</span></p>
                                {o.payment_method === 'bank' && o.payment_status === 'pending' && o.status === 'pending' && (
                                  <div className="flex gap-2 mt-3">
                                    <Button
                                      size="sm"
                                      className="bg-success hover:bg-success/90"
                                      disabled={verifying === o.id || rejecting === o.id}
                                      onClick={() => handleVerifyPayment(o.id)}
                                    >
                                      {verifying === o.id ? (
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-1" />
                                      ) : (
                                        <CheckCircle2 className="w-4 h-4 mr-1" />
                                      )}
                                      Verify Payment
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      disabled={verifying === o.id || rejecting === o.id}
                                      onClick={() => handleRejectPayment(o.id)}
                                    >
                                      {rejecting === o.id ? (
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-1" />
                                      ) : (
                                        <XCircle className="w-4 h-4 mr-1" />
                                      )}
                                      Reject
                                    </Button>
                                  </div>
                                )}
                                {o.payment_method === 'bank' && o.payment_deadline && o.payment_status !== 'paid' && o.status !== 'cancelled' && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Deadline: {new Date(o.payment_deadline).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
            <div className="border-t border-border p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                <span>Showing {Math.min(filtered.length, (page - 1) * PAGE_SIZE + 1)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
              </div>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
      </Card>

      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-lg font-semibold">Confirm Status Change</h3>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to change the status to <span className="font-medium text-foreground capitalize">{confirmDialog.newStatus}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
              <Button onClick={() => {
                updateStatus(confirmDialog.orderId, confirmDialog.newStatus);
                setConfirmDialog(null);
              }}>Confirm</Button>
            </div>
          </div>
        </div>
      )}

      {bulkConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-lg font-semibold">Confirm Bulk Status Change</h3>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to update <span className="font-medium text-foreground">{selectedIds.size}</span> order{selectedIds.size !== 1 ? 's' : ''} to <span className="font-medium text-foreground capitalize">{bulkConfirmDialog}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkConfirmDialog(null)}>Cancel</Button>
              <Button disabled={bulkUpdating} onClick={confirmBulkStatusChange}>
                {bulkUpdating && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />}
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
