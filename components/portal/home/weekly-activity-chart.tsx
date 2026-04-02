'use client';

import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Activity, ChevronLeft } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

function CustomChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">
        {payload[0].value} {payload[0].value === 1 ? 'نشاط' : 'أنشطة'}
      </p>
    </div>
  );
}

export function WeeklyActivityChart({ data }: { data: { day: string; count: number }[] }) {
  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-portal" />
            النشاط الأسبوعي
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data && data.some((d) => d.count > 0) ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip content={<CustomChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', radius: 4 }} />
                  <Bar dataKey="count" fill="var(--portal-primary, #f97316)" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">لا يوجد نشاط هذا الأسبوع</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
