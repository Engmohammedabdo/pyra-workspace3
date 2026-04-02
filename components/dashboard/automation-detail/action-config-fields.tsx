'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  action: { type: string; config: Record<string, unknown> };
  index: number;
  updateActionConfig: (index: number, key: string, value: string) => void;
  updateActionConfigJson: (index: number, json: string) => void;
}

export function ActionConfigFields({ action, index, updateActionConfig, updateActionConfigJson }: Props) {
  const { type, config } = action;

  if (type === 'create_notification') {
    return (
      <div className="space-y-2 mt-2">
        <div className="space-y-1">
          <Label className="text-xs">المستلم</Label>
          <Input value={(config.recipient as string) || ''} onChange={(e) => updateActionConfig(index, 'recipient', e.target.value)} placeholder="admin أو اسم المستخدم" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">العنوان</Label>
          <Input value={(config.title as string) || ''} onChange={(e) => updateActionConfig(index, 'title', e.target.value)} placeholder="عنوان الإشعار" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">الرسالة</Label>
          <Input value={(config.message as string) || ''} onChange={(e) => updateActionConfig(index, 'message', e.target.value)} placeholder="نص الرسالة" />
        </div>
      </div>
    );
  }

  if (type === 'change_project_status') {
    return (
      <div className="space-y-2 mt-2">
        <div className="space-y-1">
          <Label className="text-xs">معرّف المشروع</Label>
          <Input value={(config.project_id as string) || ''} onChange={(e) => updateActionConfig(index, 'project_id', e.target.value)} placeholder="معرّف المشروع أو {{project_id}}" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">الحالة الجديدة</Label>
          <Input value={(config.new_status as string) || ''} onChange={(e) => updateActionConfig(index, 'new_status', e.target.value)} placeholder="الحالة الجديدة" />
        </div>
      </div>
    );
  }

  if (type === 'log_activity') {
    return (
      <div className="space-y-2 mt-2">
        <div className="space-y-1">
          <Label className="text-xs">نوع النشاط</Label>
          <Input value={(config.action_type as string) || ''} onChange={(e) => updateActionConfig(index, 'action_type', e.target.value)} placeholder="نوع النشاط" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">الرسالة</Label>
          <Input value={(config.message as string) || ''} onChange={(e) => updateActionConfig(index, 'message', e.target.value)} placeholder="رسالة النشاط" />
        </div>
      </div>
    );
  }

  const rawValue = (config.__raw as string) ?? JSON.stringify(Object.fromEntries(Object.entries(config).filter(([k]) => k !== '__raw')), null, 2);

  return (
    <div className="space-y-1 mt-2">
      <Label className="text-xs">الإعدادات (JSON)</Label>
      <Textarea
        value={rawValue}
        onChange={(e) => updateActionConfigJson(index, e.target.value)}
        placeholder='{"key": "value"}'
        rows={4}
        className="font-mono text-xs"
        dir="ltr"
      />
    </div>
  );
}
