import { useEffect, useState } from 'react';
import { DollarSign, ShoppingCart, Users, Package, TrendingUp, Download } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Skeleton } from '../../components/ui/skeleton';
import { motion } from 'motion/react';
import { useSettings } from '../../hooks/useSettings';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const statColorMap: Record<string, { bg: string; text: string }> = {
  emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-500' },
  blue: { bg: 'bg-blue-500/20', text: 'text-blue-500' },
  green: { bg: 'bg-green-500/20', text: 'text-green-500' },
  purple: { bg: 'bg-purple-500/20', text: 'text-purple-500' },
};

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

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

interface AnalyticsData {
  totalRevenue: number;
  totalOrders: number;
  totalUsers: number;
  totalProducts: number;
  revenueByDay: { date: string; amount: number }[];
  ordersByDay: { date: string; count: number }[];
  topProducts: TopProduct[];
}

export function AdminReports() {
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [data, setData] = useState<AnalyticsData>({
    totalRevenue: 0,
    totalOrders: 0,
    totalUsers: 0,
    totalProducts: 0,
    revenueByDay: [],
    ordersByDay: [],
    topProducts: [],
  });

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [ordersResult, usersResult, productsResult] = await Promise.all([
        supabase
          .from('orders')
          .select(`
            id,
            total_amount,
            created_at,
            status,
            order_items (
              quantity,
              product_price,
              products (
                name,
                images
              )
            )
          `)
          .gte('created_at', startDate.toISOString()),
        supabase.from('profiles').select('id'),
        supabase.from('products').select('id'),
      ]);

      const orders = ordersResult.data || [];
      const totalRevenue = orders.reduce((sum: number, order: any) => sum + (order.total_amount || 0), 0);
      const totalOrders = orders.length;
      const totalUsers = usersResult.data?.length || 0;
      const totalProducts = productsResult.data?.length || 0;

      const revenueByDay: { date: string; amount: number }[] = [];
      const ordersByDay: { date: string; count: number }[] = [];

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dayOrders = orders.filter((order: any) => order.created_at.startsWith(dateStr));
        const dayRevenue = dayOrders.reduce((sum: number, order: any) => sum + (order.total_amount || 0), 0);
        const label = date.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
        revenueByDay.push({ date: label, amount: dayRevenue });
        ordersByDay.push({ date: label, count: dayOrders.length });
      }

      const productSales = new Map<string, { quantity: number; revenue: number }>();
      orders.forEach((order: any) => {
        (order.order_items || []).forEach((item: any) => {
          const productName = item.products?.name || 'Unknown';
          const current = productSales.get(productName) || { quantity: 0, revenue: 0 };
          productSales.set(productName, {
            quantity: current.quantity + item.quantity,
            revenue: current.revenue + item.quantity * item.product_price,
          });
        });
      });

      const topProducts = Array.from(productSales.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8);

      setData({
        totalRevenue,
        totalOrders,
        totalUsers,
        totalProducts,
        revenueByDay,
        ordersByDay,
        topProducts,
      });
    } catch (error) {
      console.error('Error fetching admin analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => formatKES(price);

  const exportCSV = () => {
    const headers = 'Metric,Value\n';
    const rows = [
      `Total Revenue,${data.totalRevenue}`,
      `Total Orders,${data.totalOrders}`,
      `Total Users,${data.totalUsers}`,
      `Total Products,${data.totalProducts}`,
    ];
    const blob = new Blob([headers + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${settings.siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-36" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const statCards = [
    { icon: DollarSign, label: 'Total Revenue', value: formatPrice(data.totalRevenue), color: 'emerald', delay: 0.1 },
    { icon: ShoppingCart, label: 'Total Orders', value: data.totalOrders, color: 'yellow', delay: 0.2 },
    { icon: Users, label: 'Total Users', value: data.totalUsers, color: 'blue', delay: 0.3 },
    { icon: Package, label: 'Total Products', value: data.totalProducts, color: 'purple', delay: 0.4 },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Reports</h1>
          <p className="text-muted-foreground">Platform analytics and statistics</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={exportCSV} className="gap-2"><Download className="w-4 h-4" /> Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map(({ icon: Icon, label, value, color, delay }) => (
          <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
            <Card className="p-6 bg-card border-border">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 ${statColorMap[color].bg} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${statColorMap[color].text}`} />
                </div>
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold">{value}</p>
              <p className="text-sm text-muted-foreground mt-1">{label}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card className="p-6 bg-card border-border">
            <h3 className="font-semibold mb-4">Revenue Over Time</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.revenueByDay} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="adminRevenueGrad" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#adminRevenueGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <Card className="p-6 bg-card border-border">
            <h3 className="font-semibold mb-4">Orders Per Day</h3>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <Card className="bg-card border-border">
            <div className="p-6 border-b border-border">
              <h3 className="font-semibold">Top Selling Products</h3>
            </div>
            {data.topProducts.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Package className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p>No sales data yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="text-left px-6 py-3 font-medium">#</th>
                      <th className="text-left px-6 py-3 font-medium">Product</th>
                      <th className="text-right px-6 py-3 font-medium">Qty Sold</th>
                      <th className="text-right px-6 py-3 font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((product, index) => (
                      <tr key={index} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-3 text-sm text-muted-foreground">{index + 1}</td>
                        <td className="px-6 py-3 text-sm font-medium truncate max-w-[200px]">{product.name}</td>
                        <td className="px-6 py-3 text-sm text-right">{product.quantity}</td>
                        <td className="px-6 py-3 text-sm text-right font-semibold">{formatPrice(product.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
          <Card className="p-6 bg-card border-border">
            <h3 className="font-semibold mb-4">User Growth</h3>
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Users className="w-10 h-10 text-muted-foreground mb-3 opacity-40" />
              <p className="text-3xl font-bold mb-1">{data.totalUsers.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">total registered users</p>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
