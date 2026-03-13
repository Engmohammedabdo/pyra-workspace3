'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Users, UserCheck, Clock, BarChart3 } from 'lucide-react';

interface PipelineStats {
  total_leads: number;
  new_this_week: number;
  converted: number;
  pending_follow_ups: number;
  stages: { name_ar: string; color: string; count: number }[];
}

const STAGE_BG: Record<string, string> = {
  blue: 'bg-blue-500',
  yellow: 'bg-yellow-500',
  orange: 'bg-orange-500',
  purple: 'bg-purple-500',
  indigo: 'bg-indigo-500',
  green: 'bg-green-500',
  red: 'bg-red-500',
};

export default function SalesOverviewPage() {
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentActivities, setRecentActivities] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      // Fetch pipeline stages with leads count
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

      // Recent activities from leads
      setRecentActivities(leads.slice(0, 5));
    } catch (error) {
      console.error('Failed to fetch sales data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">المبيعات</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
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

  const statCards = [
    { label: 'إجمالي العملاء المحتملين', value: stats.total_leads, icon: Users, color: 'text-blue-600' },
    { label: 'جديد هذا الأسبوع', value: stats.new_this_week, icon: TrendingUp, color: 'text-green-600' },
    { label: 'تم التحويل', value: stats.converted, icon: UserCheck, color: 'text-orange-600' },
    { label: 'متابعات معلقة', value: stats.pending_follow_ups, icon: Clock, color: 'text-purple-600' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">المبيعات</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-3xl font-bold mt-1">{card.value}</p>
                </div>
                <card.icon className={cn('h-10 w-10', card.color)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            خط المبيعات
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.stages.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا توجد مراحل</p>
          ) : (
            <div className="space-y-3">
              {stats.stages.map((stage, i) => {
                const maxCount = Math.max(...stats.stages.map(s => s.count), 1);
                const pct = (stage.count / maxCount) * 100;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm w-24 text-end shrink-0">{stage.name_ar}</span>
                    <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', STAGE_BG[stage.color] || 'bg-gray-500')}
                        style={{ width: `${Math.max(pct, 2)}%` }}
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

      {/* Recent Leads */}
      <Card>
        <CardHeader>
          <CardTitle>آخر العملاء المحتملين</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivities.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">لا توجد عملاء محتملين بعد</p>
          ) : (
            <div className="divide-y">
              {recentActivities.map((lead: Record<string, unknown>) => (
                <div key={lead.id as string} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{lead.name as string}</p>
                    <p className="text-sm text-muted-foreground">{lead.company as string || lead.phone as string || '—'}</p>
                  </div>
                  <Badge variant="outline">{lead.source as string}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ');
}
