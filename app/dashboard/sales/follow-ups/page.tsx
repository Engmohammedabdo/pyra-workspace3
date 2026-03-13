'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';
import { toast } from 'sonner';
import Link from 'next/link';
import { Clock, CheckCircle2, Calendar, User, AlertTriangle } from 'lucide-react';

interface FollowUp {
  id: string;
  lead_id: string;
  title?: string;
  notes?: string;
  due_at: string;
  status: string;
  assigned_to?: string;
  completed_at?: string;
  created_at: string;
}

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'completed' | 'all'>('pending');

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

  function isOverdue(dueAt: string) {
    return new Date(dueAt) < new Date() && followUps.find(f => f.due_at === dueAt)?.status === 'pending';
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">المتابعات</h1>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    );
  }

  // Split into overdue and upcoming
  const now = new Date();
  const overdue = followUps.filter(f => f.status === 'pending' && new Date(f.due_at) < now);
  const upcoming = followUps.filter(f => f.status === 'pending' && new Date(f.due_at) >= now);
  const completed = followUps.filter(f => f.status === 'completed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">المتابعات</h1>
        <Select value={filter} onValueChange={v => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">المعلقة</SelectItem>
            <SelectItem value="completed">المكتملة</SelectItem>
            <SelectItem value="all">الكل</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {followUps.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="لا توجد متابعات"
          description="ستظهر المتابعات هنا عند إنشائها من صفحة العميل المحتمل"
        />
      ) : (
        <div className="space-y-6">
          {/* Overdue Section */}
          {overdue.length > 0 && filter !== 'completed' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                <h2 className="font-semibold text-sm">متأخرة ({overdue.length})</h2>
              </div>
              {overdue.map(fu => (
                <FollowUpCard key={fu.id} followUp={fu} onComplete={handleComplete} onCancel={handleCancel} isOverdue />
              ))}
            </div>
          )}

          {/* Upcoming Section */}
          {upcoming.length > 0 && filter !== 'completed' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-blue-600">
                <Calendar className="h-4 w-4" />
                <h2 className="font-semibold text-sm">قادمة ({upcoming.length})</h2>
              </div>
              {upcoming.map(fu => (
                <FollowUpCard key={fu.id} followUp={fu} onComplete={handleComplete} onCancel={handleCancel} />
              ))}
            </div>
          )}

          {/* Completed Section */}
          {completed.length > 0 && (filter === 'completed' || filter === 'all') && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <h2 className="font-semibold text-sm">مكتملة ({completed.length})</h2>
              </div>
              {completed.map(fu => (
                <FollowUpCard key={fu.id} followUp={fu} onComplete={handleComplete} onCancel={handleCancel} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FollowUpCard({
  followUp,
  onComplete,
  onCancel,
  isOverdue,
}: {
  followUp: FollowUp;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  isOverdue?: boolean;
}) {
  return (
    <Card className={cn(isOverdue && 'border-red-200 dark:border-red-900')}>
      <CardContent className="py-3 flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate">{followUp.title || 'متابعة'}</p>
            {isOverdue && (
              <Badge variant="destructive" className="text-[10px]">متأخرة</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatRelativeDate(followUp.due_at)}
            </span>
            {followUp.assigned_to && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {followUp.assigned_to}
              </span>
            )}
          </div>
          {followUp.notes && (
            <p className="text-xs text-muted-foreground mt-1 truncate">{followUp.notes}</p>
          )}
          <Link href={`/dashboard/sales/leads/${followUp.lead_id}`} className="text-[10px] text-orange-600 hover:underline mt-1 inline-block">
            عرض العميل المحتمل ←
          </Link>
        </div>

        {followUp.status === 'pending' && (
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="ghost" onClick={() => onComplete(followUp.id)} className="text-green-600 hover:text-green-700">
              <CheckCircle2 className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onCancel(followUp.id)} className="text-muted-foreground hover:text-destructive">
              ✕
            </Button>
          </div>
        )}

        {followUp.status === 'completed' && (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 shrink-0">مكتملة</Badge>
        )}
      </CardContent>
    </Card>
  );
}
