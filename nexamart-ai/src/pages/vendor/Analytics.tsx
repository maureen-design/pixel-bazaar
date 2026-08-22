import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, ShoppingCart, Package } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { motion } from 'motion/react';

interface AnalyticsData {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  averageOrderValue: number;
  revenueByDay: { date: string; amount: number }[];
  ordersByDay: { date: string; count: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
}

export function VendorAnalytics() {
  const { vendor } = useAuth();
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [data, setData] = useState<AnalyticsData>({
    totalRevenue: 0,
    totalOrders: 0,
    totalProducts: 0,
    averageOrderValue: 0,
    revenueByDay: [],
    ordersByDay: [],
    topProducts: [],
  });

  useEffect(() => {
    if (vendor) {
      fetchAnalytics();
    }
  }, [vendor, timeRange]);

  const fetchAnalytics = async () => {
    try {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data: orders } = await supabase
        .from('orders')
        .select('id, total_amount, created_at, status')
        .eq('vendor_id', vendor.id)
        .gte('created_at', startDate.toISOString())
        .eq('status', 'delivered');

      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .eq('vendor_id', vendor.id);

      const { data: orderItems } = await supabase
        .from('order_items')
        .select('quantity, product_price, products!inner(name)')
        .eq('products.vendor_id', vendor.id);

      const totalRevenue = orders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
      const totalOrders = orders?.length || 0;
      const totalProducts = products?.length || 0;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      const revenueByDay: { date: string; amount: number }[] = [];
      const ordersByDay: { date: string; count: number }[] = [];

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const dayOrders = orders?.filter(order => order.created_at.startsWith(dateStr)) || [];
        const dayRevenue = dayOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0);

        revenueByDay.push({ date: dateStr, amount: dayRevenue });
        ordersByDay.push({ date: dateStr, count: dayOrders.length });
      }

      const productSales = new Map<string, { quantity: number; revenue: number }>();
      orderItems?.forEach(item => {
        const productName = item.products?.[0]?.name || 'Unknown';
        const current = productSales.get(productName) || { quantity: 0, revenue: 0 };
        productSales.set(productName, {
          quantity: current.quantity + item.quantity,
          revenue: current.revenue + (item.quantity * item.product_price),
        });
      });

      const topProducts = Array.from(productSales.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      setData({
        totalRevenue,
        totalOrders,
        totalProducts,
        averageOrderValue,
        revenueByDay,
        ordersByDay,
        topProducts,
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
  };

  const maxValue = Math.max(...data.revenueByDay.map(d => d.amount), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Analytics</h1>
          <p className="text-muted-foreground">Track your sales performance</p>
        </div>
        <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
          <SelectTrigger className="w-40 bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="w-5 h-5 text-success" />
              <span className="text-sm text-muted-foreground">Total Revenue</span>
            </div>
            <p className="text-2xl font-bold">{formatPrice(data.totalRevenue)}</p>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center gap-3 mb-2">
              <ShoppingCart className="w-5 h-5 text-blue-500" />
              <span className="text-sm text-muted-foreground">Total Orders</span>
            </div>
            <p className="text-2xl font-bold">{data.totalOrders}</p>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center gap-3 mb-2">
              <Package className="w-5 h-5 text-accent-foreground" />
              <span className="text-sm text-muted-foreground">Products</span>
            </div>
            <p className="text-2xl font-bold">{data.totalProducts}</p>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-5 h-5 text-warning" />
              <span className="text-sm text-muted-foreground">Avg Order Value</span>
            </div>
            <p className="text-2xl font-bold">{formatPrice(data.averageOrderValue)}</p>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card className="p-6 bg-card border-border">
            <h3 className="font-semibold mb-4">Revenue Over Time</h3>
            <div className="space-y-2">
              {data.revenueByDay.map((day, index) => (
                <div key={day.date} className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground w-16">{formatDate(day.date)}</span>
                  <div className="flex-1 h-8 bg-muted rounded overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(day.amount / maxValue) * 100}%` }}
                      transition={{ delay: index * 0.05 }}
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded"
                    />
                  </div>
                  <span className="text-sm font-medium w-24 text-right">{formatPrice(day.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <Card className="p-6 bg-card border-border">
            <h3 className="font-semibold mb-4">Top Selling Products</h3>
            {data.topProducts.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No sales data yet</p>
            ) : (
              <div className="space-y-4">
                {data.topProducts.map((product, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">{product.quantity} sold</p>
                    </div>
                    <p className="font-medium">{formatPrice(product.revenue)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
