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
import { SlaManager } from '@/components/dashboard/sales-settings/sla-manager';
import { UserPlus, RotateCcw, Scale, Hand, Sparkles, Star } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';

type AutoAssignMode = 'manual' | 'round_robin' | 'least_busy';

export function SalesSettingsContent() {
  const [data, setData] = useState<{ stages: any[]; instances: any[]; agents: any[]; templates: any[] }>({ stages: [], instances: [], agents: [], templates: [] });
  const [loading, setLoading] = useState(true);
  const [autoAssignMode, setAutoAssignMode] = useState<AutoAssignMode>('manual');
  const [savingAutoAssign, setSavingAutoAssign] = useState(false);
  const [aiSuggestEnabled, setAiSuggestEnabled] = useState(true);
  const [savingAiSuggest, setSavingAiSuggest] = useState(false);
  const [csatEnabled, setCsatEnabled] = useState(false);
  const [savingCsat, setSavingCsat] = useState(false);

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

      // Fetch AI suggestions setting
      try {
        const allSettings = await fetchAPI<Record<string, unknown>>('/api/settings');
        if (allSettings && allSettings.whatsapp_ai_suggestions_enabled === false) {
          setAiSuggestEnabled(false);
        }
      } catch {
        // Setting doesn't exist yet — default enabled
      }

      // Fetch CSAT setting
      try {
        const csatSettings = await fetchAPI<any[]>('/api/settings?key=whatsapp_csat_enabled');
        const csatSetting = Array.isArray(csatSettings) ? csatSettings.find((s: any) => s.key === 'whatsapp_csat_enabled') : null;
        if (csatSetting?.value?.enabled === true) {
          setCsatEnabled(true);
        }
      } catch {
        // Setting doesn't exist yet — default disabled
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

  async function handleAiSuggestToggle(enabled: boolean) {
    setAiSuggestEnabled(enabled);
    setSavingAiSuggest(true);
    try {
      await mutateAPI('/api/settings', 'PUT', {
        key: 'whatsapp_ai_suggestions_enabled',
        value: enabled,
      });
      toast.success(enabled ? 'تم تفعيل الردود الذكية' : 'تم تعطيل الردود الذكية');
    } catch {
      toast.error('فشل حفظ الإعداد');
      setAiSuggestEnabled(!enabled);
    } finally {
      setSavingAiSuggest(false);
    }
  }

  async function handleCsatToggle(enabled: boolean) {
    setCsatEnabled(enabled);
    setSavingCsat(true);
    try {
      await mutateAPI('/api/settings', 'PUT', {
        key: 'whatsapp_csat_enabled',
        value: { enabled },
      });
      toast.success(enabled ? '\u062a\u0645 \u062a\u0641\u0639\u064a\u0644 \u0627\u0633\u062a\u0628\u064a\u0627\u0646 \u0631\u0636\u0627 \u0627\u0644\u0639\u0645\u0644\u0627\u0621' : '\u062a\u0645 \u062a\u0639\u0637\u064a\u0644 \u0627\u0633\u062a\u0628\u064a\u0627\u0646 \u0631\u0636\u0627 \u0627\u0644\u0639\u0645\u0644\u0627\u0621');
    } catch {
      toast.error('\u0641\u0634\u0644 \u062d\u0641\u0638 \u0627\u0644\u0625\u0639\u062f\u0627\u062f');
      setCsatEnabled(!enabled);
    } finally {
      setSavingCsat(false);
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
          <TabsTrigger value="ai-suggest">{'\u0627\u0644\u0631\u062f\u0648\u062f \u0627\u0644\u0630\u0643\u064a\u0629'}</TabsTrigger>
          <TabsTrigger value="csat">CSAT</TabsTrigger>
          <TabsTrigger value="sla">SLA</TabsTrigger>
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
        <TabsContent value="ai-suggest">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-orange-500" />
                الردود الذكية (AI)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                عند تفعيل هذا الخيار، يقوم النظام بتحليل الرسائل الواردة واقتراح ردود سريعة للوكيل.
                يمكن للوكيل اختيار اقتراح وتعديله قبل الإرسال.
              </p>
              <div
                className={cn(
                  'flex items-center justify-between p-4 rounded-xl border transition-all',
                  aiSuggestEnabled
                    ? 'border-orange-400 bg-orange-50/50 dark:bg-orange-950/20 ring-1 ring-orange-400/30'
                    : 'border-border/60'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                    aiSuggestEnabled
                      ? 'bg-orange-500/10 text-orange-600'
                      : 'bg-muted/50 text-muted-foreground'
                  )}>
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <Label className="font-semibold text-sm cursor-pointer">
                      {aiSuggestEnabled ? 'مفعّل' : 'معطّل'}
                    </Label>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {aiSuggestEnabled
                        ? 'يظهر شريط الاقتراحات فوق حقل الإدخال'
                        : 'الاقتراحات مخفية لجميع الوكلاء'
                      }
                    </p>
                  </div>
                </div>
                <Switch
                  checked={aiSuggestEnabled}
                  onCheckedChange={handleAiSuggestToggle}
                  disabled={savingAiSuggest}
                  aria-label="تفعيل الردود الذكية"
                />
              </div>
              <div className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30">
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  النظام يستخدم قواعد ذكية لتحليل الرسائل الواردة ويقترح ردوداً مناسبة بناءً على المحتوى.
                  كما يستخدم الردود الجاهزة المحفوظة كاقتراحات إضافية عند التطابق.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="csat">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                {'\u0627\u0633\u062a\u0628\u064a\u0627\u0646 \u0631\u0636\u0627 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 (CSAT)'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {'\u0639\u0646\u062f \u062a\u0641\u0639\u064a\u0644 \u0647\u0630\u0627 \u0627\u0644\u062e\u064a\u0627\u0631\u060c \u064a\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0631\u0633\u0627\u0644\u0629 \u062a\u0642\u064a\u064a\u0645 \u062a\u0644\u0642\u0627\u0626\u064a\u0629 \u0644\u0644\u0639\u0645\u064a\u0644 \u0639\u0646\u062f \u062d\u0644 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629. \u064a\u0645\u0643\u0646 \u0644\u0644\u0639\u0645\u064a\u0644 \u0627\u0644\u0631\u062f \u0628\u0631\u0642\u0645 \u0645\u0646 1 \u0625\u0644\u0649 5 \u0644\u062a\u0642\u064a\u064a\u0645 \u0627\u0644\u062e\u062f\u0645\u0629.'}
              </p>
              <div
                className={cn(
                  'flex items-center justify-between p-4 rounded-xl border transition-all',
                  csatEnabled
                    ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 ring-1 ring-amber-400/30'
                    : 'border-border/60'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                    csatEnabled
                      ? 'bg-amber-500/10 text-amber-600'
                      : 'bg-muted/50 text-muted-foreground'
                  )}>
                    <Star className="h-5 w-5" />
                  </div>
                  <div>
                    <Label className="font-semibold text-sm cursor-pointer">
                      {csatEnabled ? '\u0645\u0641\u0639\u0651\u0644' : '\u0645\u0639\u0637\u0651\u0644'}
                    </Label>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {csatEnabled
                        ? '\u064a\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0633\u062a\u0628\u064a\u0627\u0646 CSAT \u062a\u0644\u0642\u0627\u0626\u064a\u0627\u064b \u0639\u0646\u062f \u062d\u0644 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629'
                        : '\u0644\u0646 \u064a\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0633\u062a\u0628\u064a\u0627\u0646 \u062a\u0642\u064a\u064a\u0645 \u062a\u0644\u0642\u0627\u0626\u064a'
                      }
                    </p>
                  </div>
                </div>
                <Switch
                  checked={csatEnabled}
                  onCheckedChange={handleCsatToggle}
                  disabled={savingCsat}
                  aria-label={'\u062a\u0641\u0639\u064a\u0644 \u0627\u0633\u062a\u0628\u064a\u0627\u0646 CSAT'}
                />
              </div>
              <div className="p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {'\u0639\u0646\u062f \u062d\u0644 \u0645\u062d\u0627\u062f\u062b\u0629\u060c \u064a\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0631\u0633\u0627\u0644\u0629 \u062a\u0637\u0644\u0628 \u0645\u0646 \u0627\u0644\u0639\u0645\u064a\u0644 \u062a\u0642\u064a\u064a\u0645 \u0627\u0644\u062e\u062f\u0645\u0629 \u0645\u0646 1 (\u0633\u064a\u0621) \u0625\u0644\u0649 5 (\u0645\u0645\u062a\u0627\u0632). \u064a\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u0631\u062f \u062a\u0644\u0642\u0627\u0626\u064a\u0627\u064b \u062e\u0644\u0627\u0644 24 \u0633\u0627\u0639\u0629.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="sla">
          <SlaManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
