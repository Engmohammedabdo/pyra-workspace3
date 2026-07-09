'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  Settings, Save, Key, Copy, Trash2, Plus, Shield, Check,
  Building2, FileText, Receipt, Landmark, HardDrive, Globe,
  ChevronLeft, Sparkles, ExternalLink, CalendarDays, Award, TrendingUp,
  CreditCard, Eye, EyeOff, Bell, ArrowDownCircle, Percent, Mail, Lock,
  Search, Info, Lightbulb, ChevronDown, ChevronUp, AlertCircle, Kanban,
  MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations, useLocale } from 'next-intl';
import { usePermission } from '@/hooks/usePermission';
import Link from 'next/link';
import AgentWhatsAppSettingsSection from '@/components/settings/agent-whatsapp-settings/section';

interface SettingsMap {
  [key: string]: string;
}

/* ═══════════════════════════════════════════════════════
   Setting definitions with groups (non-translatable metadata only —
   label/description/placeholder live in messages/{ar,en}/settings.json
   under settings.fields.<key> and are looked up via t() at render time)
   ═══════════════════════════════════════════════════════ */
const FIELD_META: Record<string, {
  group: string;
  dir?: 'ltr';
}> = {
  // Company
  company_name: { group: 'company' },
  company_logo: { group: 'company', dir: 'ltr' },
  // Quotes
  quote_prefix: { group: 'quotes', dir: 'ltr' },
  quote_expiry_days: { group: 'quotes' },
  vat_rate: { group: 'quotes' },
  // Invoices
  invoice_prefix: { group: 'invoices', dir: 'ltr' },
  payment_terms_days: { group: 'invoices' },
  default_currency: { group: 'invoices', dir: 'ltr' },
  default_early_payment_discount_percent: { group: 'invoices' },
  default_early_payment_discount_days: { group: 'invoices' },
  credit_note_prefix: { group: 'invoices', dir: 'ltr' },
  po_prefix: { group: 'invoices', dir: 'ltr' },
  // Bank
  bank_name: { group: 'bank' },
  bank_account_name: { group: 'bank' },
  bank_account_no: { group: 'bank', dir: 'ltr' },
  bank_iban: { group: 'bank', dir: 'ltr' },
  // Storage
  max_upload_size_mb: { group: 'storage' },
  max_storage_gb: { group: 'storage' },
  kpi_storage_warning_percent: { group: 'storage' },
  // Portal
  portal_enabled: { group: 'portal' },
  portal_welcome_message: { group: 'portal' },
  // Dunning
  dunning_enabled: { group: 'dunning' },
  late_penalty_rate: { group: 'dunning' },
  late_penalty_grace_days: { group: 'dunning' },
  dunning_reminder_interval_days: { group: 'dunning' },
  // Expenses
  expense_approval_required: { group: 'expenses' },
  // Commissions
  commission_rate: { group: 'commissions' },
  commission_trigger: { group: 'commissions', dir: 'ltr' },
  commission_auto_calculate: { group: 'commissions' },
  // Stripe
  stripe_enabled: { group: 'stripe' },
  stripe_publishable_key: { group: 'stripe', dir: 'ltr' },
  stripe_secret_key: { group: 'stripe', dir: 'ltr' },
  stripe_webhook_secret: { group: 'stripe', dir: 'ltr' },
  // File Management
  auto_version_on_upload: { group: 'files' },
  max_versions_per_file: { group: 'files' },
  trash_auto_purge_days: { group: 'files' },
  allow_public_shares: { group: 'files' },
  share_default_expiry_hours: { group: 'files' },
  // Boards
  board_default_template: { group: 'boards' },
  board_auto_create_with_project: { group: 'boards' },
  board_require_due_date: { group: 'boards' },
  board_enable_time_tracking: { group: 'boards' },
  board_overdue_notification: { group: 'boards' },
  board_notify_on_assign: { group: 'boards' },
  board_notify_on_comment: { group: 'boards' },
  board_client_portal_visible: { group: 'boards' },
  board_max_attachments_mb: { group: 'boards' },
  board_done_auto_archive_days: { group: 'boards' },
  // Security
  session_timeout_minutes: { group: 'security' },
  max_failed_logins: { group: 'security' },
  lockout_duration_minutes: { group: 'security' },
  // Email / SMTP
  smtp_host: { group: 'email', dir: 'ltr' },
  smtp_port: { group: 'email', dir: 'ltr' },
  smtp_user: { group: 'email', dir: 'ltr' },
  smtp_pass: { group: 'email', dir: 'ltr' },
  smtp_from: { group: 'email', dir: 'ltr' },
};

/* ═══════════════════════════════════════════════════════
   Group definitions organized into categories
   ═══════════════════════════════════════════════════════ */
interface GroupDef {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  category: 'business' | 'finance' | 'system';
}

// label/tip are looked up via t(`groups.${key}.label`) / t(`groups.${key}.tip`)
// at render time — see messages/{ar,en}/settings.json → settings.groups.
const GROUPS: GroupDef[] = [
  // Business
  { key: 'company', icon: Building2, gradient: 'from-orange-500 to-amber-600', category: 'business' },
  { key: 'bank', icon: Landmark, gradient: 'from-violet-500 to-purple-600', category: 'business' },
  { key: 'portal', icon: Globe, gradient: 'from-cyan-500 to-sky-600', category: 'business' },
  { key: 'boards', icon: Kanban, gradient: 'from-blue-500 to-cyan-600', category: 'business' },
  // Finance
  { key: 'quotes', icon: FileText, gradient: 'from-blue-500 to-indigo-600', category: 'finance' },
  { key: 'invoices', icon: Receipt, gradient: 'from-emerald-500 to-teal-600', category: 'finance' },
  { key: 'dunning', icon: Bell, gradient: 'from-red-500 to-rose-600', category: 'finance' },
  { key: 'expenses', icon: ArrowDownCircle, gradient: 'from-amber-500 to-yellow-600', category: 'finance' },
  { key: 'commissions', icon: Percent, gradient: 'from-emerald-500 to-teal-600', category: 'finance' },
  // System
  { key: 'storage', icon: HardDrive, gradient: 'from-rose-500 to-pink-600', category: 'system' },
  { key: 'stripe', icon: CreditCard, gradient: 'from-indigo-500 to-purple-600', category: 'system' },
  { key: 'files', icon: FileText, gradient: 'from-teal-500 to-cyan-600', category: 'system' },
  { key: 'security', icon: Lock, gradient: 'from-red-500 to-rose-600', category: 'system' },
  { key: 'email', icon: Mail, gradient: 'from-blue-500 to-sky-600', category: 'system' },
];

// label looked up via t(`categories.${key}`) — see settings.categories.
const CATEGORIES = [
  { key: 'business', icon: Building2 },
  { key: 'finance', icon: Receipt },
  { key: 'system', icon: HardDrive },
] as const;

/* ── Sub-settings navigation ── */
// label/description looked up via t(`subSettings.${key}.label`) /
// t(`subSettings.${key}.description`) — see settings.subSettings.
const SUB_SETTINGS = [
  { key: 'sales', href: '/dashboard/sales/settings', icon: TrendingUp, gradient: 'from-orange-500 to-amber-600' },
  { key: 'leave', href: '/dashboard/leave/settings', icon: CalendarDays, gradient: 'from-emerald-500 to-teal-600' },
  { key: 'evaluations', href: '/dashboard/evaluations/settings', icon: Award, gradient: 'from-violet-500 to-purple-600' },
];

/* ── Tabs ── */
// label looked up via t(`tabs.${key}`) — see settings.tabs.
const TABS = [
  { key: 'general', icon: Settings },
  { key: 'api-keys', icon: Key },
  { key: 'agent-whatsapp', icon: MessageCircle },
  { key: 'modules', icon: Sparkles },
];

/* ── Secret fields ── */
const SECRET_FIELDS = new Set(['stripe_secret_key', 'stripe_webhook_secret', 'smtp_pass']);
const SWITCH_FIELDS = new Set(['portal_enabled', 'stripe_enabled', 'dunning_enabled', 'expense_approval_required', 'commission_auto_calculate', 'auto_version_on_upload', 'allow_public_shares', 'board_auto_create_with_project', 'board_require_due_date', 'board_enable_time_tracking', 'board_overdue_notification', 'board_notify_on_assign', 'board_notify_on_comment', 'board_client_portal_visible']);

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
interface TranslatedFieldMeta {
  label: string;
  description: string;
  dir?: 'ltr';
  placeholder?: string;
}

function SettingField({ settingKey, meta, value, onChange, canManage, visibleSecrets, toggleSecret }: {
  settingKey: string;
  meta: TranslatedFieldMeta;
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
          <AlertCircle className="h-3 w-3 text-red-400 dark:text-red-500" />
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
  const t = useTranslations('settings');

  // Calculate completion per group
  const getCompletion = useCallback((groupKey: string) => {
    const groupSettings = Object.entries(FIELD_META).filter(([, v]) => v.group === groupKey);
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
                {t(`categories.${category.key}`)}
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
                  <span className="flex-1 text-start truncate">{t(`groups.${group.key}.label` as Parameters<typeof t>[0])}</span>
                  {completion < 100 && (
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0" title={t('general.completionPercent', { percent: completion })}>
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
  const t = useTranslations('settings');
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
          <span>{currentGroup ? t(`groups.${currentGroup.key}.label` as Parameters<typeof t>[0]) : t('general.selectSection')}</span>
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
                  {t(`groups.${group.key}.label` as Parameters<typeof t>[0])}
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
  const t = useTranslations('settings');
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

  // Translated field entries — built once per locale change from the
  // non-translatable FIELD_META + the settings.fields.<key> catalog.
  const fieldEntries = useMemo(() => {
    return Object.entries(FIELD_META).map(([key, meta]) => {
      const placeholder = t(`fields.${key}.placeholder` as Parameters<typeof t>[0]);
      return [key, {
        ...meta,
        label: t(`fields.${key}.label` as Parameters<typeof t>[0]),
        description: t(`fields.${key}.description` as Parameters<typeof t>[0]),
        placeholder: placeholder || undefined,
      }] as const;
    });
  }, [t]);

  // Search filter
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return fieldEntries.filter(([key, meta]) =>
      meta.label.toLowerCase().includes(q) ||
      meta.description.toLowerCase().includes(q) ||
      key.toLowerCase().includes(q)
    );
  }, [searchQuery, fieldEntries]);

  const currentGroup = GROUPS.find(g => g.key === activeGroup);
  const currentGroupSettings = fieldEntries.filter(([, v]) => v.group === activeGroup);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t('general.searchPlaceholder')}
          className="ps-10 rounded-xl"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          >
            {t('general.clearSearch')}
          </button>
        )}
      </div>

      {/* Search Results */}
      {searchResults ? (
        <motion.div variants={containerMotion} initial="hidden" animate="show" className="space-y-4">
          {searchResults.length === 0 ? (
            <EmptyState
              icon={Search}
              title={t('general.noResultsTitle')}
              description={t('general.noResultsDescription', { query: searchQuery })}
            />
          ) : (
            <SectionCard
              icon={Search}
              title={t('general.searchResultsTitle', { count: searchResults.length })}
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
                      title={t(`groups.${currentGroup.key}.label` as Parameters<typeof t>[0])}
                      gradient={currentGroup.gradient}
                      tip={t(`groups.${currentGroup.key}.tip` as Parameters<typeof t>[0])}
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

// value='*' renders via common.all at the usage site — see 'perm.value === "*"'
// checks below. Its `label` here is a non-rendered technical fallback.
const AVAILABLE_PERMISSIONS = [
  { value: '*', label: '*' },
  // Phase 11 cron permissions (2026-05) — keep in sync with the
  // permission strings checked in app/api/cron/*/route.ts.
  { value: 'cron.follow-up-reminders', label: 'cron.follow-up-reminders' },
  { value: 'cron.lead-idle-check', label: 'cron.lead-idle-check' },
  { value: 'expenses:read', label: 'expenses:read' },
  { value: 'expenses:create', label: 'expenses:create' },
  { value: 'invoices:read', label: 'invoices:read' },
  { value: 'invoices:create', label: 'invoices:create' },
  { value: 'invoices:send', label: 'invoices:send' },
  { value: 'alerts:read', label: 'alerts:read' },
  { value: 'payments:read', label: 'payments:read' },
];

function ApiKeysSection() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPermissions, setNewKeyPermissions] = useState<string[]>([]);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTargetKey, setDeleteTargetKey] = useState<ApiKey | null>(null);

  const { data: apiKeysData, isLoading: loadingKeys, refetch: refetchApiKeys } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn: () => fetchAPI('/api/settings/api-keys'),
    staleTime: 60_000,
  });

  const apiKeys: ApiKey[] = apiKeysData || [];

  const createKeyMutation = useMutation({
    mutationFn: (body: object) => mutateAPI<any>('/api/settings/api-keys', 'POST', body),
    onSuccess: (json: any) => {
      setRevealedKey(json?.key || null);
      setCopiedKey(false);
      toast.success(t('apiKeys.createdSuccess'));
      setNewKeyName('');
      setNewKeyPermissions([]);
      refetchApiKeys();
    },
    onError: (err) => { console.error(err); toast.error(t('apiKeys.createFailed')); },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (key: ApiKey) => mutateAPI<any>(`/api/settings/api-keys/${key.id}`, 'PATCH', { is_active: !key.is_active }),
    onError: (err) => { console.error(err); toast.error(t('apiKeys.statusUpdateFailed')); },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (key: ApiKey) => mutateAPI<any>(`/api/settings/api-keys/${key.id}`, 'DELETE'),
    onSuccess: () => { toast.success(t('apiKeys.deletedSuccess')); refetchApiKeys(); },
    onError: (err) => { console.error(err); toast.error(t('apiKeys.deleteFailed')); },
  });

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
    if (!newKeyName.trim()) { toast.error(t('apiKeys.nameRequired')); return; }
    if (newKeyPermissions.length === 0) { toast.error(t('apiKeys.permissionRequired')); return; }
    createKeyMutation.mutate({ name: newKeyName.trim(), permissions: newKeyPermissions });
  };

  const creatingKey = createKeyMutation.isPending;

  const handleCopyKey = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopiedKey(true);
      toast.success(t('apiKeys.copiedSuccess'));
      setTimeout(() => setCopiedKey(false), 3000);
    } catch { toast.error(t('apiKeys.copyFailed')); }
  };

  const handleToggleActive = async (key: ApiKey) => {
    setTogglingId(key.id);
    try {
      await toggleActiveMutation.mutateAsync(key);
      toast.success(key.is_active ? t('apiKeys.disabledSuccess') : t('apiKeys.enabledSuccess'));
      refetchApiKeys();
    } finally { setTogglingId(null); }
  };

  const handleDeleteKey = (key: ApiKey) => {
    setDeleteTargetKey(key);
    setShowDeleteDialog(true);
  };

  const confirmDeleteKey = async () => {
    if (!deleteTargetKey) return;
    setDeletingId(deleteTargetKey.id);
    try {
      await deleteKeyMutation.mutateAsync(deleteTargetKey);
    } finally {
      setDeletingId(null);
      setShowDeleteDialog(false);
      setDeleteTargetKey(null);
    }
  };

  // Locale-parameterized in place (Phase 6a.2 fix) — this used to hardcode
  // 'ar-SA' and shadow the shared lib/utils/format.ts `formatDate` helper.
  // The shape here (date + time, short month) differs from the shared
  // helper's date-fns pattern default, so the fix keeps the same
  // toLocaleDateString shape and only parametrizes the locale, matching the
  // codebase-wide `locale === 'ar' ? 'ar-XX' : 'en-GB'` convention (see e.g.
  // components/boards/task-sheet.tsx, app/dashboard/my-payslips/*).
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <motion.div variants={containerMotion} initial="hidden" animate="show" className="space-y-4">
      {/* Guide */}
      <motion.div variants={itemMotion}>
        <div className="flex items-start gap-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 px-4 py-3">
          <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed space-y-1">
            <p className="font-medium">{t('apiKeys.howToUseTitle')}</p>
            <p>{t.rich('apiKeys.howToUseDescription', {
              code: (chunks) => <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded" dir="ltr">{chunks}</code>,
            })}</p>
          </div>
        </div>
      </motion.div>

      <SectionCard icon={Shield} title={t('apiKeys.sectionTitle')} gradient="from-amber-500 to-orange-600">
        <div className="space-y-6">
          {/* Header with create button */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {apiKeys.length > 0 ? t('apiKeys.keysRegisteredCount', { count: apiKeys.length }) : t('apiKeys.noKeysYet')}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowCreateForm(!showCreateForm); setRevealedKey(null); }}
              className="rounded-xl"
            >
              <Plus className="h-4 w-4 me-1" />
              {t('apiKeys.newKeyButton')}
            </Button>
          </div>

          {/* Revealed Key Banner */}
          {revealedKey && (
            <div className="rounded-xl border-2 border-yellow-500/60 bg-yellow-50 dark:bg-yellow-950/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 font-semibold text-sm">
                <Key className="h-4 w-4" />
                {t('apiKeys.revealedKeyWarning')}
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg px-3 py-2 text-sm font-mono break-all select-all" dir="ltr">
                  {revealedKey}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopyKey} className="rounded-xl">
                  {copiedKey ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {/* Create Form */}
          {showCreateForm && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-4">
              <h4 className="font-semibold text-sm">{t('apiKeys.createFormTitle')}</h4>
              <div className="space-y-2">
                <FormLabel htmlFor="api-key-name" required>{t('apiKeys.keyNameLabel')}</FormLabel>
                <Input
                  id="api-key-name"
                  placeholder={t('apiKeys.keyNamePlaceholder')}
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('apiKeys.permissionsLabel')}</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {AVAILABLE_PERMISSIONS.map(perm => (
                    <div key={perm.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`perm-${perm.value}`}
                        checked={newKeyPermissions.includes(perm.value)}
                        onCheckedChange={() => handlePermissionToggle(perm.value)}
                      />
                      <Label htmlFor={`perm-${perm.value}`} className="text-sm font-normal cursor-pointer">
                        {perm.value === '*' ? tCommon('all') : perm.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleCreateKey} disabled={creatingKey} size="sm" className="rounded-xl">
                  <Key className="h-4 w-4 me-1" />
                  {creatingKey ? t('apiKeys.creating') : t('apiKeys.createButton')}
                </Button>
                <Button variant="ghost" size="sm" className="rounded-xl"
                  onClick={() => { setShowCreateForm(false); setNewKeyName(''); setNewKeyPermissions([]); }}
                >
                  {tCommon('actions.cancel')}
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
              title={t('apiKeys.emptyTitle')}
              description={t('apiKeys.emptyDescription')}
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
                        {!key.is_active && <Badge variant="secondary" className="text-xs">{t('disabledBadge')}</Badge>}
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
                        aria-label={key.is_active ? t('apiKeys.disableAria') : t('apiKeys.enableAria')}
                      />
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteKey(key)}
                        disabled={deletingId === key.id}
                        aria-label={t('apiKeys.deleteAria')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 ps-9">
                    {key.permissions.map(perm => (
                      <Badge key={perm} variant="outline" className="text-xs font-mono rounded-lg">
                        {perm === '*' ? t('apiKeys.allPermissionLabel') : perm}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground ps-9">
                    <span>{t('apiKeys.createdAt', { date: formatDate(key.created_at) })}</span>
                    <span>{t('apiKeys.lastUsed', { date: formatDate(key.last_used_at) })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('apiKeys.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('apiKeys.deleteConfirmDescription', { name: deleteTargetKey?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteKey} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('apiKeys.deleteButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
   Module Settings Tab
   ═══════════════════════════════════════════════════════ */
function ModuleSettingsTab() {
  const t = useTranslations('settings');
  return (
    <motion.div variants={containerMotion} initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={itemMotion}>
        <div className="flex items-start gap-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 px-4 py-3">
          <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
            {t('modules.infoText')}
          </p>
        </div>
      </motion.div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SUB_SETTINGS.map(item => (
          <motion.div key={item.href} variants={itemMotion}>
            <Link href={item.href}>
              <div className="group rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm p-5 hover:shadow-md hover:border-orange-500/30 transition-all duration-200 cursor-pointer h-full">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-md dark:shadow-black/15 shrink-0`}>
                    <item.icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm">{t(`subSettings.${item.key}.label` as Parameters<typeof t>[0])}</h3>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t(`subSettings.${item.key}.description` as Parameters<typeof t>[0])}</p>
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
  const t = useTranslations('settings');
  const canManage = usePermission('settings.manage');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // React Query hooks
  const { data: fetchedSettings, isLoading: loading } = useSettings() as { data: SettingsMap | undefined; isLoading: boolean };
  const [settings, setSettings] = useState<SettingsMap>({});
  const updateSettingsMutation = useUpdateSettings();

  useEffect(() => {
    if (fetchedSettings) setSettings(fetchedSettings);
  }, [fetchedSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateSettingsMutation.mutateAsync(settings);
      setSaved(true);
      toast.success(t('saveBar.savedToast'));
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error(err); toast.error(t('saveBar.errorToast')); } finally { setSaving(false); }
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
              <h1 className="text-xl font-bold">{t('page.heading')}</h1>
              <p className="text-sm text-muted-foreground">{t('page.subheading')}</p>
            </div>
          </div>
          {canManage && activeTab === 'general' && (
            <Button
              onClick={handleSave}
              disabled={saving}
              className={`rounded-xl shadow-md dark:shadow-black/15 transition-all ${saved ? 'bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800' : ''}`}
            >
              {saved ? <Check className="h-4 w-4 me-2" /> : <Save className="h-4 w-4 me-2" />}
              {saving ? t('saveBar.saving') : saved ? t('saveBar.saved') : t('saveBar.save')}
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
            {t(`tabs.${tab.key}` as Parameters<typeof t>[0])}
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

      {activeTab === 'agent-whatsapp' && <AgentWhatsAppSettingsSection />}

      {activeTab === 'modules' && <ModuleSettingsTab />}

      {/* ── Sticky Save Bar (Mobile) ── */}
      {canManage && activeTab === 'general' && (
        <div className="fixed bottom-0 inset-x-0 lg:hidden z-40 p-4 bg-background/95 backdrop-blur-sm border-t border-border/60">
          <Button
            onClick={handleSave}
            disabled={saving}
            className={`w-full rounded-xl shadow-md dark:shadow-black/15 ${saved ? 'bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800' : ''}`}
          >
            {saved ? <Check className="h-4 w-4 me-2" /> : <Save className="h-4 w-4 me-2" />}
            {saving ? t('saveBar.saving') : saved ? t('saveBar.saved') : t('saveBar.save')}
          </Button>
        </div>
      )}
    </div>
  );
}
