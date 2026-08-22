import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ShoppingCart, DollarSign, Clock, ArrowRight, TrendingUp } from 'lucide-react';
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
      // Fetch stats
      const { data: products } = await supabase
        .from('products')
        .select('id')
        .eq('vendor_id', vendor.id);

      const { data: orders } = await supabase
        .from('orders')
        .select('id, total_amount, status')
        .eq('vendor_id', vendor.id);

      const { data: pendingOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('vendor_id', vendor.id)
        .eq('status', 'pending');

      const totalRevenue = orders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;

      setStats({
        total_products: products?.length || 0,
        total_orders: orders?.length || 0,
        total_revenue: totalRevenue,
        pending_orders: pendingOrders?.length || 0,
      });

      // Fetch recent orders
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
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's your store overview</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-primary" />
              </div>
              <span className="text-sm text-muted-foreground">Total Products</span>
            </div>
            <p className="text-3xl font-bold">{stats.total_products}</p>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-success/20 rounded-lg flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-success" />
              </div>
              <span className="text-sm text-muted-foreground">Total Orders</span>
            </div>
            <p className="text-3xl font-bold">{stats.total_orders}</p>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-accent/20 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-accent-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">Total Revenue</span>
            </div>
            <p className="text-3xl font-bold">{formatPrice(stats.total_revenue)}</p>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-warning/20 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-warning" />
              </div>
              <span className="text-sm text-muted-foreground">Pending Orders</span>
            </div>
            <p className="text-3xl font-bold">{stats.pending_orders}</p>
          </Card>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        <Link to="/vendor/products">
          <Card className="p-6 bg-card border-border hover:border-primary transition-colors cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold mb-1">Add New Product</h3>
                <p className="text-sm text-muted-foreground">List a new product for sale</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </Card>
        </Link>

        <Link to="/vendor/orders">
          <Card className="p-6 bg-card border-border hover:border-primary transition-colors cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold mb-1">View Orders</h3>
                <p className="text-sm text-muted-foreground">Manage customer orders</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </Card>
        </Link>

        <Link to="/vendor/analytics">
          <Card className="p-6 bg-card border-border hover:border-primary transition-colors cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold mb-1">View Analytics</h3>
                <p className="text-sm text-muted-foreground">Track sales performance</p>
              </div>
              <TrendingUp className="w-5 h-5 text-muted-foreground" />
            </div>
          </Card>
        </Link>
      </motion.div>

      {/* Recent Orders */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Orders</h2>
          <Link to="/vendor/orders">
            <Button variant="ghost" size="sm">
              View All
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>

        <Card className="bg-card border-border">
          {recentOrders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No orders yet
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">#{order.order_number}</p>
                    <p className="text-sm text-muted-foreground">
                      {Array.isArray(order.profiles) ? order.profiles[0]?.full_name : order.profiles?.full_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatPrice(order.total_amount)}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(order.status)}`}>
                      {order.status}
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
