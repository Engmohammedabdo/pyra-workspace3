'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  TrendingUp, Users, UserCheck, Clock,
  BarChart3, ArrowUpRight, ArrowDownRight,
  Zap, Target, Phone, ChevronLeft,
} from 'lucide-react';

interface PipelineStats {
  total_leads: number;
  new_this_week: number;
  converted: number;
  pending_follow_ups: number;
  stages: { name_ar: string; color: string; count: number }[];
}

const STAGE_GRADIENTS: Record<string, string> = {
  blue: 'from-blue-500 to-blue-600',
  yellow: 'from-amber-400 to-amber-500',
  orange: 'from-orange-500 to-orange-600',
  purple: 'from-purple-500 to-purple-600',
  indigo: 'from-indigo-500 to-indigo-600',
  green: 'from-emerald-500 to-emerald-600',
  red: 'from-rose-500 to-rose-600',
};

const STAGE_GLOW: Record<string, string> = {
  blue: 'shadow-blue-500/20',
  yellow: 'shadow-amber-400/20',
  orange: 'shadow-orange-500/20',
  purple: 'shadow-purple-500/20',
  indigo: 'shadow-indigo-500/20',
  green: 'shadow-emerald-500/20',
  red: 'shadow-rose-500/20',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'يدوي', whatsapp: 'واتساب', website: 'موقع', referral: 'إحالة', ad: 'إعلان', social: 'سوشيال',
};

const containerMotion = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemMotion = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

export default function SalesOverviewPage() {
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentLeads, setRecentLeads] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [leadsRes, stagesRes, followUpsRes] = await Promise.all([
        fetch('/api/dashboard/sales/leads'),
        fetch('/api/dashboard/sales/pipeline-stages'),
        fetch('/api/dashboard/sales/follow-ups?status=pending'),
      ]);

      const leadsData = await leadsRes.json();
      const stagesData = await stagesRes.json();
      const followUpsData = await followUpsRes.json();

      const leads = leadsData.data || [];
      const stages = stagesData.data || [];
      const followUps = followUpsData.data || [];

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const stageStats = stages.map((s: Record<string, unknown>) => ({
        name_ar: s.name_ar as string,
        color: s.color as string,
        count: leads.filter((l: Record<string, unknown>) => l.stage_id === s.id).length,
      }));

      setStats({
        total_leads: leads.length,
        new_this_week: leads.filter((l: Record<string, unknown>) => new Date(l.created_at as string) >= weekAgo).length,
        converted: leads.filter((l: Record<string, unknown>) => l.is_converted).length,
        pending_follow_ups: followUps.length,
        stages: stageStats,
      });

      setRecentLeads(leads.slice(0, 5));
    } catch (error) {
      console.error('Failed to fetch sales data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="لا توجد بيانات"
        description="ابدأ بإضافة عملاء محتملين لعرض إحصائيات المبيعات"
      />
    );
  }

  const conversionRate = stats.total_leads > 0
    ? ((stats.converted / stats.total_leads) * 100).toFixed(0)
    : '0';

  const statCards = [
    {
      label: 'إجمالي العملاء',
      value: stats.total_leads,
      icon: Users,
      gradient: 'from-blue-500 to-indigo-600',
      shadowColor: 'shadow-blue-500/25',
      trend: stats.new_this_week > 0 ? `+${stats.new_this_week} هذا الأسبوع` : null,
      trendUp: true,
    },
    {
      label: 'جديد هذا الأسبوع',
      value: stats.new_this_week,
      icon: Zap,
      gradient: 'from-emerald-400 to-teal-600',
      shadowColor: 'shadow-emerald-500/25',
      trend: null,
      trendUp: true,
    },
    {
      label: 'تم التحويل',
      value: stats.converted,
      icon: Target,
      gradient: 'from-orange-400 to-amber-600',
      shadowColor: 'shadow-orange-500/25',
      trend: `${conversionRate}% نسبة التحويل`,
      trendUp: Number(conversionRate) > 20,
    },
    {
      label: 'متابعات معلقة',
      value: stats.pending_follow_ups,
      icon: Clock,
      gradient: 'from-violet-500 to-purple-600',
      shadowColor: 'shadow-violet-500/25',
      trend: null,
      trendUp: false,
    },
  ];

  const totalPipelineLeads = stats.stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <motion.div
      variants={containerMotion}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div variants={itemMotion} className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <TrendingUp className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">لوحة المبيعات</h1>
          <p className="text-sm text-muted-foreground">نظرة عامة على أداء فريق المبيعات</p>
        </div>
      </motion.div>

      {/* Stat Cards — Glass Morphism */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <motion.div key={i} variants={itemMotion}>
            <div className={cn(
              'relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br text-white shadow-xl',
              card.gradient,
              card.shadowColor
            )}>
              {/* Decorative shapes */}
              <div className="absolute -top-4 -end-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
              <div className="absolute -bottom-6 -start-6 w-32 h-32 bg-white/5 rounded-full" />

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <card.icon className="h-8 w-8 text-white/80" />
                  {card.trend && (
                    <div className="flex items-center gap-1 text-[11px] bg-white/20 backdrop-blur-sm rounded-full px-2.5 py-0.5">
                      {card.trendUp ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {card.trend}
                    </div>
                  )}
                </div>
                <p className="text-4xl font-bold tracking-tight">{card.value}</p>
                <p className="text-sm text-white/70 mt-1">{card.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pipeline + Recent Leads Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Funnel — Large */}
        <motion.div variants={itemMotion} className="lg:col-span-2">
          <Card className="overflow-hidden border-0 shadow-xl shadow-black/5 dark:shadow-black/20 bg-card/80 backdrop-blur">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-3 text-base">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center">
                    <BarChart3 className="h-4 w-4 text-white" />
                  </div>
                  خط المبيعات
                </CardTitle>
                <Link href="/dashboard/sales/leads" className="text-xs text-muted-foreground hover:text-orange-500 transition-colors flex items-center gap-1">
                  عرض الكل
                  <ChevronLeft className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {stats.stages.length === 0 ? (
                <p className="text-muted-foreground text-center py-12 text-sm">لا توجد مراحل</p>
              ) : (
                <div className="space-y-4">
                  {stats.stages.map((stage, idx) => {
                    const maxCount = Math.max(...stats.stages.map(s => s.count), 1);
                    const pct = (stage.count / maxCount) * 100;
                    const gradient = STAGE_GRADIENTS[stage.color] || 'from-gray-500 to-gray-600';
                    const glow = STAGE_GLOW[stage.color] || 'shadow-gray-500/20';

                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.08 + 0.3, duration: 0.4 }}
                        className="flex items-center gap-4"
                      >
                        <span className="text-sm font-medium w-28 text-end shrink-0 text-muted-foreground">
                          {stage.name_ar}
                        </span>
                        <div className="flex-1 bg-muted/50 rounded-full h-8 overflow-hidden relative">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(pct, 3)}%` }}
                            transition={{ delay: idx * 0.08 + 0.5, duration: 0.8, ease: 'easeOut' }}
                            className={cn(
                              'h-full rounded-full bg-gradient-to-l shadow-md',
                              gradient,
                              glow
                            )}
                          />
                          {stage.count > 0 && (
                            <span className="absolute inset-0 flex items-center ps-3 text-xs font-semibold text-white mix-blend-difference">
                              {totalPipelineLeads > 0 ? `${((stage.count / totalPipelineLeads) * 100).toFixed(0)}%` : ''}
                            </span>
                          )}
                        </div>
                        <div className={cn(
                          'w-12 h-8 rounded-lg flex items-center justify-center font-bold text-sm bg-gradient-to-br text-white shadow-lg',
                          gradient,
                          glow
                        )}>
                          {stage.count}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Leads */}
        <motion.div variants={itemMotion}>
          <Card className="overflow-hidden border-0 shadow-xl shadow-black/5 dark:shadow-black/20 bg-card/80 backdrop-blur h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-3 text-base">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                    <Users className="h-4 w-4 text-white" />
                  </div>
                  آخر العملاء
                </CardTitle>
                <Link href="/dashboard/sales/leads" className="text-xs text-muted-foreground hover:text-orange-500 transition-colors flex items-center gap-1">
                  الكل
                  <ChevronLeft className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              {recentLeads.length === 0 ? (
                <p className="text-muted-foreground text-center py-8 text-sm">لا توجد عملاء محتملين بعد</p>
              ) : (
                <div className="space-y-1">
                  {recentLeads.map((lead: Record<string, unknown>, idx) => (
                    <Link key={lead.id as string} href={`/dashboard/sales/leads/${lead.id}`}>
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.06 + 0.5 }}
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors group cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-100 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/20 flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold text-sm shrink-0 group-hover:scale-105 transition-transform">
                          {(lead.name as string)?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{lead.name as string}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {(lead.company as string) || (lead.phone as string) || '—'}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className="text-[10px] shrink-0 bg-orange-100/60 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                        >
                          {SOURCE_LABELS[(lead.source as string)] || (lead.source as string)}
                        </Badge>
                      </motion.div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div variants={itemMotion}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'إضافة عميل', href: '/dashboard/sales/leads', icon: UserCheck, color: 'from-orange-400 to-amber-500' },
            { label: 'المحادثات', href: '/dashboard/sales/chat', icon: Phone, color: 'from-emerald-400 to-teal-500' },
            { label: 'المتابعات', href: '/dashboard/sales/follow-ups', icon: Clock, color: 'from-violet-400 to-purple-500' },
            { label: 'التقارير', href: '/dashboard/sales/reports', icon: BarChart3, color: 'from-blue-400 to-indigo-500' },
          ].map((action, i) => (
            <Link key={i} href={action.href}>
              <div className="group relative overflow-hidden rounded-2xl border border-border/50 p-4 hover:border-orange-300 dark:hover:border-orange-700 transition-all hover:shadow-lg hover:shadow-orange-500/5 bg-card/50 backdrop-blur">
                <div className={cn(
                  'h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3 shadow-lg group-hover:scale-110 transition-transform',
                  action.color
                )}>
                  <action.icon className="h-5 w-5 text-white" />
                </div>
                <p className="font-medium text-sm">{action.label}</p>
                <ChevronLeft className="absolute top-4 start-4 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
