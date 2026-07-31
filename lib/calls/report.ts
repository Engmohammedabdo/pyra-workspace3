import { dubaiDayKey } from '@/lib/utils/format';
import type { AgentCall } from '@/types/database';

export interface AgentCallStats {
  today: number; month: number;
  outgoing: number; incoming: number; missed: number;
  matched: number; unmatched: number; ignored: number;
  total_duration_seconds: number; avg_duration_seconds: number;
  answered: number; answer_rate: number;
}

export interface CallsReportAgg {
  per_agent: Record<string, AgentCallStats>;
  per_day: Record<string, number>;
}

const empty = (): AgentCallStats => ({
  today: 0, month: 0, outgoing: 0, incoming: 0, missed: 0,
  matched: 0, unmatched: 0, ignored: 0,
  total_duration_seconds: 0, avg_duration_seconds: 0,
  answered: 0, answer_rate: 0,
});

export function computeCallsReport(rows: AgentCall[], todayKey: string): CallsReportAgg {
  const per_agent: Record<string, AgentCallStats> = {};
  const per_day: Record<string, number> = {};
  for (const r of rows) {
    const s = (per_agent[r.agent_username] ??= empty());
    // An ignored number is not sales work — it is the owner's own line, or any
    // number the agent explicitly marked "not a customer". The row is still
    // STORED (evidence the dial happened) and still COUNTED here so the page
    // can show "N ignored", but it contributes to nothing else: not the
    // workload, not the day chart, not the answer rate, not the average.
    // Before this, 24 calls between the owner and his own team were indexed as
    // real sales calls in every figure on the report.
    if (r.match_status === 'ignored') {
      s.ignored += 1;
      continue;
    }
    s.month += 1;
    s[r.direction] += 1;
    s[r.match_status] += 1;
    // A dialled-but-unanswered call is a real attempt (it stays in `outgoing`)
    // but it is NOT a conversation: counting its 0 seconds in the average
    // dragged the displayed figure 36% below reality (47s shown vs 73s real,
    // measured 2026-07-25). `answered` is the honest denominator.
    if (r.direction !== 'missed' && r.duration_seconds > 0) {
      s.answered += 1;
      s.total_duration_seconds += r.duration_seconds;
    }
    const day = dubaiDayKey(new Date(r.called_at));
    if (day === todayKey) s.today += 1;
    per_day[day] = (per_day[day] ?? 0) + 1;
  }
  for (const s of Object.values(per_agent)) {
    s.avg_duration_seconds = s.answered > 0
      ? Math.round(s.total_duration_seconds / s.answered)
      : 0;
    // Denominator is non-missed calls: a missed INBOUND call is not an attempt
    // the agent failed at, so it must not count against their answer rate.
    const attempts = s.outgoing + s.incoming;
    s.answer_rate = attempts > 0
      ? Math.round((s.answered / attempts) * 1000) / 10
      : 0;
  }
  return { per_agent, per_day };
}
