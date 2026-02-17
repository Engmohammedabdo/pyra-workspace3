'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Trash2, RotateCcw, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { formatFileSize, formatDate, formatRelativeDate } from '@/lib/utils/format';
import { toast } from 'sonner';

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

export default function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPurge, setShowPurge] = useState(false);
  const [showEmptyAll, setShowEmptyAll] = useState(false);
  const [selected, setSelected] = useState<TrashItem | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchTrash = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trash');
      const json = await res.json();
      if (json.data) setItems(json.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTrash(); }, [fetchTrash]);

  const restore = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/trash/${id}`, { method: 'POST' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      toast.success('تم استعادة الملف');
      fetchTrash();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  const purge = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/trash/${selected.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowPurge(false);
      toast.success('تم الحذف النهائي');
      fetchTrash();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  const emptyAll = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/trash/empty', { method: 'POST' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowEmptyAll(false);
      toast.success(`تم تفريغ السلة — ${json.data?.purged || 0} ملف`);
      fetchTrash();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  const purgeExpired = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/trash/purge-expired', { method: 'POST' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      const purged = json.data?.purged || 0;
      if (purged === 0) { toast.info('لا توجد ملفات منتهية الصلاحية'); }
      else { toast.success(`تم حذف ${purged} ملف منتهي الصلاحية`); }
      fetchTrash();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Trash2 className="h-6 w-6" /> المحذوفات</h1>
          <p className="text-muted-foreground">الملفات المحذوفة — يتم حذفها نهائياً بعد 30 يوماً تلقائياً</p>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={purgeExpired} disabled={saving}>
              <Clock className="h-4 w-4 me-1" /> حذف المنتهية
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setShowEmptyAll(true)} disabled={saving}>
              <XCircle className="h-4 w-4 me-1" /> تفريغ السلة
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
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
                  <tr key={i} className="border-b">{Array.from({ length: 7 }).map((_, j) => <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>)}</tr>
                )) : items.length === 0 ? (
                  <tr><td colSpan={7} className="p-12 text-center text-muted-foreground">سلة المحذوفات فارغة</td></tr>
                ) : items.map(item => (
                  <tr key={item.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{item.file_name}</td>
                    <td className="p-3 text-muted-foreground text-xs font-mono truncate max-w-[200px]">{item.original_path}</td>
                    <td className="p-3 text-muted-foreground">{formatFileSize(item.file_size)}</td>
                    <td className="p-3 text-muted-foreground">{item.deleted_by_display}</td>
                    <td className="p-3 text-muted-foreground text-xs">{formatRelativeDate(item.deleted_at)}</td>
                    <td className="p-3"><Badge variant="outline" className="text-xs">{formatDate(item.auto_purge_at)}</Badge></td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => restore(item.id)} disabled={saving} title="استعادة"><RotateCcw className="h-4 w-4" /></Button>
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
            <Button variant="destructive" onClick={emptyAll} disabled={saving}>{saving ? 'جارٍ التفريغ...' : 'تفريغ السلة'}</Button>
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
            <Button variant="destructive" onClick={purge} disabled={saving}>{saving ? 'جارٍ الحذف...' : 'حذف نهائي'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
