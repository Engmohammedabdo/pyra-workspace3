'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PipelineStagesManager } from '@/components/dashboard/sales-settings/pipeline-stages';
import { WAInstancesManager } from '@/components/dashboard/sales-settings/wa-manager';

export function SalesSettingsContent() {
  const [data, setData] = useState({ stages: [], instances: [], agents: [] });
  const [loading, setLoading] = useState(true);

  async function fetchAll() {
    try {
      const [s, i, a] = await Promise.all([
        fetch('/api/dashboard/sales/pipeline-stages').then(r => r.json()),
        fetch('/api/dashboard/sales/whatsapp/instances').then(r => r.json()),
        fetch('/api/users?role=sales_agent').then(r => r.json()),
      ]);
      setData({ stages: s.data || [], instances: i.data || [], agents: a.data || [] });
    } catch { } finally { setLoading(false); }
  }

  useEffect(() => { fetchAll(); }, []);

  if (loading) return <div className="space-y-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">إعدادات المبيعات</h1>
      <Tabs defaultValue="stages">
        <TabsList>
          <TabsTrigger value="stages">مراحل Pipeline</TabsTrigger>
          <TabsTrigger value="whatsapp">واتساب</TabsTrigger>
        </TabsList>
        <TabsContent value="stages"><PipelineStagesManager stages={data.stages} onRefresh={fetchAll} /></TabsContent>
        <TabsContent value="whatsapp"><WAInstancesManager instances={data.instances} onRefresh={fetchAll} agents={data.agents} /></TabsContent>
      </Tabs>
    </div>
  );
}
