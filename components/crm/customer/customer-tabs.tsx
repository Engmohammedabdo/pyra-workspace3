'use client';

/**
 * 7-tab navigation for the Active Customer Page.
 *
 * Tab list (PRD §04 line 214): // i18n-exempt: doc comment header, list below
 *   نظرة عامة (Overview) — default // i18n-exempt: doc comment
 *   العقود (Contracts)   — Cluster 2 builds the killer tab // i18n-exempt: doc comment
 *   المشاريع (Projects)  — v1 empty state, deferred // i18n-exempt: doc comment
 *   الفواتير (Invoices)  — v1 empty state, deferred // i18n-exempt: doc comment
 *   النشاط (Activity)    — Cluster 3 // i18n-exempt: doc comment
 *   الملفات (Files)      — Q-C3 (γ): empty "قريباً" placeholder // i18n-exempt: doc comment
 *   ملاحظات (Notes)      — Cluster 3 // i18n-exempt: doc comment
 *
 * Active tab persisted in URL via `?tab=<id>` per PRD §04 line 199
 * ("store active tab in URL query param for shareable links"). Sticky
 * to the top of the scroll viewport with backdrop-blur so the user
 * always knows which tab they're on as they scroll long content.
 *
 * Tabs component is navigation-only — content rendering lives in
 * customer-detail-client.tsx (Step C uses placeholders, Steps D/E fill in).
 */

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { dirFor, type Locale } from '@/lib/i18n/config';

export const CUSTOMER_TAB_IDS = [
  'overview',
  'contracts',
  'projects',
  'invoices',
  'activity',
  'files',
  'notes',
] as const;

export type CustomerTabId = (typeof CUSTOMER_TAB_IDS)[number];

export function useCustomerActiveTab(): CustomerTabId {
  const searchParams = useSearchParams();
  const raw = searchParams.get('tab') ?? 'overview';
  return (CUSTOMER_TAB_IDS as readonly string[]).includes(raw)
    ? (raw as CustomerTabId)
    : 'overview';
}

export function CustomerTabs() {
  const t = useTranslations('crm.customers.tabs');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const active = useCustomerActiveTab();

  const setTab = (tab: CustomerTabId) => {
    // router.replace so the back button doesn't accumulate one history
    // entry per tab click.
    router.replace(`${pathname}?tab=${tab}`, { scroll: false });
  };

  return (
    <div
      className={cn(
        'sticky top-0 z-10 -mx-4 px-4 sm:-mx-6 sm:px-6',
        'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70',
        'border-b border-border',
      )}
      dir={dirFor(locale)}
    >
      <nav
        role="tablist"
        aria-label={t('navAria')}
        className="flex gap-1 overflow-x-auto pb-px scrollbar-thin"
      >
        {CUSTOMER_TAB_IDS.map((tab) => {
          const isActive = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(tab)}
              className={cn(
                'shrink-0 inline-flex items-center px-4 py-3 text-sm font-medium transition-colors',
                'border-b-2 -mb-px',
                'focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:ring-offset-1',
                isActive
                  ? 'border-orange-500 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              {t(tab)}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
