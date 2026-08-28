import { useState, useEffect, useMemo } from 'react';
import { Search, Activity, Download, RefreshCw, ClipboardList } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Pagination } from '../../components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { motion } from 'motion/react';

const PAGE_SIZE = 20;

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

const dateRangeOptions = [
  { value: 'all', label: 'All' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

function formatDetails(details: Record<string, unknown> | null | undefined) {
  if (!details || typeof details !== 'object') return null;
  return Object.entries(details).map(([key, value]) => (
    <span key={key} className="inline-block mr-3 mb-1">
      <span className="font-medium">{key.replace(/_/g, ' ')}:</span>{' '}
      <span className="text-muted-foreground">{String(value)}</span>
    </span>
  ));
}

function SkeletonLoader() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-5 w-5 rounded-full mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminActivityLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => { fetchLogs(); }, []);

  useEffect(() => { setPage(1); }, [search, actionFilter, dateRange]);

  const fetchLogs = async () => {
    try {
      const { data } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false });
      setLogs(data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    const now = Date.now();
    return logs.filter((l) => {
      const matchesSearch = l.user_email?.toLowerCase().includes(search.toLowerCase()) || l.action?.toLowerCase().includes(search.toLowerCase());
      const matchesAction = actionFilter === 'all' || l.action === actionFilter;
      if (dateRange !== 'all') {
        const days = Number(dateRange);
        const cutoff = now - days * 24 * 60 * 60 * 1000;
        if (new Date(l.created_at).getTime() < cutoff) return false;
      }
      return matchesSearch && matchesAction;
    });
  }, [logs, search, actionFilter, dateRange]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {dateRangeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={fetchLogs} className="gap-2"><RefreshCw className="w-4 h-4" /> Refresh</Button>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {loading ? <SkeletonLoader />
        : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground font-medium">No activity logs found</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Try adjusting your filters</p>
          </div>
        )
        : <>
            <div className="divide-y divide-border">
              {paginated.map((l, i) => (
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
                      </p>
                      {l.details && typeof l.details === 'object' && Object.keys(l.details).length > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatDetails(l.details)}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        }
      </Card>
    </div>
  );
}
