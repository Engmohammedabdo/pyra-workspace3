import { dubaiDayKey } from '@/lib/utils/format';
import type { AgentCall } from '@/types/database';

export interface AgentCallStats {
  today: number; month: number;
  outgoing: number; incoming: number; missed: number;
  matched: number; unmatched: number; ignored: number;
  total_duration_seconds: number; avg_duration_seconds: number;
}

export interface CallsReportAgg {
  per_agent: Record<string, AgentCallStats>;
  per_day: Record<string, number>;
}

const empty = (): AgentCallStats => ({
  today: 0, month: 0, outgoing: 0, incoming: 0, missed: 0,
  matched: 0, unmatched: 0, ignored: 0,
  total_duration_seconds: 0, avg_duration_seconds: 0,
});

export function computeCallsReport(rows: AgentCall[], todayKey: string): CallsReportAgg {
  const per_agent: Record<string, AgentCallStats> = {};
  const per_day: Record<string, number> = {};
  for (const r of rows) {
    const s = (per_agent[r.agent_username] ??= empty());
    s.month += 1;
    s[r.direction] += 1;
    s[r.match_status] += 1;
    // Missed calls never connected — their duration must not inflate the
    // connected-calls average (denominator = outgoing + incoming only).
    if (r.direction !== 'missed') s.total_duration_seconds += r.duration_seconds;
    const day = dubaiDayKey(new Date(r.called_at));
    if (day === todayKey) s.today += 1;
    per_day[day] = (per_day[day] ?? 0) + 1;
  }
  for (const s of Object.values(per_agent)) {
    const connected = s.outgoing + s.incoming;
    s.avg_duration_seconds = connected > 0 ? Math.round(s.total_duration_seconds / connected) : 0;
  }
  return { per_agent, per_day };
}
