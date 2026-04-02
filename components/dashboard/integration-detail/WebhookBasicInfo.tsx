'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function WebhookBasicInfo({
  webhook,
  name, setName,
  url, setUrl,
  isEnabled, setIsEnabled,
  onSave, saving
}: {
  webhook: any;
  name: string; setName: (n: string) => void;
  url: string; setUrl: (u: string) => void;
  isEnabled: boolean; setIsEnabled: (e: boolean) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>المعلومات الأساسية</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>اسم الـ Webhook <span className="text-destructive">*</span></Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الـ Webhook" />
        </div>
        <div className="space-y-2">
          <Label>رابط الـ Webhook (URL) <span className="text-destructive">*</span></Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhook" dir="ltr" />
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={isEnabled} onCheckedChange={setIsEnabled} id="is-enabled" />
          <Label htmlFor="is-enabled">تفعيل الـ Webhook</Label>
        </div>
        <div className="pt-2">
          <Button className="bg-orange-500 hover:bg-orange-600" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Save className="h-4 w-4 me-2" />}
            حفظ التعديلات
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
