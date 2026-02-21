'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowRight, Plus, Trash2, Save, Loader2, Zap, FileText, LayoutTemplate,
} from 'lucide-react';
import { toast } from 'sonner';

/* ───────────────────────── Types ───────────────────────── */

interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  trigger_event: string;
  conditions: ConditionRow[];
  actions: ActionRow[];
}

interface ConditionRow {
  field: string;
  operator: string;
  value: string;
}

interface ActionRow {
  type: string;
  config: Record<string, unknown>;
}

/* ───────────────────────── Constants ───────────────────── */

const TRIGGER_LABELS: Record<string, string> = {
  file_uploaded: 'رفع ملف',
  project_status_changed: 'تغيير حالة مشروع',
  quote_signed: 'توقيع عرض سعر',
  invoice_overdue: 'فاتورة متأخرة',
  client_comment: 'تعليق عميل',
  approval_status_changed: 'تغيير حالة موافقة',
  invoice_paid: 'دفع فاتورة',
  project_created: 'إنشاء مشروع',
  client_created: 'إنشاء عميل',
};

const TRIGGER_EVENTS = Object.entries(TRIGGER_LABELS);

const ACTION_TYPES: Record<string, string> = {
  create_notification: 'إنشاء إشعار',
  change_project_status: 'تغيير حالة مشروع',
  create_invoice: 'إنشاء فاتورة',
  log_activity: 'تسجيل نشاط',
  send_email: 'إرسال بريد إلكتروني',
  fire_webhook: 'تشغيل Webhook',
};

const CONDITION_OPERATORS: Record<string, string> = {
  equals: 'يساوي',
  not_equals: 'لا يساوي',
  contains: 'يحتوي',
  starts_with: 'يبدأ بـ',
  greater_than: 'أكبر من',
  less_than: 'أقل من',
  is_empty: 'فارغ',
  is_not_empty: 'غير فارغ',
};

/* ───────────────────────── Component ──────────────────── */

export default function NewAutomationPage() {
  const router = useRouter();

  /* ── tab state ── */
  const [activeTab, setActiveTab] = useState<'template' | 'manual'>('template');

  /* ── templates ── */
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  /* ── form fields ── */
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerEvent, setTriggerEvent] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);

  /* ── saving ── */
  const [saving, setSaving] = useState(false);

  /* ── fetch templates ── */
  useEffect(() => {
    fetch('/api/automations/templates')
      .then(r => r.json())
      .then(json => { if (json.data) setTemplates(json.data); })
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, []);

  /* ── template selection ── */
  const applyTemplate = (tpl: AutomationTemplate) => {
    setName(tpl.name);
    setDescription(tpl.description);
    setTriggerEvent(tpl.trigger_event);
    setConditions(
      tpl.conditions.map(c => ({
        field: c.field || '',
        operator: c.operator || 'equals',
        value: typeof c.value === 'string' ? c.value : JSON.stringify(c.value ?? ''),
      }))
    );
    setActions(
      tpl.actions.map(a => ({
        type: a.type,
        config: a.config || {},
      }))
    );
    setActiveTab('manual');
    toast.success('تم تحميل القالب');
  };

  /* ── condition helpers ── */
  const addCondition = () => {
    setConditions(prev => [...prev, { field: '', operator: 'equals', value: '' }]);
  };

  const updateCondition = (index: number, key: keyof ConditionRow, value: string) => {
    setConditions(prev => prev.map((c, i) => i === index ? { ...c, [key]: value } : c));
  };

  const removeCondition = (index: number) => {
    setConditions(prev => prev.filter((_, i) => i !== index));
  };

  /* ── action helpers ── */
  const addAction = () => {
    setActions(prev => [...prev, { type: 'create_notification', config: {} }]);
  };

  const updateActionType = (index: number, type: string) => {
    setActions(prev => prev.map((a, i) => i === index ? { type, config: {} } : a));
  };

  const updateActionConfig = (index: number, key: string, value: string) => {
    setActions(prev =>
      prev.map((a, i) =>
        i === index ? { ...a, config: { ...a.config, [key]: value } } : a
      )
    );
  };

  const updateActionConfigJson = (index: number, json: string) => {
    try {
      const parsed = JSON.parse(json);
      setActions(prev =>
        prev.map((a, i) => (i === index ? { ...a, config: parsed } : a))
      );
    } catch {
      // keep raw string in a temp field for display
      setActions(prev =>
        prev.map((a, i) =>
          i === index ? { ...a, config: { ...a.config, __raw: json } } : a
        )
      );
    }
  };

  const removeAction = (index: number) => {
    setActions(prev => prev.filter((_, i) => i !== index));
  };

  /* ── submit ── */
  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('اسم القاعدة مطلوب');
      return;
    }
    if (!triggerEvent) {
      toast.error('حدث التشغيل مطلوب');
      return;
    }
    if (actions.length === 0) {
      toast.error('يجب إضافة إجراء واحد على الأقل');
      return;
    }

    // Clean actions: remove __raw from config
    const cleanActions = actions.map(a => ({
      type: a.type,
      config: Object.fromEntries(
        Object.entries(a.config).filter(([k]) => k !== '__raw')
      ),
    }));

    setSaving(true);
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          trigger_event: triggerEvent,
          conditions,
          actions: cleanActions,
          is_enabled: isEnabled,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || 'حدث خطأ في إنشاء القاعدة');
        return;
      }

      toast.success('تم إنشاء القاعدة بنجاح');
      router.push('/dashboard/automations');
    } catch {
      toast.error('حدث خطأ في إنشاء القاعدة');
    } finally {
      setSaving(false);
    }
  };

  /* ── render action config fields ── */
  const renderActionConfig = (action: ActionRow, index: number) => {
    const { type, config } = action;

    if (type === 'create_notification') {
      return (
        <div className="space-y-2 mt-2">
          <div className="space-y-1">
            <Label className="text-xs">المستلم</Label>
            <Input
              value={(config.recipient as string) || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateActionConfig(index, 'recipient', e.target.value)}
              placeholder="admin أو اسم المستخدم"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">العنوان</Label>
            <Input
              value={(config.title as string) || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateActionConfig(index, 'title', e.target.value)}
              placeholder="عنوان الإشعار"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الرسالة</Label>
            <Input
              value={(config.message as string) || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateActionConfig(index, 'message', e.target.value)}
              placeholder="نص الرسالة"
            />
          </div>
        </div>
      );
    }

    if (type === 'change_project_status') {
      return (
        <div className="space-y-2 mt-2">
          <div className="space-y-1">
            <Label className="text-xs">معرّف المشروع</Label>
            <Input
              value={(config.project_id as string) || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateActionConfig(index, 'project_id', e.target.value)}
              placeholder="معرّف المشروع أو {{project_id}}"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الحالة الجديدة</Label>
            <Input
              value={(config.new_status as string) || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateActionConfig(index, 'new_status', e.target.value)}
              placeholder="الحالة الجديدة"
            />
          </div>
        </div>
      );
    }

    if (type === 'log_activity') {
      return (
        <div className="space-y-2 mt-2">
          <div className="space-y-1">
            <Label className="text-xs">نوع النشاط</Label>
            <Input
              value={(config.action_type as string) || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateActionConfig(index, 'action_type', e.target.value)}
              placeholder="نوع النشاط"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الرسالة</Label>
            <Input
              value={(config.message as string) || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateActionConfig(index, 'message', e.target.value)}
              placeholder="رسالة النشاط"
            />
          </div>
        </div>
      );
    }

    // For send_email, fire_webhook, create_invoice: show JSON textarea
    const rawValue = (config.__raw as string) ??
      JSON.stringify(
        Object.fromEntries(Object.entries(config).filter(([k]) => k !== '__raw')),
        null,
        2
      );

    return (
      <div className="space-y-1 mt-2">
        <Label className="text-xs">الإعدادات (JSON)</Label>
        <Textarea
          value={rawValue}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateActionConfigJson(index, e.target.value)}
          placeholder='{"key": "value"}'
          rows={4}
          className="font-mono text-xs"
          dir="ltr"
        />
      </div>
    );
  };

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/automations">
          <Button variant="ghost" size="icon">
            <ArrowRight className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">قاعدة أتمتة جديدة</h1>
          <p className="text-muted-foreground">إنشاء قاعدة أتمتة من قالب أو يدوياً</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'template'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('template')}
        >
          <LayoutTemplate className="h-4 w-4 inline-block me-1" />
          من قالب
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'manual'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('manual')}
        >
          <FileText className="h-4 w-4 inline-block me-1" />
          يدوي
        </button>
      </div>

      {/* Template Tab */}
      {activeTab === 'template' && (
        <div>
          {loadingTemplates ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-5 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : templates.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <LayoutTemplate className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p>لا توجد قوالب متاحة</p>
                <p className="text-xs mt-1">يمكنك إنشاء قاعدة يدوياً</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map(tpl => (
                <Card
                  key={tpl.id}
                  className="cursor-pointer hover:border-orange-300 dark:hover:border-orange-700 transition-colors"
                  onClick={() => applyTemplate(tpl)}
                >
                  <CardContent className="p-5 space-y-2">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-orange-500" />
                      <h3 className="font-semibold">{tpl.name}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">{tpl.description}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {TRIGGER_LABELS[tpl.trigger_event] || tpl.trigger_event}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {tpl.actions.length} إجراء
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual Tab / Form */}
      {activeTab === 'manual' && (
        <>
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>المعلومات الأساسية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>اسم القاعدة <span className="text-destructive">*</span></Label>
                <Input
                  value={name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                  placeholder="اسم قاعدة الأتمتة"
                />
              </div>

              <div className="space-y-2">
                <Label>الوصف</Label>
                <Textarea
                  value={description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                  placeholder="وصف القاعدة..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>حدث التشغيل <span className="text-destructive">*</span></Label>
                <Select value={triggerEvent} onValueChange={setTriggerEvent}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر حدث التشغيل" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_EVENTS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={isEnabled}
                  onCheckedChange={setIsEnabled}
                  id="is-enabled"
                />
                <Label htmlFor="is-enabled">تفعيل القاعدة فوراً</Label>
              </div>
            </CardContent>
          </Card>

          {/* Conditions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>الشروط</CardTitle>
              <Button variant="outline" size="sm" onClick={addCondition}>
                <Plus className="h-4 w-4 me-1" /> إضافة شرط
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {conditions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  لا توجد شروط — سيتم تنفيذ الإجراءات عند كل حدث
                </p>
              ) : (
                conditions.map((cond, index) => (
                  <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <div className="sm:col-span-4">
                      <Input
                        value={cond.field}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCondition(index, 'field', e.target.value)}
                        placeholder="الحقل (مثل: status)"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Select value={cond.operator} onValueChange={v => updateCondition(index, 'operator', v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CONDITION_OPERATORS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-4">
                      <Input
                        value={cond.value}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCondition(index, 'value', e.target.value)}
                        placeholder="القيمة"
                        disabled={cond.operator === 'is_empty' || cond.operator === 'is_not_empty'}
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeCondition(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>الإجراءات <span className="text-destructive">*</span></CardTitle>
              <Button variant="outline" size="sm" onClick={addAction}>
                <Plus className="h-4 w-4 me-1" /> إضافة إجراء
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {actions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  يجب إضافة إجراء واحد على الأقل
                </p>
              ) : (
                actions.map((action, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <Label className="text-xs mb-1 block">نوع الإجراء</Label>
                        <Select value={action.type} onValueChange={v => updateActionType(index, v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(ACTION_TYPES).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive mt-5"
                        onClick={() => removeAction(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {renderActionConfig(action, index)}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex items-center gap-3 justify-end">
            <Link href="/dashboard/automations">
              <Button variant="outline">إلغاء</Button>
            </Link>
            <Button
              className="bg-orange-500 hover:bg-orange-600"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 me-2" />
              )}
              حفظ القاعدة
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
