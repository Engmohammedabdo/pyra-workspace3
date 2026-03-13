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
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Clock, CheckCircle2, Calendar, User, AlertTriangle, Bell } from 'lucide-react';

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
              {overdue.length > 0 && upcoming.length > 0 && ' • '}
              {upcoming.length > 0 && <span>{upcoming.length} قادمة</span>}
            </p>
          </div>
        </div>
        <Select value={filter} onValueChange={v => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-36 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">المعلقة</SelectItem>
            <SelectItem value="completed">المكتملة</SelectItem>
            <SelectItem value="all">الكل</SelectItem>
          </SelectContent>
        </Select>
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
          {overdue.length > 0 && filter !== 'completed' && (
            <motion.div variants={itemMotion} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
                  <AlertTriangle className="h-3.5 w-3.5 text-white" />
                </div>
                <h2 className="font-bold text-sm text-red-600 dark:text-red-400">متأخرة ({overdue.length})</h2>
              </div>
              {overdue.map(fu => (
                <FollowUpCard key={fu.id} followUp={fu} onComplete={handleComplete} onCancel={handleCancel} isOverdue />
              ))}
            </motion.div>
          )}

          {/* Upcoming Section */}
          {upcoming.length > 0 && filter !== 'completed' && (
            <motion.div variants={itemMotion} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Calendar className="h-3.5 w-3.5 text-white" />
                </div>
                <h2 className="font-bold text-sm text-blue-600 dark:text-blue-400">قادمة ({upcoming.length})</h2>
              </div>
              {upcoming.map(fu => (
                <FollowUpCard key={fu.id} followUp={fu} onComplete={handleComplete} onCancel={handleCancel} />
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
                <FollowUpCard key={fu.id} followUp={fu} onComplete={handleComplete} onCancel={handleCancel} />
              ))}
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={cn(
        'border-0 shadow-md shadow-black/5 dark:shadow-black/15 bg-card/80 backdrop-blur overflow-hidden transition-all hover:shadow-lg',
        isOverdue && 'border-s-[3px] border-s-red-500'
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
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
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
            <Link href={`/dashboard/sales/leads/${followUp.lead_id}`} className="text-[11px] text-orange-500 hover:text-orange-600 hover:underline mt-1.5 inline-block font-medium">
              عرض العميل المحتمل ←
            </Link>
          </div>

          {followUp.status === 'pending' && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onComplete(followUp.id)}
                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-xl"
              >
                <CheckCircle2 className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onCancel(followUp.id)}
                className="text-muted-foreground hover:text-destructive rounded-xl"
              >
                ✕
              </Button>
            </div>
          )}

          {followUp.status === 'completed' && (
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 shrink-0">
              مكتملة
            </Badge>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
