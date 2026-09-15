import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Package, ChevronDown, ChevronUp, ExternalLink, Clock, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { formatShippingAddress, formatOrderDate } from '../utils/formatUtils';
import { formatPrice } from '../config/pricing';

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
        return 'bg-warning/20 text-warning';
      case 'processing':
        return 'bg-primary/20 text-primary';
      case 'shipped':
        return 'bg-accent/20 text-accent-foreground';
      case 'delivered':
        return 'bg-success/20 text-success';
      case 'cancelled':
        return 'bg-destructive/20 text-destructive';
      default:
        return 'bg-muted text-muted-foreground';
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
                        <div className="flex items-center gap-4 mb-2">
                          <h3 className="font-semibold">#{order.order_number}</h3>
                          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(order.status)}`}>
                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </span>
                          {order.payment_type === 'later' && order.payment_status !== 'paid' && (
                            <span className="text-xs px-2 py-1 rounded-full bg-warning/20 text-warning flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Unpaid
                            </span>
                          )}
                          {order.payment_method === 'bank' && order.payment_status !== 'paid' && order.status !== 'cancelled' && (
                            <span className="text-xs px-2 py-1 rounded-full bg-accent/20 text-accent flex items-center gap-1">
                              <Building2 className="w-3 h-3" /> Bank Transfer Pending
                            </span>
                          )}
                        </div>
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
      
      <Footer />
    </div>
  );
}
