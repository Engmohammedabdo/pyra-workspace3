'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Clock,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  Bell,
  Pencil,
  Plus,
  X,
  CalendarClock,
} from 'lucide-react';

interface FollowUp {
  id: string;
  lead_id: string;
  quote_id?: string;
  title?: string;
  notes?: string;
  due_at: string;
  status: string;
  assigned_to?: string;
  completed_at?: string;
  created_at: string;
}

const containerMotion = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemMotion = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'completed' | 'cancelled' | 'all'>('pending');
  const [editItem, setEditItem] = useState<FollowUp | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDueAt, setEditDueAt] = useState('');

  // Create form
  const [createTitle, setCreateTitle] = useState('');
  const [createNotes, setCreateNotes] = useState('');
  const [createDueAt, setCreateDueAt] = useState('');
  const [createLeadId, setCreateLeadId] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      const res = await fetch(`/api/dashboard/sales/follow-ups?${params}`);
      const data = await res.json();
      setFollowUps(data.data || []);
    } catch {
      console.error('Failed to fetch follow-ups');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleComplete(id: string) {
    try {
      const res = await fetch('/api/dashboard/sales/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'completed' }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم إكمال المتابعة');
      fetchData();
    } catch {
      toast.error('فشل تحديث المتابعة');
    }
  }

  async function handleCancel(id: string) {
    try {
      const res = await fetch('/api/dashboard/sales/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'cancelled' }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم إلغاء المتابعة');
      fetchData();
    } catch {
      toast.error('فشل تحديث المتابعة');
    }
  }

  function openEdit(fu: FollowUp) {
    setEditItem(fu);
    setEditTitle(fu.title || '');
    setEditNotes(fu.notes || '');
    setEditDueAt(fu.due_at ? fu.due_at.slice(0, 16) : '');
    setEditDialogOpen(true);
  }

  async function handleSaveEdit() {
    if (!editItem) return;
    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/sales/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editItem.id,
          title: editTitle || null,
          notes: editNotes || null,
          due_at: editDueAt ? new Date(editDueAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم تحديث المتابعة');
      setEditDialogOpen(false);
      fetchData();
    } catch {
      toast.error('فشل تحديث المتابعة');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!createLeadId || !createDueAt) {
      toast.error('يرجى إدخال معرف العميل المحتمل وتاريخ المتابعة');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/sales/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: createLeadId,
          title: createTitle || null,
          notes: createNotes || null,
          due_at: new Date(createDueAt).toISOString(),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم إنشاء المتابعة');
      setCreateDialogOpen(false);
      setCreateTitle('');
      setCreateNotes('');
      setCreateDueAt('');
      setCreateLeadId('');
      fetchData();
    } catch {
      toast.error('فشل إنشاء المتابعة');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-8 w-32" />
        </div>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
    );
  }

  const now = new Date();
  const overdue = followUps.filter(f => f.status === 'pending' && new Date(f.due_at) < now);
  const upcoming = followUps.filter(f => f.status === 'pending' && new Date(f.due_at) >= now);
  const completed = followUps.filter(f => f.status === 'completed');
  const cancelled = followUps.filter(f => f.status === 'cancelled');

  // Stats
  const todayStr = now.toISOString().slice(0, 10);
  const todayCount = followUps.filter(f => f.status === 'pending' && f.due_at.slice(0, 10) === todayStr).length;

  return (
    <motion.div
      variants={containerMotion}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemMotion} className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Bell className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">المتابعات</h1>
            <p className="text-sm text-muted-foreground">
              {overdue.length > 0 && <span className="text-red-500 font-medium">{overdue.length} متأخرة</span>}
              {overdue.length > 0 && (upcoming.length > 0 || todayCount > 0) && ' • '}
              {todayCount > 0 && <span className="text-orange-500 font-medium">{todayCount} اليوم</span>}
              {todayCount > 0 && upcoming.length > 0 && ' • '}
              {upcoming.length > 0 && <span>{upcoming.length} قادمة</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md shadow-orange-500/20"
          >
            <Plus className="h-4 w-4 me-1.5" />
            متابعة جديدة
          </Button>
          <Select value={filter} onValueChange={v => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-36 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">المعلقة</SelectItem>
              <SelectItem value="completed">المكتملة</SelectItem>
              <SelectItem value="cancelled">الملغاة</SelectItem>
              <SelectItem value="all">الكل</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={itemMotion} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="متأخرة" count={overdue.length} color="red" icon={AlertTriangle} />
        <SummaryCard label="اليوم" count={todayCount} color="orange" icon={CalendarClock} />
        <SummaryCard label="قادمة" count={upcoming.length} color="blue" icon={Calendar} />
        <SummaryCard label="مكتملة" count={completed.length} color="emerald" icon={CheckCircle2} />
      </motion.div>

      {followUps.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="لا توجد متابعات"
          description="ستظهر المتابعات هنا عند إنشائها من صفحة العميل المحتمل"
        />
      ) : (
        <div className="space-y-8">
          {/* Overdue Section */}
          {overdue.length > 0 && filter !== 'completed' && filter !== 'cancelled' && (
            <motion.div variants={itemMotion} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
                  <AlertTriangle className="h-3.5 w-3.5 text-white" />
                </div>
                <h2 className="font-bold text-sm text-red-600 dark:text-red-400">متأخرة ({overdue.length})</h2>
              </div>
              {overdue.map(fu => (
                <FollowUpCard key={fu.id} followUp={fu} onComplete={handleComplete} onCancel={handleCancel} onEdit={openEdit} isOverdue />
              ))}
            </motion.div>
          )}

          {/* Upcoming Section */}
          {upcoming.length > 0 && filter !== 'completed' && filter !== 'cancelled' && (
            <motion.div variants={itemMotion} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Calendar className="h-3.5 w-3.5 text-white" />
                </div>
                <h2 className="font-bold text-sm text-blue-600 dark:text-blue-400">قادمة ({upcoming.length})</h2>
              </div>
              {upcoming.map(fu => (
                <FollowUpCard key={fu.id} followUp={fu} onComplete={handleComplete} onCancel={handleCancel} onEdit={openEdit} />
              ))}
            </motion.div>
          )}

          {/* Completed Section */}
          {completed.length > 0 && (filter === 'completed' || filter === 'all') && (
            <motion.div variants={itemMotion} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
                  <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                </div>
                <h2 className="font-bold text-sm text-emerald-600 dark:text-emerald-400">مكتملة ({completed.length})</h2>
              </div>
              {completed.map(fu => (
                <FollowUpCard key={fu.id} followUp={fu} onComplete={handleComplete} onCancel={handleCancel} onEdit={openEdit} />
              ))}
            </motion.div>
          )}

          {/* Cancelled Section */}
          {cancelled.length > 0 && (filter === 'cancelled' || filter === 'all') && (
            <motion.div variants={itemMotion} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center">
                  <X className="h-3.5 w-3.5 text-white" />
                </div>
                <h2 className="font-bold text-sm text-muted-foreground">ملغاة ({cancelled.length})</h2>
              </div>
              {cancelled.map(fu => (
                <FollowUpCard key={fu.id} followUp={fu} onComplete={handleComplete} onCancel={handleCancel} onEdit={openEdit} />
              ))}
            </motion.div>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل المتابعة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="عنوان المتابعة..."
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>تاريخ الاستحقاق</Label>
              <Input
                type="datetime-local"
                value={editDueAt}
                onChange={e => setEditDueAt(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="ملاحظات إضافية..."
                className="rounded-xl resize-none"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditDialogOpen(false)} className="rounded-xl">
                إلغاء
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={saving}
                className="rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>متابعة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>معرف العميل المحتمل (Lead ID)</Label>
              <Input
                value={createLeadId}
                onChange={e => setCreateLeadId(e.target.value)}
                placeholder="مثال: ld_abc123"
                className="rounded-xl"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input
                value={createTitle}
                onChange={e => setCreateTitle(e.target.value)}
                placeholder="عنوان المتابعة..."
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>تاريخ الاستحقاق</Label>
              <Input
                type="datetime-local"
                value={createDueAt}
                onChange={e => setCreateDueAt(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={createNotes}
                onChange={e => setCreateNotes(e.target.value)}
                placeholder="ملاحظات إضافية..."
                className="rounded-xl resize-none"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setCreateDialogOpen(false)} className="rounded-xl">
                إلغاء
              </Button>
              <Button
                onClick={handleCreate}
                disabled={saving || !createLeadId || !createDueAt}
                className="rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white"
              >
                {saving ? 'جاري الإنشاء...' : 'إنشاء'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function SummaryCard({ label, count, color, icon: Icon }: {
  label: string;
  count: number;
  color: string;
  icon: React.ElementType;
}) {
  const colorMap: Record<string, string> = {
    red: 'from-red-500/10 to-red-500/5 dark:from-red-500/15 dark:to-red-500/5 text-red-600 dark:text-red-400',
    orange: 'from-orange-500/10 to-orange-500/5 dark:from-orange-500/15 dark:to-orange-500/5 text-orange-600 dark:text-orange-400',
    blue: 'from-blue-500/10 to-blue-500/5 dark:from-blue-500/15 dark:to-blue-500/5 text-blue-600 dark:text-blue-400',
    emerald: 'from-emerald-500/10 to-emerald-500/5 dark:from-emerald-500/15 dark:to-emerald-500/5 text-emerald-600 dark:text-emerald-400',
  };

  return (
    <div className={cn(
      'rounded-2xl bg-gradient-to-br p-4 border border-border/30',
      colorMap[color]
    )}>
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 opacity-60" />
        <span className="text-2xl font-bold">{count}</span>
      </div>
      <p className="text-xs mt-1 opacity-70">{label}</p>
    </div>
  );
}

function FollowUpCard({
  followUp,
  onComplete,
  onCancel,
  onEdit,
  isOverdue,
}: {
  followUp: FollowUp;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onEdit: (fu: FollowUp) => void;
  isOverdue?: boolean;
}) {
  const dueDate = new Date(followUp.due_at);
  const isToday = dueDate.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={cn(
        'border-0 shadow-md shadow-black/5 dark:shadow-black/15 bg-card/80 backdrop-blur overflow-hidden transition-all hover:shadow-lg',
        isOverdue && 'border-s-[3px] border-s-red-500',
        isToday && !isOverdue && 'border-s-[3px] border-s-orange-500'
      )}>
        <CardContent className="py-4 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <p className="font-semibold text-sm truncate">{followUp.title || 'متابعة'}</p>
              {isOverdue && (
                <Badge className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 border-0">
                  متأخرة
                </Badge>
              )}
              {isToday && !isOverdue && (
                <Badge className="text-[10px] bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 border-0">
                  اليوم
                </Badge>
              )}
              {followUp.quote_id && (
                <Badge variant="outline" className="text-[10px] border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400">
                  عرض سعر
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className={cn(
                'flex items-center gap-1.5',
                isOverdue && 'text-red-500'
              )}>
                <Clock className="h-3 w-3" />
                {formatRelativeDate(followUp.due_at)}
              </span>
              {followUp.assigned_to && (
                <span className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white text-[8px] font-bold">
                    {followUp.assigned_to.charAt(0).toUpperCase()}
                  </div>
                  {followUp.assigned_to}
                </span>
              )}
            </div>
            {followUp.notes && (
              <p className="text-xs text-muted-foreground/70 mt-1.5 truncate">{followUp.notes}</p>
            )}
            <div className="flex items-center gap-3 mt-1.5">
              <Link href={`/dashboard/sales/leads/${followUp.lead_id}`} className="text-[11px] text-orange-500 hover:text-orange-600 hover:underline font-medium">
                عرض العميل المحتمل ←
              </Link>
              {followUp.quote_id && (
                <Link href={`/dashboard/quotes?id=${followUp.quote_id}`} className="text-[11px] text-violet-500 hover:text-violet-600 hover:underline font-medium">
                  عرض السعر ←
                </Link>
              )}
            </div>
          </div>

          {followUp.status === 'pending' && (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onEdit(followUp)}
                className="text-muted-foreground hover:text-foreground rounded-xl h-8 w-8 p-0"
                title="تعديل"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onComplete(followUp.id)}
                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-xl h-8 w-8 p-0"
                title="إكمال"
              >
                <CheckCircle2 className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onCancel(followUp.id)}
                className="text-muted-foreground hover:text-destructive rounded-xl h-8 w-8 p-0"
                title="إلغاء"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {followUp.status === 'completed' && (
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 shrink-0">
              مكتملة
            </Badge>
          )}

          {followUp.status === 'cancelled' && (
            <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400 border-0 shrink-0">
              ملغاة
            </Badge>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
