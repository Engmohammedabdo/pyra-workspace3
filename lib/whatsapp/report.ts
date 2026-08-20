import { dubaiDayKey } from '@/lib/utils/format';

export interface AgentWaStats {
  today: number; month: number;
  outgoing: number; incoming: number;
  conversations: number; open: number; resolved: number;
  leads_contacted: number;
  replied: number; reply_rate: number;
  avg_response_seconds: number;
}
export interface WaReportInput {
  messages: Array<{
    credit_agent: string | null;
    direction: 'incoming' | 'outgoing';
    timestamp: string;
    conversation_id: string | null;
    lead_id: string | null;
    lead_owned: boolean;
  }>;
  conversations: Array<{ id: string; credit_agent: string | null; status: string }>;
  todayKey: string;
}

function blank(): AgentWaStats {
  return { today: 0, month: 0, outgoing: 0, incoming: 0, conversations: 0, open: 0, resolved: 0, leads_contacted: 0, replied: 0, reply_rate: 0, avg_response_seconds: 0 };
}

export function computeWhatsappReport(input: WaReportInput): {
  per_agent: Record<string, AgentWaStats>;
  per_day: Record<string, number>;
} {
  const per_agent: Record<string, AgentWaStats> = {};
  const per_day: Record<string, number> = {};
  const leadsByAgent: Record<string, Set<string>> = {};
  const get = (u: string) => (per_agent[u] ??= blank());

  // Conversation owner lookup — an inbound (customer) message always carries
  // credit_agent: null on the message itself, so it can only be credited to
  // an agent via the conversation it belongs to.
  const convAgent: Record<string, string | null> = {};
  for (const c of input.conversations) convAgent[c.id] = c.credit_agent;

  // Message-level tallies (credited) + per-day (all messages, unconditional).
  for (const m of input.messages) {
    const day = dubaiDayKey(new Date(m.timestamp));
    per_day[day] = (per_day[day] ?? 0) + 1;
    const u = m.credit_agent ?? (m.conversation_id ? convAgent[m.conversation_id] : null) ?? null;
    if (!u) continue;
    const s = get(u);
    s.month += 1;
    if (day === input.todayKey) s.today += 1;
    if (m.direction === 'outgoing') s.outgoing += 1; else s.incoming += 1;
    if (m.direction === 'outgoing' && m.lead_id && m.lead_owned) {
      (leadsByAgent[u] ??= new Set()).add(m.lead_id);
    }
  }
  for (const [u, set] of Object.entries(leadsByAgent)) get(u).leads_contacted = set.size;

  // Conversation-level tallies (handled / open / resolved).
  for (const c of input.conversations) {
    if (!c.credit_agent) continue;
    const s = get(c.credit_agent);
    s.conversations += 1;
    if (c.status === 'open') s.open += 1;
    else if (c.status === 'resolved') s.resolved += 1;
  }

  // First-response time + replied, per conversation, credited to the conversation's agent.
  const byConv: Record<string, WaReportInput['messages']> = {};
  for (const m of input.messages) {
    if (!m.conversation_id) continue;
    (byConv[m.conversation_id] ??= []).push(m);
  }
  const respByAgent: Record<string, number[]> = {};
  const withInboundByAgent: Record<string, number> = {};
  for (const [cid, msgs] of Object.entries(byConv)) {
    const agent = convAgent[cid];
    if (!agent) continue;
    const sorted = [...msgs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const firstInboundIdx = sorted.findIndex((m) => m.direction === 'incoming');
    if (firstInboundIdx === -1) continue;
    withInboundByAgent[agent] = (withInboundByAgent[agent] ?? 0) + 1;
    const reply = sorted.slice(firstInboundIdx + 1).find((m) => m.direction === 'outgoing');
    if (!reply) continue;
    const gap = (new Date(reply.timestamp).getTime() - new Date(sorted[firstInboundIdx].timestamp).getTime()) / 1000;
    if (gap >= 0) (respByAgent[agent] ??= []).push(gap);
  }
  for (const [u, gaps] of Object.entries(respByAgent)) {
    const s = get(u);
    s.replied = gaps.length;
    s.avg_response_seconds = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
  }
  for (const [u, withInbound] of Object.entries(withInboundByAgent)) {
    const s = get(u);
    s.reply_rate = withInbound ? Math.round((s.replied / withInbound) * 1000) / 10 : 0;
  }

  return { per_agent, per_day };
}
