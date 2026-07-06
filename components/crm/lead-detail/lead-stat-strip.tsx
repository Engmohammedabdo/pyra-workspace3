'use client';

/**
 * 4-card stat strip on the Lead Detail page.
 *
 * Cards (per PRD § Lead Detail):
 *   1. Deal value (expected_value + currency)
 *   2. Days in pipeline (created_at → converted_at OR now)
 *   3. Last activity (most recent of last_contact_at + activity timeline)
 *   4. Win probability (with the Q-BIZ-001 default→override flag note)
 */

import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Wallet, CalendarClock, Activity, Target } from 'lucide-react';
import { formatCurrency, formatRelativeDate } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';
import type { PyraSalesLead } from '@/types/database';

interface LeadStatStripProps {
  lead: PyraSalesLead;
  /** Most recent timeline activity timestamp, if known. Falls back to last_contact_at. */
  lastActivityAt?: string | null;
}

function daysInPipeline(lead: PyraSalesLead): number | null {
  if (!lead.created_at) return null;
  const start = new Date(lead.created_at).getTime();
  const end = lead.converted_at ? new Date(lead.converted_at).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.floor((end - start) / (24 * 60 * 60 * 1000)));
}

export function LeadStatStrip({ lead, lastActivityAt }: LeadStatStripProps) {
  const t = useTranslations('crm.lead.statStrip');
  const statusLabelForBillingCycle = useStatusLabels('leadBillingCycle');
  const locale = useLocale() as Locale;
  const days = daysInPipeline(lead);
  const lastSeen = lastActivityAt ?? lead.last_contact_at;
  const winProb = lead.win_probability ?? 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        icon={<Wallet className="size-5" />}
        label={t('dealValue')}
        tone="orange"
        value={
          (Number(lead.expected_value) || 0) > 0
            ? formatCurrency(Number(lead.expected_value), lead.expected_value_currency || 'AED')
            : t('dash')
        }
        sub={
          lead.billing_cycle && lead.billing_cycle !== 'one_time'
            ? statusLabelForBillingCycle(lead.billing_cycle)
            : undefined
        }
      />
      <StatCard
        icon={<CalendarClock className="size-5" />}
        label={lead.is_converted ? t('closedDuration') : t('inPipeline')}
        tone="indigo"
        value={days !== null ? `${days}` : t('dash')}
        sub={days !== null ? t('days', { count: days }) : undefined}
      />
      <StatCard
        icon={<Activity className="size-5" />}
        label={t('lastActivity')}
        tone="amber"
        value={lastSeen ? formatRelativeDate(lastSeen, locale) : t('dash')}
      />
      <StatCard
        icon={<Target className="size-5" />}
        label={t('winProbability')}
        tone={winProb >= 75 ? 'emerald' : winProb >= 50 ? 'orange' : 'gray'}
        value={`${winProb}%`}
        sub={lead.win_probability_overridden ? t('overriddenManually') : t('byStage')}
      />
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: 'orange' | 'indigo' | 'amber' | 'emerald' | 'gray';
}

const TONE_CLASSES: Record<StatCardProps['tone'], string> = {
  orange:  'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  indigo:  'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  amber:   'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  gray:    'bg-muted text-muted-foreground',
};

function StatCard({ icon, label, value, sub, tone }: StatCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className={`size-9 rounded-lg flex items-center justify-center ${TONE_CLASSES[tone]}`}>{icon}</div>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tracking-tight tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}
