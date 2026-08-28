import { useState, useEffect, useMemo } from 'react';
import { Search, Star, Trash2, Check, EyeOff, Inbox, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Pagination } from '../../components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { motion } from 'motion/react';

const PAGE_SIZE = 15;

const DATE_RANGES = [
  { label: 'All', value: 'all', days: null },
  { label: 'Last 7 days', value: '7', days: 7 },
  { label: 'Last 30 days', value: '30', days: 30 },
  { label: 'Last 90 days', value: '90', days: 90 },
] as const;

export function AdminReviews() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [reviewTarget, setReviewTarget] = useState<any>(null);
  const [page, setPage] = useState(1);

  useEffect(() => { fetchReviews(); }, []);

  const fetchReviews = async () => {
    try {
      const { data } = await supabase
        .from('reviews')
        .select('*, products(name), profiles(full_name, email)')
        .order('created_at', { ascending: false });
      setReviews(data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const approveReview = async (id: string) => {
    const { error } = await supabase.from('reviews').update({ is_approved: true }).eq('id', id);
    if (error) { toast.error('Failed to approve'); return; }
    toast.success('Review approved');
    fetchReviews();
  };

  const hideReview = async (id: string) => {
    const { error } = await supabase.from('reviews').update({ is_hidden: true }).eq('id', id);
    if (error) { toast.error('Failed to hide'); return; }
    toast.success('Review hidden');
    fetchReviews();
  };

  const deleteReview = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('reviews').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Failed to delete'); setDeleteTarget(null); return; }
    toast.success('Review deleted');
    setDeleteTarget(null);
    fetchReviews();
  };

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      const matchesSearch =
        r.products?.name?.toLowerCase().includes(search.toLowerCase()) ||
        r.profiles?.full_name?.toLowerCase().includes(search.toLowerCase());
      const matchesRating = ratingFilter === 'all' || r.rating === parseInt(ratingFilter);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'approved' && r.is_approved && !r.is_hidden) ||
        (statusFilter === 'pending' && !r.is_approved && !r.is_hidden) ||
        (statusFilter === 'hidden' && r.is_hidden);

      let matchesDate = true;
      if (dateFilter !== 'all') {
        const days = DATE_RANGES.find((d) => d.value === dateFilter)?.days;
        if (days) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);
          matchesDate = new Date(r.created_at) >= cutoff;
        }
      }

      return matchesSearch && matchesRating && matchesStatus && matchesDate;
    });
  }, [reviews, search, ratingFilter, statusFilter, dateFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, ratingFilter, statusFilter, dateFilter]);

  const formatDate = (d: string) => new Date(d).toLocaleDateString();
  const renderStars = (n: number) =>
    Array.from({ length: 5 }, (_, i) => (
      <Star key={i} className={`w-4 h-4 ${i < n ? 'fill-yellow-400 text-warning' : 'text-muted-foreground'}`} />
    ));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Reviews</h1>
        <p className="text-muted-foreground">Moderate customer reviews</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by product or customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map((d) => (
              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ratings</SelectItem>
            {[5, 4, 3, 2, 1].map((n) => <SelectItem key={n} value={String(n)}>{n} Stars</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 flex items-start gap-3">
                <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-3">
            <Inbox className="w-12 h-12 text-muted-foreground/50" />
            <p>No reviews found</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {paginated.map((r) => (
                <motion.div key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                        <Star className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm">{r.profiles?.full_name || r.profiles?.email}</p>
                          <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-1 mb-1">{renderStars(r.rating)}</div>
                        <p className="text-sm text-secondary-foreground">{r.comment}</p>
                        <p className="text-xs text-muted-foreground mt-1">Product: {r.products?.name}</p>
                        <Button variant="link" size="sm" className="h-auto p-0 mt-1 text-xs" onClick={() => setReviewTarget(r)}>
                          <Eye className="w-3 h-3 mr-1" /> View Full Review
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {r.is_hidden ? <Badge variant="secondary">Hidden</Badge>
                      : r.is_approved ? <Badge variant="default">Approved</Badge>
                      : <Badge variant="secondary">Pending</Badge>}
                      {!r.is_approved && !r.is_hidden && (
                        <Button size="sm" className="gap-1" onClick={() => approveReview(r.id)} aria-label={`Approve review by ${r.profiles?.full_name || r.profiles?.email || 'customer'}`}><Check aria-hidden="true" className="w-4 h-4" /></Button>
                      )}
                      {!r.is_hidden && (
                        <Button size="sm" variant="outline" className="border-warning/30 text-warning hover:bg-warning/10" onClick={() => hideReview(r.id)} aria-label={`Hide review by ${r.profiles?.full_name || r.profiles?.email || 'customer'}`}><EyeOff aria-hidden="true" className="w-4 h-4" /></Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(r)} aria-label={`Delete review by ${r.profiles?.full_name || r.profiles?.email || 'customer'}`}><Trash2 aria-hidden="true" className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="p-4" />
          </>
        )}
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Review</DialogTitle><DialogDescription>Delete this review? Cannot be undone.</DialogDescription></DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteReview}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewTarget} onOpenChange={() => setReviewTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Full Review</DialogTitle>
          </DialogHeader>
          {reviewTarget && (
            <div className="space-y-4">
              <p className="text-sm font-medium">Product: {reviewTarget.products?.name}</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{reviewTarget.profiles?.full_name || reviewTarget.profiles?.email}</p>
                <span className="text-xs text-muted-foreground">{formatDate(reviewTarget.created_at)}</span>
              </div>
              <div className="flex items-center gap-1">{renderStars(reviewTarget.rating)}</div>
              <p className="text-sm text-secondary-foreground whitespace-pre-wrap">{reviewTarget.comment}</p>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setReviewTarget(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
