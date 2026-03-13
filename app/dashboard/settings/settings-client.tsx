'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormLabel } from '@/components/ui/form-label';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Settings, Save, Key, Copy, Trash2, Plus, Shield, Check,
  Building2, FileText, Receipt, Landmark, HardDrive, Globe,
  ChevronLeft, Sparkles, ExternalLink, CalendarDays, Award, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePermission } from '@/hooks/usePermission';
import Link from 'next/link';

interface SettingsMap {
  [key: string]: string;
}

/* ── Setting definitions with groups ── */
const SETTING_LABELS: Record<string, { label: string; description: string; group: string; dir?: 'ltr' }> = {
  // Company
  company_name: { label: 'اسم الشركة', description: 'اسم الشركة المعروض في النظام والمستندات', group: 'company' },
  company_logo: { label: 'رابط الشعار', description: 'رابط صورة شعار الشركة (URL)', group: 'company', dir: 'ltr' },
  // Quotes
  quote_prefix: { label: 'بادئة عرض السعر', description: 'مثال: QT — يظهر قبل رقم العرض', group: 'quotes', dir: 'ltr' },
  quote_expiry_days: { label: 'صلاحية عرض السعر (أيام)', description: 'عدد أيام صلاحية العرض الافتراضية', group: 'quotes' },
  vat_rate: { label: 'نسبة الضريبة (%)', description: 'نسبة ضريبة القيمة المضافة — تُطبق على الفواتير والعروض', group: 'quotes' },
  // Invoices (NEW)
  invoice_prefix: { label: 'بادئة الفاتورة', description: 'مثال: INV — يظهر قبل رقم الفاتورة', group: 'invoices', dir: 'ltr' },
  payment_terms_days: { label: 'مدة الدفع (أيام)', description: 'مدة الدفع الافتراضية بالأيام — تُستخدم لحساب تاريخ الاستحقاق', group: 'invoices' },
  default_currency: { label: 'العملة الافتراضية', description: 'رمز العملة — مثال: AED, USD, SAR', group: 'invoices', dir: 'ltr' },
  // Bank
  bank_name: { label: 'اسم البنك', description: 'اسم البنك للتحويلات', group: 'bank' },
  bank_account_name: { label: 'اسم الحساب', description: 'اسم صاحب الحساب البنكي', group: 'bank' },
  bank_account_no: { label: 'رقم الحساب', description: 'رقم الحساب البنكي', group: 'bank', dir: 'ltr' },
  bank_iban: { label: 'IBAN', description: 'رقم الحساب الدولي (IBAN)', group: 'bank', dir: 'ltr' },
  // Storage
  max_upload_size_mb: { label: 'أقصى حجم رفع (MB)', description: 'الحد الأقصى لحجم الملف الواحد بالميغابايت', group: 'storage' },
  max_storage_gb: { label: 'أقصى مساحة تخزين (GB)', description: 'الحد الأقصى للمساحة الكلية بالجيجابايت', group: 'storage' },
  kpi_storage_warning_percent: { label: 'نسبة تنبيه التخزين (%)', description: 'يتم إظهار تنبيه عند تجاوز هذه النسبة — الافتراضي 80%', group: 'storage' },
  // Portal (NEW)
  portal_enabled: { label: 'تفعيل بورتال العملاء', description: 'تمكين أو تعطيل بورتال العملاء بالكامل', group: 'portal' },
  portal_welcome_message: { label: 'رسالة الترحيب', description: 'رسالة ترحيب تظهر للعميل عند تسجيل الدخول', group: 'portal' },
};

/* ── Group definitions with icons and gradients ── */
const GROUPS: Array<{
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
}> = [
  { key: 'company', label: 'معلومات الشركة', icon: Building2, gradient: 'from-orange-500 to-amber-600' },
  { key: 'quotes', label: 'إعدادات عروض الأسعار', icon: FileText, gradient: 'from-blue-500 to-indigo-600' },
  { key: 'invoices', label: 'إعدادات الفواتير', icon: Receipt, gradient: 'from-emerald-500 to-teal-600' },
  { key: 'bank', label: 'البيانات البنكية', icon: Landmark, gradient: 'from-violet-500 to-purple-600' },
  { key: 'storage', label: 'إعدادات التخزين', icon: HardDrive, gradient: 'from-rose-500 to-pink-600' },
  { key: 'portal', label: 'بورتال العملاء', icon: Globe, gradient: 'from-cyan-500 to-sky-600' },
];

/* ── Sub-settings navigation links ── */
const SUB_SETTINGS = [
  { href: '/dashboard/sales/settings', label: 'إعدادات المبيعات', icon: TrendingUp, gradient: 'from-orange-500 to-amber-600', description: 'مراحل Pipeline والتصنيفات وأرقام WhatsApp' },
  { href: '/dashboard/leave/settings', label: 'إعدادات الإجازات', icon: CalendarDays, gradient: 'from-emerald-500 to-teal-600', description: 'أنواع الإجازات والأرصدة والترحيل' },
  { href: '/dashboard/evaluations/settings', label: 'إعدادات التقييم', icon: Award, gradient: 'from-violet-500 to-purple-600', description: 'معايير التقييم والأوزان والفئات' },
];

/* ── Framer Motion variants ── */
const containerMotion = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const itemMotion = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

/* ── Tabs ── */
const TABS = [
  { key: 'general', label: 'عام', icon: Settings },
  { key: 'api-keys', label: 'مفاتيح API', icon: Key },
  { key: 'modules', label: 'إعدادات الأنظمة', icon: Sparkles },
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

/* ── Section Card wrapper ── */
function SectionCard({ icon: Icon, title, gradient, children }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  gradient: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={itemMotion} className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <h3 className="font-bold text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </motion.div>
  );
}

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
      if (newKeyPermissions.includes('*')) {
        setNewKeyPermissions([]);
      } else {
        setNewKeyPermissions(['*']);
      }
      return;
    }
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
    <motion.div variants={containerMotion} initial="hidden" animate="show" className="space-y-4">
      <SectionCard icon={Shield} title="مفاتيح API الخارجية" gradient="from-amber-500 to-orange-600">
        <div className="space-y-6">
          {/* Header with create button */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              إنشاء مفاتيح API للتكامل مع الأنظمة الخارجية
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowCreateForm(!showCreateForm); setRevealedKey(null); }}
              className="rounded-xl"
            >
              <Plus className="h-4 w-4 me-1" />
              مفتاح جديد
            </Button>
          </div>

          {/* Revealed Key Banner */}
          {revealedKey && (
            <div className="rounded-xl border-2 border-yellow-500/60 bg-yellow-50 dark:bg-yellow-950/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 font-semibold text-sm">
                <Key className="h-4 w-4" />
                هذا المفتاح لن يظهر مرة أخرى — احفظه الآن
              </div>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg px-3 py-2 text-sm font-mono break-all select-all"
                  dir="ltr"
                >
                  {revealedKey}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopyKey} className="rounded-xl">
                  {copiedKey ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {/* Create New Key Form */}
          {showCreateForm && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-4">
              <h4 className="font-semibold text-sm">إنشاء مفتاح API جديد</h4>
              <div className="space-y-2">
                <FormLabel htmlFor="api-key-name" required>اسم المفتاح</FormLabel>
                <Input
                  id="api-key-name"
                  placeholder="مثال: تكامل نظام المحاسبة"
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  className="rounded-xl"
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
                <Button onClick={handleCreateKey} disabled={creatingKey} size="sm" className="rounded-xl">
                  <Key className="h-4 w-4 me-1" />
                  {creatingKey ? 'جارٍ الإنشاء...' : 'إنشاء المفتاح'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-xl"
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
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : apiKeys.length === 0 ? (
            <EmptyState
              icon={Key}
              title="لا توجد مفاتيح API"
              description="أنشئ مفتاح API للتكامل مع أنظمتك الخارجية"
            />
          ) : (
            <div className="space-y-3">
              {apiKeys.map(key => (
                <div
                  key={key.id}
                  className={`rounded-xl border border-border/60 bg-background/50 p-4 space-y-3 transition-opacity ${
                    !key.is_active ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
                          <Key className="h-3.5 w-3.5 text-white" />
                        </div>
                        <span className="font-medium text-sm truncate">{key.name}</span>
                        {!key.is_active && (
                          <Badge variant="secondary" className="text-xs">معطّل</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono ps-9" dir="ltr">
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
                  <div className="flex flex-wrap gap-1.5 ps-9">
                    {key.permissions.map(perm => (
                      <Badge key={perm} variant="outline" className="text-xs font-mono rounded-lg">
                        {perm === '*' ? 'الكل (*)' : perm}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground ps-9">
                    <span>أُنشئ: {formatDate(key.created_at)}</span>
                    <span>آخر استخدام: {formatDate(key.last_used_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </motion.div>
  );
}

/* ── Module Settings Links Tab ── */
function ModuleSettingsTab() {
  return (
    <motion.div variants={containerMotion} initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={itemMotion}>
        <p className="text-sm text-muted-foreground mb-4">
          إعدادات خاصة بكل نظام فرعي — انقر للانتقال إلى صفحة الإعدادات المطلوبة
        </p>
      </motion.div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SUB_SETTINGS.map(item => (
          <motion.div key={item.href} variants={itemMotion}>
            <Link href={item.href}>
              <div className="group rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm p-5 hover:shadow-md hover:border-orange-500/30 transition-all duration-200 cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-md shrink-0`}>
                    <item.icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm">{item.label}</h3>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
                  </div>
                  <ChevronLeft className="h-4 w-4 text-muted-foreground/40 group-hover:text-orange-500 transition-colors shrink-0 mt-1" />
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Main Settings Page
   ══════════════════════════════════════════════════════════════ */
export default function SettingsClient() {
  const canManage = usePermission('settings.manage');
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

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
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="relative rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
        {/* Decorative gradient orb */}
        <div className="absolute -top-20 -end-20 w-60 h-60 rounded-full bg-gradient-to-br from-orange-500/10 to-amber-500/5 blur-3xl pointer-events-none" />
        <div className="relative px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">الإعدادات</h1>
              <p className="text-sm text-muted-foreground">إعدادات النظام والتكوين</p>
            </div>
          </div>
          {canManage && activeTab === 'general' && (
            <Button onClick={handleSave} disabled={saving} className="rounded-xl shadow-md">
              <Save className="h-4 w-4 me-2" />
              {saving ? 'جارٍ الحفظ...' : saved ? 'تم الحفظ!' : 'حفظ الإعدادات'}
            </Button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/50 border border-border/40">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === tab.key
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      {activeTab === 'general' && (
        <motion.div
          key="general"
          variants={containerMotion}
          initial="hidden"
          animate="show"
          className="space-y-4"
        >
          {GROUPS.map(group => {
            const groupSettings = Object.entries(SETTING_LABELS).filter(([, v]) => v.group === group.key);
            if (groupSettings.length === 0) return null;
            return (
              <SectionCard
                key={group.key}
                icon={group.icon}
                title={group.label}
                gradient={group.gradient}
              >
                <div className="space-y-5">
                  {groupSettings.map(([key, meta]) => (
                    <div key={key} className="space-y-1.5">
                      <Label htmlFor={key} className="text-sm font-medium">{meta.label}</Label>
                      {key === 'portal_enabled' ? (
                        <div className="flex items-center gap-3">
                          <Switch
                            id={key}
                            checked={settings[key] === 'true' || settings[key] === '1'}
                            onCheckedChange={(checked) =>
                              setSettings(prev => ({ ...prev, [key]: checked ? 'true' : 'false' }))
                            }
                          />
                          <span className="text-sm text-muted-foreground">
                            {settings[key] === 'true' || settings[key] === '1' ? 'مفعّل' : 'معطّل'}
                          </span>
                        </div>
                      ) : (
                        <Input
                          id={key}
                          value={settings[key] || ''}
                          onChange={e => setSettings(prev => ({ ...prev, [key]: e.target.value }))}
                          dir={meta.dir || undefined}
                          className="rounded-xl"
                          disabled={!canManage}
                        />
                      )}
                      <p className="text-xs text-muted-foreground">{meta.description}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            );
          })}
        </motion.div>
      )}

      {activeTab === 'api-keys' && <ApiKeysSection />}

      {activeTab === 'modules' && <ModuleSettingsTab />}
    </div>
  );
}
