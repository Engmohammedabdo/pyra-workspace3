'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowRight, FileText } from 'lucide-react';
import { ExportButton } from '@/components/reports/ExportButton';
import { PnlTab } from '@/components/dashboard/finance-reports/PnlTab';
import { CashflowTab } from '@/components/dashboard/finance-reports/CashflowTab';
import { VatTab } from '@/components/dashboard/finance-reports/VatTab';
import { ClientProfitabilityTab } from '@/components/dashboard/finance-reports/ClientProfitabilityTab';
import { ProjectProfitabilityTab } from '@/components/dashboard/finance-reports/ProjectProfitabilityTab';
import { dirFor, type Locale } from '@/lib/i18n/config';

function getDefaultFrom(): string { const d = new Date(); return `${d.getFullYear()}-01-01`; }
function getDefaultTo(): string { return new Date().toISOString().slice(0, 10); }

export default function FinanceReportsPage() {
  const t = useTranslations('finance.reports');
  const locale = useLocale() as Locale;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance" className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t('meta.title')}</h1>
              <p className="text-muted-foreground text-sm">{t('meta.subtitle')}</p>
            </div>
          </div>
        </div>
        <ExportButton type="finance" from={getDefaultFrom()} to={getDefaultTo()} />
      </div>

      <Tabs defaultValue="pnl" dir={dirFor(locale)}>
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="pnl" className="text-xs sm:text-sm">{t('tabs.pnl')}</TabsTrigger>
          <TabsTrigger value="cashflow" className="text-xs sm:text-sm">{t('tabs.cashflow')}</TabsTrigger>
          <TabsTrigger value="vat" className="text-xs sm:text-sm">{t('tabs.vat')}</TabsTrigger>
          <TabsTrigger value="clients" className="text-xs sm:text-sm">{t('tabs.clients')}</TabsTrigger>
          <TabsTrigger value="projects" className="text-xs sm:text-sm">{t('tabs.projects')}</TabsTrigger>
        </TabsList>

        <TabsContent value="pnl"><PnlTab /></TabsContent>
        <TabsContent value="cashflow"><CashflowTab /></TabsContent>
        <TabsContent value="vat"><VatTab /></TabsContent>
        <TabsContent value="clients"><ClientProfitabilityTab /></TabsContent>
        <TabsContent value="projects"><ProjectProfitabilityTab /></TabsContent>
      </Tabs>
    </div>
  );
}
