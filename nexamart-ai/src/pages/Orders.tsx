import { useState, useEffect, useMemo, type ChangeEvent } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Package,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Clock,
  Building2,
  Truck,
  CheckCircle2,
  XCircle,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { motion, AnimatePresence } from 'motion/react';
import { formatShippingAddress, formatOrderDate } from '../utils/formatUtils';
import { formatPrice } from '../config/pricing';
import { toast } from 'sonner';

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

interface Order {
  id: string;
  order_number: string;
  total_amount: number;
  status: string;
  shipping_address: string;
  payment_method: string;
  payment_status: string;
  payment_type: string;
  payment_deadline: string | null;
  created_at: string;
  order_items: OrderItem[];
}

export function Orders() {
  const { user } = useAuth();
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [cancelDialog, setCancelDialog] = useState<{ orderId: string; orderNumber: string } | null>(
    null
  );
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const searchQuery = searchParams.get('search') ?? '';
  const statusFilter = searchParams.get('status') ?? 'all';

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    fetchOrders();
  }, [user]);

  useEffect(() => {
    if (orderNumber && orders.length > 0) {
      const matchingOrder = orders.find((o) => o.order_number === orderNumber);
      if (matchingOrder) {
        setExpandedOrders(() => new Set([matchingOrder.id]));
      }
    }
  }, [orderNumber, orders]);

  const fetchOrders = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('orders')
        .select(
          `
            *,
            order_items (
              *,
              products (name, images)
            )
          `
        )
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Unable to load your orders right now.');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);

      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }

      return next;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-warning/20 text-warning border-warning/30';
      case 'processing':
        return 'bg-primary/20 text-primary border-primary/30';
      case 'shipped':
        return 'bg-accent/20 text-accent-foreground border-accent/30';
      case 'delivered':
        return 'bg-success/20 text-success border-success/30';
      case 'cancelled':
        return 'bg-destructive/20 text-destructive border-destructive/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return Clock;
      case 'processing':
        return Package;
      case 'shipped':
        return Truck;
      case 'delivered':
        return CheckCircle2;
      case 'cancelled':
        return XCircle;
      default:
        return Package;
    }
  };

  const getStatusHelp = (order: Order) => {
    if (order.status === 'cancelled') return 'Order cancelled — no further action.';
    if (order.payment_status === 'failed') return 'Payment failed — try Pay Now or contact support.';
    if (order.payment_status !== 'paid' && order.payment_method === 'bank')
      return 'Awaiting bank transfer verification.';
    if (order.payment_status !== 'paid' && order.payment_type === 'later')
      return 'Unpaid — complete payment before deadline.';
    if (order.status === 'pending' && order.payment_status === 'paid')
      return 'Payment confirmed — seller will process soon.';
    if (order.status === 'processing') return 'Seller is preparing your order.';
    if (order.status === 'shipped') return 'On the way — track with seller if provided.';
    if (order.status === 'delivered') return 'Delivered — please confirm receipt.';
    return '';
  };

  const isEligibleForCancel = (order: Order) => {
    if (order.status === 'cancelled' || order.status === 'delivered' || order.status === 'processing')
      return false;

    if (order.payment_status === 'paid' || order.payment_status === 'refunded') return false;

    const minutesElapsed = (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60);
    return minutesElapsed <= 30;
  };

  const handleCancelOrder = async () => {
    if (!cancelDialog) return;

    setCancelling(true);

    try {
      const { data, error } = await supabase.rpc('customer_cancel_order', {
        p_order_id: cancelDialog.orderId,
        p_reason: cancelReason.trim() || null,
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to cancel order');
      }

      toast.success('Order cancelled successfully');
      setCancelDialog(null);
      setCancelReason('');
      await fetchOrders();
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel order');
    } finally {
      setCancelling(false);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchQuery || order.order_number.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, statusFilter]);

  const handleSearchChange = (value: string) => {
    const next = new URLSearchParams(searchParams);

    if (value.trim()) {
      next.set('search', value.trim());
    } else {
      next.delete('search');
    }

    setSearchParams(next, { replace: true });
  };

  const handleStatusChange = (value: string) => {
    const next = new URLSearchParams(searchParams);

    if (value === 'all') {
      next.delete('status');
    } else {
      next.set('status', value);
    }

    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);

    next.delete('search');
    next.delete('status');

    setSearchParams(next, { replace: true });
  };

  const hasActiveFilters = !!searchQuery || statusFilter !== 'all';

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <Card className="border-border bg-card p-10">
            <Package className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
            <h2 className="mb-2 text-2xl font-semibold">Sign in to view your orders</h2>
            <p className="mb-6 text-muted-foreground">
              Please log in to see your purchase history and order status.
            </p>
            <Link to="/login">
              <Button>Sign In</Button>
            </Link>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <div className="flex h-64 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="mx-auto max-w-4xl px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="mb-6 text-3xl font-bold">My Orders</h1>

          <div className="mb-6 flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <label htmlFor="order-search" className="sr-only">
                Search by order number
              </label>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="order-search"
                placeholder="Search by order number..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
                aria-label="Search orders by order number"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="w-full sm:w-[180px]">
              <label htmlFor="order-status-filter" className="sr-only">
                Filter orders by status
              </label>
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger id="order-status-filter" className="w-full" aria-label="Filter orders by status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} className="w-full sm:w-auto">
                Clear filters
              </Button>
            )}
          </div>

          <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
            {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
            {hasActiveFilters ? ' match your filters' : ''}
          </p>

          {orders.length === 0 ? (
            <Card className="border-border bg-card p-12 text-center">
              <Package className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
              <h3 className="mb-2 text-xl font-semibold">No orders yet</h3>
              <p className="mb-6 text-muted-foreground">
                You haven't placed any orders yet. Start shopping to see your orders here.
              </p>
              <Link to="/">
                <Button>Continue Shopping</Button>
              </Link>
            </Card>
          ) : filteredOrders.length === 0 ? (
            <Card className="border-border bg-card p-12 text-center">
              <Package className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
              <h3 className="mb-2 text-xl font-semibold">No orders match your filters</h3>
              <p className="mb-6 text-muted-foreground">
                Try adjusting your search or filter criteria to find your orders.
              </p>
              <Button onClick={clearFilters}>Clear filters</Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => {
                const StatusIcon = getStatusIcon(order.status);
                const statusHelp = getStatusHelp(order);
                const isExpanded = expandedOrders.has(order.id);

                return (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className="overflow-hidden border-border bg-card">
                      <div
                        className="flex cursor-pointer items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/50"
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        aria-controls={`order-details-${order.id}`}
                        onClick={() => toggleExpanded(order.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleExpanded(order.id);
                          }
                        }}
                      >
                        <div className="flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">#{order.order_number}</h3>
                            <span
                              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${getStatusColor(
                                order.status
                              )}`}
                            >
                              <StatusIcon className="h-3 w-3" />
                              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                            </span>

                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs ${
                                order.payment_status === 'paid'
                                  ? 'border-success/30 bg-success/15 text-success'
                                  : order.payment_status === 'failed'
                                    ? 'border-destructive/30 bg-destructive/15 text-destructive'
                                    : 'border-warning/30 bg-warning/15 text-warning'
                              }`}
                            >
                              Payment: {order.payment_status.charAt(0).toUpperCase() + order.payment_status.slice(1)}
                            </span>

                            {order.payment_type === 'later' && order.payment_status !== 'paid' && (
                              <span className="rounded-full border border-warning/30 bg-warning/20 px-2 py-1 text-xs text-warning">
                                <Clock className="mr-1 inline h-3 w-3" />
                                Unpaid
                              </span>
                            )}

                            {order.payment_method === 'bank' &&
                              order.payment_status !== 'paid' &&
                              order.status !== 'cancelled' && (
                                <span className="rounded-full border border-accent/30 bg-accent/20 px-2 py-1 text-xs text-accent-foreground">
                                  <Building2 className="mr-1 inline h-3 w-3" />
                                  Bank Transfer Pending
                                </span>
                              )}

                            {statusHelp && (
                              <span className="hidden text-xs text-muted-foreground sm:inline">
                                — {statusHelp}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                            <span>{formatOrderDate(order.created_at)}</span>
                            <span>•</span>
                            <span className="capitalize">{order.payment_method}</span>
                            {order.payment_type === 'later' &&
                              order.payment_status !== 'paid' &&
                              order.payment_deadline && (
                                <>
                                  <span>•</span>
                                  <span className="text-warning">
                                    Due by{' '}
                                    {new Date(order.payment_deadline).toLocaleDateString('en-KE', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </>
                              )}
                            {order.payment_method === 'bank' &&
                              order.payment_status !== 'paid' &&
                              order.status !== 'cancelled' &&
                              order.payment_deadline && (
                                <>
                                  <span>•</span>
                                  <span className="text-accent">
                                    Transfer by{' '}
                                    {new Date(order.payment_deadline).toLocaleDateString('en-KE', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </>
                              )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {order.payment_type === 'later' && order.payment_status !== 'paid' && (
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/order-confirmation/${order.id}`);
                              }}
                            >
                              Pay Now
                            </Button>
                          )}

                          {order.payment_method === 'bank' &&
                            order.payment_status !== 'paid' &&
                            order.status !== 'cancelled' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/order-confirmation/${order.id}`);
                                }}
                              >
                                View Instructions
                              </Button>
                            )}

                          {isEligibleForCancel(order) && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCancelDialog({
                                  orderId: order.id,
                                  orderNumber: order.order_number,
                                });
                              }}
                            >
                              Cancel
                            </Button>
                          )}

                          <p className="font-bold">{formatPrice(order.total_amount)}</p>

                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            id={`order-details-${order.id}`}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-border"
                          >
                            <div className="space-y-4 p-4">
                              <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-muted/50 p-3 text-sm">
                                <span>
                                  <span className="text-muted-foreground">Order:</span>{' '}
                                  <span className="font-medium capitalize">{order.status}</span>
                                </span>
                                <span>
                                  <span className="text-muted-foreground">Payment:</span>{' '}
                                  <span
                                    className={`font-medium ${
                                      order.payment_status === 'paid'
                                        ? 'text-success'
                                        : order.payment_status === 'failed'
                                          ? 'text-destructive'
                                          : 'text-warning'
                                    }`}
                                  >
                                    {order.payment_status}
                                  </span>{' '}
                                  via {order.payment_method}
                                  {order.payment_type === 'later' ? ' (Pay Later)' : ''}
                                </span>
                              </div>

                              <div>
                                <h4 className="mb-3 font-medium">Order Items</h4>
                                <div className="space-y-3">
                                  {order.order_items.map((item) => (
                                    <div key={item.id} className="flex items-center gap-4">
                                      {item.products?.images?.[0] && (
                                        <img
                                          src={item.products.images[0]}
                                          alt={item.products.name}
                                          className="h-16 w-16 rounded-lg object-cover"
                                        />
                                      )}

                                      <div className="flex-1">
                                        <p className="font-medium">{item.products?.name}</p>
                                        {item.variant_attributes && (
                                          <p className="text-xs text-muted-foreground">
                                            {Object.values(item.variant_attributes).join(', ')}
                                          </p>
                                        )}
                                        <p className="text-sm text-muted-foreground">
                                          Qty: {item.quantity}
                                        </p>
                                      </div>

                                      <p className="font-medium">
                                        {formatPrice(item.product_price * item.quantity)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <h4 className="mb-2 font-medium">Shipping Address</h4>
                                <p className="whitespace-pre-line text-sm text-muted-foreground">
                                  {formatShippingAddress(order.shipping_address)}
                                </p>
                              </div>

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/order-confirmation/${order.id}`)}
                              >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View Full Details
                              </Button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

      <Dialog
        open={cancelDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelDialog(null);
            setCancelReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order #{cancelDialog?.orderNumber}</DialogTitle>
            <DialogDescription>
              Provide a reason for cancellation (optional). This will be included in the email sent to you.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="cancel-reason">Reason (optional)</Label>
              <textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setCancelReason(e.target.value)}
                placeholder="e.g., Changed my mind, found a better price, etc."
                rows={3}
                maxLength={500}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">{cancelReason.length}/500</p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCancelDialog(null);
                  setCancelReason('');
                }}
                disabled={cancelling}
              >
                Keep Order
              </Button>

              <Button variant="destructive" onClick={handleCancelOrder} disabled={cancelling}>
                {cancelling ? 'Cancelling...' : 'Cancel Order'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}