'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { TrendingUp, Clock, Users, Target } from 'lucide-react';

interface ConversionData {
  funnel: { stage: string; count: number }[];
  rates: { sent_rate: number; sign_rate: number; invoice_rate: number };
  by_status: Record<string, number>;
}

interface PipelineData {
  total_active: number;
  total_value: number;
  by_status: Record<string, { count: number; value: number }>;
}

interface VelocityData {
  average_days_to_sign: number | null;
  total_signed: number;
}

interface AgentData {
  username: string;
  total: number;
  signed: number;
  value: number;
  signed_value: number;
  conversion_rate: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#94a3b8',
  pending_approval: '#fbbf24',
  sent: '#3b82f6',
  viewed: '#8b5cf6',
  signed: '#22c55e',
  invoiced: '#f97316',
  expired: '#ef4444',
  rejected: '#dc2626',
  cancelled: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  pending_approval: 'بانتظار الموافقة',
  sent: 'مُرسل',
  viewed: 'تم العرض',
  signed: 'موقع',
  invoiced: 'تم الفوترة',
  expired: 'منتهي',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
};

const fmtNum = (n: number) =>
  new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

export default function QuotesAnalyticsClient() {
  const [conversion, setConversion] = useState<ConversionData | null>(null);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [velocity, setVelocity] = useState<VelocityData | null>(null);
  const [agents, setAgents] = useState<AgentData[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/quotes/reports?type=conversion').then(r => r.json()),
      fetch('/api/dashboard/quotes/reports?type=pipeline').then(r => r.json()),
      fetch('/api/dashboard/quotes/reports?type=velocity').then(r => r.json()),
      fetch('/api/dashboard/quotes/reports?type=agent_performance').then(r => r.json()),
    ]).then(([c, p, v, a]) => {
      if (c.data) setConversion(c.data);
      if (p.data) setPipeline(p.data);
      if (v.data) setVelocity(v.data);
      if (a.data) setAgents(a.data);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold">تحليلات عروض الأسعار</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-80 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // Status distribution for pie chart
  const statusData = Object.entries(conversion?.by_status || {}).map(([status, count]) => ({
    name: STATUS_LABELS[status] || status,
    value: count,
    color: STATUS_COLORS[status] || '#94a3b8',
  }));

  // Pipeline by status for bar chart
  const pipelineData = Object.entries(pipeline?.by_status || {}).map(([status, data]) => ({
    name: STATUS_LABELS[status] || status,
    value: data.value,
    count: data.count,
    fill: STATUS_COLORS[status] || '#94a3b8',
  }));

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">تحليلات عروض الأسعار</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-orange-500/10">
              <Target className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">نسبة الإرسال</p>
              <p className="text-2xl font-bold">{conversion?.rates.sent_rate || 0}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-green-500/10">
              <TrendingUp className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">نسبة التوقيع</p>
              <p className="text-2xl font-bold">{conversion?.rates.sign_rate || 0}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-500/10">
              <Clock className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">متوسط أيام التوقيع</p>
              <p className="text-2xl font-bold">{velocity?.average_days_to_sign ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-500/10">
              <Users className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">قيمة العروض النشطة</p>
              <p className="text-2xl font-bold" dir="ltr">{fmtNum(pipeline?.total_value || 0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">قمع التحويل</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={conversion?.funnel || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="stage" width={100} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">توزيع الحالات</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, value }) => `${name} (${value})`}
                >
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Value + Agent Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">قيمة العروض النشطة حسب الحالة</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={pipelineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmtNum(v)} />
                <Legend />
                <Bar dataKey="value" name="القيمة" radius={[4, 4, 0, 0]}>
                  {pipelineData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Agent Performance Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">أداء وكلاء المبيعات</CardTitle>
          </CardHeader>
          <CardContent>
            {agents && agents.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="p-2 text-start">الوكيل</th>
                      <th className="p-2 text-start">العروض</th>
                      <th className="p-2 text-start">الموقعة</th>
                      <th className="p-2 text-start">نسبة التحويل</th>
                      <th className="p-2 text-start">القيمة الموقعة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map(a => (
                      <tr key={a.username} className="border-b">
                        <td className="p-2 font-medium">{a.username}</td>
                        <td className="p-2">{a.total}</td>
                        <td className="p-2">{a.signed}</td>
                        <td className="p-2">
                          <span className={a.conversion_rate >= 50 ? 'text-green-600 dark:text-green-400' : a.conversion_rate >= 25 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}>
                            {a.conversion_rate}%
                          </span>
                        </td>
                        <td className="p-2 font-mono" dir="ltr">{fmtNum(a.signed_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">لا توجد بيانات كافية</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
