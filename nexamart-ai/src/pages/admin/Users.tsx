import { useState, useEffect, useMemo } from 'react';
import { Search, Trash2, AlertCircle, CheckSquare } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { useAuth } from '../../context/AuthContext';
import { Pagination } from '../../components/ui/pagination';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';

const PAGE_SIZE = 15;

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600',
  'bg-rose-600', 'bg-cyan-600', 'bg-pink-600', 'bg-indigo-600',
];

function getAvatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitial(name?: string | null, email?: string | null) {
  const source = name || email || '?';
  return source.charAt(0).toUpperCase();
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left p-4"><Skeleton className="h-4 w-5" /></th>
            <th className="text-left p-4"><Skeleton className="h-4 w-20" /></th>
            <th className="text-left p-4"><Skeleton className="h-4 w-32" /></th>
            <th className="text-left p-4"><Skeleton className="h-4 w-16" /></th>
            <th className="text-left p-4"><Skeleton className="h-4 w-20" /></th>
            <th className="text-left p-4"><Skeleton className="h-4 w-16" /></th>
            <th className="text-right p-4"><Skeleton className="h-4 w-16 ml-auto" /></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              <td className="p-4"><Skeleton className="h-4 w-5" /></td>
              <td className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </td>
              <td className="p-4"><Skeleton className="h-4 w-36" /></td>
              <td className="p-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
              <td className="p-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
              <td className="p-4"><Skeleton className="h-4 w-20" /></td>
              <td className="p-4">
                <div className="flex items-center justify-end gap-2">
                  <Skeleton className="h-8 w-28" />
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ user: any; newRole: string } | null>(null);
  const [page, setPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkRoleTarget, setBulkRoleTarget] = useState<string | null>(null);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*, vendors(id, is_verified)')
        .order('created_at', { ascending: false });
      setUsers(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateRole = async (userId: string, role: string) => {
    const { error } = await supabase.rpc('update_user_role', { target_user_id: userId, new_role: role });
    if (error) { toast.error('Failed to update role'); return; }
    toast.success('Role updated');
    fetchUsers();
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.id === user?.id) {
      toast.error('You cannot delete your own account');
      setDeleteTarget(null);
      return;
    }
    const { error } = await supabase.from('profiles').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Failed to delete user'); setDeleteTarget(null); return; }
    toast.success('User deleted');
    setDeleteTarget(null);
    fetchUsers();
  };

  const confirmRoleChange = () => {
    if (!roleChangeTarget) return;
    updateRole(roleChangeTarget.user.id, roleChangeTarget.newRole);
    setRoleChangeTarget(null);
  };

  const filtered = users.filter((u) => {
    const matchesSearch = u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [search, roleFilter]);

  const formatDate = (d: string) => new Date(d).toLocaleDateString();

  const getRoleVariant = (role: string) => {
    if (role === 'admin') return 'default' as const;
    if (role === 'vendor') return 'outline' as const;
    return 'secondary' as const;
  };

  const paginatedIds = paginated.map((u) => u.id);
  const allPaginatedSelected = paginatedIds.length > 0 && paginatedIds.every((id) => selectedIds.has(id));
  const somePaginatedSelected = paginatedIds.some((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allPaginatedSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const { error } = await supabase.from('profiles').delete().in('id', ids);
    if (error) { toast.error('Failed to delete selected users'); setBulkDeleteOpen(false); return; }
    toast.success(`${ids.length} user${ids.length > 1 ? 's' : ''} deleted`);
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    fetchUsers();
  };

  const bulkRoleChange = async () => {
    if (!bulkRoleTarget) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    let failed = 0;
    for (const id of ids) {
      const { error } = await supabase.rpc('update_user_role', { target_user_id: id, new_role: bulkRoleTarget });
      if (error) failed++;
    }
    if (failed > 0) {
      toast.error(`Failed to update ${failed} user role${failed > 1 ? 's' : ''}`);
    } else {
      toast.success(`${ids.length} user${ids.length > 1 ? 's' : ''} role updated to ${bulkRoleTarget}`);
    }
    setSelectedIds(new Set());
    setBulkRoleTarget(null);
    fetchUsers();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Users</h1>
        <p className="text-muted-foreground">Manage platform users and roles</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="customer">Customer</SelectItem>
            <SelectItem value="vendor">Vendor</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="bg-primary/10 border-primary/30 p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <span className="text-sm font-medium text-primary">
                  {selectedIds.size} user{selectedIds.size > 1 ? 's' : ''} selected
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="ghost" size="sm" onClick={clearSelection}>
                    Clear selection
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete selected
                  </Button>
                  <Select value="" onValueChange={(val) => setBulkRoleTarget(val)}>
                    <SelectTrigger className="w-40 h-8 text-xs">
                      <SelectValue placeholder="Change role..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="vendor">Vendor</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="bg-card border-border overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <AlertCircle className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-lg font-medium">No users found</p>
            <p className="text-sm mt-1">Try adjusting your search or filter</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 w-10">
                      <button
                        onClick={toggleSelectAll}
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                          allPaginatedSelected
                            ? 'bg-primary border-primary text-primary-foreground'
                            : somePaginatedSelected
                            ? 'bg-primary/30 border-primary text-primary-foreground'
                            : 'border-muted-foreground/40 hover:border-muted-foreground'
                        }`}
                        aria-label="Select all users"
                      >
                        {allPaginatedSelected && <CheckSquare className="w-3.5 h-3.5" />}
                        {somePaginatedSelected && !allPaginatedSelected && <div className="w-2 h-0.5 bg-primary-foreground rounded" />}
                      </button>
                    </th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Name</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Email</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Role</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Vendor Status</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Joined</th>
                    <th className="text-right p-4 text-muted-foreground font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map((u) => {
                    const isSelected = selectedIds.has(u.id);
                    return (
                      <motion.tr
                        key={u.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`hover:bg-muted/50 ${isSelected ? 'bg-muted/30' : ''}`}
                      >
                        <td className="p-4 w-10">
                          <button
                            onClick={() => toggleSelectOne(u.id)}
                            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'border-muted-foreground/40 hover:border-muted-foreground'
                            }`}
                            aria-label={`Select user ${u.full_name || u.email}`}
                          >
                            {isSelected && <CheckSquare className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${getAvatarColor(u.id)}`}>
                              {getInitial(u.full_name, u.email)}
                            </div>
                            <span className="font-medium">{u.full_name || 'N/A'}</span>
                          </div>
                        </td>
                        <td className="p-4 text-muted-foreground">{u.email}</td>
                        <td className="p-4">
                          <Badge variant={getRoleVariant(u.role)}>{u.role}</Badge>
                        </td>
                        <td className="p-4">
                          {u.vendors?.length > 0 ? (
                            <Badge variant={u.vendors[0]?.is_verified ? 'default' : 'secondary'}>
                              {u.vendors[0]?.is_verified ? 'Approved' : 'Pending'}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-4 text-muted-foreground">{formatDate(u.created_at)}</td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Select
                              value={u.role}
                              onValueChange={(val: string) => setRoleChangeTarget({ user: u, newRole: val })}
                            >
                              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="customer">Customer</SelectItem>
                                <SelectItem value="vendor">Vendor</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-red-300 hover:bg-destructive/10" onClick={() => setDeleteTarget(u)} aria-label={`Delete user ${u.full_name || u.email}`}>
                              <Trash2 aria-hidden="true" className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="border-t border-border p-4">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>Are you sure you want to delete {deleteTarget?.full_name || deleteTarget?.email}? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteUser}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!roleChangeTarget} onOpenChange={() => setRoleChangeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Are you sure you want to change <span className="font-medium text-foreground">{roleChangeTarget?.user?.full_name || roleChangeTarget?.user?.email}</span> from <Badge variant={getRoleVariant(roleChangeTarget?.user?.role || '')}>{roleChangeTarget?.user?.role}</Badge> to <Badge variant={getRoleVariant(roleChangeTarget?.newRole || '')}>{roleChangeTarget?.newRole}</Badge>?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setRoleChangeTarget(null)}>Cancel</Button>
            <Button onClick={confirmRoleChange}>Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteOpen} onOpenChange={() => setBulkDeleteOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Selected Users</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-medium text-foreground">{selectedIds.size}</span> user{selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={bulkDelete}>Delete {selectedIds.size} user{selectedIds.size > 1 ? 's' : ''}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bulkRoleTarget} onOpenChange={() => setBulkRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role for Selected Users</DialogTitle>
            <DialogDescription>
              Are you sure you want to change the role of <span className="font-medium text-foreground">{selectedIds.size}</span> user{selectedIds.size > 1 ? 's' : ''} to <Badge variant={getRoleVariant(bulkRoleTarget || '')}>{bulkRoleTarget}</Badge>?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setBulkRoleTarget(null)}>Cancel</Button>
            <Button onClick={bulkRoleChange}>Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
