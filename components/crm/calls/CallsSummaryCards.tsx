'use client';

import { useTranslations } from 'next-intl';
import {
  Phone,
  CalendarClock,
  CalendarRange,
  PhoneOutgoing,
  PhoneIncoming,
  PhoneMissed,
  Link2,
  Link2Off,
  EyeOff,
  Timer,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { CallsReportAgent } from '@/hooks/useCallsReport';

// m:s (minutes:seconds) — e.g. 3:40. Pure formatter, digits only, no i18n needed. // i18n-exempt: doc comment
// Exported so CallsTable (the per-call row list) reuses the exact same
// formatting instead of a duplicate copy.
export function formatCallDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface StatProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  /** Highlight tone for values that deserve attention (e.g. missed calls > 0). */
  warn?: boolean;
}

function Stat({ icon: Icon, label, value, warn }: StatProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className={cn('size-3.5', warn && 'text-red-500')} aria-hidden />
        {label}
      </div>
      <div className={cn('text-base font-semibold tabular-nums', warn && 'text-red-600 dark:text-red-400')}>
        {value}
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: CallsReportAgent }) {
  const t = useTranslations('calls');

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-500/15">
          <Phone className="h-4 w-4 text-white" aria-hidden />
        </div>
        <h3 className="font-bold text-sm">{agent.display_name}</h3>
      </div>

      <div className="grid grid-cols-2 gap-2.5 p-5 sm:grid-cols-5">
        <Stat icon={CalendarClock} label={t('today')} value={agent.today} />
        <Stat icon={CalendarRange} label={t('month')} value={agent.month} />
        <Stat icon={PhoneOutgoing} label={t('outgoing')} value={agent.outgoing} />
        <Stat icon={PhoneIncoming} label={t('incoming')} value={agent.incoming} />
        <Stat icon={PhoneMissed} label={t('missed')} value={agent.missed} warn={agent.missed > 0} />
        <Stat icon={Link2} label={t('matched')} value={agent.matched} />
        <Stat icon={Link2Off} label={t('unmatched')} value={agent.unmatched} />
        <Stat icon={EyeOff} label={t('ignored')} value={agent.ignored} />
        <Stat icon={Timer} label={t('avgDuration')} value={formatCallDuration(agent.avg_duration_seconds)} />
        <Stat icon={Clock} label={t('totalDuration')} value={formatCallDuration(agent.total_duration_seconds)} />
      </div>
    </div>
  );
}

export function CallsSummaryCards({ agents }: { agents: CallsReportAgent[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {agents.map((agent) => (
        <AgentCard key={agent.username} agent={agent} />
      ))}
    </div>
  );
}
