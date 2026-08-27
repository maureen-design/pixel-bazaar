import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ShoppingCart, DollarSign, Clock, ArrowRight, TrendingUp, TrendingDown, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { motion } from 'motion/react';

interface DashboardStats {
  total_products: number;
  total_orders: number;
  total_revenue: number;
  pending_orders: number;
  previous_revenue: number;
  previous_orders: number;
  low_stock_products: { id: string; name: string; stock_quantity: number }[];
}

interface RecentOrder {
  id: string;
  order_number: string;
  total_amount: number;
  status: string;
  created_at: string;
  profiles: any;
}

export function VendorDashboard() {
  const { vendor } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    total_products: 0,
    total_orders: 0,
    total_revenue: 0,
    pending_orders: 0,
    previous_revenue: 0,
    previous_orders: 0,
    low_stock_products: [],
  });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (vendor) {
      fetchDashboardData();
    }
  }, [vendor]);

  const fetchDashboardData = async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const [productsResult, currentOrdersResult, prevOrdersResult, pendingResult, lowStockResult] = await Promise.all([
        supabase.from('products').select('id').eq('vendor_id', vendor.id),
        supabase.from('orders').select('id, total_amount, status').eq('vendor_id', vendor.id).gte('created_at', thirtyDaysAgo.toISOString()),
        supabase.from('orders').select('id, total_amount').eq('vendor_id', vendor.id).gte('created_at', sixtyDaysAgo.toISOString()).lt('created_at', thirtyDaysAgo.toISOString()),
        supabase.from('orders').select('id').eq('vendor_id', vendor.id).eq('status', 'pending'),
        supabase.from('products').select('id, name, stock_quantity').eq('vendor_id', vendor.id).lte('stock_quantity', 5).eq('status', 'active'),
      ]);

      const currentRevenue = currentOrdersResult.data?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
      const prevRevenue = prevOrdersResult.data?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;

      setStats({
        total_products: productsResult.data?.length || 0,
        total_orders: currentOrdersResult.data?.length || 0,
        total_revenue: currentRevenue,
        pending_orders: pendingResult.data?.length || 0,
        previous_revenue: prevRevenue,
        previous_orders: prevOrdersResult.data?.length || 0,
        low_stock_products: lowStockResult.data || [],
      });

      const { data: recent } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          total_amount,
          status,
          created_at,
          profiles!inner (full_name)
        `)
        .eq('vendor_id', vendor.id)
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentOrders(recent || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(price);
  };

  const formatPercentChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? '+100%' : '0%';
    const change = ((current - previous) / previous) * 100;
    return `${change >= 0 ? '+' : ''}${Math.round(change)}%`;
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
      <div className="space-y-6">
        <div className="space-y-2 animate-pulse">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-4 w-64 bg-muted rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-40 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's your store overview</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card className="p-5 bg-card border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground">Total Products</span>
            </div>
            <p className="text-2xl font-bold">{stats.total_products}</p>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="p-5 bg-card border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-success" />
              </div>
              <span className="text-xs text-muted-foreground">Orders (30d)</span>
            </div>
            <div className="flex items-end gap-2">
              <p className="text-2xl font-bold">{stats.total_orders}</p>
              <span className={`text-xs font-medium mb-1 ${stats.total_orders >= stats.previous_orders ? 'text-success' : 'text-destructive'}`}>
                {formatPercentChange(stats.total_orders, stats.previous_orders)}
              </span>
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="p-5 bg-card border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-success" />
              </div>
              <span className="text-xs text-muted-foreground">Revenue (30d)</span>
            </div>
            <div className="flex items-end gap-2">
              <p className="text-2xl font-bold">{formatPrice(stats.total_revenue)}</p>
              <span className={`text-xs font-medium mb-1 flex items-center gap-0.5 ${stats.total_revenue >= stats.previous_revenue ? 'text-success' : 'text-destructive'}`}>
                {stats.total_revenue >= stats.previous_revenue ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {formatPercentChange(stats.total_revenue, stats.previous_revenue)}
              </span>
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="p-5 bg-card border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-warning" />
              </div>
              <span className="text-xs text-muted-foreground">Pending</span>
            </div>
            <p className="text-2xl font-bold">{stats.pending_orders}</p>
          </Card>
        </motion.div>
      </div>

      {/* Action Required + Low Stock */}
      {(stats.pending_orders > 0 || stats.low_stock_products.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card className="bg-card border-border overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30">
              <h2 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Action Required
              </h2>
            </div>
            <div className="divide-y divide-border">
              {stats.pending_orders > 0 && (
                <Link
                  to="/vendor/orders"
                  className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-warning/10 rounded-lg flex items-center justify-center">
                      <ShoppingCart className="w-4 h-4 text-warning" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {stats.pending_orders} order{stats.pending_orders !== 1 ? 's' : ''} awaiting fulfillment
                      </p>
                      <p className="text-xs text-muted-foreground">Review and process pending orders</p>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </Link>
              )}
              {stats.low_stock_products.slice(0, 3).map((product) => (
                <Link
                  key={product.id}
                  to={`/vendor/products?q=${encodeURIComponent(product.name)}`}
                  className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-destructive/10 rounded-lg flex items-center justify-center">
                      <Package className="w-4 h-4 text-destructive" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Only {product.stock_quantity} left in stock
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                    Low Stock
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors ml-2" />
                </Link>
              ))}
              {stats.low_stock_products.length > 3 && (
                <Link
                  to="/vendor/products"
                  className="flex items-center justify-center p-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm text-primary font-medium">
                    View all {stats.low_stock_products.length - 3} more low-stock items
                  </span>
                </Link>
              )}
            </div>
          </Card>
        </motion.div>
      )}

      {/* Recent Orders */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Orders</h2>
          <Link to="/vendor/orders">
            <Button variant="ghost" size="sm" className="gap-1">
              View All
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        <Card className="bg-card border-border">
          {recentOrders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No orders yet
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                      <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">#{order.order_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {Array.isArray(order.profiles) ? order.profiles[0]?.full_name : order.profiles?.full_name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatPrice(order.total_amount)}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(order.status)}`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
