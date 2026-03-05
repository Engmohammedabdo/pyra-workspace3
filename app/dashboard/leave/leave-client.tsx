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
import {
  CalendarOff, Plus, CheckCircle, XCircle, Sun, Stethoscope, UserCircle, Trash2
} from 'lucide-react';
import type { AuthSession } from '@/lib/auth/guards';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  approved: 'bg-green-500/10 text-green-600 dark:text-green-400',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
};
const STATUS_LABELS: Record<string, string> = { pending: 'معلق', approved: 'موافق عليه', rejected: 'مرفوض' };
const TYPE_LABELS: Record<string, string> = { annual: 'سنوية', sick: 'مرضية', personal: 'شخصية' };
const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = { annual: Sun, sick: Stethoscope, personal: UserCircle };

interface LeaveRequest {
  id: string;
  username: string;
  type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

interface LeaveBalance {
  annual_total: number;
  annual_used: number;
  sick_total: number;
  sick_used: number;
  personal_total: number;
  personal_used: number;
}

interface LeaveClientProps { session: AuthSession; }

export default function LeaveClient({ session }: LeaveClientProps) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formType, setFormType] = useState('annual');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formReason, setFormReason] = useState('');

  const canApprove = hasPermission(session.pyraUser.rolePermissions, 'leave.approve');
  const canManage = hasPermission(session.pyraUser.rolePermissions, 'leave.manage');

  const fetchData = useCallback(async () => {
    try {
      const [reqRes, balRes] = await Promise.all([
        fetch('/api/leave'),
        fetch('/api/leave/balance'),
      ]);
      if (reqRes.ok) { const { data } = await reqRes.json(); setRequests(data || []); }
      if (balRes.ok) { const { data } = await balRes.json(); setBalance(data); }
    } catch {
      // Silently handle network errors
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const submitRequest = async () => {
    if (!formStart || !formEnd) return;
    setSaving(true);
    try {
      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: formType, start_date: formStart, end_date: formEnd, reason: formReason }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'Failed');
      }
      toast.success('تم تقديم طلب الإجازة');
      setShowCreate(false);
      setFormStart(''); setFormEnd(''); setFormReason('');
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'فشل تقديم الطلب';
      toast.error(message);
    } finally { setSaving(false); }
  };

  const reviewRequest = async (id: string, status: string) => {
    try {
      await fetch(`/api/leave/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      toast.success(status === 'approved' ? 'تمت الموافقة' : 'تم الرفض');
      fetchData();
    } catch { toast.error('فشل العملية'); }
  };

  const cancelRequest = async (id: string) => {
    try {
      await fetch(`/api/leave/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      toast.success('تم إلغاء الطلب');
      fetchData();
    } catch { toast.error('فشل الإلغاء'); }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  const balanceCards = [
    { type: 'annual', label: 'إجازة سنوية', icon: Sun, total: balance?.annual_total || 30, used: balance?.annual_used || 0, color: 'orange' },
    { type: 'sick', label: 'إجازة مرضية', icon: Stethoscope, total: balance?.sick_total || 15, used: balance?.sick_used || 0, color: 'blue' },
    { type: 'personal', label: 'إجازة شخصية', icon: UserCircle, total: balance?.personal_total || 5, used: balance?.personal_used || 0, color: 'purple' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">الإجازات</h1>
          <p className="text-sm text-muted-foreground">{requests.length} طلب</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="h-4 w-4 me-2" />
              طلب إجازة
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>طلب إجازة جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">نوع الإجازة</label>
                <select value={formType} onChange={(e) => setFormType(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="annual">سنوية</option>
                  <option value="sick">مرضية</option>
                  <option value="personal">شخصية</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">من تاريخ</label>
                  <Input type="date" value={formStart} onChange={(e) => setFormStart(e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">إلى تاريخ</label>
                  <Input type="date" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} dir="ltr" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">السبب (اختياري)</label>
                <Input value={formReason} onChange={(e) => setFormReason(e.target.value)} placeholder="سبب الإجازة..." />
              </div>
              <Button onClick={submitRequest} disabled={saving || !formStart || !formEnd} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
                {saving ? 'جاري التقديم...' : 'تقديم الطلب'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {balanceCards.map((b) => {
          const Icon = b.icon;
          const remaining = b.total - b.used;
          const pct = b.total > 0 ? (b.used / b.total) * 100 : 0;
          return (
            <Card key={b.type}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-10 w-10 rounded-lg bg-${b.color}-500/10 flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 text-${b.color}-500`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{b.label}</p>
                    <p className="text-xs text-muted-foreground">{remaining} يوم متبقي من {b.total}</p>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full bg-${b.color}-500 transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Requests List */}
      {requests.length === 0 ? (
        <EmptyState icon={CalendarOff} title="لا توجد طلبات إجازة" description="يمكنك تقديم طلب إجازة جديد" actionLabel="طلب إجازة" onAction={() => setShowCreate(true)} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {requests.map((req) => {
                const TypeIcon = TYPE_ICONS[req.type] || CalendarOff;
                return (
                  <div key={req.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                        <TypeIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{TYPE_LABELS[req.type] || req.type}</p>
                          <span className="text-xs text-muted-foreground">({req.days_count} يوم)</span>
                        </div>
                        <p className="text-xs text-muted-foreground" dir="ltr">
                          {req.start_date} &rarr; {req.end_date}
                        </p>
                        {req.reason && <p className="text-xs text-muted-foreground mt-0.5">{req.reason}</p>}
                        {canManage && req.username !== session.pyraUser.username && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">مقدم من: {req.username}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${STATUS_STYLES[req.status]}`}>
                        {STATUS_LABELS[req.status]}
                      </Badge>
                      {req.status === 'pending' && req.username === session.pyraUser.username && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => cancelRequest(req.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canApprove && req.status === 'pending' && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600" onClick={() => reviewRequest(req.id, 'approved')}>
                            <CheckCircle className="h-3 w-3 me-1" />
                            موافقة
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" onClick={() => reviewRequest(req.id, 'rejected')}>
                            <XCircle className="h-3 w-3 me-1" />
                            رفض
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
