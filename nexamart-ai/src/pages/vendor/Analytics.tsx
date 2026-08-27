import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, ShoppingCart, Package, Eye, BarChart3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { motion } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

function formatKES(price: number) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(price);
}

function RevenueTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-3">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-sm font-semibold">{formatKES(payload[0].value)}</p>
      </div>
    );
  }
  return null;
}

function OrdersTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-3">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-sm font-semibold">{payload[0].value} order{payload[0].value !== 1 ? 's' : ''}</p>
      </div>
    );
  }
  return null;
}

interface AnalyticsData {
  totalRevenue: number;
  previousRevenue: number;
  totalOrders: number;
  previousOrders: number;
  totalProducts: number;
  averageOrderValue: number;
  revenueByDay: { date: string; amount: number }[];
  ordersByDay: { date: string; count: number }[];
  topProducts: { name: string; quantity: number; revenue: number; image?: string }[];
}

export function VendorAnalytics() {
  const { vendor } = useAuth();
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [data, setData] = useState<AnalyticsData>({
    totalRevenue: 0,
    previousRevenue: 0,
    totalOrders: 0,
    previousOrders: 0,
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
    setLoading(true);
    try {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - days);

      const [currentOrdersResult, prevOrdersResult, productsResult] = await Promise.all([
        supabase
          .from('orders')
          .select(`
            id,
            total_amount,
            created_at,
            status,
            order_items!inner (
              quantity,
              product_price,
              products!inner (
                name,
                images,
                vendor_id
              )
            )
          `)
          .eq('vendor_id', vendor.id)
          .gte('created_at', startDate.toISOString())
          .eq('status', 'delivered')
          .eq('order_items.products.vendor_id', vendor.id),
        supabase
          .from('orders')
          .select('id, total_amount, created_at')
          .eq('vendor_id', vendor.id)
          .gte('created_at', prevStartDate.toISOString())
          .lt('created_at', startDate.toISOString())
          .eq('status', 'delivered'),
        supabase
          .from('products')
          .select('id, name')
          .eq('vendor_id', vendor.id),
      ]);

      const orders = currentOrdersResult.data || [];
      const prevOrders = prevOrdersResult.data || [];

      const totalRevenue = orders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
      const previousRevenue = prevOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
      const totalOrders = orders.length;
      const previousOrders = prevOrders.length;
      const totalProducts = productsResult.data?.length || 0;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Build day-by-day data
      const revenueByDay: { date: string; amount: number }[] = [];
      const ordersByDay: { date: string; count: number }[] = [];

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const dayOrders = orders.filter(order => order.created_at.startsWith(dateStr));
        const dayRevenue = dayOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0);

        const label = date.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
        revenueByDay.push({ date: label, amount: dayRevenue });
        ordersByDay.push({ date: label, count: dayOrders.length });
      }

      // Product performance
      const productSales = new Map<string, { quantity: number; revenue: number; image?: string }>();
      const items = orders.flatMap(order => (order as any).order_items || []);
      items.forEach(item => {
        const productName = item.products?.name || 'Unknown';
        const current = productSales.get(productName) || { quantity: 0, revenue: 0, image: item.products?.images?.[0] };
        productSales.set(productName, {
          quantity: current.quantity + item.quantity,
          revenue: current.revenue + (item.quantity * item.product_price),
          image: current.image || item.products?.images?.[0],
        });
      });

      const topProducts = Array.from(productSales.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8);

      setData({
        totalRevenue,
        previousRevenue,
        totalOrders,
        previousOrders,
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

  const formatPrice = (price: number) => formatKES(price);

  const formatPercent = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? '+100%' : '0%';
    const change = ((current - previous) / previous) * 100;
    return `${change >= 0 ? '+' : ''}${Math.round(change)}%`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between animate-pulse">
          <div className="space-y-2">
            <div className="h-8 w-40 bg-muted rounded" />
            <div className="h-4 w-56 bg-muted rounded" />
          </div>
          <div className="h-10 w-40 bg-muted rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-muted rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 bg-muted rounded-xl" />
          <div className="h-80 bg-muted rounded-xl" />
        </div>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="p-5 bg-card border-border">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="w-4 h-4 text-success" />
              <span className="text-xs text-muted-foreground">Total Revenue</span>
            </div>
            <p className="text-xl font-bold">{formatPrice(data.totalRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              vs prev. period: <span className={`font-medium ${data.totalRevenue >= data.previousRevenue ? 'text-success' : 'text-destructive'}`}>{formatPercent(data.totalRevenue, data.previousRevenue)}</span>
            </p>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="p-5 bg-card border-border">
            <div className="flex items-center gap-3 mb-2">
              <ShoppingCart className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Orders</span>
            </div>
            <p className="text-xl font-bold">{data.totalOrders}</p>
            <p className="text-xs text-muted-foreground mt-1">
              vs prev. period: <span className={`font-medium ${data.totalOrders >= data.previousOrders ? 'text-success' : 'text-destructive'}`}>{formatPercent(data.totalOrders, data.previousOrders)}</span>
            </p>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="p-5 bg-card border-border">
            <div className="flex items-center gap-3 mb-2">
              <Package className="w-4 h-4 text-accent-foreground" />
              <span className="text-xs text-muted-foreground">Active Products</span>
            </div>
            <p className="text-xl font-bold">{data.totalProducts}</p>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="p-5 bg-card border-border">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-4 h-4 text-warning" />
              <span className="text-xs text-muted-foreground">Avg Order Value</span>
            </div>
            <p className="text-xl font-bold">{formatPrice(data.averageOrderValue)}</p>
          </Card>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card className="p-6 bg-card border-border">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              Revenue Over Time
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.revenueByDay} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    interval={timeRange === '7d' ? 0 : timeRange === '30d' ? 4 : 9}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                  />
                  <Tooltip content={<RevenueTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#revenueGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="p-6 bg-card border-border">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              Orders Per Day
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.ordersByDay} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    interval={timeRange === '7d' ? 0 : timeRange === '30d' ? 4 : 9}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<OrdersTooltip />} />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Top Products */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Card className="bg-card border-border">
          <div className="p-6 border-b border-border">
            <h3 className="font-semibold flex items-center gap-2">
              <Package className="w-4 h-4 text-muted-foreground" />
              Top Products
            </h3>
          </div>
          {data.topProducts.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Eye className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p>No sales data yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.topProducts.map((product, index) => (
                <div key={index} className="px-6 py-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                  <span className="text-sm font-medium text-muted-foreground w-6 text-center">
                    {index + 1}
                  </span>
                  {product.image ? (
                    <img src={product.image} alt="" className="w-10 h-10 rounded-lg object-cover bg-muted" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Package className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.quantity} sold</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatPrice(product.revenue)}</p>
                    <p className="text-xs text-muted-foreground">
                      {data.totalRevenue > 0 ? Math.round((product.revenue / data.totalRevenue) * 100) : 0}% of revenue
                    </p>
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
