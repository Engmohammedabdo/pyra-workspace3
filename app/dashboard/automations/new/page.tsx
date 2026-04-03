'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileText, LayoutTemplate, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { AutomationTemplate, AutomationTemplate as AutomationTemplateType, ConditionRow, ActionRow } from '@/components/dashboard/automation-new/types';
import { TemplatesView } from '@/components/dashboard/automation-new/templates-view';
import { AutomationForm } from '@/components/dashboard/automation-new/automation-form';

export default function NewAutomationPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'template' | 'manual'>('template');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerEvent, setTriggerEvent] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);

  const { data: templates = [], isLoading: loadingTemplates } = useQuery<AutomationTemplateType[]>({
    queryKey: ['automations-templates'],
    queryFn: () => fetchAPI('/api/automations/templates'),
    staleTime: 5 * 60_000,
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => mutateAPI('/api/automations', 'POST', body),
    onSuccess: () => {
      toast.success('تم إنشاء القاعدة بنجاح');
      router.push('/dashboard/automations');
    },
    onError: () => toast.error('حدث خطأ'),
  });

  const saving = createMutation.isPending;

  const applyTemplate = (tpl: AutomationTemplate) => {
    setName(tpl.name);
    setDescription(tpl.description);
    setTriggerEvent(tpl.trigger_event);
    setConditions(tpl.conditions.map(c => ({ field: c.field || '', operator: c.operator || 'equals', value: typeof c.value === 'string' ? c.value : JSON.stringify(c.value ?? '') })));
    setActions(tpl.actions.map(a => ({ type: a.type, config: a.config || {} })));
    setActiveTab('manual');
    toast.success('تم تحميل القالب');
  };

  const handleSubmit = () => {
    if (!name.trim() || !triggerEvent || actions.length === 0) {
      toast.error('يجب ملء الحقول المطلوبة');
      return;
    }
    createMutation.mutate({ name: name.trim(), description: description.trim() || null, trigger_event: triggerEvent, conditions, actions, is_enabled: isEnabled });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/automations"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
        <div><h1 className="text-2xl font-bold">قاعدة أتمتة جديدة</h1><p className="text-muted-foreground">إنشاء قاعدة أتمتة</p></div>
      </div>
      <div className="flex items-center gap-2 border-b">
        <button className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'template' ? 'border-orange-500 text-orange-600' : 'border-transparent'}`} onClick={() => setActiveTab('template')}><LayoutTemplate className="h-4 w-4 inline-block me-1" /> من قالب</button>
        <button className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'manual' ? 'border-orange-500 text-orange-600' : 'border-transparent'}`} onClick={() => setActiveTab('manual')}><FileText className="h-4 w-4 inline-block me-1" /> يدوي</button>
      </div>
      {activeTab === 'template' ? (
        <TemplatesView loading={loadingTemplates} templates={templates} onApply={applyTemplate} />
      ) : (
        <>
          <AutomationForm {...{ name, setName, description, setDescription, triggerEvent, setTriggerEvent, isEnabled, setIsEnabled, conditions, setConditions, actions, setActions }} />
          <div className="flex justify-end gap-3">
            <Link href="/dashboard/automations"><Button variant="outline">إلغاء</Button></Link>
            <Button className="bg-orange-500" onClick={handleSubmit} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Save className="h-4 w-4 me-2" />} حفظ القاعدة</Button>
          </div>
        </>
      )}
    </div>
  );
}
