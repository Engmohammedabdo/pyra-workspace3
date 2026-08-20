'use client';

/**
 * Per-agent WhatsApp stat cards — mirrors components/crm/calls/CallsSummaryCards.tsx.
 * The agent-name header is shown ONLY when scope === 'all' (multiple agents,
 * manager/admin view); a scope === 'own' report is obviously "you", so the
 * header is skipped and the tiles render directly.
 */

import { useTranslations } from 'next-intl';
import {
  MessageCircle,
  CalendarClock,
  CalendarRange,
  MessagesSquare,
  Inbox,
  CheckCircle2,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  Reply,
  Percent,
  Timer,
} from 'lucide-react';
import type { WaReportAgent } from '@/hooks/useWhatsappReport';

// m:s (minutes:seconds) — e.g. 3:40. Pure formatter, digits only, no i18n needed. // i18n-exempt: doc comment
function formatResponseTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface StatProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}

function Stat({ icon: Icon, label, value }: StatProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </div>
      <div className="text-base font-semibold tabular-nums" dir="ltr">
        {value}
      </div>
    </div>
  );
}

function AgentCard({ agent, showHeader }: { agent: WaReportAgent; showHeader: boolean }) {
  const t = useTranslations('whatsapp-report');

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      {showHeader && (
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-500/15">
            <MessageCircle className="h-4 w-4 text-white" aria-hidden />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">{t('agent')}</p>
            <h3 className="font-bold text-sm">{agent.display_name}</h3>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 p-5 sm:grid-cols-4">
        <Stat icon={CalendarClock} label={t('today')} value={agent.today} />
        <Stat icon={CalendarRange} label={t('month')} value={agent.month} />
        <Stat icon={MessagesSquare} label={t('conversations')} value={agent.conversations} />
        <Stat icon={Inbox} label={t('open')} value={agent.open} />
        <Stat icon={CheckCircle2} label={t('resolved')} value={agent.resolved} />
        <Stat icon={ArrowUpRight} label={t('outgoing')} value={agent.outgoing} />
        <Stat icon={ArrowDownLeft} label={t('incoming')} value={agent.incoming} />
        <Stat icon={Users} label={t('leadsContacted')} value={agent.leads_contacted} />
        <Stat icon={Reply} label={t('replied')} value={agent.replied} />
        <Stat icon={Percent} label={t('replyRate')} value={`${agent.reply_rate}%`} />
        <Stat icon={Timer} label={t('avgResponse')} value={formatResponseTime(agent.avg_response_seconds)} />
      </div>
    </div>
  );
}

export function WaSummaryCards({ agents, scope }: { agents: WaReportAgent[]; scope: 'all' | 'own' }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {agents.map((agent) => (
        <AgentCard key={agent.username} agent={agent} showHeader={scope === 'all'} />
      ))}
    </div>
  );
}
