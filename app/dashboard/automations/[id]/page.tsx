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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Plus, Save, Loader2, Zap, ScrollText } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import { toast } from 'sonner';
import { ConditionRow } from '@/components/dashboard/automation-detail/condition-row';
import { ActionRow } from '@/components/dashboard/automation-detail/action-row';

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
const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  success: { label: 'ناجح', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  partial_failure: { label: 'جزئي', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  failed: { label: 'فشل', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

export default function EditAutomationPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [rule, setRule] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerEvent, setTriggerEvent] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [conditions, setConditions] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  const fetchRule = useCallback(async () => {
    try {
      const res = await fetch(`/api/automations/${id}`);
      const data = await res.json();
      if (!res.ok) return;
      const ruleData = data.data;
      setRule(ruleData);
      setName(ruleData.name);
      setDescription(ruleData.description || '');
      setTriggerEvent(ruleData.trigger_event);
      setIsEnabled(ruleData.is_enabled);
      setConditions(ruleData.conditions?.map((c: any) => ({ field: c.field, operator: c.operator, value: c.value })) || []);
      setActions(ruleData.actions?.map((a: any) => ({ type: a.type, config: a.config || {} })) || []);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchRule(); }, [fetchRule]);

  const handleSave = async () => {
    setSaving(true);
    const cleanActions = actions.map(a => ({ type: a.type, config: Object.fromEntries(Object.entries(a.config).filter(([k]) => k !== '__raw')) }));
    await fetch(`/api/automations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description, trigger_event: triggerEvent, conditions, actions: cleanActions, is_enabled: isEnabled }) });
    setSaving(false);
    toast.success('تم حفظ التعديلات');
    fetchRule();
  };

  if (loading) return <Skeleton className="h-[600px] max-w-4xl" />;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/automations" aria-label="العودة إلى الأتمتة"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
          <h1 className="text-2xl font-bold">تعديل {rule.name}</h1>
        </div>
      </div>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="اسم القاعدة" />
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="الوصف" />
          <Select value={triggerEvent} onValueChange={setTriggerEvent}>
            <SelectTrigger><SelectValue placeholder="حدث التشغيل" /></SelectTrigger>
            <SelectContent>{TRIGGER_EVENTS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex items-center gap-3"><Switch checked={isEnabled} onCheckedChange={setIsEnabled} /> <Label>تفعيل</Label></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle>الشروط</CardTitle><Button size="sm" onClick={() => setConditions([...conditions, { field: '', operator: 'equals', value: '' }])}><Plus className="h-4 w-4" /></Button></CardHeader>
        <CardContent className="space-y-3">{conditions.map((c, i) => <ConditionRow key={i} condition={c} index={i} updateCondition={(i, k, v) => setConditions(conditions.map((x, j) => j === i ? { ...x, [k]: v } : x))} removeCondition={(i) => setConditions(conditions.filter((_, j) => j !== i))} />)}</CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle>الإجراءات</CardTitle><Button size="sm" onClick={() => setActions([...actions, { type: 'create_notification', config: {} }])}><Plus className="h-4 w-4" /></Button></CardHeader>
        <CardContent className="space-y-4">{actions.map((a, i) => <ActionRow key={i} action={a} index={i} updateActionType={(i, t) => setActions(actions.map((x, j) => j === i ? { ...x, type: t } : x))} updateActionConfig={(i, k, v) => setActions(actions.map((x, j) => j === i ? { ...x, config: { ...x.config, [k]: v } } : x))} updateActionConfigJson={(i, j) => { try { const p = JSON.parse(j); setActions(actions.map((x, y) => y === i ? { ...x, config: p } : x)); } catch { setActions(actions.map((x, y) => y === i ? { ...x, config: { ...x.config, __raw: j } } : x)); } }} removeAction={(i) => setActions(actions.filter((_, j) => j !== i))} />)}</CardContent>
      </Card>
      <Button className="w-full" onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />} حفظ</Button>
    </div>
  );
}
