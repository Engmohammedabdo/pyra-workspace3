'use client';

import { useEffect, useState, useCallback } from 'react';
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
      <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 shadow-sm">
        <Skeleton className="h-5 w-36 mb-4" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/15">
          <PieChartIcon className="h-4 w-4 text-white" />
        </div>
        <h3 className="font-bold text-sm">توزيع المشاريع</h3>
      </div>
      <div className="p-5">
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
                  borderRadius: '12px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--card))',
                  color: 'hsl(var(--foreground))',
                  fontSize: '12px',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
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
          <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground/40">
            <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mb-3">
              <PieChartIcon className="h-7 w-7 opacity-40" />
            </div>
            <p className="text-sm font-medium">لا توجد مشاريع</p>
          </div>
        )}
      </div>
    </div>
  );
}
