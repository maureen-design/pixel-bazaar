import { useState, useEffect } from 'react';
import { Search, Store, Check, X, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { motion } from 'motion/react';

export function AdminVendors() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedVendor, setSelectedVendor] = useState<any>(null);

  useEffect(() => { fetchVendors(); }, []);

  const fetchVendors = async () => {
    try {
      const { data } = await supabase
        .from('vendors')
        .select('*, profiles!inner(full_name, email, created_at)')
        .order('created_at', { ascending: false });
      setVendors(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const approveVendor = async (id: string) => {
    const { error } = await supabase.rpc('approve_vendor', { target_vendor_id: id });
    if (error) { toast.error('Failed to approve'); return; }
    toast.success('Vendor approved');
    fetchVendors();
  };

  const rejectVendor = async (id: string) => {
    const { error } = await supabase.rpc('reject_vendor', { target_vendor_id: id });
    if (error) { toast.error('Failed to reject'); return; }
    toast.success('Vendor rejected');
    fetchVendors();
  };

  const filtered = vendors.filter((v) => {
    const matchesSearch = v.business_name?.toLowerCase().includes(search.toLowerCase()) || v.profiles?.email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'approved' && v.is_verified) || (statusFilter === 'pending' && !v.is_verified);
    return matchesSearch && matchesStatus;
  });

  const formatDate = (d: string) => new Date(d).toLocaleDateString();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Vendors</h1>
        <p className="text-muted-foreground">Manage vendor applications and stores</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No vendors found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-muted-foreground font-medium">Store Name</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Owner</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Email</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Rating</th>
                  <th className="text-left p-4 text-muted-foreground font-medium">Joined</th>
                  <th className="text-right p-4 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((v) => (
                  <motion.tr key={v.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-muted/50">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Store className="w-5 h-5 text-primary" />
                        <span className="font-medium">{v.business_name || v.store_name}</span>
                      </div>
                    </td>
                    <td className="p-4">{v.profiles?.full_name}</td>
                    <td className="p-4 text-muted-foreground">{v.profiles?.email}</td>
                    <td className="p-4">
                      <Badge variant={v.is_verified ? 'default' : 'secondary'}>{v.is_verified ? 'Approved' : 'Pending'}</Badge>
                    </td>
                    <td className="p-4">{v.rating || '-'}</td>
                    <td className="p-4 text-muted-foreground">{formatDate(v.created_at)}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setSelectedVendor(v)} aria-label={`View ${v.business_name || v.store_name}`}><Eye aria-hidden="true" className="w-4 h-4" /></Button>
                        {!v.is_verified ? (
                          <>
                            <Button size="sm" className="gap-1" onClick={() => approveVendor(v.id)} aria-label={`Approve ${v.business_name || v.store_name}`}><Check aria-hidden="true" className="w-4 h-4" /></Button>
                            <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => rejectVendor(v.id)} aria-label={`Reject ${v.business_name || v.store_name}`}><X aria-hidden="true" className="w-4 h-4" /></Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => rejectVendor(v.id)}><X className="w-4 h-4" /> Revoke</Button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={!!selectedVendor} onOpenChange={() => setSelectedVendor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Vendor Details</DialogTitle></DialogHeader>
          {selectedVendor && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Store className="w-12 h-12 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold">{selectedVendor.business_name || selectedVendor.store_name}</h3>
                  <p className="text-muted-foreground">{selectedVendor.profiles?.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Owner:</span> <span className="text-foreground ml-2">{selectedVendor.profiles?.full_name}</span></div>
                <div><span className="text-muted-foreground">Rating:</span> <span className="text-foreground ml-2">{selectedVendor.rating || 'N/A'}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={selectedVendor.is_verified ? 'default' : 'secondary'} className="ml-2">{selectedVendor.is_verified ? 'Approved' : 'Pending'}</Badge></div>
                <div><span className="text-muted-foreground">Joined:</span> <span className="text-foreground ml-2">{formatDate(selectedVendor.created_at)}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
