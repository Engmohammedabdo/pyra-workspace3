'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, ArrowRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { CsatStatsCard } from '@/components/sales/chat/csat/csat-stats-card';
import { SlaStatsCard } from '@/components/sales/chat/sla/sla-stats-card';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { isSuperAdmin, hasPermission } from '@/lib/auth/rbac';

export default function WhatsAppAnalyticsPage() {
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser ? isSuperAdmin(currentUser.rolePermissions) : false;
  const canView = currentUser
    ? hasPermission(currentUser.rolePermissions || [], 'sales_whatsapp.view')
    : false;

  // Date range filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Calculate SLA days from date range
  const slaDays = useMemo(() => {
    if (!fromDate) return 30;
    const from = new Date(fromDate);
    const to = toDate ? new Date(toDate) : new Date();
    const diffMs = to.getTime() - from.getTime();
    return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }, [fromDate, toDate]);

  // Build CSAT params from date range
  const csatParams = useMemo(() => {
    const params: Record<string, string | undefined> = {};
    if (fromDate) params.from = fromDate;
    if (toDate) params.to = toDate;
    return params;
  }, [fromDate, toDate]);

  if (!canView && !isAdmin) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-muted-foreground">ليس لديك صلاحية لعرض هذه الصفحة</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <BarChart3 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">تحليلات واتساب</h1>
          <p className="text-xs text-muted-foreground/60">WhatsApp Analytics</p>
        </div>
        <div className="flex-1" />
        <Link href="/dashboard/sales/chat">
          <Button variant="outline" size="sm" className="rounded-lg text-xs h-8 gap-1.5">
            <ArrowRight className="h-3.5 w-3.5" />
            العودة للمحادثات
          </Button>
        </Link>
      </div>

      {/* Date Range Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">الفترة:</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">من</label>
          <Input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="h-8 w-40 text-xs rounded-lg"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">إلى</label>
          <Input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="h-8 w-40 text-xs rounded-lg"
          />
        </div>
        {(fromDate || toDate) && (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg text-xs h-8"
            onClick={() => { setFromDate(''); setToDate(''); }}
          >
            مسح الفلتر
          </Button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CsatStatsCard params={csatParams} />
        <SlaStatsCard days={slaDays} />
      </div>
    </motion.div>
  );
}
