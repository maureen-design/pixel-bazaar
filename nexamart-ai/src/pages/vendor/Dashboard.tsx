import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ShoppingCart, DollarSign, Clock, ArrowRight, TrendingUp, TrendingDown, AlertTriangle, ArrowUpRight, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { formatPrice } from '../../config/pricing';

interface DashboardStats {
  total_products: number;
  total_orders: number;
  total_revenue: number;
  pending_orders: number;
  previous_revenue: number;
  previous_orders: number;
  outstanding_balance: number;
  lifetime_earnings: number;
  total_paid_out: number;
  low_stock_products: { id: string; name: string; stock_quantity: number }[];
  status_breakdown: { status: string; count: number }[];
}

interface DailyData {
  date: string;
  revenue: number;
  orders: number;
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
    outstanding_balance: 0,
    lifetime_earnings: 0,
    total_paid_out: 0,
    low_stock_products: [],
    status_breakdown: [],
  });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (vendor) {
      fetchDashboardData();
    }
  }, [vendor]);

  const fetchDashboardData = async () => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      // Earnings come from the database. The old code summed orders.total_amount,
      // which was wrong twice over: it counted unpaid and refunded orders as
      // revenue, and total_amount includes tax and shipping that the vendor
      // never receives. 0037 stored vendor_earnings per order (merchandise minus
      // platform commission) and 0039 exposes it range-filtered on paid_at.
      const [productsResult, currentMoney, prevMoney, lifetimeMoney, dailyResult, pendingResult, lowStockResult] = await Promise.all([
        supabase.from('products').select('id').eq('vendor_id', vendor.id),
        supabase.rpc('vendor_financial_summary_range', { p_vendor_id: vendor.id, p_from: thirtyDaysAgo.toISOString(), p_to: now.toISOString() }),
        supabase.rpc('vendor_financial_summary_range', { p_vendor_id: vendor.id, p_from: sixtyDaysAgo.toISOString(), p_to: thirtyDaysAgo.toISOString() }),
        supabase.rpc('vendor_financial_summary', { p_vendor_id: vendor.id }),
        supabase.rpc('vendor_daily_earnings', { p_vendor_id: vendor.id, p_from: thirtyDaysAgo.toISOString(), p_to: now.toISOString() }),
        supabase.from('orders').select('id').eq('vendor_id', vendor.id).eq('status', 'pending'),
        supabase.from('products').select('id, name, stock_quantity').eq('vendor_id', vendor.id).lte('stock_quantity', 5).eq('status', 'active'),
      ]);

      if (currentMoney.error) {
        console.error('vendor_financial_summary_range failed:', currentMoney.error);
        toast.error('Earnings unavailable', {
          description: 'Apply migrations 0037 and 0039 in Supabase, then reload.',
        });
      }

      const cur = currentMoney.data?.[0];
      const prv = prevMoney.data?.[0];
      const lifetime = lifetimeMoney.data?.[0];

      // Operational counts still come from the orders table.
      const { data: currentOrders } = await supabase
        .from('orders')
        .select('id, status')
        .eq('vendor_id', vendor.id)
        .gte('created_at', thirtyDaysAgo.toISOString());

      // Calculate status breakdown from current orders
      const statusCounts: Record<string, number> = {};
      currentOrders?.forEach((o: any) => {
        statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
      });
      const status_breakdown = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

      setStats({
        total_products: productsResult.data?.length || 0,
        total_orders: currentOrders?.length || 0,
        total_revenue: Number(cur?.earnings ?? 0),
        pending_orders: pendingResult.data?.length || 0,
        previous_revenue: Number(prv?.earnings ?? 0),
        previous_orders: Number(prv?.orders ?? 0),
        outstanding_balance: Number(lifetime?.outstanding ?? 0),
        lifetime_earnings: Number(lifetime?.total_earnings ?? 0),
        total_paid_out: Number(lifetime?.total_paid_out ?? 0),
        low_stock_products: lowStockResult.data || [],
        status_breakdown,
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

      // Zero-filled by the RPC, so a quiet day is a real zero instead of a
      // missing point that would make the chart look broken.
      setDailyData(
        (dailyResult.data || []).map((d: any) => ({
          date: new Date(d.day).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }),
          revenue: Number(d.earnings || 0),
          orders: Number(d.orders || 0),
        })),
      );
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
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
        return 'bg-ai/20 text-ai';
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
                <Package className="w-5 h-5 text-success" />
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
              <span className="text-xs text-muted-foreground">Earnings (30d)</span>
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
            <p className="text-xs text-muted-foreground mt-2">Your share of merchandise, after platform commission. Excludes tax and shipping.</p>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
        >
          <Card className="p-5 bg-card border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground">Balance Owed</span>
            </div>
            <div className="flex items-end gap-2">
              <p className="text-2xl font-bold">{formatPrice(stats.outstanding_balance)}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Lifetime earned {formatPrice(stats.lifetime_earnings)} &middot; paid out {formatPrice(stats.total_paid_out)}
            </p>
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

      {/* Order Status Breakdown */}
      {stats.status_breakdown.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card className="bg-card border-border p-5">
            <h2 className="text-sm font-semibold text-muted-foreground mb-4">Order Status (30d)</h2>
            <div className="flex items-center gap-3">
              {[
                { status: 'pending', label: 'Pending', color: 'bg-warning' },
                { status: 'processing', label: 'Processing', color: 'bg-primary' },
                { status: 'shipped', label: 'Shipped', color: 'bg-ai' },
                { status: 'delivered', label: 'Delivered', color: 'bg-success' },
                { status: 'cancelled', label: 'Cancelled', color: 'bg-destructive' },
              ].map(({ status, label, color }) => {
                const count = stats.status_breakdown.find(s => s.status === status)?.count || 0;
                const pct = stats.total_orders > 0 ? (count / stats.total_orders) * 100 : 0;
                return (
                  <div key={status} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-2 h-2 rounded-full ${color}`} />
                      <span className="text-xs text-muted-foreground truncate">{label}</span>
                    </div>
                    <p className="text-lg font-bold">{count}</p>
                    <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </motion.div>
      )}

      {/* Revenue Chart */}
      {dailyData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card className="bg-card border-border p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Revenue (Last 30 Days)</h2>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-primary rounded-full" />
                  <span>Revenue</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-ai rounded-full" />
                  <span>Orders</span>
                </div>
              </div>
            </div>
            <div className="h-48">
              <RevenueChart data={dailyData} />
            </div>
          </Card>
        </motion.div>
      )}

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

function RevenueChart({ data }: { data: DailyData[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mouseX, setMouseX] = useState(0);

  if (data.length === 0) return null;

  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  const maxOrders = Math.max(...data.map(d => d.orders), 1);
  const height = 180;
  const width = 800;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const getX = (i: number) => padding.left + (i / (data.length - 1)) * chartWidth;
  const getRevenueY = (revenue: number) => padding.top + chartHeight - (revenue / maxRevenue) * chartHeight;
  const getOrderY = (orders: number) => padding.top + chartHeight - (orders / maxOrders) * chartHeight;

  const revenuePoints = data.map((d, i) => `${getX(i)},${getRevenueY(d.revenue)}`).join(' ');
  const orderPoints = data.map((d, i) => `${getX(i)},${getOrderY(d.orders)}`).join(' ');
  const revenueAreaPoints = `${padding.left},${padding.top + chartHeight} ${revenuePoints} ${padding.left + chartWidth},${padding.top + chartHeight}`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * width;
    const idx = Math.round(((svgX - padding.left) / chartWidth) * (data.length - 1));
    const clamped = Math.max(0, Math.min(data.length - 1, idx));
    setHoverIndex(clamped);
    setMouseX(e.clientX - rect.left);
  };

  const hoverData = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full"
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={padding.left}
            y1={padding.top + chartHeight * (1 - ratio)}
            x2={padding.left + chartWidth}
            y2={padding.top + chartHeight * (1 - ratio)}
            stroke="hsl(var(--border))"
            strokeWidth="1"
            strokeDasharray="4,4"
          />
        ))}

        {/* Revenue area fill */}
        <polygon
          points={revenueAreaPoints}
          fill="hsl(var(--primary))"
          fillOpacity="0.1"
        />

        {/* Revenue line */}
        <polyline
          points={revenuePoints}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Orders line */}
        <polyline
          points={orderPoints}
          fill="none"
          stroke="hsl(var(--ai))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="6,4"
        />

        {/* Crosshair + hover dot */}
        {hoverIndex !== null && (
          <>
            <line
              x1={getX(hoverIndex)}
              y1={padding.top}
              x2={getX(hoverIndex)}
              y2={padding.top + chartHeight}
              stroke="hsl(var(--foreground))"
              strokeWidth="1"
              strokeOpacity="0.3"
            />
            <circle
              cx={getX(hoverIndex)}
              cy={getRevenueY(data[hoverIndex].revenue)}
              r="5"
              fill="hsl(var(--primary))"
              stroke="hsl(var(--background))"
              strokeWidth="2"
            />
            <circle
              cx={getX(hoverIndex)}
              cy={getOrderY(data[hoverIndex].orders)}
              r="4"
              fill="hsl(var(--ai))"
              stroke="hsl(var(--background))"
              strokeWidth="2"
            />
          </>
        )}

        {/* X-axis labels (every 5 days) */}
        {data.filter((_, i) => i % 5 === 0 || i === data.length - 1).map((d, i) => {
          const idx = data.indexOf(d);
          const x = getX(idx);
          return (
            <text
              key={i}
              x={x}
              y={height - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {d.date}
            </text>
          );
        })}

        {/* Y-axis labels */}
        {[0, 0.5, 1].map((ratio) => (
          <text
            key={ratio}
            x={padding.left - 8}
            y={padding.top + chartHeight * (1 - ratio) + 4}
            textAnchor="end"
            className="fill-muted-foreground text-[10px]"
          >
            {ratio === 0 ? '0' : ratio === 1 ? `KES ${maxRevenue.toLocaleString()}` : ''}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {hoverData && (
        <div
          className="absolute pointer-events-none z-10 bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs"
          style={{
            left: `${mouseX}px`,
            top: '8px',
            transform: mouseX > 600 ? 'translateX(-110%)' : 'translateX(10%)',
          }}
        >
          <p className="font-medium text-foreground mb-1">{hoverData.date}</p>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span>{formatPrice(hoverData.revenue)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-ai" />
            <span>{hoverData.orders} order{hoverData.orders !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}
    </div>
  );
}
