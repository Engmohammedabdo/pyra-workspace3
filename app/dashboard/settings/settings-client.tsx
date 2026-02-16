'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Settings, Save } from 'lucide-react';

interface SettingsMap {
  [key: string]: string;
}

const SETTING_LABELS: Record<string, { label: string; description: string; group: string }> = {
  company_name: { label: 'اسم الشركة', description: 'اسم الشركة المعروض في النظام', group: 'company' },
  company_logo: { label: 'رابط الشعار', description: 'رابط صورة شعار الشركة', group: 'company' },
  quote_prefix: { label: 'بادئة عرض السعر', description: 'مثال: QT', group: 'quotes' },
  quote_expiry_days: { label: 'صلاحية عرض السعر (أيام)', description: 'عدد أيام صلاحية العرض الافتراضية', group: 'quotes' },
  vat_rate: { label: 'نسبة الضريبة (%)', description: 'نسبة ضريبة القيمة المضافة', group: 'quotes' },
  bank_name: { label: 'اسم البنك', description: 'اسم البنك للتحويلات', group: 'bank' },
  bank_account_name: { label: 'اسم الحساب', description: 'اسم صاحب الحساب البنكي', group: 'bank' },
  bank_account_no: { label: 'رقم الحساب', description: 'رقم الحساب البنكي', group: 'bank' },
  bank_iban: { label: 'IBAN', description: 'رقم الحساب الدولي', group: 'bank' },
  max_upload_size_mb: { label: 'أقصى حجم رفع (MB)', description: 'الحد الأقصى لحجم الملف بالميغابايت', group: 'storage' },
  max_storage_gb: { label: 'أقصى مساحة تخزين (GB)', description: 'الحد الأقصى للمساحة الكلية بالجيجابايت', group: 'storage' },
};

const GROUPS = [
  { key: 'company', label: 'معلومات الشركة' },
  { key: 'quotes', label: 'إعدادات عروض الأسعار' },
  { key: 'bank', label: 'البيانات البنكية' },
  { key: 'storage', label: 'إعدادات التخزين' },
];

export default function SettingsClient() {
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(json => { if (json.data) setSettings(json.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (json.error) { alert(json.error); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="h-6 w-6" /> الإعدادات</h1>
          <p className="text-muted-foreground">إعدادات النظام والتكوين</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 me-2" />
          {saving ? 'جارٍ الحفظ...' : saved ? 'تم الحفظ!' : 'حفظ الإعدادات'}
        </Button>
      </div>

      {GROUPS.map(group => {
        const groupSettings = Object.entries(SETTING_LABELS).filter(([, v]) => v.group === group.key);
        return (
          <Card key={group.key}>
            <CardHeader>
              <CardTitle className="text-lg">{group.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {groupSettings.map(([key, meta]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{meta.label}</Label>
                  <Input
                    id={key}
                    value={settings[key] || ''}
                    onChange={e => setSettings(prev => ({ ...prev, [key]: e.target.value }))}
                    dir={['bank_iban', 'bank_account_no', 'company_logo'].includes(key) ? 'ltr' : undefined}
                  />
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
