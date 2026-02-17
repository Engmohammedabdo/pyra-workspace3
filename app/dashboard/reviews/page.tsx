'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { MessageSquare, Search, Check, Trash2 } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import { toast } from 'sonner';

interface Review {
  id: string;
  file_path: string;
  username: string;
  display_name: string;
  type: 'comment' | 'approval';
  text: string;
  resolved: boolean;
  parent_id: string | null;
  created_at: string;
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchPath, setSearchPath] = useState('');
  const [debouncedPath, setDebouncedPath] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<Review | null>(null);
  const [saving, setSaving] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPath(searchPath), 350);
    return () => clearTimeout(timer);
  }, [searchPath]);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedPath) params.set('path', debouncedPath);
      const res = await fetch(`/api/reviews?${params}`);
      const json = await res.json();
      if (json.data) setReviews(json.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [debouncedPath]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  const toggleResolve = async (id: string) => {
    try {
      const review = reviews.find(r => r.id === id);
      if (!review) return;
      await fetch(`/api/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: !review.resolved }),
      });
      setReviews(prev => prev.map(r => r.id === id ? { ...r, resolved: !r.resolved } : r));
    } catch (err) { console.error(err); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reviews/${selected.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowDelete(false);
      toast.success('تم حذف المراجعة');
      fetchReviews();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  // Group by file_path
  const grouped = reviews.reduce<Record<string, Review[]>>((acc, r) => {
    if (!acc[r.file_path]) acc[r.file_path] = [];
    acc[r.file_path].push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><MessageSquare className="h-6 w-6" /> المراجعات</h1>
        <p className="text-muted-foreground">مراجعات وتعليقات الملفات</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="فلترة حسب مسار الملف..." value={searchPath} onChange={e => setSearchPath(e.target.value)} className="ps-9" dir="ltr" />
      </div>

      {loading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">لا توجد مراجعات</CardContent></Card>
      ) : (
        <ScrollArea className="max-h-[600px]">
          <div className="space-y-4">
            {Object.entries(grouped).map(([path, items]) => (
              <Card key={path}>
                <CardContent className="p-4">
                  <div className="text-xs font-mono text-muted-foreground mb-3 truncate" dir="ltr">{path}</div>
                  <div className="space-y-3">
                    {items.map(r => (
                      <div key={r.id} className={`rounded-lg border p-3 ${r.resolved ? 'opacity-60' : ''} ${r.parent_id ? 'ms-6' : ''}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{r.display_name}</span>
                            <Badge variant={r.type === 'approval' ? 'default' : 'secondary'} className="text-[10px]">
                              {r.type === 'approval' ? 'موافقة' : 'تعليق'}
                            </Badge>
                            {r.resolved && <Badge variant="outline" className="text-[10px] text-green-600">محلول</Badge>}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleResolve(r.id)} title={r.resolved ? 'إلغاء الحل' : 'تحديد كمحلول'}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { setSelected(r); setShowDelete(true); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm mt-1">{r.text}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{formatRelativeDate(r.created_at)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>حذف المراجعة</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-4">هل أنت متأكد من حذف هذه المراجعة؟</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>{saving ? 'جارٍ الحذف...' : 'حذف'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
