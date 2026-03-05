'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { hasPermission } from '@/lib/auth/rbac';
import { formatRelativeDate } from '@/lib/utils/format';
import {
  Megaphone, Plus, Pin, Trash2, Edit,
} from 'lucide-react';
import type { AuthSession } from '@/lib/auth/guards';

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: string;
  is_pinned: boolean;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  is_read: boolean;
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-600 border-red-200 dark:border-red-800',
  important: 'bg-orange-500/10 text-orange-600 border-orange-200 dark:border-orange-800',
  normal: 'bg-gray-500/10 text-gray-600 border-gray-200 dark:border-gray-800',
};
const PRIORITY_LABELS: Record<string, string> = { urgent: 'عاجل', important: 'مهم', normal: 'عادي' };

interface AnnouncementsClientProps { session: AuthSession; }

export default function AnnouncementsClient({ session }: AnnouncementsClientProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Announcement | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formPriority, setFormPriority] = useState('normal');
  const [formPinned, setFormPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const canManage = hasPermission(session.pyraUser.rolePermissions, 'announcements.manage');

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await fetch('/api/announcements');
      if (res.ok) {
        const { data } = await res.json();
        setAnnouncements(data || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const markAsRead = async (id: string) => {
    await fetch(`/api/announcements/${id}/read`, { method: 'POST' });
    setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a));
  };

  const saveAnnouncement = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    setSaving(true);
    try {
      const url = editItem ? `/api/announcements/${editItem.id}` : '/api/announcements';
      const method = editItem ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          content: formContent,
          priority: formPriority,
          is_pinned: formPinned,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(editItem ? 'تم تحديث الإعلان' : 'تم نشر الإعلان');
      setShowCreate(false);
      setEditItem(null);
      resetForm();
      fetchAnnouncements();
    } catch {
      toast.error('فشل حفظ الإعلان');
    } finally {
      setSaving(false);
    }
  };

  const deleteAnnouncement = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الإعلان؟')) return;
    try {
      await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
      toast.success('تم حذف الإعلان');
      fetchAnnouncements();
    } catch {
      toast.error('فشل الحذف');
    }
  };

  const resetForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormPriority('normal');
    setFormPinned(false);
  };

  const openEdit = (a: Announcement) => {
    setEditItem(a);
    setFormTitle(a.title);
    setFormContent(a.content);
    setFormPriority(a.priority);
    setFormPinned(a.is_pinned);
    setShowCreate(true);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const unreadCount = announcements.filter(a => !a.is_read).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">الإعلانات</h1>
          <p className="text-sm text-muted-foreground">
            {announcements.length} إعلان{unreadCount > 0 && ` · ${unreadCount} غير مقروء`}
          </p>
        </div>
        {canManage && (
          <Dialog
            open={showCreate}
            onOpenChange={(open) => {
              setShowCreate(open);
              if (!open) {
                setEditItem(null);
                resetForm();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="h-4 w-4 me-2" />
                إعلان جديد
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editItem ? 'تعديل الإعلان' : 'إعلان جديد'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">العنوان</label>
                  <Input
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="عنوان الإعلان..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">المحتوى</label>
                  <textarea
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="محتوى الإعلان..."
                    className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex gap-4">
                  <div className="space-y-2 flex-1">
                    <label className="text-sm font-medium">الأولوية</label>
                    <select
                      value={formPriority}
                      onChange={(e) => setFormPriority(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="normal">عادي</option>
                      <option value="important">مهم</option>
                      <option value="urgent">عاجل</option>
                    </select>
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formPinned}
                        onChange={(e) => setFormPinned(e.target.checked)}
                        className="rounded"
                      />
                      <Pin className="h-4 w-4" />
                      تثبيت
                    </label>
                  </div>
                </div>
                <Button
                  onClick={saveAnnouncement}
                  disabled={saving || !formTitle.trim() || !formContent.trim()}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {saving ? 'جاري الحفظ...' : editItem ? 'تحديث الإعلان' : 'نشر الإعلان'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="لا توجد إعلانات"
          description="لم يتم نشر أي إعلانات بعد"
          actionLabel={canManage ? 'إعلان جديد' : undefined}
          onAction={canManage ? () => setShowCreate(true) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <Card
              key={a.id}
              className={`transition-colors cursor-pointer ${
                !a.is_read ? 'border-s-4 border-s-blue-500 bg-blue-500/5' : ''
              } ${a.is_pinned ? 'border-orange-200 dark:border-orange-800' : ''}`}
              onClick={() => !a.is_read && markAsRead(a.id)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {a.is_pinned && <Pin className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
                      <h3 className="font-semibold">{a.title}</h3>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${PRIORITY_STYLES[a.priority] || PRIORITY_STYLES.normal}`}
                      >
                        {PRIORITY_LABELS[a.priority] || 'عادي'}
                      </Badge>
                      {!a.is_read && (
                        <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                      {a.content}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{a.created_by}</span>
                      <span>{formatRelativeDate(a.created_at)}</span>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(a);
                        }}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteAnnouncement(a.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
