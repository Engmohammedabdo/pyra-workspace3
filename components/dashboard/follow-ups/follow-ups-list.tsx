'use client';

import { useState, useCallback, useEffect } from 'react';
import { mutateAPI } from '@/hooks/api-helpers';
import { motion } from 'framer-motion';
import { Clock, CheckCircle2, Calendar, AlertTriangle, Bell, Plus, X, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { FollowUp, FollowUpFilter } from '@/components/dashboard/follow-ups/types';
import { FollowUpCard } from '@/components/dashboard/follow-ups/follow-up-card';
import { toast } from 'sonner';

export function FollowUpsList({ filter, setFilter, setEditItem, setCreateDialogOpen, setEditDialogOpen, setFollowUps, followUps, loading, fetchData }: any) {
  async function handleComplete(id: string) {
    try {
      await mutateAPI('/api/dashboard/sales/follow-ups', 'PATCH', { id, status: 'completed' });
      toast.success('تم إكمال المتابعة');
      fetchData();
    } catch { toast.error('فشل تحديث المتابعة'); }
  }

  async function handleCancel(id: string) {
    try {
      await mutateAPI('/api/dashboard/sales/follow-ups', 'PATCH', { id, status: 'cancelled' });
      toast.success('تم إلغاء المتابعة');
      fetchData();
    } catch { toast.error('فشل تحديث المتابعة'); }
  }

  if (loading) return <div>{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl mb-4" />)}</div>;

  const now = new Date();
  const overdue = followUps.filter((f: FollowUp) => f.status === 'pending' && new Date(f.due_at) < now);
  const upcoming = followUps.filter((f: FollowUp) => f.status === 'pending' && new Date(f.due_at) >= now);
  const completed = followUps.filter((f: FollowUp) => f.status === 'completed');
  const cancelled = followUps.filter((f: FollowUp) => f.status === 'cancelled');

  return (
    <div className="space-y-8">
      {overdue.length > 0 && filter !== 'completed' && filter !== 'cancelled' && (
        <div className="space-y-3">
          <h2 className="font-bold text-sm text-red-600 dark:text-red-400">متأخرة ({overdue.length})</h2>
          {overdue.map((fu: FollowUp) => <FollowUpCard key={fu.id} followUp={fu} onComplete={handleComplete} onCancel={handleCancel} onEdit={setEditItem} isOverdue />)}
        </div>
      )}
      {/* ... similar sections for upcoming, completed, cancelled ... */}
    </div>
  );
}
