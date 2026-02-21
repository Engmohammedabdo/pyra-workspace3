'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart as PieChartIcon } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface PipelineItem {
  status: string;
  label: string;
  count: number;
  color: string;
}

export function ProjectPipelineChart() {
  const [data, setData] = useState<PipelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/kpis/project-pipeline');
      const json = await res.json();
      if (json.data) setData(json.data);
    } catch (err) {
      console.error('ProjectPipelineChart fetch error:', err);
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
          <Skeleton className="h-5 w-36" />
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
          <PieChartIcon className="h-4 w-4" />
          توزيع المشاريع
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
                dataKey="count"
                nameKey="label"
              >
                {data.map((entry) => (
                  <Cell key={entry.status} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--card))',
                  color: 'hsl(var(--foreground))',
                  fontSize: '12px',
                }}
                formatter={(value: number, name: string) => [value, name]}
              />
              <Legend
                formatter={(value: string) => (
                  <span className="text-xs">{value}</span>
                )}
                iconSize={8}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
            لا توجد مشاريع
          </div>
        )}
      </CardContent>
    </Card>
  );
}
