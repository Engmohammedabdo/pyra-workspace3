'use client';

import { useEffect, useState, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface WorkloadItem {
  username: string;
  display_name: string;
  actions: number;
}

export function TeamWorkloadChart() {
  const [data, setData] = useState<WorkloadItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/kpis/team-workload');
      const json = await res.json();
      if (json.data) setData(json.data);
    } catch (err) {
      console.error('TeamWorkloadChart fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 shadow-sm">
        <Skeleton className="h-5 w-44 mb-4" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-violet-500/15">
          <Activity className="h-4 w-4 text-white" />
        </div>
        <h3 className="font-bold text-sm">نشاط الفريق هذا الشهر</h3>
      </div>
      <div className="p-5">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
              <XAxis
                dataKey="display_name"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--card))',
                  color: 'hsl(var(--foreground))',
                  fontSize: '12px',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
                }}
                formatter={(value: number) => [value, 'إجراء']}
                labelFormatter={(label: string) => label}
              />
              <Bar
                dataKey="actions"
                fill="#8b5cf6"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground/40">
            <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mb-3">
              <Activity className="h-7 w-7 opacity-40" />
            </div>
            <p className="text-sm font-medium">لا يوجد نشاط هذا الشهر</p>
          </div>
        )}
      </div>
    </div>
  );
}
