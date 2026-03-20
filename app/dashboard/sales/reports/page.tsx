'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils/cn';
import { motion } from 'framer-motion';
import {
  BarChart3, Users, TrendingUp, UserCheck, PieChart, Target,
  Clock, AlertTriangle, Calendar, Filter,
} from 'lucide-react';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiData = Record<string, any>;

export default function SalesReportsPage() {
  const [tab, setTab] = useState('overview');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  // Overview data (from raw leads)
  const [overview, setOverview] = useState<ApiData | null>(null);
  // API report data
  const [funnelData, setFunnelData] = useState<ApiData | null>(null);
  const [velocityData, setVelocityData] = useState<ApiData | null>(null);
  const [agentsData, setAgentsData] = useState<ApiData | null>(null);
  const [agingData, setAgingData] = useState<ApiData | null>(null);
  const [lostData, setLostData] = useState<ApiData | null>(null);

  const fetchAllReports = useCallback(async () => {
    setLoading(true);
    try {
      const dateParams = new URLSearchParams();
      if (dateFrom) dateParams.set('from', dateFrom);
      if (dateTo) dateParams.set('to', dateTo);
      const dp = dateParams.toString();

      const [leadsRes, stagesRes, funnelRes, velocityRes, agentsRes, agingRes, lostRes] = await Promise.all([
        fetch('/api/dashboard/sales/leads'),
        fetch('/api/dashboard/sales/pipeline-stages'),
        fetch(`/api/dashboard/sales/reports?type=funnel${dp ? '&' + dp : ''}`),
        fetch(`/api/dashboard/sales/reports?type=velocity${dp ? '&' + dp : ''}`),
        fetch(`/api/dashboard/sales/reports?type=agents${dp ? '&' + dp : ''}`),
        fetch('/api/dashboard/sales/reports?type=aging'),
        fetch(`/api/dashboard/sales/reports?type=lost${dp ? '&' + dp : ''}`),
      ]);

      const leadsData = await leadsRes.json();
      const stagesData = await stagesRes.json();
      const leads = leadsData.data || [];
      const stages = stagesData.data || [];

      // Build overview from raw data
      const converted = leads.filter((l: ApiData) => l.is_converted);
      const sourceMap = new Map<string, number>();
      for (const l of leads) {
        const s = l.source as string;
        sourceMap.set(s, (sourceMap.get(s) || 0) + 1);
      }
      const stageStats = stages.map((s: ApiData) => ({
        name_ar: s.name_ar as string,
        color: s.color as string,
        count: leads.filter((l: ApiData) => l.stage_id === s.id).length,
      }));

      setOverview({
        total_leads: leads.length,
        converted: converted.length,
        conversion_rate: leads.length > 0 ? (converted.length / leads.length) * 100 : 0,
        sources: Array.from(sourceMap.entries())
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count),
        stages: stageStats,
      });

      const funnelJson = await funnelRes.json();
      const velocityJson = await velocityRes.json();
      const agentsJson = await agentsRes.json();
      const agingJson = await agingRes.json();
      const lostJson = await lostRes.json();

      setFunnelData(funnelJson.data);
      setVelocityData(velocityJson.data);
      setAgentsData(agentsJson.data);
      setAgingData(agingJson.data);
      setLostData(lostJson.data);
    } catch {
      console.error('Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchAllReports();
  }, [fetchAllReports]);

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

  if (!overview) {
    return <EmptyState icon={BarChart3} title="لا توجد بيانات" description="ابدأ بإضافة عملاء محتملين لعرض التقارير" />;
  }

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
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">تقارير المبيعات</h1>
            <p className="text-sm text-muted-foreground">تحليل أداء فريق المبيعات</p>
          </div>
        </div>

        {/* Date Filters */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">من</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-8 w-36 text-xs rounded-lg"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">إلى</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-8 w-36 text-xs rounded-lg"
            />
          </div>
          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs rounded-lg"
              onClick={() => { setDateFrom(''); setDateTo(''); }}
            >
              مسح
            </Button>
          )}
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={itemMotion} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="إجمالي العملاء المحتملين"
          value={overview.total_leads}
          icon={Users}
          gradient="from-blue-500 to-indigo-600"
        />
        <SummaryCard
          label="تم التحويل"
          value={overview.converted}
          icon={UserCheck}
          gradient="from-emerald-400 to-teal-600"
        />
        <SummaryCard
          label="نسبة التحويل"
          value={`${overview.conversion_rate.toFixed(1)}%`}
          icon={Target}
          gradient="from-orange-400 to-amber-600"
        />
        <SummaryCard
          label="متوسط التحويل"
          value={`${velocityData?.avgDays || 0} يوم`}
          icon={Clock}
          gradient="from-violet-500 to-purple-600"
        />
      </motion.div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-xl bg-muted/50 p-1">
          <TabsTrigger value="overview" className="rounded-lg text-xs">نظرة عامة</TabsTrigger>
          <TabsTrigger value="funnel" className="rounded-lg text-xs">القمع التحويلي</TabsTrigger>
          <TabsTrigger value="agents" className="rounded-lg text-xs">أداء الوكلاء</TabsTrigger>
          <TabsTrigger value="aging" className="rounded-lg text-xs">أعمار العملاء</TabsTrigger>
          <TabsTrigger value="lost" className="rounded-lg text-xs">العملاء المفقودين</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
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
                  <BarList items={overview.sources.map((s: ApiData) => ({
                    label: SOURCE_LABELS[s.source] || s.source,
                    value: s.count,
                    gradient: SOURCE_COLORS[s.source] || 'from-gray-400 to-gray-500',
                  }))} />
                </CardContent>
              </Card>
            </motion.div>

            {/* Pipeline Stages */}
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
                  <BarList items={overview.stages.map((s: ApiData) => ({
                    label: s.name_ar,
                    value: s.count,
                    gradient: STAGE_GRADIENTS[s.color] || 'from-gray-500 to-gray-600',
                  }))} />
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </TabsContent>

        {/* Funnel Tab */}
        <TabsContent value="funnel" className="mt-6">
          <Card className="border-0 shadow-xl shadow-black/5 dark:shadow-black/20 bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-white" />
                </div>
                القمع التحويلي حسب المصدر
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!funnelData?.funnel?.length ? (
                <p className="text-muted-foreground text-center py-12 text-sm">لا توجد بيانات</p>
              ) : (
                <div className="space-y-4">
                  {funnelData.funnel.map((item: ApiData, idx: number) => (
                    <motion.div
                      key={item.source}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.06 }}
                      className="flex items-center gap-4 p-3 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <div className={cn(
                        'w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shadow-sm',
                        SOURCE_COLORS[item.source] || 'from-gray-400 to-gray-500'
                      )}>
                        {item.total}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{item.sourceLabel}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 bg-muted/40 rounded-full h-2 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${item.conversionRate}%` }}
                              transition={{ delay: idx * 0.06 + 0.3, duration: 0.7 }}
                              className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-emerald-500"
                            />
                          </div>
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {item.conversionRate}%
                          </span>
                        </div>
                      </div>
                      <div className="text-end shrink-0">
                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{item.converted}</p>
                        <p className="text-[10px] text-muted-foreground">محوّل</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agents Tab */}
        <TabsContent value="agents" className="mt-6">
          <Card className="border-0 shadow-xl shadow-black/5 dark:shadow-black/20 bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Users className="h-4 w-4 text-white" />
                </div>
                أداء الوكلاء
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!agentsData?.agents?.length ? (
                <p className="text-muted-foreground text-center py-12 text-sm">لا توجد بيانات</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60">
                        <th className="text-start p-3 font-semibold text-muted-foreground text-xs">الوكيل</th>
                        <th className="text-start p-3 font-semibold text-muted-foreground text-xs">عملاء محتملين</th>
                        <th className="text-start p-3 font-semibold text-muted-foreground text-xs">محوّلين</th>
                        <th className="text-start p-3 font-semibold text-muted-foreground text-xs">نسبة التحويل</th>
                        <th className="text-start p-3 font-semibold text-muted-foreground text-xs">متوسط النقاط</th>
                        <th className="text-start p-3 font-semibold text-muted-foreground text-xs">عروض أسعار</th>
                        <th className="text-start p-3 font-semibold text-muted-foreground text-xs">قيمة العروض</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentsData.agents.map((agent: ApiData, idx: number) => (
                        <motion.tr
                          key={agent.username}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.05 }}
                          className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                                {agent.username.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium">{agent.username}</span>
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
                                    agent.conversionRate >= 50 ? 'bg-emerald-500' : agent.conversionRate >= 25 ? 'bg-amber-500' : 'bg-muted-foreground/30'
                                  )}
                                  style={{ width: `${Math.min(agent.conversionRate, 100)}%` }}
                                />
                              </div>
                              <Badge
                                variant="secondary"
                                className={cn(
                                  'text-[10px] font-bold',
                                  agent.conversionRate >= 50 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                  agent.conversionRate >= 25 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : ''
                                )}
                              >
                                {agent.conversionRate}%
                              </Badge>
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground">{agent.avgScore}</td>
                          <td className="p-3">{agent.quotes}</td>
                          <td className="p-3 text-muted-foreground" dir="ltr">
                            {agent.quotesValue > 0 ? `AED ${agent.quotesValue.toLocaleString()}` : '—'}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aging Tab */}
        <TabsContent value="aging" className="mt-6">
          <Card className="border-0 shadow-xl shadow-black/5 dark:shadow-black/20 bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-white" />
                </div>
                أعمار العملاء المحتملين في كل مرحلة
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!agingData?.stages?.length ? (
                <p className="text-muted-foreground text-center py-12 text-sm">لا توجد بيانات</p>
              ) : (
                <div className="space-y-4">
                  {agingData.stages.map((stage: ApiData, idx: number) => (
                    <motion.div
                      key={stage.stageId}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.06 }}
                      className="flex items-center gap-4 p-4 rounded-xl bg-muted/20"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{stage.stageName}</p>
                          <Badge variant="outline" className="text-xs">{stage.count} عميل</Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>متوسط: <strong className={cn(
                            stage.avgDays > 14 ? 'text-red-500' : stage.avgDays > 7 ? 'text-orange-500' : 'text-foreground'
                          )}>{stage.avgDays} يوم</strong></span>
                          <span>أقصى: <strong className={cn(
                            stage.maxDays > 30 ? 'text-red-500' : ''
                          )}>{stage.maxDays} يوم</strong></span>
                        </div>
                        {stage.count > 0 && (
                          <div className="mt-2 bg-muted/40 rounded-full h-2 overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                stage.avgDays > 14 ? 'bg-red-500' : stage.avgDays > 7 ? 'bg-amber-500' : 'bg-emerald-500'
                              )}
                              style={{ width: `${Math.min((stage.avgDays / 30) * 100, 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lost Tab */}
        <TabsContent value="lost" className="mt-6">
          <Card className="border-0 shadow-xl shadow-black/5 dark:shadow-black/20 bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-white" />
                </div>
                العملاء المفقودين
                {(lostData?.totalLost ?? 0) > 0 && (
                  <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">
                    {lostData?.totalLost}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!lostData?.totalLost ? (
                <p className="text-muted-foreground text-center py-12 text-sm">لا يوجد عملاء مفقودين</p>
              ) : (
                <div className="space-y-6">
                  {/* By Source */}
                  {lostData.bySource?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-3">حسب المصدر</p>
                      <div className="flex flex-wrap gap-2">
                        {lostData.bySource.map((item: ApiData) => (
                          <Badge key={item.source} variant="outline" className="text-xs gap-1.5">
                            {item.source}
                            <span className="text-muted-foreground font-bold">{item.count}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lost Leads List */}
                  <div className="space-y-2">
                    {lostData.leads?.slice(0, 20).map((lead: ApiData) => (
                      <div key={lead.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500 text-xs font-bold">
                          {lead.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{lead.name}</p>
                          <p className="text-xs text-muted-foreground">{lead.company || lead.source}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {lead.assigned_to || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

function SummaryCard({ label, value, icon: Icon, gradient }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  gradient: string;
}) {
  return (
    <motion.div variants={itemMotion}>
      <div className={cn(
        'relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br text-white shadow-xl',
        gradient
      )}>
        <div className="absolute -top-4 -end-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
        <div className="relative z-10">
          <Icon className="h-7 w-7 text-white/80 mb-3" />
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          <p className="text-sm text-white/70 mt-1">{label}</p>
        </div>
      </div>
    </motion.div>
  );
}

function BarList({ items }: { items: { label: string; value: number; gradient: string }[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-center py-12 text-sm">لا توجد بيانات</p>;
  }

  const maxCount = Math.max(...items.map(i => i.value), 1);

  return (
    <div className="space-y-4 pt-2">
      {items.map((item, idx) => {
        const pct = (item.value / maxCount) * 100;
        return (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.06 + 0.3 }}
            className="flex items-center gap-3"
          >
            <span className="text-sm w-24 text-end shrink-0 font-medium text-muted-foreground">{item.label}</span>
            <div className="flex-1 bg-muted/40 rounded-full h-6 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(pct, 4)}%` }}
                transition={{ delay: idx * 0.06 + 0.5, duration: 0.7 }}
                className={cn('h-full rounded-full bg-gradient-to-l shadow-sm', item.gradient)}
              />
            </div>
            <div className={cn(
              'w-10 h-6 rounded-lg bg-gradient-to-br text-white text-xs font-bold flex items-center justify-center shadow-sm',
              item.gradient
            )}>
              {item.value}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
