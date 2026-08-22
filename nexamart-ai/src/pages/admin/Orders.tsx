import { useState, useEffect } from 'react';
import { Search, Package, ChevronDown, ChevronUp, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { formatShippingAddress, formatOrderDate } from '../../utils/formatUtils';

const statuses = ['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'];

export function AdminOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

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

  const [verifying, setVerifying] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);

  const handleVerifyPayment = async (orderId: string) => {
    setVerifying(orderId);
    try {
      const { error } = await supabase.rpc('verify_bank_payment', {
        p_order_id: orderId,
        p_admin_ref: `admin-verified-${new Date().toISOString()}`,
      });
      if (error) throw error;
      // Post-payment confirmation email via the server-side order_id path:
      // the function reads fresh paid status from the DB and marks email_sent.
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
      // Cancellation email via the server-side path (same template used by
      // bank-transfer-reconcile for expired orders).
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
    const map: Record<string, string> = { pending: 'bg-warning/20 text-warning', processing: 'bg-primary/20 text-primary', shipped: 'bg-accent/20 text-accent-foreground', delivered: 'bg-success/20 text-success', cancelled: 'bg-destructive/20 text-destructive' };
    return map[s] || 'bg-muted text-muted-foreground';
  };

  const filtered = orders.filter((o) => {
    const matchesSearch = o.order_number?.toLowerCase().includes(search.toLowerCase()) || o.profiles?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No orders found</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filtered.map((o) => (
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
                            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Update Status</h4>
                            <Select value={o.status} onValueChange={(val: string) => updateStatus(o.id, val)}>
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
        )}
      </Card>

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Order Details</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <p>Order #{selectedOrder.order_number}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
