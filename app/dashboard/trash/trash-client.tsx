'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Trash2, RotateCcw, AlertTriangle, XCircle, Clock, Search, Filter } from 'lucide-react';
import { formatFileSize, formatDate, formatRelativeDate } from '@/lib/utils/format';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';

interface TrashItem {
  id: string;
  original_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  deleted_by_display: string;
  deleted_at: string;
  auto_purge_at: string;
}

export default function TrashClient() {
  const queryClient = useQueryClient();
  const [showPurge, setShowPurge] = useState(false);
  const [showEmptyAll, setShowEmptyAll] = useState(false);
  const [showPurgeExpired, setShowPurgeExpired] = useState(false);
  const [selected, setSelected] = useState<TrashItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const { data: items = [], isLoading: loading } = useQuery<TrashItem[]>({
    queryKey: ['trash'],
    queryFn: () => fetchAPI('/api/trash'),
    staleTime: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['trash'] });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => mutateAPI(`/api/trash/${id}`, 'POST'),
    onSuccess: () => { toast.success('تم استعادة الملف'); invalidate(); },
    onError: () => toast.error('حدث خطأ'),
  });

  const purgeMutation = useMutation({
    mutationFn: (id: string) => mutateAPI(`/api/trash/${id}`, 'DELETE'),
    onSuccess: () => { setShowPurge(false); toast.success('تم الحذف النهائي'); invalidate(); },
    onError: () => toast.error('حدث خطأ'),
  });

  const emptyAllMutation = useMutation({
    mutationFn: () => mutateAPI<{ purged?: number }>('/api/trash/empty', 'POST'),
    onSuccess: (data) => { setShowEmptyAll(false); toast.success(`تم تفريغ السلة — ${(data as any).purged || 0} ملف`); invalidate(); },
    onError: () => toast.error('حدث خطأ'),
  });

  const purgeExpiredMutation = useMutation({
    mutationFn: () => mutateAPI<{ purged?: number }>('/api/trash/purge-expired', 'POST'),
    onSuccess: (data) => {
      const purged = (data as any).purged || 0;
      if (purged === 0) { toast.info('لا توجد ملفات منتهية الصلاحية'); }
      else { toast.success(`تم حذف ${purged} ملف منتهي الصلاحية`); }
      setShowPurgeExpired(false);
      invalidate();
    },
    onError: () => toast.error('حدث خطأ'),
  });

  const saving = restoreMutation.isPending || purgeMutation.isPending || emptyAllMutation.isPending || purgeExpiredMutation.isPending;

  // Filter items based on search and type
  const filteredItems = useMemo(() => {
    let result = items;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (item) =>
          item.file_name.toLowerCase().includes(q) ||
          item.original_path.toLowerCase().includes(q)
      );
    }

    if (typeFilter !== 'all') {
      result = result.filter((item) => {
        const mime = item.mime_type || '';
        switch (typeFilter) {
          case 'image': return mime.startsWith('image/');
          case 'video': return mime.startsWith('video/');
          case 'document': return mime.startsWith('text/') || mime === 'application/pdf' || mime.includes('document') || mime.includes('spreadsheet');
          case 'archive': return mime.includes('zip') || mime.includes('rar') || mime.includes('tar') || mime.includes('compress');
          default: return true;
        }
      });
    }

    return result;
  }, [items, searchQuery, typeFilter]);

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (checkedIds.size === filteredItems.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const batchRestore = async () => {
    if (checkedIds.size === 0) return;
    let successCount = 0;
    for (const id of checkedIds) {
      try {
        await restoreMutation.mutateAsync(id);
        successCount++;
      } catch { /* continue */ }
    }
    toast.success(`تم استعادة ${successCount} ملف`);
    setCheckedIds(new Set());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Trash2 className="h-6 w-6" aria-hidden="true" /> المحذوفات</h1>
          <p className="text-muted-foreground">الملفات المحذوفة — يتم حذفها نهائياً بعد 30 يوماً تلقائياً</p>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowPurgeExpired(true)} disabled={saving}>
              <Clock className="h-4 w-4 me-1" /> حذف المنتهية
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setShowEmptyAll(true)} disabled={saving}>
              <XCircle className="h-4 w-4 me-1" /> تفريغ السلة
            </Button>
          </div>
        )}
      </div>

      {/* Search + Filter Bar */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو المسار..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ps-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]">
              <Filter className="h-4 w-4 me-2 text-muted-foreground" />
              <SelectValue placeholder="النوع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="image">صور</SelectItem>
              <SelectItem value="video">فيديو</SelectItem>
              <SelectItem value="document">مستندات</SelectItem>
              <SelectItem value="archive">أرشيف</SelectItem>
            </SelectContent>
          </Select>
          {checkedIds.size > 0 && (
            <Button variant="outline" size="sm" onClick={batchRestore} disabled={saving}>
              <RotateCcw className="h-4 w-4 me-1" />
              استعادة المحدد ({checkedIds.size})
            </Button>
          )}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 w-10">
                    {filteredItems.length > 0 && (
                      <Checkbox
                        checked={checkedIds.size === filteredItems.length && filteredItems.length > 0}
                        onCheckedChange={toggleSelectAll}
                        aria-label="تحديد الكل"
                      />
                    )}
                  </th>
                  <th className="text-start p-3 font-medium">الملف</th>
                  <th className="text-start p-3 font-medium">المسار الأصلي</th>
                  <th className="text-start p-3 font-medium">الحجم</th>
                  <th className="text-start p-3 font-medium">حُذف بواسطة</th>
                  <th className="text-start p-3 font-medium">تاريخ الحذف</th>
                  <th className="text-start p-3 font-medium">الحذف التلقائي</th>
                  <th className="text-start p-3 font-medium w-[100px]"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">{Array.from({ length: 8 }).map((_, j) => <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>)}</tr>
                )) : filteredItems.length === 0 ? (
                  <tr><td colSpan={8}>
                    <EmptyState
                      icon={Trash2}
                      title={items.length === 0 ? 'سلة المحذوفات فارغة' : 'لا توجد نتائج'}
                      description={items.length === 0 ? 'الملفات المحذوفة ستظهر هنا' : 'جرّب تغيير كلمة البحث أو الفلتر'}
                    />
                  </td></tr>
                ) : filteredItems.map(item => (
                  <tr key={item.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <Checkbox
                        checked={checkedIds.has(item.id)}
                        onCheckedChange={() => toggleCheck(item.id)}
                        aria-label={`تحديد ${item.file_name}`}
                      />
                    </td>
                    <td className="p-3 font-medium">{item.file_name}</td>
                    <td className="p-3 text-muted-foreground text-xs font-mono truncate max-w-[200px]">{item.original_path}</td>
                    <td className="p-3 text-muted-foreground">{formatFileSize(item.file_size)}</td>
                    <td className="p-3 text-muted-foreground">{item.deleted_by_display}</td>
                    <td className="p-3 text-muted-foreground text-xs">{formatRelativeDate(item.deleted_at)}</td>
                    <td className="p-3"><Badge variant="outline" className="text-xs">{formatDate(item.auto_purge_at)}</Badge></td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => restoreMutation.mutate(item.id)} disabled={saving} title="استعادة"><RotateCcw className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setSelected(item); setShowPurge(true); }} title="حذف نهائي"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Empty All Dialog */}
      <Dialog open={showEmptyAll} onOpenChange={setShowEmptyAll}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /> تفريغ السلة بالكامل</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            هل أنت متأكد من حذف <strong>جميع الملفات ({items.length})</strong> نهائياً من السلة؟<br />
            <span className="text-destructive">هذا الإجراء لا يمكن التراجع عنه.</span>
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmptyAll(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => emptyAllMutation.mutate()} disabled={saving}>{saving ? 'جارٍ التفريغ...' : 'تفريغ السلة'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Purge Dialog */}
      <Dialog open={showPurge} onOpenChange={setShowPurge}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /> حذف نهائي</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            هل أنت متأكد من الحذف النهائي لـ <strong>{selected?.file_name}</strong>؟<br />
            <span className="text-destructive">هذا الإجراء لا يمكن التراجع عنه.</span>
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurge(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => selected && purgeMutation.mutate(selected.id)} disabled={saving}>{saving ? 'جارٍ الحذف...' : 'حذف نهائي'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purge Expired Dialog */}
      <Dialog open={showPurgeExpired} onOpenChange={setShowPurgeExpired}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-orange-500" /> حذف الملفات المنتهية</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            سيتم حذف جميع الملفات التي تجاوزت مدة 30 يوماً في السلة نهائياً.<br />
            <span className="text-destructive">هذا الإجراء لا يمكن التراجع عنه.</span>
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurgeExpired(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => purgeExpiredMutation.mutate()} disabled={saving}>{saving ? 'جارٍ الحذف...' : 'حذف المنتهية'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
