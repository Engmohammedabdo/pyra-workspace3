'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  BookOpen,
  LayoutDashboard,
  Briefcase,
  Wallet,
  Settings,
  ArrowRight,
  Shield,
  TrendingUp,
} from 'lucide-react';
import { useAllModuleGuides, useModuleGuideSearch } from '@/lib/i18n/module-guide-labels';
import { ModuleCard } from '@/components/dashboard/guide/module-card';

// `key` maps to `guide.ui.sections.<key>.title` in messages/{ar,en}/guide.json.
// `hrefs` are pure route-path lists (structural, mirror the sidebar's
// navGroup structure) — entries are MODULE_GUIDES OBJECT KEYS, not always
// equal to a guide's `href` field (see the lead-detail tab walkthrough
// entries and the admin pseudo-entries below).
const SECTIONS = [
  {
    key: 'main',
    icon: LayoutDashboard,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/10',
    hrefs: ['/dashboard', '/dashboard/notifications', '/dashboard/profile', '/dashboard/my-tasks', '/dashboard/guide'],
  },
  {
    key: 'work',
    icon: Briefcase,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-500/10',
    hrefs: [
      '/dashboard/projects',
      '/dashboard/clients',
      '/dashboard/clients/[id]',
      '/dashboard/quotes',
      '/dashboard/quotes/analytics',
      '/dashboard/invoices',
      '/dashboard/boards',
      '/dashboard/script-reviews',
      '/dashboard/content-pipeline',
      '/dashboard/files',
      '/dashboard/favorites',
      '/dashboard/reviews',
      '/dashboard/trash',
      '/dashboard/storage',
    ],
  },
  {
    key: 'sales',
    icon: TrendingUp,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    hrefs: [
      '/dashboard/crm',
      '/dashboard/crm/pipeline',
      // Phase 17 — lead-detail tab walkthrough entries (Phase 15.1 + 15.2 features)
      '/dashboard/crm/leads/[id]?tab=tasks',
      '/dashboard/crm/leads/[id]?tab=activity',
      '/dashboard/crm/leads/[id]?tab=files',
      '/dashboard/calendar',
      '/dashboard/sales/chat',
      '/dashboard/sales/whatsapp-analytics',
      '/dashboard/sales/approvals',
      '/dashboard/crm/follow-ups',
      '/dashboard/crm/calls',
      '/dashboard/sales/settings',
    ],
  },
  {
    // Mirrors sidebar "الموارد البشرية" group — admin-level HR pages // i18n-exempt: dev comment referencing legacy Arabic sidebar group name
    key: 'hr',
    icon: Settings,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    hrefs: [
      '/dashboard/hr',
      '/dashboard/hr/productivity',
      '/dashboard/approvals',
      '/dashboard/leave/settings',
      '/dashboard/hr/leave-balances',
      '/dashboard/evaluations/settings',
      '/dashboard/hr/documents',
      '/dashboard/hr/documents/settings',
      '/dashboard/hr/onboarding',
      '/dashboard/hr/offboarding',
      '/dashboard/hr/work-schedules',
    ],
  },
  {
    // Mirrors sidebar "الخدمة الذاتية" group — self-service employee pages // i18n-exempt: dev comment referencing legacy Arabic sidebar group name
    key: 'self_service',
    icon: Settings,
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-500/10',
    hrefs: [
      '/dashboard/timesheet',
      '/dashboard/attendance',
      '/dashboard/leave',
      '/dashboard/my-payslips',
      '/dashboard/evaluations',
      '/dashboard/my-documents',
      '/dashboard/directory',
      '/dashboard/announcements',
      '/dashboard/org-chart',
    ],
  },
  {
    key: 'finance',
    icon: Wallet,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/10',
    hrefs: [
      '/dashboard/finance',
      '/dashboard/finance/expenses',
      '/dashboard/finance/expenses/categories',
      '/dashboard/finance/client-statement',
      '/dashboard/finance/cards',
      '/dashboard/finance/contracts',
      '/dashboard/finance/credit-notes',
      '/dashboard/finance/suppliers',
      '/dashboard/finance/purchase-orders',
      '/dashboard/finance/recurring',
      '/dashboard/finance/reports',
      '/dashboard/finance/targets',
      '/dashboard/payroll',
    ],
  },
  {
    key: 'admin',
    icon: Shield,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-500/10',
    hrefs: [
      '/dashboard/settings',
      '/dashboard/users',
      '/dashboard/teams',
      '/dashboard/roles',
      '/dashboard/permissions',
      '/dashboard/reports',
      '/dashboard/automations',
      '/dashboard/knowledge-base',
      '/dashboard/integrations',
      '/dashboard/activity',
      '/dashboard/login-history',
      '/dashboard/sessions',
      '/dashboard/admin/error-logs',
      // Phase 17 — admin reference entries (Phase D + 14.3 admin docs)
      '/dashboard/admin/backup-procedure',
      '/dashboard/admin/security-checklist',
    ],
  },
] as const;

export default function GuidePage() {
  const tCommonGuide = useTranslations('common.guide');
  const tGuideUi = useTranslations('guide.ui');
  const [query, setQuery] = useState('');

  const allGuides = useAllModuleGuides();
  const searchResults = useModuleGuideSearch(query);

  const filteredGuides = useMemo(() => {
    if (!query.trim()) return null;
    return searchResults;
  }, [query, searchResults]);

  const totalModules = Object.keys(allGuides).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
        >
          <ArrowRight className="h-5 w-5 rtl:rotate-180" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{tCommonGuide('title')}</h1>
            <p className="text-muted-foreground text-sm">
              {tGuideUi('pageSubtitle', { count: totalModules })}
            </p>
          </div>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={tGuideUi('searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ps-9"
        />
      </div>

      {filteredGuides !== null ? (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            {filteredGuides.length > 0
              ? tGuideUi('resultsCount', { count: filteredGuides.length })
              : tGuideUi('noResults')}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredGuides.map((guide) => (
              <ModuleCard key={guide.slug} guide={guide} color="text-orange-600 dark:text-orange-400" />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {SECTIONS.map((section) => {
            const sectionGuides = section.hrefs
              .map((href) => allGuides[href])
              .filter(Boolean);

            if (sectionGuides.length === 0) return null;

            const Icon = section.icon;

            return (
              <div key={section.key}>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-8 h-8 rounded-lg ${section.bgColor} flex items-center justify-center`}>
                    <Icon className={`h-4 w-4 ${section.color}`} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">{tGuideUi(`sections.${section.key}.title`)}</h2>
                  </div>
                  <Badge variant="outline" className="ms-2 text-[10px]">
                    {sectionGuides.length}
                  </Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sectionGuides.map((guide) => (
                    <ModuleCard key={guide.slug} guide={guide} color={section.color} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
