import { useState, useEffect } from 'react';
import { Search, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { formatShippingAddress, formatOrderDate } from '../../utils/formatUtils';

interface Order {
  id: string;
  order_number: string;
  total_amount: number;
  status: string;
  shipping_address: string;
  payment_method: string;
  created_at: string;
  profiles: any;
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

export function VendorOrders() {
  const { vendor } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

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
          profiles (full_name, email),
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
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;

      toast.success('Order status updated');
      fetchOrders();
    } catch (error: any) {
      console.error('Error updating order:', error);
      toast.error(error.message || 'Failed to update order');
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

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(price);
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
      <div className="flex items-center justify-center h-64">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Orders</h1>
        <p className="text-muted-foreground">Manage customer orders</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 bg-card border-border"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 bg-card border-border">
            <SelectValue placeholder="Filter by status" />
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
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <Card className="p-12 bg-card border-border text-center">
          <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No orders found</h3>
          <p className="text-muted-foreground">
            {searchQuery || statusFilter !== 'all' 
              ? 'Try adjusting your filters' 
              : 'Orders will appear here once customers make purchases'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="bg-card border-border overflow-hidden">
                {/* Order Header */}
                <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                     }}>
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                      <h3 className="font-semibold">#{order.order_number}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(order.status)}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{order.profiles?.full_name}</span>
                      <span>•</span>
                      <span>{formatOrderDate(order.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
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

                        {/* Payment Method */}
                        <div>
                          <h4 className="font-medium mb-2">Payment Method</h4>
                          <p className="text-sm text-muted-foreground capitalize">{order.payment_method}</p>
                        </div>

                        {/* Status Update */}
                        <div>
                          <h4 className="font-medium mb-2">Update Status</h4>
                          <Select
                            value={order.status}
                            onValueChange={(value: string) => handleStatusUpdate(order.id, value)}
                          >
                            <SelectTrigger className="bg-muted border-border">
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
    </div>
  );
}
