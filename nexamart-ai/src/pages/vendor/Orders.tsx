import { useState, useEffect, useMemo } from 'react';
import { Search, Package, ChevronDown, ChevronUp, Calendar, Mail, Phone, MapPin, Download, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { formatShippingAddress, formatOrderDate } from '../../utils/formatUtils';
import { OrderTimeline } from '../../components/OrderTimeline';
import { formatPrice } from '../../config/pricing';

interface Order {
  id: string;
  order_number: string;
  total_amount: number;
  status: string;
  shipping_address: string;
  payment_method: string;
  payment_status: string;
  cancellation_reason?: string | null;
  created_at: string;
  profiles: { full_name: string; email?: string; phone?: string } | null;
  order_items: OrderItem[];
}

interface OrderItem {
  id: string;
  quantity: number;
  product_price: number;
  variant_attributes?: Record<string, string>;
  products: {
    name: string;
    images: string[];
  };
}

type DateRange = 'all' | '7d' | '30d' | '90d';

export function VendorOrders() {
  const { vendor, user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [cancelDialog, setCancelDialog] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (vendor) {
      fetchOrders();
    }
  }, [vendor]);

  const fetchOrders = async () => {
    try {
      const { data } = await supabase
        .from('orders')
        .select(`
          *,
          profiles (full_name, email, phone),
          order_items (
            *,
            products (name, images)
          )
        `)
        .eq('vendor_id', vendor.id)
        .order('created_at', { ascending: false });

      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    if (newStatus === 'cancelled') {
      // Open cancel dialog instead
      const order = orders.find(o => o.id === orderId);
      setCancelDialog({ orderId, orderNumber: order?.order_number || '' });
      return;
    }
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;
      toast.success('Order status updated');
      // Send status email (non-blocking)
      supabase.functions.invoke('send-order-status-email', {
        body: { order_id: orderId, status: newStatus },
      }).catch(() => {});
      fetchOrders();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update order');
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelDialog) return;
    setCancelling(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancellation_reason: cancelReason.trim() || null,
          cancelled_by: user?.id || null,
        })
        .eq('id', cancelDialog.orderId);

      if (error) throw error;
      toast.success('Order cancelled');
      // Send cancellation email with reason (non-blocking)
      supabase.functions.invoke('send-order-status-email', {
        body: {
          order_id: cancelDialog.orderId,
          status: 'cancelled',
          reason: cancelReason.trim() || null,
        },
      }).catch(() => {});
      setCancelDialog(null);
      setCancelReason('');
      fetchOrders();
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel order');
    } finally {
      setCancelling(false);
    }
  };

  const toggleExpanded = (orderId: string) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) newSet.delete(orderId);
      else newSet.add(orderId);
      return newSet;
    });
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch =
        order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      let matchesDate = true;
      if (dateRange !== 'all') {
        const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        matchesDate = new Date(order.created_at) >= cutoff;
      }
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [orders, searchQuery, statusFilter, dateRange]);

  const handleExport = () => {
    const headers = ['Order #', 'Customer', 'Date', 'Items', 'Total', 'Status', 'Payment'];
    const rows = filteredOrders.map(o => [
      o.order_number,
      o.profiles?.full_name || '',
      formatOrderDate(o.created_at),
      o.order_items.length,
      o.total_amount,
      o.status,
      o.payment_method,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Orders exported');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-warning/20 text-warning';
      case 'processing': return 'bg-primary/20 text-primary';
      case 'shipped': return 'bg-ai/20 text-ai';
      case 'delivered': return 'bg-success/20 text-success';
      case 'cancelled': return 'bg-destructive/20 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 animate-pulse">
          <div className="h-8 w-40 bg-muted rounded" />
          <div className="h-4 w-56 bg-muted rounded" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 flex-1 bg-muted rounded-lg" />
          <div className="h-10 w-44 bg-muted rounded-lg" />
          <div className="h-10 w-36 bg-muted rounded-lg" />
        </div>
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Orders</h1>
          <p className="text-muted-foreground">
            {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by order # or customer name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-card border-border"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 bg-card border-border">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
          <SelectTrigger className="w-36 bg-card border-border">
            <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <Card className="p-12 bg-card border-border text-center">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
          <h3 className="text-lg font-semibold mb-2">No orders found</h3>
          <p className="text-muted-foreground text-sm">
            {searchQuery || statusFilter !== 'all' || dateRange !== 'all'
              ? 'Try adjusting your filters'
              : 'Orders will appear here once customers make purchases'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="bg-card border-border overflow-hidden">
                {/* Order Header */}
                <button
                  onClick={() => toggleExpanded(order.id)}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                  aria-expanded={expandedOrders.has(order.id)}
                  aria-controls={`order-details-${order.id}`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-semibold text-sm">#{order.order_number}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(order.status)}`}>
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{order.profiles?.full_name}</span>
                        <span className="text-border">·</span>
                        <span>{formatOrderDate(order.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="font-bold text-sm">{formatPrice(order.total_amount)}</p>
                    {expandedOrders.has(order.id) ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Order Details */}
                <AnimatePresence>
                  {expandedOrders.has(order.id) && (
                    <motion.div
                      id={`order-details-${order.id}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border"
                    >
                      <div className="p-4 space-y-5">
                        {/* Timeline */}
                        <OrderTimeline
                          status={order.status}
                          paymentStatus={order.payment_status || 'unpaid'}
                        />

                        {/* Customer Info */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                              <span className="text-xs font-bold text-muted-foreground">
                                {order.profiles?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                              </span>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Customer</p>
                              <p className="text-sm font-medium">{order.profiles?.full_name}</p>
                            </div>
                          </div>
                          {order.profiles?.email && (
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Email</p>
                                <p className="text-sm font-medium truncate">{order.profiles.email}</p>
                              </div>
                            </div>
                          )}
                          {order.profiles?.phone && (
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Phone</p>
                                <p className="text-sm font-medium">{order.profiles.phone}</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Order Items */}
                        <div>
                          <h4 className="font-medium mb-3 text-sm">Items Ordered</h4>
                          <div className="space-y-3">
                            {order.order_items.map((item) => (
                              <div key={item.id} className="flex items-center gap-3">
                                {item.products?.images?.[0] ? (
                                  <img
                                    src={item.products.images[0]}
                                    alt={item.products.name}
                                    className="w-12 h-12 object-cover rounded-lg bg-muted"
                                  />
                                ) : (
                                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                                    <Package className="w-4 h-4 text-muted-foreground" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{item.products?.name}</p>
                                  {item.variant_attributes && (
                                    <p className="text-xs text-muted-foreground">
                                      {Object.values(item.variant_attributes).join(', ')}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-medium">{formatPrice(item.product_price * item.quantity)}</p>
                                  <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Shipping + Payment */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="p-3 bg-muted/30 rounded-lg">
                            <h4 className="font-medium mb-1.5 text-sm flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                              Shipping Address
                            </h4>
                            <p className="text-sm text-muted-foreground whitespace-pre-line">
                              {formatShippingAddress(order.shipping_address)}
                            </p>
                          </div>
                          <div className="p-3 bg-muted/30 rounded-lg">
                            <h4 className="font-medium mb-1.5 text-sm">Payment</h4>
                            <p className="text-sm text-muted-foreground capitalize">{order.payment_method}</p>
                          </div>
                        </div>

                        {/* Status Update */}
                        <div className="flex items-center gap-3 pt-2 border-t border-border">
                          <span className="text-sm font-medium">Update Status:</span>
                          <Select
                            value={order.status}
                            onValueChange={(value: string) => handleStatusUpdate(order.id, value)}
                          >
                            <SelectTrigger className="w-44 bg-muted border-border h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="processing">Processing</SelectItem>
                              <SelectItem value="shipped">Shipped</SelectItem>
                              <SelectItem value="delivered">Delivered</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Cancellation Reason Dialog */}
      <Dialog open={cancelDialog !== null} onOpenChange={() => { if (!cancelling) { setCancelDialog(null); setCancelReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order #{cancelDialog?.orderNumber}</DialogTitle>
            <DialogDescription>
              Provide a reason for cancellation. This will be included in the email sent to the customer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                <XCircle className="w-4 h-4 inline mr-1" />
                Cancellation Reason (optional)
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Item out of stock, customer requested cancellation, etc."
                rows={3}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setCancelDialog(null); setCancelReason(''); }} disabled={cancelling}>Keep Order</Button>
              <Button
                variant="destructive"
                onClick={handleCancelOrder}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling...' : 'Cancel Order'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
