'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { BarChart3, Users, TrendingUp, UserCheck, PieChart } from 'lucide-react';

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

const STAGE_BG: Record<string, string> = {
  blue: 'bg-blue-500', yellow: 'bg-yellow-500', orange: 'bg-orange-500',
  purple: 'bg-purple-500', indigo: 'bg-indigo-500', green: 'bg-green-500', red: 'bg-red-500',
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

      // Source distribution
      const sourceMap = new Map<string, number>();
      for (const l of leads) {
        const s = (l as Record<string, unknown>).source as string;
        sourceMap.set(s, (sourceMap.get(s) || 0) + 1);
      }
      const sources = Array.from(sourceMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      // Stage distribution
      const stageStats = stages.map((s: Record<string, unknown>) => ({
        name_ar: s.name_ar as string,
        color: s.color as string,
        count: leads.filter((l: Record<string, unknown>) => l.stage_id === s.id).length,
      }));

      // Agent performance
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
        <h1 className="text-2xl font-bold">تقارير المبيعات</h1>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return <EmptyState icon={BarChart3} title="لا توجد بيانات" description="ابدأ بإضافة عملاء محتملين لعرض التقارير" />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">تقارير المبيعات</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي العملاء المحتملين</p>
                <p className="text-3xl font-bold mt-1">{data.total_leads}</p>
              </div>
              <Users className="h-10 w-10 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">تم التحويل</p>
                <p className="text-3xl font-bold mt-1">{data.converted}</p>
              </div>
              <UserCheck className="h-10 w-10 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">نسبة التحويل</p>
                <p className="text-3xl font-bold mt-1">{data.conversion_rate.toFixed(1)}%</p>
              </div>
              <TrendingUp className="h-10 w-10 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              توزيع المصادر
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.sources.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-sm">لا توجد بيانات</p>
            ) : (
              <div className="space-y-3">
                {data.sources.map(s => {
                  const maxCount = Math.max(...data.sources.map(x => x.count), 1);
                  const pct = (s.count / maxCount) * 100;
                  return (
                    <div key={s.source} className="flex items-center gap-3">
                      <span className="text-sm w-20 text-end shrink-0">
                        {SOURCE_LABELS[s.source] || s.source}
                      </span>
                      <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-orange-500 transition-all"
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                      <Badge variant="secondary" className="w-10 justify-center">{s.count}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pipeline Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              خط المبيعات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.stages.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-sm">لا توجد مراحل</p>
            ) : (
              <div className="space-y-3">
                {data.stages.map(stage => {
                  const maxCount = Math.max(...data.stages.map(s => s.count), 1);
                  const pct = (stage.count / maxCount) * 100;
                  return (
                    <div key={stage.name_ar} className="flex items-center gap-3">
                      <span className="text-sm w-24 text-end shrink-0">{stage.name_ar}</span>
                      <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', STAGE_BG[stage.color] || 'bg-gray-500')}
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                      <Badge variant="secondary" className="w-10 justify-center">{stage.count}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Performance */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5" />
              أداء الموظفين
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.agents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-sm">لا توجد بيانات</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-start p-3 font-medium">الموظف</th>
                      <th className="text-start p-3 font-medium">عملاء محتملين</th>
                      <th className="text-start p-3 font-medium">تم التحويل</th>
                      <th className="text-start p-3 font-medium">نسبة التحويل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.agents.map(agent => (
                      <tr key={agent.agent} className="border-b">
                        <td className="p-3 font-medium">{agent.agent}</td>
                        <td className="p-3">{agent.leads}</td>
                        <td className="p-3">{agent.converted}</td>
                        <td className="p-3">
                          <Badge variant="secondary">
                            {agent.leads > 0 ? ((agent.converted / agent.leads) * 100).toFixed(0) : 0}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
