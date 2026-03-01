'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormLabel } from '@/components/ui/form-label';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Settings, Save, Key, Copy, Trash2, Plus, Shield, Check } from 'lucide-react';
import { toast } from 'sonner';

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

// --- API Keys Section Types & Constants ---

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

const AVAILABLE_PERMISSIONS = [
  { value: '*', label: 'الكل' },
  { value: 'expenses:read', label: 'expenses:read' },
  { value: 'expenses:create', label: 'expenses:create' },
  { value: 'invoices:read', label: 'invoices:read' },
  { value: 'invoices:create', label: 'invoices:create' },
  { value: 'invoices:send', label: 'invoices:send' },
  { value: 'subscriptions:read', label: 'subscriptions:read' },
  { value: 'subscriptions:create', label: 'subscriptions:create' },
  { value: 'alerts:read', label: 'alerts:read' },
  { value: 'payments:read', label: 'payments:read' },
];

// --- API Keys Management Sub-Component ---

function ApiKeysSection() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPermissions, setNewKeyPermissions] = useState<string[]>([]);
  const [creatingKey, setCreatingKey] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchApiKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/api-keys');
      const json = await res.json();
      if (json.data) setApiKeys(json.data);
    } catch (err) {
      console.error(err);
      toast.error('فشل تحميل مفاتيح API');
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  const handlePermissionToggle = (perm: string) => {
    if (perm === '*') {
      // If selecting "all", clear others and just set *
      if (newKeyPermissions.includes('*')) {
        setNewKeyPermissions([]);
      } else {
        setNewKeyPermissions(['*']);
      }
      return;
    }
    // If selecting a specific perm, remove * if present
    setNewKeyPermissions(prev => {
      const without = prev.filter(p => p !== '*');
      return without.includes(perm) ? without.filter(p => p !== perm) : [...without, perm];
    });
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('يرجى إدخال اسم المفتاح');
      return;
    }
    if (newKeyPermissions.length === 0) {
      toast.error('يرجى اختيار صلاحية واحدة على الأقل');
      return;
    }
    setCreatingKey(true);
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim(), permissions: newKeyPermissions }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        return;
      }
      // Show the full key once
      setRevealedKey(json.data?.key || json.key || null);
      setCopiedKey(false);
      toast.success('تم إنشاء مفتاح API بنجاح');
      setNewKeyName('');
      setNewKeyPermissions([]);
      fetchApiKeys();
    } catch (err) {
      console.error(err);
      toast.error('فشل إنشاء المفتاح');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleCopyKey = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopiedKey(true);
      toast.success('تم نسخ المفتاح');
      setTimeout(() => setCopiedKey(false), 3000);
    } catch {
      toast.error('فشل نسخ المفتاح');
    }
  };

  const handleToggleActive = async (key: ApiKey) => {
    setTogglingId(key.id);
    try {
      const res = await fetch(`/api/settings/api-keys/${key.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !key.is_active }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        return;
      }
      setApiKeys(prev =>
        prev.map(k => (k.id === key.id ? { ...k, is_active: !k.is_active } : k))
      );
      toast.success(key.is_active ? 'تم تعطيل المفتاح' : 'تم تفعيل المفتاح');
    } catch (err) {
      console.error(err);
      toast.error('فشل تحديث حالة المفتاح');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteKey = async (key: ApiKey) => {
    const confirmed = window.confirm(`هل أنت متأكد من حذف المفتاح "${key.name}"؟ لا يمكن التراجع عن هذا الإجراء.`);
    if (!confirmed) return;
    setDeletingId(key.id);
    try {
      const res = await fetch(`/api/settings/api-keys/${key.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        return;
      }
      setApiKeys(prev => prev.filter(k => k.id !== key.id));
      toast.success('تم حذف المفتاح');
    } catch (err) {
      console.error(err);
      toast.error('فشل حذف المفتاح');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            مفاتيح API الخارجية
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowCreateForm(!showCreateForm); setRevealedKey(null); }}
          >
            <Plus className="h-4 w-4 me-1" />
            إنشاء مفتاح جديد
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Revealed Key Banner */}
        {revealedKey && (
          <div className="rounded-lg border-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30 p-4 space-y-3">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 font-semibold text-sm">
              <Key className="h-4 w-4" />
              هذا المفتاح لن يظهر مرة أخرى
            </div>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 bg-yellow-100 dark:bg-yellow-900/50 rounded px-3 py-2 text-sm font-mono break-all select-all"
                dir="ltr"
              >
                {revealedKey}
              </code>
              <Button variant="outline" size="sm" onClick={handleCopyKey}>
                {copiedKey ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {/* Create New Key Form */}
        {showCreateForm && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
            <h4 className="font-semibold text-sm">إنشاء مفتاح API جديد</h4>
            <div className="space-y-2">
              <FormLabel htmlFor="api-key-name" required>اسم المفتاح</FormLabel>
              <Input
                id="api-key-name"
                placeholder="مثال: تكامل نظام المحاسبة"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>الصلاحيات</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {AVAILABLE_PERMISSIONS.map(perm => (
                  <div key={perm.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`perm-${perm.value}`}
                      checked={newKeyPermissions.includes(perm.value)}
                      onCheckedChange={() => handlePermissionToggle(perm.value)}
                    />
                    <Label
                      htmlFor={`perm-${perm.value}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {perm.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleCreateKey} disabled={creatingKey} size="sm">
                <Key className="h-4 w-4 me-1" />
                {creatingKey ? 'جارٍ الإنشاء...' : 'إنشاء المفتاح'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowCreateForm(false); setNewKeyName(''); setNewKeyPermissions([]); }}
              >
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {/* Existing Keys List */}
        {loadingKeys ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Key className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">لا توجد مفاتيح API حتى الآن</p>
          </div>
        ) : (
          <div className="space-y-3">
            {apiKeys.map(key => (
              <div
                key={key.id}
                className={`rounded-lg border p-4 space-y-3 transition-opacity ${
                  !key.is_active ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate">{key.name}</span>
                      {!key.is_active && (
                        <Badge variant="secondary" className="text-xs">معطّل</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono" dir="ltr">
                      {key.key_prefix}••••••••
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={key.is_active}
                      onCheckedChange={() => handleToggleActive(key)}
                      disabled={togglingId === key.id}
                      aria-label={key.is_active ? 'تعطيل المفتاح' : 'تفعيل المفتاح'}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteKey(key)}
                      disabled={deletingId === key.id}
                      aria-label="حذف المفتاح"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {key.permissions.map(perm => (
                    <Badge key={perm} variant="outline" className="text-xs font-mono">
                      {perm === '*' ? 'الكل (*)' : perm}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>أُنشئ: {formatDate(key.created_at)}</span>
                  <span>آخر استخدام: {formatDate(key.last_used_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
      if (json.error) { toast.error(json.error); return; }
      setSaved(true);
      toast.success('تم حفظ الإعدادات');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
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

      {/* API Keys Management Section */}
      <Separator />
      <ApiKeysSection />
    </div>
  );
}
