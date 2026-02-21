'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-72" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" />
          نشاط الفريق هذا الشهر
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
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
                  borderRadius: '8px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--card))',
                  color: 'hsl(var(--foreground))',
                  fontSize: '12px',
                }}
                formatter={(value: number) => [value, 'إجراء']}
                labelFormatter={(label: string) => label}
              />
              <Bar
                dataKey="actions"
                fill="#8b5cf6"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
            لا يوجد نشاط هذا الشهر
          </div>
        )}
      </CardContent>
    </Card>
  );
}
