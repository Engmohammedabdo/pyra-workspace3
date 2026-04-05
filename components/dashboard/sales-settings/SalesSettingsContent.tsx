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
import { UserPlus, RotateCcw, Scale, Hand, Sparkles, Star, Clock, Bot, FileText as FileTextIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import type { BusinessHoursConfig, DaySchedule } from '@/lib/whatsapp/business-hours';

type AutoAssignMode = 'manual' | 'round_robin' | 'least_busy';

export function SalesSettingsContent() {
  const [data, setData] = useState<{ stages: any[]; instances: any[]; agents: any[]; templates: any[] }>({ stages: [], instances: [], agents: [], templates: [] });
  const [loading, setLoading] = useState(true);
  const [autoAssignMode, setAutoAssignMode] = useState<AutoAssignMode>('manual');
  const [savingAutoAssign, setSavingAutoAssign] = useState(false);
  const [aiSuggestEnabled, setAiSuggestEnabled] = useState(true);
  const [savingAiSuggest, setSavingAiSuggest] = useState(false);
  const [aiProvider, setAiProvider] = useState<'rules' | 'claude'>('rules');
  const [aiApiKey, setAiApiKey] = useState('');
  const [savingAiProvider, setSavingAiProvider] = useState(false);
  const [csatEnabled, setCsatEnabled] = useState(false);
  const [savingCsat, setSavingCsat] = useState(false);
  const [businessHours, setBusinessHours] = useState<BusinessHoursConfig>({
    enabled: false,
    timezone: 'Asia/Dubai',
    schedule: {
      sunday: { start: '09:00', end: '18:00' },
      monday: { start: '09:00', end: '18:00' },
      tuesday: { start: '09:00', end: '18:00' },
      wednesday: { start: '09:00', end: '18:00' },
      thursday: { start: '09:00', end: '18:00' },
      friday: { start: '09:00', end: '18:00', closed: true },
      saturday: { start: '09:00', end: '18:00', closed: true },
    },
    away_message: 'شكراً لتواصلك! نحن خارج ساعات العمل حالياً. سنرد عليك في أقرب وقت خلال ساعات العمل.',
  });
  const [savingBH, setSavingBH] = useState(false);

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

      // Fetch AI suggestions setting + AI provider
      try {
        const allSettings = await fetchAPI<Record<string, unknown>>('/api/settings');
        if (allSettings && allSettings.whatsapp_ai_suggestions_enabled === false) {
          setAiSuggestEnabled(false);
        }
        if (allSettings?.whatsapp_ai_provider) {
          setAiProvider(allSettings.whatsapp_ai_provider as 'rules' | 'claude');
        }
        if (allSettings?.whatsapp_ai_api_key) {
          setAiApiKey(String(allSettings.whatsapp_ai_api_key));
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

      // Fetch Business Hours setting
      try {
        const bhSettings = await fetchAPI<any[]>('/api/settings?key=whatsapp_business_hours');
        const bhSetting = Array.isArray(bhSettings) ? bhSettings.find((s: any) => s.key === 'whatsapp_business_hours') : null;
        if (bhSetting?.value) {
          setBusinessHours(bhSetting.value);
        }
      } catch {
        // Setting doesn't exist yet — use defaults
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

  async function handleAiProviderSave(provider: 'rules' | 'claude', key: string) {
    setSavingAiProvider(true);
    try {
      await mutateAPI('/api/settings', 'PUT', {
        key: 'whatsapp_ai_provider',
        value: provider,
      });
      if (provider === 'claude' && key) {
        await mutateAPI('/api/settings', 'PUT', {
          key: 'whatsapp_ai_api_key',
          value: key,
        });
      }
      toast.success('تم حفظ إعداد مزود الذكاء الاصطناعي');
    } catch {
      toast.error('فشل حفظ الإعداد');
    } finally {
      setSavingAiProvider(false);
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

  async function handleSaveBusinessHours(config: BusinessHoursConfig) {
    setSavingBH(true);
    try {
      await mutateAPI('/api/settings', 'PUT', {
        key: 'whatsapp_business_hours',
        value: config,
      });
      setBusinessHours(config);
      toast.success('تم حفظ ساعات العمل');
    } catch {
      toast.error('فشل حفظ الإعداد');
    } finally {
      setSavingBH(false);
    }
  }

  function updateDaySchedule(day: string, field: keyof DaySchedule, value: string | boolean) {
    const updated = { ...businessHours };
    updated.schedule = { ...updated.schedule };
    updated.schedule[day] = { ...updated.schedule[day], [field]: value };
    setBusinessHours(updated);
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
          <TabsTrigger value="business-hours">ساعات العمل</TabsTrigger>
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
              {/* AI Provider Selection */}
              {aiSuggestEnabled && (
                <div className="space-y-3 border-t border-border/40 pt-4">
                  <p className="text-sm font-medium">مزود الاقتراحات</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        setAiProvider('rules');
                        handleAiProviderSave('rules', aiApiKey);
                      }}
                      disabled={savingAiProvider}
                      className={cn(
                        'p-3 rounded-xl border text-start transition-all',
                        aiProvider === 'rules'
                          ? 'border-orange-400 bg-orange-50/50 dark:bg-orange-950/20 ring-1 ring-orange-400/30'
                          : 'border-border/60 hover:border-border hover:bg-muted/30',
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <FileTextIcon className="h-4 w-4 text-orange-500" />
                        <span className="text-sm font-medium">قواعد ثابتة</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70">
                        تحليل الكلمات المفتاحية + القوالب المحفوظة
                      </p>
                    </button>
                    <button
                      onClick={() => {
                        setAiProvider('claude');
                        if (aiApiKey) handleAiProviderSave('claude', aiApiKey);
                      }}
                      disabled={savingAiProvider}
                      className={cn(
                        'p-3 rounded-xl border text-start transition-all',
                        aiProvider === 'claude'
                          ? 'border-purple-400 bg-purple-50/50 dark:bg-purple-950/20 ring-1 ring-purple-400/30'
                          : 'border-border/60 hover:border-border hover:bg-muted/30',
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Bot className="h-4 w-4 text-purple-500" />
                        <span className="text-sm font-medium">Claude AI</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70">
                        ردود ذكية بالذكاء الاصطناعي
                      </p>
                    </button>
                  </div>

                  {aiProvider === 'claude' && (
                    <div className="space-y-2">
                      <Label className="text-xs">مفتاح API</Label>
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          value={aiApiKey}
                          onChange={(e) => setAiApiKey(e.target.value)}
                          placeholder="sk-ant-..."
                          className="flex-1"
                          dir="ltr"
                        />
                        <button
                          onClick={() => handleAiProviderSave('claude', aiApiKey)}
                          disabled={!aiApiKey || savingAiProvider}
                          className="px-4 py-2 rounded-lg bg-purple-500 text-white text-xs font-medium hover:bg-purple-600 disabled:opacity-50 transition-colors"
                        >
                          حفظ
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground/50">
                        يتم استخدام Claude 3.5 Sonnet لتوليد الاقتراحات. التكلفة التقديرية: ~$0.003 لكل اقتراح.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30">
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  {aiProvider === 'claude'
                    ? 'يستخدم Claude AI لتحليل سياق المحادثة واقتراح ردود مخصصة. في حالة فشل الاتصال يتم الرجوع للقواعد الثابتة.'
                    : 'النظام يستخدم قواعد ذكية لتحليل الرسائل الواردة ويقترح ردوداً مناسبة بناءً على المحتوى.'
                  }
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
        <TabsContent value="business-hours">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-orange-500" />
                ساعات العمل
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                حدد ساعات العمل الرسمية. عند استلام رسالة خارج هذه الساعات، يتم إرسال رسالة تلقائية.
              </p>

              {/* Enable/Disable Toggle */}
              <div className={cn(
                'flex items-center justify-between p-4 rounded-xl border transition-all',
                businessHours.enabled
                  ? 'border-orange-400 bg-orange-50/50 dark:bg-orange-950/20 ring-1 ring-orange-400/30'
                  : 'border-border/60'
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                    businessHours.enabled ? 'bg-orange-500/10 text-orange-600' : 'bg-muted/50 text-muted-foreground'
                  )}>
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <Label className="font-semibold text-sm cursor-pointer">
                      {businessHours.enabled ? 'مفعّل' : 'معطّل'}
                    </Label>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {businessHours.enabled ? 'رسالة تلقائية خارج ساعات العمل' : 'لن يتم إرسال رسالة تلقائية'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={businessHours.enabled}
                  onCheckedChange={enabled => {
                    const updated = { ...businessHours, enabled };
                    setBusinessHours(updated);
                  }}
                  aria-label="تفعيل ساعات العمل"
                />
              </div>

              {/* Timezone */}
              <div className="space-y-1">
                <Label className="text-xs">المنطقة الزمنية</Label>
                <select
                  value={businessHours.timezone}
                  onChange={e => setBusinessHours({ ...businessHours, timezone: e.target.value })}
                  className="w-full p-2 rounded-lg border border-border/60 bg-background text-sm"
                >
                  <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                  <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                  <option value="Asia/Kuwait">Asia/Kuwait (GMT+3)</option>
                  <option value="Europe/London">Europe/London (GMT+0)</option>
                  <option value="America/New_York">America/New_York (GMT-5)</option>
                </select>
              </div>

              {/* Schedule */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">الجدول الأسبوعي</Label>
                {(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const).map(day => {
                  const dayLabels: Record<string, string> = {
                    sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء',
                    thursday: 'الخميس', friday: 'الجمعة', saturday: 'السبت',
                  };
                  const sched = businessHours.schedule[day] || { start: '09:00', end: '18:00' };
                  return (
                    <div key={day} className={cn(
                      'flex items-center gap-3 p-2 rounded-lg border',
                      sched.closed ? 'border-border/30 bg-muted/20 opacity-60' : 'border-border/60'
                    )}>
                      <span className="text-sm font-medium w-20 shrink-0">{dayLabels[day]}</span>
                      <label className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="checkbox"
                          checked={!!sched.closed}
                          onChange={e => updateDaySchedule(day, 'closed', e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-xs text-muted-foreground">مغلق</span>
                      </label>
                      {!sched.closed && (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            type="time"
                            value={sched.start}
                            onChange={e => updateDaySchedule(day, 'start', e.target.value)}
                            className="h-8 text-xs w-28"
                          />
                          <span className="text-xs text-muted-foreground">إلى</span>
                          <Input
                            type="time"
                            value={sched.end}
                            onChange={e => updateDaySchedule(day, 'end', e.target.value)}
                            className="h-8 text-xs w-28"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Away Message */}
              <div className="space-y-1">
                <Label className="text-xs">رسالة خارج ساعات العمل</Label>
                <Textarea
                  value={businessHours.away_message}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setBusinessHours({ ...businessHours, away_message: e.target.value })
                  }
                  placeholder="رسالة تلقائية خارج ساعات العمل..."
                  rows={3}
                />
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <button
                  onClick={() => handleSaveBusinessHours(businessHours)}
                  disabled={savingBH}
                  className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {savingBH ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
                </button>
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
