'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowRight, Plus, Trash2, Save, Loader2, Zap, ScrollText,
} from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import { toast } from 'sonner';

/* ───────────────────────── Types ───────────────────────── */

interface ConditionRow {
  field: string;
  operator: string;
  value: string;
}

interface ActionRow {
  type: string;
  config: Record<string, unknown>;
}

interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  conditions: ConditionRow[];
  actions: ActionRow[];
  is_enabled: boolean;
  execution_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface LogEntry {
  id: string;
  rule_id: string;
  rule_name: string;
  trigger_event: string;
  trigger_data: Record<string, unknown> | null;
  actions_executed: Array<Record<string, unknown>> | null;
  status: string;
  error_message: string | null;
  executed_at: string;
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

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  success: { label: 'ناجح', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  partial_failure: { label: 'جزئي', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  failed: { label: 'فشل', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

/* ───────────────────────── Component ──────────────────── */

export default function EditAutomationPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  /* ── data state ── */
  const [rule, setRule] = useState<AutomationRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* ── form fields ── */
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerEvent, setTriggerEvent] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);

  /* ── saving ── */
  const [saving, setSaving] = useState(false);

  /* ── execution logs ── */
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  /* ── fetch rule ── */
  const fetchRule = useCallback(async () => {
    try {
      const res = await fetch(`/api/automations/${id}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || 'فشل في تحميل القاعدة');
        return;
      }
      const data = json.data as AutomationRule;
      setRule(data);

      // Populate form
      setName(data.name);
      setDescription(data.description || '');
      setTriggerEvent(data.trigger_event);
      setIsEnabled(data.is_enabled);
      setConditions(
        (data.conditions || []).map(c => ({
          field: c.field || '',
          operator: c.operator || 'equals',
          value: typeof c.value === 'string' ? c.value : JSON.stringify(c.value ?? ''),
        }))
      );
      setActions(
        (data.actions || []).map(a => ({
          type: a.type,
          config: a.config || {},
        }))
      );
    } catch {
      setError('حدث خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  }, [id]);

  /* ── fetch logs ── */
  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/automations/log?rule_id=${id}&pageSize=10`);
      const json = await res.json();
      if (json.data) setLogs(json.data);
    } catch {
      // silent
    } finally {
      setLoadingLogs(false);
    }
  }, [id]);

  useEffect(() => { fetchRule(); }, [fetchRule]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

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

  /* ── save ── */
  const handleSave = async () => {
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

    const cleanActions = actions.map(a => ({
      type: a.type,
      config: Object.fromEntries(
        Object.entries(a.config).filter(([k]) => k !== '__raw')
      ),
    }));

    setSaving(true);
    try {
      const res = await fetch(`/api/automations/${id}`, {
        method: 'PATCH',
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
        toast.error(json.error || 'فشل في حفظ التعديلات');
        return;
      }

      toast.success('تم حفظ التعديلات');
      fetchRule();
    } catch {
      toast.error('حدث خطأ');
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

  /* ──────────────────── Loading State ─────────────────── */
  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }

  /* ──────────────────── Error State ───────────────────── */
  if (error || !rule) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/automations">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">خطأ</h1>
        </div>
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p>{error || 'القاعدة غير موجودة'}</p>
            <Link href="/dashboard/automations">
              <Button variant="outline" className="mt-4">العودة للأتمتة</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/automations">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">تعديل القاعدة</h1>
            <p className="text-muted-foreground text-sm">
              {rule.name} — {rule.execution_count} تنفيذ
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={
            rule.is_enabled
              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
              : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
          }
        >
          {rule.is_enabled ? 'مفعّل' : 'معطّل'}
        </Badge>
      </div>

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
            <Label htmlFor="is-enabled">تفعيل القاعدة</Label>
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

      {/* Save */}
      <div className="flex items-center gap-3 justify-end">
        <Link href="/dashboard/automations">
          <Button variant="outline">إلغاء</Button>
        </Link>
        <Button
          className="bg-orange-500 hover:bg-orange-600"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 me-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 me-2" />
          )}
          حفظ التعديلات
        </Button>
      </div>

      {/* Execution Logs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-4 w-4" /> آخر سجلات التنفيذ
          </CardTitle>
          <Link href={`/dashboard/automations/log`}>
            <Button variant="outline" size="sm">عرض الكل</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-12" />
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              لا توجد سجلات تنفيذ بعد
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-start p-3 font-medium">التاريخ</th>
                    <th className="text-start p-3 font-medium">الحالة</th>
                    <th className="text-start p-3 font-medium">حدث التشغيل</th>
                    <th className="text-start p-3 font-medium">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const statusInfo = STATUS_BADGES[log.status] || {
                      label: log.status,
                      color: 'bg-gray-100 text-gray-700',
                    };
                    return (
                      <tr key={log.id} className="border-b">
                        <td className="p-3 text-muted-foreground text-xs">
                          {formatDate(log.executed_at, 'dd-MM-yyyy HH:mm')}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={statusInfo.color}>
                            {statusInfo.label}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant="secondary">
                            {TRIGGER_LABELS[log.trigger_event] || log.trigger_event}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {log.actions_executed?.length ?? 0} إجراء
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Meta info */}
      <div className="text-xs text-muted-foreground">
        أنشئت بواسطة {rule.created_by || '—'} في {formatDate(rule.created_at)} — آخر تحديث: {formatDate(rule.updated_at)}
      </div>
    </div>
  );
}
