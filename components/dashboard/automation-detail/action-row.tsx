'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Trash2 } from 'lucide-react';
import { ActionConfigFields } from './action-config-fields';

const ACTION_TYPES: Record<string, string> = {
  create_notification: 'إنشاء إشعار',
  change_project_status: 'تغيير حالة مشروع',
  create_invoice: 'إنشاء فاتورة',
  log_activity: 'تسجيل نشاط',
  send_email: 'إرسال بريد إلكتروني',
  fire_webhook: 'تشغيل Webhook',
};

interface Props {
  action: { type: string; config: Record<string, unknown> };
  index: number;
  updateActionType: (index: number, type: string) => void;
  updateActionConfig: (index: number, key: string, value: string) => void;
  updateActionConfigJson: (index: number, json: string) => void;
  removeAction: (index: number) => void;
}

export function ActionRow({ action, index, updateActionType, updateActionConfig, updateActionConfigJson, removeAction }: Props) {
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <Label className="text-xs mb-1 block">نوع الإجراء</Label>
          <Select value={action.type} onValueChange={(v) => updateActionType(index, v)}>
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
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive mt-5" onClick={() => removeAction(index)} aria-label="حذف">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <ActionConfigFields action={action} index={index} updateActionConfig={updateActionConfig} updateActionConfigJson={updateActionConfigJson} />
    </div>
  );
}
