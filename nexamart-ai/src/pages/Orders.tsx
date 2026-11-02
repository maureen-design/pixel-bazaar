import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Package, ChevronDown, ChevronUp, ExternalLink, Clock, Building2, Truck, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { motion, AnimatePresence } from 'motion/react';
import { formatShippingAddress, formatOrderDate } from '../utils/formatUtils';
import { formatPrice } from '../config/pricing';
import { toast } from 'sonner';

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

export function Orders() {
  const { user } = useAuth();
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [cancelDialog, setCancelDialog] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user]);

  useEffect(() => {
    // Auto-expand order if orderNumber is in URL
    if (orderNumber && orders.length > 0) {
      const matchingOrder = orders.find(o => o.order_number === orderNumber);
      if (matchingOrder) {
        setExpandedOrders(new Set([matchingOrder.id]));
      }
    }
  }, [orderNumber, orders]);

  const fetchOrders = async () => {
    try {
      const { data } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            products (name, images)
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (orderId: string) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
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
      case 'pending': return Clock;
      case 'processing': return Package;
      case 'shipped': return Truck;
      case 'delivered': return CheckCircle2;
      case 'cancelled': return XCircle;
      default: return Package;
    }
  };

  const getStatusHelp = (order: Order) => {
    if (order.status === 'cancelled') return 'Order cancelled — no further action.';
    if (order.payment_status === 'failed') return 'Payment failed — try Pay Now or contact support.';
    if (order.payment_status !== 'paid' && order.payment_method === 'bank') return 'Awaiting bank transfer verification.';
    if (order.payment_status !== 'paid' && order.payment_type === 'later') return 'Unpaid — complete payment before deadline.';
    if (order.status === 'pending' && order.payment_status === 'paid') return 'Payment confirmed — seller will process soon.';
    if (order.status === 'processing') return 'Seller is preparing your order.';
    if (order.status === 'shipped') return 'On the way — track with seller if provided.';
    if (order.status === 'delivered') return 'Delivered — please confirm receipt.';
    return '';
  };

  // Eligibility rule: unpaid and within 30 minutes of creation, not in terminal state
  const isEligibleForCancel = (order: Order) => {
    if (order.status === 'cancelled' || order.status === 'delivered' || order.status === 'processing') return false;
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
      fetchOrders();
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel order');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <div className="flex items-center justify-center h-64">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-bold mb-6">My Orders</h1>
          
          {orders.length === 0 ? (
            <Card className="p-12 bg-card border-border text-center">
              <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No orders yet</h3>
              <p className="text-muted-foreground mb-6">
                You haven't placed any orders yet. Start shopping to see your orders here.
              </p>
              <Link to="/">
                <Button>Continue Shopping</Button>
              </Link>
            </Card>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className="bg-card border-border overflow-hidden">
                    {/* Order Header */}
                    <div 
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      role="button"
                      tabIndex={0}
                      aria-expanded={expandedOrders.has(order.id)}
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
                        {(() => { const StatusIcon = getStatusIcon(order.status); const help = getStatusHelp(order); return (
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h3 className="font-semibold">#{order.order_number}</h3>
                          <span className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1 ${getStatusColor(order.status)}`}>
                            <StatusIcon className="w-3 h-3" /> {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </span>
                          <span className={`text-xs px-2.5 py-1 rounded-full border ${order.payment_status === 'paid' ? 'bg-success/15 text-success border-success/30' : order.payment_status === 'failed' ? 'bg-destructive/15 text-destructive border-destructive/30' : 'bg-warning/15 text-warning border-warning/30'}`}>
                            Payment: {order.payment_status.charAt(0).toUpperCase() + order.payment_status.slice(1)}
                          </span>
                          {order.payment_type === 'later' && order.payment_status !== 'paid' && (
                            <span className="text-xs px-2 py-1 rounded-full bg-warning/20 text-warning flex items-center gap-1 border border-warning/30">
                              <Clock className="w-3 h-3" /> Unpaid
                            </span>
                          )}
                          {order.payment_method === 'bank' && order.payment_status !== 'paid' && order.status !== 'cancelled' && (
                            <span className="text-xs px-2 py-1 rounded-full bg-accent/20 text-accent-foreground flex items-center gap-1 border border-accent/30">
                              <Building2 className="w-3 h-3" /> Bank Transfer Pending
                            </span>
                          )}
                          {help && <span className="text-xs text-muted-foreground hidden sm:inline">— {help}</span>}
                        </div>
                        ); })()}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{formatOrderDate(order.created_at)}</span>
                          <span>•</span>
                          <span className="capitalize">{order.payment_method}</span>
                          {order.payment_type === 'later' && order.payment_status !== 'paid' && order.payment_deadline && (
                            <>
                              <span>•</span>
                              <span className="text-warning">Due by {new Date(order.payment_deadline).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </>
                          )}
                          {order.payment_method === 'bank' && order.payment_status !== 'paid' && order.status !== 'cancelled' && order.payment_deadline && (
                            <>
                              <span>•</span>
                              <span className="text-accent">Transfer by {new Date(order.payment_deadline).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {order.payment_type === 'later' && order.payment_status !== 'paid' && (
                          <Button size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/order-confirmation/${order.id}`); }}>
                            Pay Now
                          </Button>
                        )}
                        {order.payment_method === 'bank' && order.payment_status !== 'paid' && order.status !== 'cancelled' && (
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/order-confirmation/${order.id}`); }}>
                            View Instructions
                          </Button>
                        )}
                        {isEligibleForCancel(order) && (
                          <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); setCancelDialog({ orderId: order.id, orderNumber: order.order_number }); }}>
                            Cancel
                          </Button>
                        )}
                        <p className="font-bold">{formatPrice(order.total_amount)}</p>
                        {expandedOrders.has(order.id) ? (
                          <ChevronUp className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>

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
                          <div className="p-4 space-y-4">
                            {/* Status Summary */}
                            <div className="bg-muted/50 border border-border rounded-lg p-3 flex flex-wrap gap-4 text-sm">
                              <span><span className="text-muted-foreground">Order:</span> <span className="font-medium capitalize">{order.status}</span></span>
                              <span><span className="text-muted-foreground">Payment:</span> <span className={`font-medium ${order.payment_status === 'paid' ? 'text-success' : order.payment_status === 'failed' ? 'text-destructive' : 'text-warning'}`}>{order.payment_status}</span> via {order.payment_method}{order.payment_type === 'later' ? ' (Pay Later)' : ''}</span>
                            </div>

                            {/* Order Items */}
                            <div>
                              <h4 className="font-medium mb-3">Order Items</h4>
                              <div className="space-y-3">
                                {order.order_items.map((item) => (
                                  <div key={item.id} className="flex items-center gap-4">
                                    {item.products?.images && item.products.images[0] && (
                                      <img
                                        src={item.products.images[0]}
                                        alt={item.products.name}
                                        className="w-16 h-16 object-cover rounded-lg"
                                      />
                                    )}
                                    <div className="flex-1">
                                      <p className="font-medium">{item.products?.name}</p>
                                      {item.variant_attributes && (
                                        <p className="text-xs text-muted-foreground">
                                          {Object.values(item.variant_attributes).join(', ')}
                                        </p>
                                      )}
                                      <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                                    </div>
                                    <p className="font-medium">{formatPrice(item.product_price * item.quantity)}</p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Shipping Address */}
                            <div>
                              <h4 className="font-medium mb-2">Shipping Address</h4>
                              <p className="text-sm text-muted-foreground whitespace-pre-line">
                                {formatShippingAddress(order.shipping_address)}
                              </p>
                            </div>

                            {/* View Details Button */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/order-confirmation/${order.id}`)}
                            >
                              <ExternalLink className="w-4 h-4 mr-2" />
                              View Full Details
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Cancel Order Dialog */}
      <Dialog open={cancelDialog !== null} onOpenChange={(open) => { if (!open) { setCancelDialog(null); setCancelReason(''); } }}>
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
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCancelReason(e.target.value)}
                placeholder="e.g., Changed my mind, found a better price, etc."
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">{cancelReason.length}/500</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setCancelDialog(null); setCancelReason(''); }} disabled={cancelling}>
                Keep Order
              </Button>
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

      <Footer />
    </div>
  );
}
