'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { motion } from 'framer-motion';
import { BarChart3, Users, TrendingUp, UserCheck, PieChart, Target } from 'lucide-react';

interface ReportData {
  total_leads: number;
  converted: number;
  conversion_rate: number;
  sources: { source: string; count: number }[];
  stages: { name_ar: string; color: string; count: number }[];
  agents: { agent: string; leads: number; converted: number }[];
  weekly: { week: string; count: number }[];
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'يدوي', whatsapp: 'واتساب', website: 'موقع', referral: 'إحالة', ad: 'إعلان', social: 'سوشيال',
};

const SOURCE_COLORS: Record<string, string> = {
  manual: 'from-gray-400 to-gray-500',
  whatsapp: 'from-emerald-400 to-green-500',
  website: 'from-blue-400 to-indigo-500',
  referral: 'from-violet-400 to-purple-500',
  ad: 'from-orange-400 to-amber-500',
  social: 'from-pink-400 to-rose-500',
};

const STAGE_GRADIENTS: Record<string, string> = {
  blue: 'from-blue-500 to-blue-600',
  yellow: 'from-amber-400 to-amber-500',
  orange: 'from-orange-500 to-orange-600',
  purple: 'from-purple-500 to-purple-600',
  indigo: 'from-indigo-500 to-indigo-600',
  green: 'from-emerald-500 to-emerald-600',
  red: 'from-rose-500 to-rose-600',
};

const containerMotion = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemMotion = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function SalesReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReport();
  }, []);

  async function fetchReport() {
    try {
      const [leadsRes, stagesRes] = await Promise.all([
        fetch('/api/dashboard/sales/leads?limit=1000'),
        fetch('/api/dashboard/sales/pipeline-stages'),
      ]);

      const leadsData = await leadsRes.json();
      const stagesData = await stagesRes.json();

      const leads = leadsData.data || [];
      const stages = stagesData.data || [];

      const converted = leads.filter((l: Record<string, unknown>) => l.is_converted);

      const sourceMap = new Map<string, number>();
      for (const l of leads) {
        const s = (l as Record<string, unknown>).source as string;
        sourceMap.set(s, (sourceMap.get(s) || 0) + 1);
      }
      const sources = Array.from(sourceMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      const stageStats = stages.map((s: Record<string, unknown>) => ({
        name_ar: s.name_ar as string,
        color: s.color as string,
        count: leads.filter((l: Record<string, unknown>) => l.stage_id === s.id).length,
      }));

      const agentMap = new Map<string, { leads: number; converted: number }>();
      for (const l of leads) {
        const agent = (l as Record<string, unknown>).assigned_to as string || 'غير معين';
        if (!agentMap.has(agent)) agentMap.set(agent, { leads: 0, converted: 0 });
        const a = agentMap.get(agent)!;
        a.leads++;
        if ((l as Record<string, unknown>).is_converted) a.converted++;
      }
      const agents = Array.from(agentMap.entries())
        .map(([agent, stats]) => ({ agent, ...stats }))
        .sort((a, b) => b.leads - a.leads);

      setData({
        total_leads: leads.length,
        converted: converted.length,
        conversion_rate: leads.length > 0 ? (converted.length / leads.length) * 100 : 0,
        sources,
        stages: stageStats,
        agents,
        weekly: [],
      });
    } catch {
      console.error('Failed to fetch report data');
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return <EmptyState icon={BarChart3} title="لا توجد بيانات" description="ابدأ بإضافة عملاء محتملين لعرض التقارير" />;
  }

  const summaryCards = [
    {
      label: 'إجمالي العملاء المحتملين',
      value: data.total_leads,
      icon: Users,
      gradient: 'from-blue-500 to-indigo-600',
      shadow: 'shadow-blue-500/25',
    },
    {
      label: 'تم التحويل',
      value: data.converted,
      icon: UserCheck,
      gradient: 'from-emerald-400 to-teal-600',
      shadow: 'shadow-emerald-500/25',
    },
    {
      label: 'نسبة التحويل',
      value: `${data.conversion_rate.toFixed(1)}%`,
      icon: Target,
      gradient: 'from-orange-400 to-amber-600',
      shadow: 'shadow-orange-500/25',
    },
  ];

  return (
    <motion.div
      variants={containerMotion}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div variants={itemMotion} className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <BarChart3 className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">تقارير المبيعات</h1>
          <p className="text-sm text-muted-foreground">تحليل أداء فريق المبيعات</p>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {summaryCards.map((card, i) => (
          <motion.div key={i} variants={itemMotion}>
            <div className={cn(
              'relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br text-white shadow-xl',
              card.gradient, card.shadow
            )}>
              <div className="absolute -top-4 -end-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
              <div className="relative z-10">
                <card.icon className="h-7 w-7 text-white/80 mb-3" />
                <p className="text-3xl font-bold tracking-tight">{card.value}</p>
                <p className="text-sm text-white/70 mt-1">{card.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Distribution */}
        <motion.div variants={itemMotion}>
          <Card className="border-0 shadow-xl shadow-black/5 dark:shadow-black/20 bg-card/80 backdrop-blur overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
                  <PieChart className="h-4 w-4 text-white" />
                </div>
                توزيع المصادر
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.sources.length === 0 ? (
                <p className="text-muted-foreground text-center py-12 text-sm">لا توجد بيانات</p>
              ) : (
                <div className="space-y-4 pt-2">
                  {data.sources.map((s, idx) => {
                    const maxCount = Math.max(...data.sources.map(x => x.count), 1);
                    const pct = (s.count / maxCount) * 100;
                    const gradient = SOURCE_COLORS[s.source] || 'from-gray-400 to-gray-500';

                    return (
                      <motion.div
                        key={s.source}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.06 + 0.3 }}
                        className="flex items-center gap-3"
                      >
                        <span className="text-sm w-20 text-end shrink-0 font-medium text-muted-foreground">
                          {SOURCE_LABELS[s.source] || s.source}
                        </span>
                        <div className="flex-1 bg-muted/40 rounded-full h-6 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(pct, 4)}%` }}
                            transition={{ delay: idx * 0.06 + 0.5, duration: 0.7 }}
                            className={cn('h-full rounded-full bg-gradient-to-l shadow-sm', gradient)}
                          />
                        </div>
                        <div className={cn(
                          'w-10 h-6 rounded-lg bg-gradient-to-br text-white text-xs font-bold flex items-center justify-center shadow-sm',
                          gradient
                        )}>
                          {s.count}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Pipeline Funnel */}
        <motion.div variants={itemMotion}>
          <Card className="border-0 shadow-xl shadow-black/5 dark:shadow-black/20 bg-card/80 backdrop-blur overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-white" />
                </div>
                خط المبيعات
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.stages.length === 0 ? (
                <p className="text-muted-foreground text-center py-12 text-sm">لا توجد مراحل</p>
              ) : (
                <div className="space-y-4 pt-2">
                  {data.stages.map((stage, idx) => {
                    const maxCount = Math.max(...data.stages.map(s => s.count), 1);
                    const pct = (stage.count / maxCount) * 100;
                    const gradient = STAGE_GRADIENTS[stage.color] || 'from-gray-500 to-gray-600';

                    return (
                      <motion.div
                        key={stage.name_ar}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.06 + 0.3 }}
                        className="flex items-center gap-3"
                      >
                        <span className="text-sm w-24 text-end shrink-0 font-medium text-muted-foreground">{stage.name_ar}</span>
                        <div className="flex-1 bg-muted/40 rounded-full h-6 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(pct, 4)}%` }}
                            transition={{ delay: idx * 0.06 + 0.5, duration: 0.7 }}
                            className={cn('h-full rounded-full bg-gradient-to-l shadow-sm', gradient)}
                          />
                        </div>
                        <div className={cn(
                          'w-10 h-6 rounded-lg bg-gradient-to-br text-white text-xs font-bold flex items-center justify-center shadow-sm',
                          gradient
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

        {/* Agent Performance */}
        <motion.div variants={itemMotion} className="lg:col-span-2">
          <Card className="border-0 shadow-xl shadow-black/5 dark:shadow-black/20 bg-card/80 backdrop-blur overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Users className="h-4 w-4 text-white" />
                </div>
                أداء الموظفين
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.agents.length === 0 ? (
                <p className="text-muted-foreground text-center py-12 text-sm">لا توجد بيانات</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60">
                        <th className="text-start p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">الموظف</th>
                        <th className="text-start p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">عملاء محتملين</th>
                        <th className="text-start p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">تم التحويل</th>
                        <th className="text-start p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">نسبة التحويل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.agents.map((agent, idx) => {
                        const rate = agent.leads > 0 ? ((agent.converted / agent.leads) * 100) : 0;
                        return (
                          <motion.tr
                            key={agent.agent}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: idx * 0.05 + 0.3 }}
                            className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                          >
                            <td className="p-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                                  {agent.agent.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium">{agent.agent}</span>
                              </div>
                            </td>
                            <td className="p-3 font-semibold">{agent.leads}</td>
                            <td className="p-3 font-semibold text-emerald-600 dark:text-emerald-400">{agent.converted}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-muted/40 rounded-full h-2 overflow-hidden">
                                  <div
                                    className={cn(
                                      'h-full rounded-full',
                                      rate >= 50 ? 'bg-emerald-500' : rate >= 25 ? 'bg-amber-500' : 'bg-muted-foreground/30'
                                    )}
                                    style={{ width: `${Math.min(rate, 100)}%` }}
                                  />
                                </div>
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    'text-[10px] font-bold',
                                    rate >= 50 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                    rate >= 25 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                    ''
                                  )}
                                >
                                  {rate.toFixed(0)}%
                                </Badge>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
