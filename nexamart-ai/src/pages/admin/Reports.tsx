import { useEffect, useState } from 'react';
import { DollarSign, ShoppingCart, Users, Package, TrendingUp, Download } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { motion } from 'motion/react';

export function AdminReports() {
  const [summary, setSummary] = useState({ totalRevenue: 0, totalOrders: 0, totalUsers: 0, totalProducts: 0 });
  const [period, setPeriod] = useState('weekly');
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchSummary(); }, []);

  const fetchSummary = async () => {
    try {
      const { data: orders } = await supabase.from('orders').select('total_amount');
      const { data: users } = await supabase.from('profiles').select('id');
      const { data: products } = await supabase.from('products').select('id');
      setSummary({
        totalRevenue: orders?.reduce((s: number, o: any) => s + (o.total_amount || 0), 0) || 0,
        totalOrders: orders?.length || 0,
        totalUsers: users?.length || 0,
        totalProducts: products?.length || 0,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (p: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(p);

  const exportCSV = () => {
    const headers = 'Metric,Value\n';
    const rows = [
      `Total Revenue,${summary.totalRevenue}`,
      `Total Orders,${summary.totalOrders}`,
      `Total Users,${summary.totalUsers}`,
      `Total Products,${summary.totalProducts}`,
    ];
    const blob = new Blob([headers + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexamart-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  const statCards = [
    { icon: DollarSign, label: 'Total Revenue', value: formatPrice(summary.totalRevenue), color: 'emerald', delay: 0.1 },
    { icon: ShoppingCart, label: 'Total Orders', value: summary.totalOrders, color: 'blue', delay: 0.2 },
    { icon: Users, label: 'Total Users', value: summary.totalUsers, color: 'green', delay: 0.3 },
    { icon: Package, label: 'Total Products', value: summary.totalProducts, color: 'purple', delay: 0.4 },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Reports</h1>
          <p className="text-muted-foreground">Platform analytics and statistics</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
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
                <div className={`w-12 h-12 bg-${color}-500/20 rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 text-${color}-500`} />
                </div>
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold">{value}</p>
              <p className="text-sm text-muted-foreground mt-1">{label}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Simple Bar Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card className="p-6 bg-card border-border">
            <h3 className="text-lg font-semibold mb-4">Revenue ({period})</h3>
            <div className="flex items-end gap-2 h-48">
              {Array.from({ length: 7 }).map((_, i) => {
                const height = 20 + Math.random() * 80;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs text-muted-foreground">{height.toFixed(0)}K</span>
                    <div className="w-full bg-primary/20 rounded-t" style={{ height: `${height}%` }}>
                      <div className="w-full bg-primary rounded-t transition-all duration-500" style={{ height: '60%' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <Card className="p-6 bg-card border-border">
            <h3 className="text-lg font-semibold mb-4">Orders ({period})</h3>
            <div className="flex items-end gap-2 h-48">
              {Array.from({ length: 7 }).map((_, i) => {
                const height = 15 + Math.random() * 85;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs text-muted-foreground">{Math.round(height)}</span>
                    <div className="w-full bg-success/20 rounded-t" style={{ height: `${height}%` }}>
                      <div className="w-full bg-success rounded-t transition-all duration-500" style={{ height: '60%' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Top Selling Products / User Growth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <Card className="p-6 bg-card border-border">
            <h3 className="text-lg font-semibold mb-4">Top Selling Products</h3>
            <p className="text-muted-foreground text-sm">Install a charting library (e.g. recharts) for detailed product analytics</p>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
          <Card className="p-6 bg-card border-border">
            <h3 className="text-lg font-semibold mb-4">User Growth</h3>
            <p className="text-muted-foreground text-sm">User growth analytics will appear once more data is available</p>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
