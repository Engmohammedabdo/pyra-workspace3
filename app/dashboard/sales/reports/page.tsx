'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils/cn';
import { motion } from 'framer-motion';
import {
  BarChart3, Users, TrendingUp, UserCheck, PieChart, Target,
  Clock, AlertTriangle, Calendar, Filter,
} from 'lucide-react';

import { SummaryCard } from '@/components/dashboard/sales-reports/SummaryCard';
import { BarList } from '@/components/dashboard/sales-reports/BarList';

const SOURCE_LABELS: Record<string, string> = {
  manual: 'يدوي', whatsapp: 'واتساب', website: 'موقع', referral: 'إحالة', ad: 'إعلان', social: 'سوشيال',
};

const SOURCE_COLORS: Record<string, string> = {
  manual: 'from-gray-400 to-gray-500', whatsapp: 'from-emerald-400 to-green-500',
  website: 'from-blue-400 to-indigo-500', referral: 'from-violet-400 to-purple-500',
  ad: 'from-orange-400 to-amber-500', social: 'from-pink-400 to-rose-500',
};

const STAGE_GRADIENTS: Record<string, string> = {
  blue: 'from-blue-500 to-blue-600', yellow: 'from-amber-400 to-amber-500',
  orange: 'from-orange-500 to-orange-600', purple: 'from-purple-500 to-purple-600',
  indigo: 'from-indigo-500 to-indigo-600', green: 'from-emerald-500 to-emerald-600',
  red: 'from-rose-500 to-rose-600',
};

const containerMotion = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const itemMotion = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

type ApiData = Record<string, any>;

export default function SalesReportsPage() {
  const [tab, setTab] = useState('overview');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<ApiData | null>(null);
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
        fetch('/api/dashboard/sales/leads'), fetch('/api/dashboard/sales/pipeline-stages'),
        fetch(`/api/dashboard/sales/reports?type=funnel${dp ? '&' + dp : ''}`),
        fetch(`/api/dashboard/sales/reports?type=velocity${dp ? '&' + dp : ''}`),
        fetch(`/api/dashboard/sales/reports?type=agents${dp ? '&' + dp : ''}`),
        fetch('/api/dashboard/sales/reports?type=aging'),
        fetch(`/api/dashboard/sales/reports?type=lost${dp ? '&' + dp : ''}`),
      ]);
      const leadsData = await leadsRes.json(); const stagesData = await stagesRes.json();
      const leads = leadsData.data || []; const stages = stagesData.data || [];
      const converted = leads.filter((l: ApiData) => l.is_converted);
      const sourceMap = new Map<string, number>();
      for (const l of leads) { const s = l.source as string; sourceMap.set(s, (sourceMap.get(s) || 0) + 1); }
      setOverview({
        total_leads: leads.length, converted: converted.length,
        conversion_rate: leads.length > 0 ? (converted.length / leads.length) * 100 : 0,
        sources: Array.from(sourceMap.entries()).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
        stages: stages.map((s: ApiData) => ({ name_ar: s.name_ar, color: s.color, count: leads.filter((l: ApiData) => l.stage_id === s.id).length })),
      });
      setFunnelData((await funnelRes.json()).data);
      setVelocityData((await velocityRes.json()).data);
      setAgentsData((await agentsRes.json()).data);
      setAgingData((await agingRes.json()).data);
      setLostData((await lostRes.json()).data);
    } catch { console.error('Failed to fetch reports'); } finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchAllReports(); }, [fetchAllReports]);

  if (loading) return <div className="space-y-6"><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-xl" /><Skeleton className="h-8 w-48" /></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div><Skeleton className="h-64 rounded-2xl" /></div>;
  if (!overview) return <EmptyState icon={BarChart3} title="لا توجد بيانات" description="ابدأ بإضافة عملاء محتملين لعرض التقارير" />;

  return (
    <motion.div variants={containerMotion} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={itemMotion} className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4"><div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20"><BarChart3 className="h-6 w-6 text-white" /></div><div><h1 className="text-2xl font-bold tracking-tight">تقارير المبيعات</h1><p className="text-sm text-muted-foreground">تحليل أداء فريق المبيعات</p></div></div>
        <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-muted-foreground" /><div className="flex items-center gap-1.5"><Label className="text-xs text-muted-foreground">من</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-36 text-xs rounded-lg" /></div><div className="flex items-center gap-1.5"><Label className="text-xs text-muted-foreground">إلى</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 w-36 text-xs rounded-lg" /></div>{(dateFrom || dateTo) && <Button variant="ghost" size="sm" className="h-8 text-xs rounded-lg" onClick={() => { setDateFrom(''); setDateTo(''); }}>مسح</Button>}</div>
      </motion.div>
      <motion.div variants={itemMotion} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="إجمالي العملاء المحتملين" value={overview.total_leads} icon={Users} gradient="from-blue-500 to-indigo-600" />
        <SummaryCard label="تم التحويل" value={overview.converted} icon={UserCheck} gradient="from-emerald-400 to-teal-600" />
        <SummaryCard label="نسبة التحويل" value={`${overview.conversion_rate.toFixed(1)}%`} icon={Target} gradient="from-orange-400 to-amber-600" />
        <SummaryCard label="متوسط التحويل" value={`${velocityData?.avgDays || 0} يوم`} icon={Clock} gradient="from-violet-500 to-purple-600" />
      </motion.div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-xl bg-muted/50 p-1"><TabsTrigger value="overview" className="rounded-lg text-xs">نظرة عامة</TabsTrigger><TabsTrigger value="funnel" className="rounded-lg text-xs">القمع التحويلي</TabsTrigger><TabsTrigger value="agents" className="rounded-lg text-xs">أداء الوكلاء</TabsTrigger><TabsTrigger value="aging" className="rounded-lg text-xs">أعمار العملاء</TabsTrigger><TabsTrigger value="lost" className="rounded-lg text-xs">العملاء المفقودين</TabsTrigger></TabsList>
        <TabsContent value="overview" className="mt-6"><div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><motion.div variants={itemMotion}><Card className="border-0 shadow-xl bg-card/80 backdrop-blur"><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-3"><div className="h-8 w-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center"><PieChart className="h-4 w-4 text-white" /></div>توزيع المصادر</CardTitle></CardHeader><CardContent><BarList items={overview.sources.map((s: ApiData) => ({ label: SOURCE_LABELS[s.source] || s.source, value: s.count, gradient: SOURCE_COLORS[s.source] || 'from-gray-400 to-gray-500' }))} /></CardContent></Card></motion.div><motion.div variants={itemMotion}><Card className="border-0 shadow-xl bg-card/80 backdrop-blur"><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-3"><div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center"><BarChart3 className="h-4 w-4 text-white" /></div>خط المبيعات</CardTitle></CardHeader><CardContent><BarList items={overview.stages.map((s: ApiData) => ({ label: s.name_ar, value: s.count, gradient: STAGE_GRADIENTS[s.color] || 'from-gray-500 to-gray-600' }))} /></CardContent></Card></motion.div></div></TabsContent>
        <TabsContent value="funnel" className="mt-6"><Card className="border-0 shadow-xl bg-card/80 backdrop-blur"><CardHeader><CardTitle className="text-base flex items-center gap-3"><div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center"><TrendingUp className="h-4 w-4 text-white" /></div>القمع التحويلي حسب المصدر</CardTitle></CardHeader><CardContent>{!funnelData?.funnel?.length ? <p className="text-muted-foreground text-center py-12 text-sm">لا توجد بيانات</p> : <div className="space-y-4">{funnelData.funnel.map((item: ApiData, idx: number) => (<motion.div key={item.source} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-4 p-3 rounded-xl bg-muted/20"><div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shadow-sm', SOURCE_COLORS[item.source] || 'from-gray-400 to-gray-500')}>{item.total}</div><div className="flex-1 min-w-0"><p className="font-medium text-sm">{item.sourceLabel}</p><div className="flex items-center gap-2 mt-1"><div className="flex-1 bg-muted/40 rounded-full h-2 overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${item.conversionRate}%` }} /></div><span className="text-xs font-bold text-emerald-600">{item.conversionRate}%</span></div></div><div className="text-end"><p className="text-sm font-bold text-emerald-600">{item.converted}</p><p className="text-[10px] text-muted-foreground">محوّل</p></div></motion.div>))}</div>}</CardContent></Card></TabsContent>
        <TabsContent value="agents" className="mt-6"><Card className="border-0 shadow-xl bg-card/80 backdrop-blur"><CardHeader><CardTitle className="text-base flex items-center gap-3"><div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center"><Users className="h-4 w-4 text-white" /></div>أداء الوكلاء</CardTitle></CardHeader><CardContent>{!agentsData?.agents?.length ? <p className="text-muted-foreground text-center py-12 text-sm">لا توجد بيانات</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border/60"><th className="text-start p-3 text-muted-foreground text-xs">الوكيل</th><th className="text-start p-3 text-muted-foreground text-xs">عملاء</th><th className="text-start p-3 text-muted-foreground text-xs">محوّلين</th><th className="text-start p-3 text-muted-foreground text-xs">النسبة</th><th className="text-start p-3 text-muted-foreground text-xs">النقاط</th><th className="text-start p-3 text-muted-foreground text-xs">العروض</th><th className="text-start p-3 text-muted-foreground text-xs">القيمة</th></tr></thead><tbody>{agentsData.agents.map((agent: ApiData) => (<tr key={agent.username} className="border-b border-border/30"><td><div className="flex items-center gap-2.5 p-3"><div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center text-white text-xs">{agent.username.charAt(0).toUpperCase()}</div><span className="font-medium">{agent.username}</span></div></td><td className="p-3">{agent.leads}</td><td className="p-3 text-emerald-600">{agent.converted}</td><td className="p-3"><Badge variant="secondary">{agent.conversionRate}%</Badge></td><td className="p-3 text-muted-foreground">{agent.avgScore}</td><td className="p-3">{agent.quotes}</td><td className="p-3 text-muted-foreground">AED {agent.quotesValue.toLocaleString()}</td></tr>))}</tbody></table></div>}</CardContent></Card></TabsContent>
        <TabsContent value="aging" className="mt-6"><Card className="border-0 shadow-xl bg-card/80 backdrop-blur"><CardHeader><CardTitle className="text-base flex items-center gap-3"><div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center"><Calendar className="h-4 w-4 text-white" /></div>أعمار العملاء</CardTitle></CardHeader><CardContent>{!agingData?.stages?.length ? <p className="text-muted-foreground text-center py-12 text-sm">لا توجد بيانات</p> : <div className="space-y-4">{agingData.stages.map((s: ApiData) => (<div key={s.stageId} className="flex items-center gap-4 p-4 rounded-xl bg-muted/20"><div className="flex-1"><div className="flex items-center justify-between"><p className="font-medium text-sm">{s.stageName}</p><Badge variant="outline">{s.count} عميل</Badge></div><div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground"><span>متوسط: {s.avgDays} يوم</span><span>أقصى: {s.maxDays} يوم</span></div></div></div>))}</div>}</CardContent></Card></TabsContent>
        <TabsContent value="lost" className="mt-6"><Card className="border-0 shadow-xl bg-card/80 backdrop-blur"><CardHeader><CardTitle className="text-base flex items-center gap-3"><div className="h-8 w-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center"><AlertTriangle className="h-4 w-4 text-white" /></div>العملاء المفقودين</CardTitle></CardHeader><CardContent>{!lostData?.totalLost ? <p className="text-muted-foreground text-center py-12 text-sm">لا يوجد عملاء مفقودين</p> : <div className="space-y-6">{lostData.bySource?.length > 0 && <div className="flex flex-wrap gap-2">{lostData.bySource.map((i: ApiData) => <Badge key={i.source} variant="outline" className="text-xs">{i.source} {i.count}</Badge>)}</div>}<div className="space-y-2">{lostData.leads?.slice(0, 20).map((l: ApiData) => (<div key={l.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/20"><div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500 text-xs">{l.name?.charAt(0)?.toUpperCase()}</div><div className="flex-1"><p className="text-sm font-medium">{l.name}</p><p className="text-xs text-muted-foreground">{l.company || l.source}</p></div></div>))}</div></div>}</CardContent></Card></TabsContent>
      </Tabs>
    </motion.div>
  );
}
