import { describe, it, expect } from 'vitest';
import { computeCallsReport } from '@/lib/calls/report';
import type { AgentCall } from '@/types/database';

const row = (o: Partial<AgentCall>): AgentCall => ({
  id: 'ac_x', agent_username: 'sayed', phone_raw: '050', phone_normalized: '501234567',
  direction: 'outgoing', duration_seconds: 60, called_at: '2026-07-10T08:00:00+04:00',
  device_call_key: 'k', lead_id: null, activity_id: null, match_status: 'unmatched',
  created_at: '2026-07-10T08:00:00+04:00', ...o,
});

describe('computeCallsReport', () => {
  it('aggregates per agent with Dubai-day today split', () => {
    const rows = [
      row({ id: 'a1', device_call_key: 'k1' }),
      row({ id: 'a2', device_call_key: 'k2', direction: 'incoming', match_status: 'matched', lead_id: 'sl_1', duration_seconds: 120 }),
      row({ id: 'a3', device_call_key: 'k3', called_at: '2026-07-09T20:00:00+04:00' }),
      row({ id: 'a4', device_call_key: 'k4', agent_username: 'kassem', direction: 'missed', duration_seconds: 0 }),
    ];
    const agg = computeCallsReport(rows, '2026-07-10');
    expect(agg.per_agent.sayed.month).toBe(3);
    expect(agg.per_agent.sayed.today).toBe(2);
    expect(agg.per_agent.sayed.incoming).toBe(1);
    expect(agg.per_agent.sayed.matched).toBe(1);
    expect(agg.per_agent.kassem.missed).toBe(1);
    expect(agg.per_agent.sayed.avg_duration_seconds).toBe(80);
    expect(agg.per_day['2026-07-09']).toBe(1);
    expect(agg.per_day['2026-07-10']).toBe(3);
  });

  it('excludes missed-call durations from totals and average', () => {
    const rows = [
      row({ id: 'b1', device_call_key: 'k1', duration_seconds: 60 }),
      row({ id: 'b2', device_call_key: 'k2', direction: 'incoming', duration_seconds: 120 }),
      row({ id: 'b3', device_call_key: 'k3', direction: 'missed', duration_seconds: 999 }),
    ];
    const agg = computeCallsReport(rows, '2026-07-10');
    expect(agg.per_agent.sayed.missed).toBe(1);
    expect(agg.per_agent.sayed.total_duration_seconds).toBe(180);
    expect(agg.per_agent.sayed.avg_duration_seconds).toBe(90);
  });

  it('returns empty objects for empty input', () => {
    const agg = computeCallsReport([], '2026-07-10');
    expect(agg.per_agent).toEqual({});
    expect(agg.per_day).toEqual({});
  });

  it('counts ignored match_status rows', () => {
    const agg = computeCallsReport([row({ id: 'c1', match_status: 'ignored' })], '2026-07-10');
    expect(agg.per_agent.sayed.ignored).toBe(1);
    expect(agg.per_agent.sayed.matched).toBe(0);
    expect(agg.per_agent.sayed.unmatched).toBe(0);
  });
});
