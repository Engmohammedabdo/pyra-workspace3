'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Bell, Plus, Clock, AlertTriangle, Calendar, CalendarClock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FollowUpsList } from '@/components/dashboard/follow-ups/follow-ups-list';
import { FollowUp } from '@/components/dashboard/follow-ups/types';

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'completed' | 'cancelled' | 'all'>('pending');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<FollowUp | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/sales/follow-ups?status=${filter}`);
      const data = await res.json();
      setFollowUps(data.data || []);
    } catch { } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg"><Bell className="h-6 w-6 text-white" /></div>
          <div><h1 className="text-2xl font-bold tracking-tight">المتابعات</h1></div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setCreateDialogOpen(true)} className="rounded-xl bg-orange-500"><Plus className="h-4 w-4 me-1.5" /> متابعة جديدة</Button>
          <Select value={filter} onValueChange={v => setFilter(v as any)}><SelectTrigger className="w-36 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">المعلقة</SelectItem><SelectItem value="completed">المكتملة</SelectItem><SelectItem value="cancelled">الملغاة</SelectItem><SelectItem value="all">الكل</SelectItem></SelectContent></Select>
        </div>
      </div>
      <FollowUpsList {...{ filter, setFilter, setEditItem, setCreateDialogOpen, setEditDialogOpen, setFollowUps, followUps, loading, fetchData }} />
    </motion.div>
  );
}
