'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  CreditCard, Eye, EyeOff, Bell, ArrowDownCircle, Percent,
  Search, Info, Lightbulb, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePermission } from '@/hooks/usePermission';
import Link from 'next/link';

interface SettingsMap {
  [key: string]: string;
}

/* ═══════════════════════════════════════════════════════
   Setting definitions with groups + tips
   ═══════════════════════════════════════════════════════ */
const SETTING_LABELS: Record<string, {
  label: string;
  description: string;
  group: string;
  dir?: 'ltr';
  placeholder?: string;
}> = {
  // Company
  company_name: { label: 'اسم الشركة', description: 'يظهر في الفواتير والعروض والمستندات الرسمية', group: 'company', placeholder: 'مثال: بيراميديا إكس' },
  company_logo: { label: 'رابط الشعار', description: 'رابط مباشر لصورة الشعار بصيغة PNG أو SVG', group: 'company', dir: 'ltr', placeholder: 'https://example.com/logo.png' },
  // Quotes
  quote_prefix: { label: 'بادئة عرض السعر', description: 'يظهر قبل رقم العرض — مثال: QT-0001', group: 'quotes', dir: 'ltr', placeholder: 'QT' },
  quote_expiry_days: { label: 'صلاحية عرض السعر (أيام)', description: 'المدة الافتراضية قبل انتهاء صلاحية العرض', group: 'quotes', placeholder: '30' },
  vat_rate: { label: 'نسبة الضريبة (%)', description: 'ضريبة القيمة المضافة — تُطبق تلقائياً على الفواتير والعروض', group: 'quotes', placeholder: '5' },
  // Invoices
  invoice_prefix: { label: 'بادئة الفاتورة', description: 'يظهر قبل رقم الفاتورة — مثال: INV-0001', group: 'invoices', dir: 'ltr', placeholder: 'INV' },
  payment_terms_days: { label: 'مدة الدفع (أيام)', description: 'يُستخدم لحساب تاريخ الاستحقاق تلقائياً', group: 'invoices', placeholder: '30' },
  default_currency: { label: 'العملة الافتراضية', description: 'العملات المدعومة: AED, USD, EUR, SAR, GBP', group: 'invoices', dir: 'ltr', placeholder: 'AED' },
  default_early_payment_discount_percent: { label: 'خصم الدفع المبكر (%)', description: 'خصم يُمنح للعميل عند الدفع قبل الموعد', group: 'invoices', placeholder: '2' },
  default_early_payment_discount_days: { label: 'أيام الدفع المبكر', description: 'عدد الأيام المطلوبة للاستفادة من الخصم', group: 'invoices', placeholder: '10' },
  credit_note_prefix: { label: 'بادئة الإشعار الدائن', description: 'يظهر قبل رقم الإشعار — مثال: CN-0001', group: 'invoices', dir: 'ltr', placeholder: 'CN' },
  po_prefix: { label: 'بادئة أمر الشراء', description: 'يظهر قبل رقم أمر الشراء — مثال: PO-0001', group: 'invoices', dir: 'ltr', placeholder: 'PO' },
  // Bank
  bank_name: { label: 'اسم البنك', description: 'يظهر في بيانات التحويل على الفواتير', group: 'bank', placeholder: 'مثال: بنك أبوظبي الأول' },
  bank_account_name: { label: 'اسم صاحب الحساب', description: 'الاسم المسجل في البنك', group: 'bank', placeholder: 'مثال: Pyramedia X LLC' },
  bank_account_no: { label: 'رقم الحساب', description: 'رقم الحساب البنكي', group: 'bank', dir: 'ltr', placeholder: '1234567890' },
  bank_iban: { label: 'IBAN', description: 'رقم الحساب الدولي (International Bank Account Number)', group: 'bank', dir: 'ltr', placeholder: 'AE070331234567890123456' },
  // Storage
  max_upload_size_mb: { label: 'أقصى حجم رفع (MB)', description: 'الحد الأقصى لحجم الملف الواحد', group: 'storage', placeholder: '50' },
  max_storage_gb: { label: 'أقصى مساحة تخزين (GB)', description: 'المساحة الكلية المتاحة لجميع الملفات', group: 'storage', placeholder: '100' },
  kpi_storage_warning_percent: { label: 'نسبة تنبيه التخزين (%)', description: 'يظهر تنبيه عند تجاوز هذه النسبة من المساحة', group: 'storage', placeholder: '80' },
  // Portal
  portal_enabled: { label: 'تفعيل بورتال العملاء', description: 'عند التعطيل، لن يتمكن العملاء من تسجيل الدخول', group: 'portal' },
  portal_welcome_message: { label: 'رسالة الترحيب', description: 'تظهر للعميل في صفحة البورتال الرئيسية', group: 'portal', placeholder: 'مرحباً بك في بوابة العملاء' },
  // Dunning
  dunning_enabled: { label: 'تفعيل نظام التحصيل', description: 'تذكيرات تلقائية بالبريد للفواتير المتأخرة', group: 'dunning' },
  late_penalty_rate: { label: 'نسبة غرامة التأخير (%)', description: 'تُضاف تلقائياً على الفواتير المتأخرة', group: 'dunning', placeholder: '2' },
  late_penalty_grace_days: { label: 'أيام السماح', description: 'فترة سماح بعد تاريخ الاستحقاق', group: 'dunning', placeholder: '7' },
  dunning_reminder_interval_days: { label: 'الفترة بين التذكيرات (أيام)', description: 'المدة بين كل تذكير تحصيل وآخر', group: 'dunning', placeholder: '7' },
  // Expenses
  expense_approval_required: { label: 'اعتماد المصروفات', description: 'عند التفعيل، تحتاج المصروفات الجديدة موافقة مدير', group: 'expenses' },
  // Commissions
  commission_rate: { label: 'نسبة العمولة الافتراضية (%)', description: 'تُستخدم إذا لم يكن للموظف نسبة خاصة', group: 'commissions', placeholder: '5' },
  commission_trigger: { label: 'توقيت الاحتساب', description: 'payment = عند الدفع، invoice = عند إصدار الفاتورة', group: 'commissions', dir: 'ltr', placeholder: 'payment' },
  commission_auto_calculate: { label: 'احتساب تلقائي', description: 'حساب العمولات تلقائياً عند تسجيل الدفع (يدوي + Stripe)', group: 'commissions' },
  // Stripe
  stripe_enabled: { label: 'تفعيل الدفع الإلكتروني', description: 'تمكين أو تعطيل الدفع عبر Stripe', group: 'stripe' },
  stripe_publishable_key: { label: 'Publishable Key', description: 'المفتاح العام — يبدأ بـ pk_live_ أو pk_test_', group: 'stripe', dir: 'ltr', placeholder: 'pk_live_...' },
  stripe_secret_key: { label: 'Secret Key', description: 'المفتاح السري — لا تشاركه مع أحد', group: 'stripe', dir: 'ltr', placeholder: 'sk_live_...' },
  stripe_webhook_secret: { label: 'Webhook Secret', description: 'سر التحقق من إشعارات Stripe', group: 'stripe', dir: 'ltr', placeholder: 'whsec_...' },
};

/* ═══════════════════════════════════════════════════════
   Group definitions organized into categories
   ═══════════════════════════════════════════════════════ */
interface GroupDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  tip: string;
  category: 'business' | 'finance' | 'system';
}

const GROUPS: GroupDef[] = [
  // Business
  { key: 'company', label: 'معلومات الشركة', icon: Building2, gradient: 'from-orange-500 to-amber-600', category: 'business',
    tip: 'هذه البيانات تظهر في رأس الفواتير والعروض والمستندات الرسمية. تأكد من دقتها.' },
  { key: 'bank', label: 'البيانات البنكية', icon: Landmark, gradient: 'from-violet-500 to-purple-600', category: 'business',
    tip: 'تظهر في ذيل الفواتير لتسهيل التحويل البنكي. تأكد من صحة رقم IBAN.' },
  { key: 'portal', label: 'بورتال العملاء', icon: Globe, gradient: 'from-cyan-500 to-sky-600', category: 'business',
    tip: 'البورتال يتيح للعملاء متابعة مشاريعهم وفواتيرهم. يمكنك تعطيله مؤقتاً عند الحاجة.' },
  // Finance
  { key: 'quotes', label: 'عروض الأسعار', icon: FileText, gradient: 'from-blue-500 to-indigo-600', category: 'finance',
    tip: 'البادئة ونسبة الضريبة تُطبق تلقائياً عند إنشاء عرض سعر جديد.' },
  { key: 'invoices', label: 'الفواتير والمستندات', icon: Receipt, gradient: 'from-emerald-500 to-teal-600', category: 'finance',
    tip: 'هذه الإعدادات تتحكم في الترقيم التلقائي ومدة الدفع والخصومات لجميع المستندات المالية.' },
  { key: 'dunning', label: 'التحصيل والتذكيرات', icon: Bell, gradient: 'from-red-500 to-rose-600', category: 'finance',
    tip: 'نظام التحصيل يرسل تذكيرات تلقائية بالبريد للفواتير المتأخرة ويطبق غرامات التأخير.' },
  { key: 'expenses', label: 'المصروفات', icon: ArrowDownCircle, gradient: 'from-amber-500 to-yellow-600', category: 'finance',
    tip: 'عند تفعيل الاعتماد، المصروفات الجديدة تكون بحالة "معلّقة" حتى يوافق عليها المدير.' },
  { key: 'commissions', label: 'العمولات', icon: Percent, gradient: 'from-emerald-500 to-teal-600', category: 'finance',
    tip: 'العمولات تُحسب تلقائياً عند تسجيل الدفع. يمكن تخصيص نسبة لكل موظف من ملفه الشخصي.' },
  // System
  { key: 'storage', label: 'التخزين', icon: HardDrive, gradient: 'from-rose-500 to-pink-600', category: 'system',
    tip: 'حدود التخزين تحمي من الاستهلاك المفرط. نسبة التنبيه تظهر إشعاراً في لوحة التحكم.' },
  { key: 'stripe', label: 'الدفع الإلكتروني', icon: CreditCard, gradient: 'from-indigo-500 to-purple-600', category: 'system',
    tip: 'احصل على المفاتيح من dashboard.stripe.com. استخدم مفاتيح test_ أثناء التجربة.' },
];

const CATEGORIES = [
  { key: 'business', label: 'الشركة والأعمال', icon: Building2 },
  { key: 'finance', label: 'المالية والفوترة', icon: Receipt },
  { key: 'system', label: 'النظام والتقنية', icon: HardDrive },
] as const;

/* ── Sub-settings navigation ── */
const SUB_SETTINGS = [
  { href: '/dashboard/sales/settings', label: 'إعدادات المبيعات', icon: TrendingUp, gradient: 'from-orange-500 to-amber-600', description: 'مراحل Pipeline والتصنيفات وأرقام WhatsApp' },
  { href: '/dashboard/leave/settings', label: 'إعدادات الإجازات', icon: CalendarDays, gradient: 'from-emerald-500 to-teal-600', description: 'أنواع الإجازات والأرصدة والترحيل' },
  { href: '/dashboard/evaluations/settings', label: 'إعدادات التقييم', icon: Award, gradient: 'from-violet-500 to-purple-600', description: 'معايير التقييم والأوزان والفئات' },
];

/* ── Tabs ── */
const TABS = [
  { key: 'general', label: 'عام', icon: Settings },
  { key: 'api-keys', label: 'مفاتيح API', icon: Key },
  { key: 'modules', label: 'إعدادات الأنظمة', icon: Sparkles },
];

/* ── Secret fields ── */
const SECRET_FIELDS = new Set(['stripe_secret_key', 'stripe_webhook_secret']);
const SWITCH_FIELDS = new Set(['portal_enabled', 'stripe_enabled', 'dunning_enabled', 'expense_approval_required', 'commission_auto_calculate']);

/* ── Framer Motion ── */
const containerMotion = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};
const itemMotion = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

/* ═══════════════════════════════════════════════════════
   Tip Banner Component
   ═══════════════════════════════════════════════════════ */
function TipBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-200/50 dark:border-orange-800/30 px-4 py-3 mb-5">
      <Lightbulb className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
      <p className="text-xs text-orange-700 dark:text-orange-400 leading-relaxed">{text}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Section Card Wrapper
   ═══════════════════════════════════════════════════════ */
function SectionCard({ icon: Icon, title, gradient, tip, children, id }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  gradient: string;
  tip?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <motion.div
      id={id}
      variants={itemMotion}
      className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden scroll-mt-32"
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <h3 className="font-bold text-sm">{title}</h3>
      </div>
      <div className="p-5">
        {tip && <TipBanner text={tip} />}
        {children}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
   Settings Field Component
   ═══════════════════════════════════════════════════════ */
function SettingField({ settingKey, meta, value, onChange, canManage, visibleSecrets, toggleSecret }: {
  settingKey: string;
  meta: typeof SETTING_LABELS[string];
  value: string;
  onChange: (key: string, val: string) => void;
  canManage: boolean;
  visibleSecrets: Set<string>;
  toggleSecret: (key: string) => void;
}) {
  if (SWITCH_FIELDS.has(settingKey)) {
    return (
      <div className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl bg-muted/30 border border-border/30">
        <div className="space-y-0.5">
          <Label htmlFor={settingKey} className="text-sm font-medium cursor-pointer">{meta.label}</Label>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>
        <Switch
          id={settingKey}
          checked={value === 'true' || value === '1'}
          onCheckedChange={(checked) => onChange(settingKey, checked ? 'true' : 'false')}
          disabled={!canManage}
        />
      </div>
    );
  }

  if (SECRET_FIELDS.has(settingKey)) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={settingKey} className="text-sm font-medium">{meta.label}</Label>
        <div className="relative">
          <Input
            id={settingKey}
            type={visibleSecrets.has(settingKey) ? 'text' : 'password'}
            value={value || ''}
            onChange={e => onChange(settingKey, e.target.value)}
            dir="ltr"
            className="rounded-xl pe-10 font-mono text-sm"
            disabled={!canManage}
            placeholder={meta.placeholder || '••••••••••••••••'}
          />
          <button
            type="button"
            className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
            onClick={() => toggleSecret(settingKey)}
            tabIndex={-1}
          >
            {visibleSecrets.has(settingKey) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3 text-red-400" />
          {meta.description}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={settingKey} className="text-sm font-medium">{meta.label}</Label>
      <Input
        id={settingKey}
        value={value || ''}
        onChange={e => onChange(settingKey, e.target.value)}
        dir={meta.dir || undefined}
        className="rounded-xl"
        disabled={!canManage}
        placeholder={meta.placeholder}
      />
      <p className="text-xs text-muted-foreground">{meta.description}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Sidebar Navigation (General Tab)
   ═══════════════════════════════════════════════════════ */
function SettingsSidebar({ activeGroup, onSelect, settings }: {
  activeGroup: string;
  onSelect: (key: string) => void;
  settings: SettingsMap;
}) {
  // Calculate completion per group
  const getCompletion = useCallback((groupKey: string) => {
    const groupSettings = Object.entries(SETTING_LABELS).filter(([, v]) => v.group === groupKey);
    if (groupSettings.length === 0) return 100;
    const filled = groupSettings.filter(([key]) => {
      const val = settings[key];
      return val !== undefined && val !== '' && val !== null;
    }).length;
    return Math.round((filled / groupSettings.length) * 100);
  }, [settings]);

  return (
    <nav className="space-y-1">
      {CATEGORIES.map(category => {
        const categoryGroups = GROUPS.filter(g => g.category === category.key);
        return (
          <div key={category.key} className="mb-4">
            <div className="flex items-center gap-2 px-3 py-2 mb-1">
              <category.icon className="h-3.5 w-3.5 text-muted-foreground/60" />
              <span className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wide">
                {category.label}
              </span>
            </div>
            {categoryGroups.map(group => {
              const isActive = activeGroup === group.key;
              const completion = getCompletion(group.key);
              return (
                <button
                  key={group.key}
                  onClick={() => onSelect(group.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                    isActive
                      ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 font-medium border border-orange-200/50 dark:border-orange-800/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    isActive
                      ? `bg-gradient-to-br ${group.gradient} shadow-sm`
                      : 'bg-muted/80'
                  }`}>
                    <group.icon className={`h-3.5 w-3.5 ${isActive ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                  <span className="flex-1 text-start truncate">{group.label}</span>
                  {completion < 100 && (
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0" title={`${completion}% مكتمل`}>
                      <span className="text-[9px] font-bold text-muted-foreground">{completion}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════
   Mobile Group Selector (for small screens)
   ═══════════════════════════════════════════════════════ */
function MobileGroupSelector({ activeGroup, onSelect }: {
  activeGroup: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const currentGroup = GROUPS.find(g => g.key === activeGroup);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border/60 bg-card/80 text-sm font-medium"
      >
        <div className="flex items-center gap-3">
          {currentGroup && (
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${currentGroup.gradient} flex items-center justify-center`}>
              <currentGroup.icon className="h-3.5 w-3.5 text-white" />
            </div>
          )}
          <span>{currentGroup?.label || 'اختر القسم'}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-2 pt-3">
              {GROUPS.map(group => (
                <button
                  key={group.key}
                  onClick={() => { onSelect(group.key); setOpen(false); }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    activeGroup === group.key
                      ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border border-orange-200/50 dark:border-orange-800/30'
                      : 'bg-muted/30 border border-border/40 text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    activeGroup === group.key ? `bg-gradient-to-br ${group.gradient}` : 'bg-muted'
                  }`}>
                    <group.icon className={`h-3 w-3 ${activeGroup === group.key ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                  {group.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   General Settings Tab (Redesigned with sidebar)
   ═══════════════════════════════════════════════════════ */
function GeneralSettingsTab({ settings, setSettings, canManage }: {
  settings: SettingsMap;
  setSettings: React.Dispatch<React.SetStateAction<SettingsMap>>;
  canManage: boolean;
}) {
  const [activeGroup, setActiveGroup] = useState(GROUPS[0].key);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());

  const toggleSecret = useCallback((key: string) => {
    setVisibleSecrets(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handleChange = useCallback((key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, [setSettings]);

  // Search filter
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return Object.entries(SETTING_LABELS).filter(([key, meta]) =>
      meta.label.toLowerCase().includes(q) ||
      meta.description.toLowerCase().includes(q) ||
      key.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const currentGroup = GROUPS.find(g => g.key === activeGroup);
  const currentGroupSettings = Object.entries(SETTING_LABELS).filter(([, v]) => v.group === activeGroup);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="ابحث في الإعدادات..."
          className="ps-10 rounded-xl"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          >
            مسح
          </button>
        )}
      </div>

      {/* Search Results */}
      {searchResults ? (
        <motion.div variants={containerMotion} initial="hidden" animate="show" className="space-y-4">
          {searchResults.length === 0 ? (
            <EmptyState
              icon={Search}
              title="لا توجد نتائج"
              description={`لم يتم العثور على إعدادات تطابق "${searchQuery}"`}
            />
          ) : (
            <SectionCard
              icon={Search}
              title={`نتائج البحث (${searchResults.length})`}
              gradient="from-gray-500 to-slate-600"
            >
              <div className="space-y-5">
                {searchResults.map(([key, meta]) => (
                  <SettingField
                    key={key}
                    settingKey={key}
                    meta={meta}
                    value={settings[key] || ''}
                    onChange={handleChange}
                    canManage={canManage}
                    visibleSecrets={visibleSecrets}
                    toggleSecret={toggleSecret}
                  />
                ))}
              </div>
            </SectionCard>
          )}
        </motion.div>
      ) : (
        <>
          {/* Mobile Group Selector */}
          <MobileGroupSelector activeGroup={activeGroup} onSelect={setActiveGroup} />

          {/* Desktop: Sidebar + Content */}
          <div className="flex gap-6">
            {/* Sidebar — hidden on mobile */}
            <div className="hidden lg:block w-64 shrink-0">
              <div className="sticky top-24">
                <SettingsSidebar
                  activeGroup={activeGroup}
                  onSelect={setActiveGroup}
                  settings={settings}
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <AnimatePresence mode="wait">
                {currentGroup && (
                  <motion.div
                    key={activeGroup}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <SectionCard
                      id={`group-${activeGroup}`}
                      icon={currentGroup.icon}
                      title={currentGroup.label}
                      gradient={currentGroup.gradient}
                      tip={currentGroup.tip}
                    >
                      <div className="space-y-5">
                        {currentGroupSettings.map(([key, meta]) => (
                          <SettingField
                            key={key}
                            settingKey={key}
                            meta={meta}
                            value={settings[key] || ''}
                            onChange={handleChange}
                            canManage={canManage}
                            visibleSecrets={visibleSecrets}
                            toggleSecret={toggleSecret}
                          />
                        ))}
                      </div>
                    </SectionCard>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   API Keys Section
   ═══════════════════════════════════════════════════════ */

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

  useEffect(() => { fetchApiKeys(); }, [fetchApiKeys]);

  const handlePermissionToggle = (perm: string) => {
    if (perm === '*') {
      setNewKeyPermissions(prev => prev.includes('*') ? [] : ['*']);
      return;
    }
    setNewKeyPermissions(prev => {
      const without = prev.filter(p => p !== '*');
      return without.includes(perm) ? without.filter(p => p !== perm) : [...without, perm];
    });
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) { toast.error('يرجى إدخال اسم المفتاح'); return; }
    if (newKeyPermissions.length === 0) { toast.error('يرجى اختيار صلاحية واحدة على الأقل'); return; }
    setCreatingKey(true);
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim(), permissions: newKeyPermissions }),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setRevealedKey(json.data?.key || json.key || null);
      setCopiedKey(false);
      toast.success('تم إنشاء مفتاح API بنجاح');
      setNewKeyName('');
      setNewKeyPermissions([]);
      fetchApiKeys();
    } catch (err) { console.error(err); toast.error('فشل إنشاء المفتاح'); } finally { setCreatingKey(false); }
  };

  const handleCopyKey = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopiedKey(true);
      toast.success('تم نسخ المفتاح');
      setTimeout(() => setCopiedKey(false), 3000);
    } catch { toast.error('فشل نسخ المفتاح'); }
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
      if (json.error) { toast.error(json.error); return; }
      setApiKeys(prev => prev.map(k => k.id === key.id ? { ...k, is_active: !k.is_active } : k));
      toast.success(key.is_active ? 'تم تعطيل المفتاح' : 'تم تفعيل المفتاح');
    } catch (err) { console.error(err); toast.error('فشل تحديث حالة المفتاح'); } finally { setTogglingId(null); }
  };

  const handleDeleteKey = async (key: ApiKey) => {
    const confirmed = window.confirm(`هل أنت متأكد من حذف المفتاح "${key.name}"؟ لا يمكن التراجع عن هذا الإجراء.`);
    if (!confirmed) return;
    setDeletingId(key.id);
    try {
      const res = await fetch(`/api/settings/api-keys/${key.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setApiKeys(prev => prev.filter(k => k.id !== key.id));
      toast.success('تم حذف المفتاح');
    } catch (err) { console.error(err); toast.error('فشل حذف المفتاح'); } finally { setDeletingId(null); }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <motion.div variants={containerMotion} initial="hidden" animate="show" className="space-y-4">
      {/* Guide */}
      <motion.div variants={itemMotion}>
        <div className="flex items-start gap-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 px-4 py-3">
          <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed space-y-1">
            <p className="font-medium">كيف تستخدم مفاتيح API؟</p>
            <p>أنشئ مفتاح API لربط النظام مع أنظمتك الخارجية مثل n8n أو Telegram bot. أرسل المفتاح في هيدر <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded" dir="ltr">x-api-key</code> مع كل طلب.</p>
          </div>
        </div>
      </motion.div>

      <SectionCard icon={Shield} title="مفاتيح API الخارجية" gradient="from-amber-500 to-orange-600">
        <div className="space-y-6">
          {/* Header with create button */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {apiKeys.length > 0 ? `${apiKeys.length} مفتاح مسجّل` : 'لم يتم إنشاء أي مفاتيح بعد'}
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
                <code className="flex-1 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg px-3 py-2 text-sm font-mono break-all select-all" dir="ltr">
                  {revealedKey}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopyKey} className="rounded-xl">
                  {copiedKey ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {/* Create Form */}
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
                      <Label htmlFor={`perm-${perm.value}`} className="text-sm font-normal cursor-pointer">
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
                <Button variant="ghost" size="sm" className="rounded-xl"
                  onClick={() => { setShowCreateForm(false); setNewKeyName(''); setNewKeyPermissions([]); }}
                >
                  إلغاء
                </Button>
              </div>
            </div>
          )}

          {/* Keys List */}
          {loadingKeys ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : apiKeys.length === 0 ? (
            <EmptyState
              icon={Key}
              title="لا توجد مفاتيح API"
              description="أنشئ مفتاح API للتكامل مع أنظمتك الخارجية مثل n8n أو Telegram"
            />
          ) : (
            <div className="space-y-3">
              {apiKeys.map(key => (
                <div
                  key={key.id}
                  className={`rounded-xl border border-border/60 bg-background/50 p-4 space-y-3 transition-opacity ${!key.is_active ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
                          <Key className="h-3.5 w-3.5 text-white" />
                        </div>
                        <span className="font-medium text-sm truncate">{key.name}</span>
                        {!key.is_active && <Badge variant="secondary" className="text-xs">معطّل</Badge>}
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
                        variant="ghost" size="icon"
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

/* ═══════════════════════════════════════════════════════
   Module Settings Tab
   ═══════════════════════════════════════════════════════ */
function ModuleSettingsTab() {
  return (
    <motion.div variants={containerMotion} initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={itemMotion}>
        <div className="flex items-start gap-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 px-4 py-3">
          <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
            كل نظام فرعي له صفحة إعدادات خاصة. اضغط على البطاقة للانتقال مباشرة.
          </p>
        </div>
      </motion.div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SUB_SETTINGS.map(item => (
          <motion.div key={item.href} variants={itemMotion}>
            <Link href={item.href}>
              <div className="group rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm p-5 hover:shadow-md hover:border-orange-500/30 transition-all duration-200 cursor-pointer h-full">
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

/* ═══════════════════════════════════════════════════════
   Main Settings Page
   ═══════════════════════════════════════════════════════ */
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
      toast.success('تم حفظ الإعدادات بنجاح');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error(err); toast.error('حدث خطأ أثناء الحفظ'); } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="flex gap-6">
          <Skeleton className="hidden lg:block h-96 w-64 rounded-2xl" />
          <div className="flex-1 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="relative rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
        <div className="absolute -top-20 -end-20 w-60 h-60 rounded-full bg-gradient-to-br from-orange-500/10 to-amber-500/5 blur-3xl pointer-events-none" />
        <div className="relative px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">الإعدادات</h1>
              <p className="text-sm text-muted-foreground">تخصيص النظام والتكوين العام</p>
            </div>
          </div>
          {canManage && activeTab === 'general' && (
            <Button
              onClick={handleSave}
              disabled={saving}
              className={`rounded-xl shadow-md transition-all ${saved ? 'bg-green-600 hover:bg-green-700' : ''}`}
            >
              {saved ? <Check className="h-4 w-4 me-2" /> : <Save className="h-4 w-4 me-2" />}
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
        <GeneralSettingsTab
          settings={settings}
          setSettings={setSettings}
          canManage={canManage}
        />
      )}

      {activeTab === 'api-keys' && <ApiKeysSection />}

      {activeTab === 'modules' && <ModuleSettingsTab />}

      {/* ── Sticky Save Bar (Mobile) ── */}
      {canManage && activeTab === 'general' && (
        <div className="fixed bottom-0 inset-x-0 lg:hidden z-40 p-4 bg-background/95 backdrop-blur-sm border-t border-border/60">
          <Button
            onClick={handleSave}
            disabled={saving}
            className={`w-full rounded-xl shadow-md ${saved ? 'bg-green-600 hover:bg-green-700' : ''}`}
          >
            {saved ? <Check className="h-4 w-4 me-2" /> : <Save className="h-4 w-4 me-2" />}
            {saving ? 'جارٍ الحفظ...' : saved ? 'تم الحفظ!' : 'حفظ الإعدادات'}
          </Button>
        </div>
      )}
    </div>
  );
}
