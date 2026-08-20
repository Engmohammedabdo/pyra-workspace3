import { describe, it, expect } from 'vitest';
import { computeWhatsappReport } from '@/lib/whatsapp/report';

const RESOLVED = 'resolved';
const OPEN = 'open';

describe('computeWhatsappReport', () => {
  it('tallies direction, conversations, leads and per-day for one agent', () => {
    const out = computeWhatsappReport({
      todayKey: '2026-08-20',
      conversations: [
        { id: 'c1', credit_agent: 'youssef', status: OPEN },
        { id: 'c2', credit_agent: 'youssef', status: RESOLVED },
      ],
      messages: [
        // c1: customer at 10:00, agent replies at 10:05 (300s) → replied
        { credit_agent: null, direction: 'incoming', timestamp: '2026-08-20T06:00:00.000Z', conversation_id: 'c1', lead_id: 'l1', lead_owned: true },
        { credit_agent: 'youssef', direction: 'outgoing', timestamp: '2026-08-20T06:05:00.000Z', conversation_id: 'c1', lead_id: 'l1', lead_owned: true },
        // c2: agent-only outbound to another owned lead (no inbound → not "replied")
        { credit_agent: 'youssef', direction: 'outgoing', timestamp: '2026-08-19T09:00:00.000Z', conversation_id: 'c2', lead_id: 'l2', lead_owned: true },
      ],
    });
    const y = out.per_agent['youssef'];
    expect(y.outgoing).toBe(2);
    expect(y.incoming).toBe(1);
    expect(y.month).toBe(3);
    expect(y.conversations).toBe(2);
    expect(y.open).toBe(1);
    expect(y.resolved).toBe(1);
    expect(y.leads_contacted).toBe(2);      // l1 + l2, both owned + outbound
    expect(y.replied).toBe(1);              // only c1 had inbound→outbound
    expect(y.reply_rate).toBe(100);         // 1 replied / 1 conversation-with-inbound
    expect(y.avg_response_seconds).toBe(300);
    // per_day buckets by Dubai day (UTC 06:00 = 10:00 +04)
    expect(out.per_day['2026-08-20']).toBe(2);
    expect(out.per_day['2026-08-19']).toBe(1);
  });

  it('does not credit leads_contacted for a lead the agent does not own', () => {
    const out = computeWhatsappReport({
      todayKey: '2026-08-20',
      conversations: [{ id: 'c1', credit_agent: 'youssef', status: OPEN }],
      messages: [
        { credit_agent: 'youssef', direction: 'outgoing', timestamp: '2026-08-20T06:00:00.000Z', conversation_id: 'c1', lead_id: 'l9', lead_owned: false },
      ],
    });
    expect(out.per_agent['youssef'].leads_contacted).toBe(0);
  });

  it('omits nothing but keys strictly by credit_agent (null credit ignored)', () => {
    const out = computeWhatsappReport({
      todayKey: '2026-08-20',
      conversations: [{ id: 'c1', credit_agent: null, status: OPEN }],
      messages: [
        { credit_agent: null, direction: 'incoming', timestamp: '2026-08-20T06:00:00.000Z', conversation_id: 'c1', lead_id: null, lead_owned: false },
      ],
    });
    expect(Object.keys(out.per_agent)).toHaveLength(0);
    expect(out.per_day['2026-08-20']).toBe(1); // per_day counts all messages regardless of credit
  });
});
