import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Store, Package, ShoppingCart, DollarSign, ArrowRight, Check, X, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { toast } from 'sonner';
import { motion } from 'motion/react';

const statColorMap: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-500/20', text: 'text-blue-500' },
  green: { bg: 'bg-green-500/20', text: 'text-green-500' },
  purple: { bg: 'bg-purple-500/20', text: 'text-purple-500' },
  yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-500' },
  emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-500' },
};

function formatPercent(current: number, previous: number) {
  if (previous === 0) return current > 0 ? '+100%' : '0%';
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? '+' : ''}${Math.round(change)}%`;
}

function StatCardSkeleton() {
  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="w-12 h-12 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-20 mb-1" />
      <Skeleton className="h-4 w-24" />
    </Card>
  );
}

export function AdminDashboard() {
  const [stats, setStats] = useState({ total_users: 0, total_vendors: 0, total_products: 0, total_orders: 0, total_revenue: 0, pending_vendors: 0, low_stock: 0, out_of_stock: 0 });
  const [prevStats, setPrevStats] = useState({ total_users: 0, total_vendors: 0, total_products: 0, total_orders: 0, total_revenue: 0 });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [pendingVendors, setPendingVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sixtyDaysAgo = new Date(now);
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const { data: users } = await supabase.from('profiles').select('id');
      const { data: vendors } = await supabase.from('vendors').select('id, is_verified');
      const { data: products } = await supabase.from('products').select('id, stock_quantity, status, price');

      const [currentOrdersResult, prevOrdersResult] = await Promise.all([
        supabase.from('orders').select('id, total_amount, created_at').gte('created_at', thirtyDaysAgo.toISOString()),
        supabase.from('orders').select('id, total_amount, created_at').gte('created_at', sixtyDaysAgo.toISOString()).lt('created_at', thirtyDaysAgo.toISOString()),
      ]);

      const productList = products || [];
      const currentOrders = currentOrdersResult.data || [];
      const prevOrders = prevOrdersResult.data || [];

      setStats({
        total_users: users?.length || 0,
        total_vendors: vendors?.length || 0,
        total_products: productList.length,
        total_orders: currentOrders.length,
        total_revenue: currentOrders.reduce((s: number, o: any) => s + (o.total_amount || 0), 0),
        pending_vendors: vendors?.filter((v: any) => !v.is_verified).length || 0,
        low_stock: productList.filter((p: any) => p.stock_quantity > 0 && p.stock_quantity <= 5 && p.status !== 'out_of_stock').length,
        out_of_stock: productList.filter((p: any) => p.stock_quantity === 0 || p.status === 'out_of_stock').length,
      });

      setPrevStats({
        total_users: users?.length || 0,
        total_vendors: vendors?.length || 0,
        total_products: productList.length,
        total_orders: prevOrders.length,
        total_revenue: prevOrders.reduce((s: number, o: any) => s + (o.total_amount || 0), 0),
      });

      const { data: recent } = await supabase
        .from('orders')
        .select('id, order_number, total_amount, status, created_at, profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentOrders(recent || []);

      const { data: pending } = await supabase
        .from('vendors')
        .select('*, profiles!inner(full_name, email)')
        .eq('is_verified', false)
        .order('created_at', { ascending: true });
      setPendingVendors(pending || []);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const approveVendor = async (vendorId: string) => {
    const { error } = await supabase.rpc('approve_vendor', { target_vendor_id: vendorId });
    if (error) { toast.error('Failed to approve vendor'); return; }
    toast.success('Vendor approved');
    fetchDashboard();
  };

  const rejectVendor = async (vendorId: string) => {
    const { error } = await supabase.rpc('reject_vendor', { target_vendor_id: vendorId });
    if (error) { toast.error('Failed to reject vendor'); return; }
    toast.success('Vendor rejected');
    fetchDashboard();
  };

  const formatPrice = (p: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(p);

  const getStatusColor = (s: string) => {
    const map: Record<string, string> = { pending: 'bg-warning/20 text-warning', processing: 'bg-primary/20 text-primary', shipped: 'bg-accent/20 text-accent-foreground', delivered: 'bg-success/20 text-success', cancelled: 'bg-destructive/20 text-destructive' };
    return map[s] || 'bg-muted text-muted-foreground';
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-9 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {[1, 2, 3, 4, 5].map((i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div><Skeleton className="h-6 w-32 mb-4" /><Skeleton className="h-64 rounded-xl" /></div>
          <div><Skeleton className="h-6 w-56 mb-4" /><Skeleton className="h-64 rounded-xl" /></div>
        </div>
      </div>
    );
  }

  const statCards = [
    { icon: Users, label: 'Total Users', value: stats.total_users, color: 'blue', delay: 0.1, prev: prevStats.total_users },
    { icon: Store, label: 'Total Vendors', value: stats.total_vendors, color: 'green', delay: 0.2, prev: prevStats.total_vendors },
    { icon: Package, label: 'Total Products', value: stats.total_products, color: 'purple', delay: 0.3, prev: prevStats.total_products },
    { icon: ShoppingCart, label: '30-Day Orders', value: stats.total_orders, color: 'yellow', delay: 0.4, prev: prevStats.total_orders },
    { icon: DollarSign, label: '30-Day Revenue', value: formatPrice(stats.total_revenue), color: 'emerald', delay: 0.5, prev: prevStats.total_revenue },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-muted-foreground">Overview of your marketplace (last 30 days)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {statCards.map(({ icon: Icon, label, value, color, delay, prev }) => {
          const colors = statColorMap[color];
          const pct = formatPercent(typeof value === 'number' ? value : 0, prev);
          const isUp = (typeof value === 'number' ? value : 0) >= prev;
          return (
            <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
              <Card className="p-6 bg-card border-border">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 ${colors.bg} rounded-lg flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${colors.text}`} />
                  </div>
                  {prev > 0 && (
                    <span className={`text-xs font-medium flex items-center gap-0.5 ${isUp ? 'text-success' : 'text-destructive'}`}>
                      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {pct}
                    </span>
                  )}
                </div>
                <p className="text-3xl font-bold">{value}</p>
                <p className="text-sm text-muted-foreground mt-1">{label}</p>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/admin/inventory">
          <Card className="p-4 bg-card border-border hover:border-yellow-500/50 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-warning" />
              <div>
                <p className="text-lg font-bold">{stats.low_stock} products low on stock</p>
                <p className="text-sm text-muted-foreground">View inventory to restock</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground ml-auto" />
            </div>
          </Card>
        </Link>
        <Link to="/admin/inventory?filter=out_of_stock">
          <Card className="p-4 bg-card border-border hover:border-red-500/50 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-destructive" />
              <div>
                <p className="text-lg font-bold">{stats.out_of_stock} products out of stock</p>
                <p className="text-sm text-muted-foreground">View inventory to restock</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground ml-auto" />
            </div>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Recent Orders</h2>
            <Link to="/admin/orders"><Button variant="ghost" size="sm">View All <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
          </div>
          <Card className="bg-card border-border">
            {recentOrders.length === 0 ? <div className="p-8 text-center text-muted-foreground">No orders yet</div> : (
              <div className="divide-y divide-border">
                {recentOrders.map((o) => (
                  <div key={o.id} className="p-4 flex items-center justify-between hover:bg-muted/50">
                    <div>
                      <p className="font-medium">#{o.order_number}</p>
                      <p className="text-sm text-muted-foreground">{o.profiles?.full_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatPrice(o.total_amount)}</p>
                      <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(o.status)}`}>{o.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Pending Vendor Applications</h2>
            <Link to="/admin/vendors"><Button variant="ghost" size="sm">View All <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
          </div>
          <Card className="bg-card border-border">
            {pendingVendors.length === 0 ? <div className="p-8 text-center text-muted-foreground">No pending applications</div> : (
              <div className="divide-y divide-border">
                {pendingVendors.map((v: any) => (
                  <div key={v.id} className="p-4 hover:bg-muted/50">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium">{v.business_name || v.store_name}</p>
                        <p className="text-sm text-muted-foreground">{v.profiles?.email}</p>
                      </div>
                      <Badge variant="secondary">Pending</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="gap-1" onClick={() => approveVendor(v.id)}><Check className="w-4 h-4" /> Approve</Button>
                      <Button size="sm" variant="outline" className="gap-1 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => rejectVendor(v.id)}><X className="w-4 h-4" /> Reject</Button>
                    </div>
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
