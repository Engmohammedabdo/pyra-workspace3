'use client';

import { useState, useEffect } from 'react';
import { fetchAPI } from '@/hooks/api-helpers';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PipelineStagesManager } from '@/components/dashboard/sales-settings/pipeline-stages';
import { WAInstancesManager } from '@/components/dashboard/sales-settings/wa-manager';
import { CannedResponsesManager } from '@/components/dashboard/sales-settings/canned-responses';

export function SalesSettingsContent() {
  const [data, setData] = useState<{ stages: any[]; instances: any[]; agents: any[]; templates: any[] }>({ stages: [], instances: [], agents: [], templates: [] });
  const [loading, setLoading] = useState(true);

  async function fetchAll() {
    try {
      const [stages, instances, agents, templates] = await Promise.all([
        fetchAPI<any[]>('/api/dashboard/sales/pipeline-stages'),
        fetchAPI<any[]>('/api/dashboard/sales/whatsapp/instances'),
        fetchAPI<any[]>('/api/users?role=sales_agent'),
        fetchAPI<any[]>('/api/dashboard/sales/whatsapp/templates'),
      ]);
      setData({ stages, instances, agents, templates });
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
          <TabsTrigger value="canned">ردود جاهزة</TabsTrigger>
        </TabsList>
        <TabsContent value="stages"><PipelineStagesManager stages={data.stages} onRefresh={fetchAll} /></TabsContent>
        <TabsContent value="whatsapp"><WAInstancesManager instances={data.instances} onRefresh={fetchAll} agents={data.agents} /></TabsContent>
        <TabsContent value="canned"><CannedResponsesManager templates={data.templates} onRefresh={fetchAll} /></TabsContent>
      </Tabs>
    </div>
  );
}
