import { useState, useEffect } from 'react';
import { Search, Activity, Download, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { motion } from 'motion/react';

const actionColors: Record<string, string> = {
  vendor_approve: 'bg-success/20 text-success',
  vendor_reject: 'bg-destructive/20 text-destructive',
  user_role_change: 'bg-primary/20 text-primary',
  product_delete: 'bg-destructive/20 text-destructive',
  category_create: 'bg-accent/20 text-accent-foreground',
  category_update: 'bg-primary/20 text-primary',
  category_delete: 'bg-destructive/20 text-destructive',
  coupon_create: 'bg-success/20 text-success',
  coupon_update: 'bg-primary/20 text-primary',
  coupon_delete: 'bg-destructive/20 text-destructive',
  order_status_change: 'bg-warning/20 text-warning',
};

const actionLabels: Record<string, string> = {
  vendor_approve: 'Vendor Approved',
  vendor_reject: 'Vendor Rejected',
  user_role_change: 'Role Changed',
  product_delete: 'Product Deleted',
  category_create: 'Category Created',
  category_update: 'Category Updated',
  category_delete: 'Category Deleted',
  coupon_create: 'Coupon Created',
  coupon_update: 'Coupon Updated',
  coupon_delete: 'Coupon Deleted',
  order_status_change: 'Order Status Changed',
};

export function AdminActivityLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    try {
      const { data } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false });
      setLogs(data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const filtered = logs.filter((l) => {
    const matchesSearch = l.user_email?.toLowerCase().includes(search.toLowerCase()) || l.action?.toLowerCase().includes(search.toLowerCase());
    const matchesAction = actionFilter === 'all' || l.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const formatDate = (d: string) => new Date(d).toLocaleString();
  const uniqueActions = [...new Set(logs.map((l) => l.action))];

  const exportCSV = () => {
    const headers = 'User,Action,Details,IP,Device,Time\n';
    const rows = filtered.map((l) =>
      `"${l.user_email || ''}","${l.action}","${JSON.stringify(l.details || '').replace(/"/g, '""')}","${l.ip_address || ''}","${l.user_agent || ''}","${l.created_at}"`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Activity Logs</h1>
          <p className="text-muted-foreground">Track admin actions and system events</p>
        </div>
        <Button onClick={exportCSV} className="gap-2"><Download className="w-4 h-4" /> Export CSV</Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by user or action..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {uniqueActions.map((a) => (
              <SelectItem key={a} value={a}>{actionLabels[a] || a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={fetchLogs} className="gap-2"><Filter className="w-4 h-4" /> Refresh</Button>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {loading ? <div className="p-8 text-center"><div className="h-8 w-8 animate-spin mx-auto border-4 border-primary border-t-transparent rounded-full" /></div>
        : filtered.length === 0 ? <div className="p-8 text-center text-muted-foreground">No activity logs found</div>
        : <div className="divide-y divide-slate-800">
            {filtered.map((l, i) => (
              <motion.div key={l.id || i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 hover:bg-muted/50">
                <div className="flex items-start gap-3">
                  <Activity className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={actionColors[l.action] || 'bg-muted text-muted-foreground'}>
                        {actionLabels[l.action] || l.action}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(l.created_at)}</span>
                    </div>
                    <p className="text-sm text-secondary-foreground">
                      <span className="font-medium">{l.user_email || 'System'}</span>
                      {l.details && <span className="text-muted-foreground"> — {JSON.stringify(l.details)}</span>}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>}
      </Card>
    </div>
  );
}
