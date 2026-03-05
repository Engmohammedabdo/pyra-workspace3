'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { hasPermission } from '@/lib/auth/rbac';
import {
  Clock, Plus, Send, CheckCircle, XCircle, Trash2, Briefcase,
} from 'lucide-react';
import type { AuthSession } from '@/lib/auth/guards';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  submitted: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  approved: 'bg-green-500/10 text-green-600 dark:text-green-400',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  submitted: 'مرسل',
  approved: 'معتمد',
  rejected: 'مرفوض',
};

interface TimesheetEntry {
  id: string;
  username: string;
  project_id: string | null;
  task_id: string | null;
  date: string;
  hours: number;
  description: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  pyra_projects: { id: string; name: string } | null;
}

interface Project {
  id: string;
  name: string;
}

interface TimesheetClientProps {
  session: AuthSession;
}

export default function TimesheetClient({ session }: TimesheetClientProps) {
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formHours, setFormHours] = useState('');
  const [formProject, setFormProject] = useState('');
  const [formDesc, setFormDesc] = useState('');

  const canManage = hasPermission(session.pyraUser.rolePermissions, 'timesheet.manage');
  const canApprove = hasPermission(session.pyraUser.rolePermissions, 'timesheet.approve');

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/timesheet');
      if (res.ok) {
        const { data } = await res.json();
        setEntries(data || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
    // Fetch projects for dropdown
    fetch('/api/projects')
      .then((r) => r.json())
      .then(({ data }) => setProjects(data || []))
      .catch(() => {});
  }, [fetchEntries]);

  const addEntry = async () => {
    if (!formDate || !formHours) return;
    setSaving(true);
    try {
      const res = await fetch('/api/timesheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: formDate,
          hours: parseFloat(formHours),
          project_id: formProject || null,
          description: formDesc || null,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('تم إضافة السجل');
      setShowAdd(false);
      setFormHours('');
      setFormDesc('');
      setFormProject('');
      fetchEntries();
    } catch {
      toast.error('فشل الإضافة');
    } finally {
      setSaving(false);
    }
  };

  const submitEntry = async (id: string) => {
    try {
      await fetch(`/api/timesheet/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'submitted' }),
      });
      toast.success('تم إرسال السجل للاعتماد');
      fetchEntries();
    } catch {
      toast.error('فشل الإرسال');
    }
  };

  const approveEntry = async (id: string, approved: boolean) => {
    try {
      await fetch(`/api/timesheet/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: approved ? 'approved' : 'rejected' }),
      });
      toast.success(approved ? 'تم اعتماد السجل' : 'تم رفض السجل');
      fetchEntries();
    } catch {
      toast.error('فشل العملية');
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      await fetch(`/api/timesheet/${id}`, { method: 'DELETE' });
      toast.success('تم الحذف');
      fetchEntries();
    } catch {
      toast.error('فشل الحذف');
    }
  };

  const totalHours = useMemo(
    () => entries.reduce((sum, e) => sum + (e.hours || 0), 0),
    [entries]
  );

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">سجل ساعات العمل</h1>
          <p className="text-sm text-muted-foreground">
            {entries.length} سجل &middot; إجمالي {totalHours.toFixed(1)} ساعة
          </p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="h-4 w-4 me-2" />
              تسجيل ساعات
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تسجيل ساعات عمل</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">التاريخ</label>
                  <Input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">الساعات</label>
                  <Input
                    type="number"
                    min="0.5"
                    max="24"
                    step="0.5"
                    value={formHours}
                    onChange={(e) => setFormHours(e.target.value)}
                    placeholder="مثال: 8"
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">المشروع (اختياري)</label>
                <select
                  value={formProject}
                  onChange={(e) => setFormProject(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">بدون مشروع</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">ملاحظات</label>
                <Input
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="ما الذي عملت عليه؟"
                />
              </div>
              <Button
                onClick={addEntry}
                disabled={saving || !formHours}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">إجمالي الساعات</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {entries.filter((e) => e.status === 'approved').length}
              </p>
              <p className="text-xs text-muted-foreground">معتمد</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Send className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {entries.filter((e) => e.status === 'submitted').length}
              </p>
              <p className="text-xs text-muted-foreground">بانتظار الاعتماد</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Entries List */}
      {entries.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="لا توجد سجلات"
          description="ابدأ بتسجيل ساعات عملك"
          actionLabel="تسجيل ساعات"
          onAction={() => setShowAdd(true)}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[60px]">
                      <p className="text-lg font-bold" dir="ltr">
                        {entry.hours}h
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(entry.date).toLocaleDateString('ar-EG', {
                          weekday: 'short',
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {entry.description || 'بدون وصف'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className="text-xs text-muted-foreground"
                          dir="ltr"
                        >
                          {entry.date}
                        </span>
                        {entry.pyra_projects && (
                          <Badge variant="secondary" className="text-[10px]">
                            <Briefcase className="h-3 w-3 me-1" />
                            {entry.pyra_projects.name}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] ${STATUS_STYLES[entry.status]}`}>
                      {STATUS_LABELS[entry.status]}
                    </Badge>
                    {entry.status === 'draft' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => submitEntry(entry.id)}
                        >
                          <Send className="h-3 w-3 me-1" />
                          إرسال
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-500"
                          onClick={() => deleteEntry(entry.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {canApprove && entry.status === 'submitted' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-green-600"
                          onClick={() => approveEntry(entry.id, true)}
                        >
                          <CheckCircle className="h-3 w-3 me-1" />
                          اعتماد
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-500"
                          onClick={() => approveEntry(entry.id, false)}
                        >
                          <XCircle className="h-3 w-3 me-1" />
                          رفض
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
