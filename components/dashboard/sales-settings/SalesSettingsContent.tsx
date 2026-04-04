'use client';

import { useState, useEffect } from 'react';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { PipelineStagesManager } from '@/components/dashboard/sales-settings/pipeline-stages';
import { WAInstancesManager } from '@/components/dashboard/sales-settings/wa-manager';
import { CannedResponsesManager } from '@/components/dashboard/sales-settings/canned-responses';
import { UserPlus, RotateCcw, Scale, Hand } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';

type AutoAssignMode = 'manual' | 'round_robin' | 'least_busy';

export function SalesSettingsContent() {
  const [data, setData] = useState<{ stages: any[]; instances: any[]; agents: any[]; templates: any[] }>({ stages: [], instances: [], agents: [], templates: [] });
  const [loading, setLoading] = useState(true);
  const [autoAssignMode, setAutoAssignMode] = useState<AutoAssignMode>('manual');
  const [savingAutoAssign, setSavingAutoAssign] = useState(false);

  async function fetchAll() {
    try {
      const [stages, instances, agents, templates] = await Promise.all([
        fetchAPI<any[]>('/api/dashboard/sales/pipeline-stages'),
        fetchAPI<any[]>('/api/dashboard/sales/whatsapp/instances'),
        fetchAPI<any[]>('/api/users?role=sales_agent'),
        fetchAPI<any[]>('/api/dashboard/sales/whatsapp/templates'),
      ]);
      setData({ stages, instances, agents, templates });

      // Fetch auto-assignment setting
      try {
        const settings = await fetchAPI<any[]>('/api/settings?key=whatsapp_auto_assignment');
        const setting = Array.isArray(settings) ? settings.find((s: any) => s.key === 'whatsapp_auto_assignment') : null;
        if (setting?.value?.mode) {
          setAutoAssignMode(setting.value.mode);
        }
      } catch {
        // Setting doesn't exist yet — use default
      }
    } catch { } finally { setLoading(false); }
  }

  useEffect(() => { fetchAll(); }, []);

  async function handleAutoAssignChange(mode: AutoAssignMode) {
    setAutoAssignMode(mode);
    setSavingAutoAssign(true);
    try {
      await mutateAPI('/api/settings', 'PUT', {
        key: 'whatsapp_auto_assignment',
        value: { mode },
      });
      toast.success('تم حفظ إعداد التعيين التلقائي');
    } catch {
      toast.error('فشل حفظ الإعداد');
    } finally {
      setSavingAutoAssign(false);
    }
  }

  if (loading) return <div className="space-y-6"><Skeleton className="h-96 w-full" /></div>;

  const autoAssignOptions: { key: AutoAssignMode; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'manual', label: 'يدوي', desc: 'المدير يوزع المحادثات يدوياً', icon: Hand },
    { key: 'round_robin', label: 'توزيع بالتناوب', desc: 'توزيع تلقائي بالتناوب على الوكلاء', icon: RotateCcw },
    { key: 'least_busy', label: 'الأقل عبئاً', desc: 'تعيين للوكيل صاحب أقل محادثات مفتوحة', icon: Scale },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">إعدادات المبيعات</h1>
      <Tabs defaultValue="stages">
        <TabsList>
          <TabsTrigger value="stages">مراحل Pipeline</TabsTrigger>
          <TabsTrigger value="whatsapp">واتساب</TabsTrigger>
          <TabsTrigger value="canned">ردود جاهزة</TabsTrigger>
          <TabsTrigger value="assignment">التعيين التلقائي</TabsTrigger>
        </TabsList>
        <TabsContent value="stages"><PipelineStagesManager stages={data.stages} onRefresh={fetchAll} /></TabsContent>
        <TabsContent value="whatsapp"><WAInstancesManager instances={data.instances} onRefresh={fetchAll} agents={data.agents} /></TabsContent>
        <TabsContent value="canned"><CannedResponsesManager templates={data.templates} onRefresh={fetchAll} /></TabsContent>
        <TabsContent value="assignment">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserPlus className="h-5 w-5 text-orange-500" />
                التعيين التلقائي للمحادثات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                اختر كيفية تعيين المحادثات الجديدة تلقائياً للوكلاء
              </p>
              <div className="space-y-3">
                {autoAssignOptions.map(option => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.key}
                      onClick={() => handleAutoAssignChange(option.key)}
                      disabled={savingAutoAssign}
                      className={cn(
                        'w-full flex items-start gap-3 p-4 rounded-xl border transition-all text-start',
                        autoAssignMode === option.key
                          ? 'border-orange-400 bg-orange-50/50 dark:bg-orange-950/20 ring-1 ring-orange-400/30'
                          : 'border-border/60 hover:border-border hover:bg-muted/30'
                      )}
                    >
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                        autoAssignMode === option.key
                          ? 'bg-orange-500/10 text-orange-600'
                          : 'bg-muted/50 text-muted-foreground'
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <Label className="font-semibold text-sm cursor-pointer">{option.label}</Label>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">{option.desc}</p>
                      </div>
                      <div className="ms-auto shrink-0 mt-1">
                        <div className={cn(
                          'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                          autoAssignMode === option.key
                            ? 'border-orange-500 bg-orange-500'
                            : 'border-border'
                        )}>
                          {autoAssignMode === option.key && (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {data.agents.length === 0 && autoAssignMode !== 'manual' && (
                <div className="p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    لا يوجد وكلاء مبيعات نشطين. أضف وكلاء أولاً لتفعيل التعيين التلقائي.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
