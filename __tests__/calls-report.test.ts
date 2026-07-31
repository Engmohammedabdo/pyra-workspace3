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

describe('computeCallsReport — answered vs dialled', () => {
  it('excludes 0-second dials from the average but keeps them in the call count', () => {
    const rows = [
      row({ id: 'd1', device_call_key: 'k1', agent_username: 'a', direction: 'outgoing', duration_seconds: 100 }),
      row({ id: 'd2', device_call_key: 'k2', agent_username: 'a', direction: 'outgoing', duration_seconds: 0 }),
      row({ id: 'd3', device_call_key: 'k3', agent_username: 'a', direction: 'outgoing', duration_seconds: 0 }),
    ];
    const { per_agent } = computeCallsReport(rows, '2026-07-25');
    expect(per_agent.a.outgoing).toBe(3);          // all three were dialled
    expect(per_agent.a.answered).toBe(1);          // one was picked up
    expect(per_agent.a.avg_duration_seconds).toBe(100); // NOT 33
  });

  it('computes answer rate over non-missed calls only', () => {
    const rows = [
      row({ id: 'e1', device_call_key: 'k1', agent_username: 'a', direction: 'outgoing', duration_seconds: 60 }),
      row({ id: 'e2', device_call_key: 'k2', agent_username: 'a', direction: 'outgoing', duration_seconds: 0 }),
      row({ id: 'e3', device_call_key: 'k3', agent_username: 'a', direction: 'incoming', duration_seconds: 30 }),
      row({ id: 'e4', device_call_key: 'k4', agent_username: 'a', direction: 'missed', duration_seconds: 0 }),
    ];
    const { per_agent } = computeCallsReport(rows, '2026-07-25');
    // 2 answered of 3 non-missed = 66.7 (the missed call is not a failed attempt by the agent)
    expect(per_agent.a.answered).toBe(2);
    expect(per_agent.a.answer_rate).toBe(66.7);
  });

  it('reports 0 answer rate and 0 average when nobody ever picked up', () => {
    const rows = [
      row({ id: 'f1', device_call_key: 'k1', agent_username: 'a', direction: 'outgoing', duration_seconds: 0 }),
      row({ id: 'f2', device_call_key: 'k2', agent_username: 'a', direction: 'outgoing', duration_seconds: 0 }),
    ];
    const { per_agent } = computeCallsReport(rows, '2026-07-25');
    expect(per_agent.a.answered).toBe(0);
    expect(per_agent.a.answer_rate).toBe(0);
    expect(per_agent.a.avg_duration_seconds).toBe(0);
  });

  it('reports 0 answer rate for an agent whose only calls are missed inbound', () => {
    const rows = [row({ id: 'g1', device_call_key: 'k1', agent_username: 'a', direction: 'missed', duration_seconds: 0 })];
    const { per_agent } = computeCallsReport(rows, '2026-07-25');
    expect(per_agent.a.missed).toBe(1);
    expect(per_agent.a.answer_rate).toBe(0); // no division by zero
  });

  // An ignored number is the owner's own line (or any number the agent marked
  // "not a customer"). It is deliberately still STORED as evidence that the
  // dial happened, but it must not inflate a single productivity figure —
  // before this, 24 calls between the owner and his team counted as real
  // sales calls in every metric on the page.
  it('keeps ignored calls out of every metric except the ignored counter', () => {
    const rows = [
      row({ id: 'h1', device_call_key: 'k1', agent_username: 'a', duration_seconds: 60 }),
      row({ id: 'h2', device_call_key: 'k2', agent_username: 'a', match_status: 'ignored', direction: 'outgoing', duration_seconds: 300 }),
      row({ id: 'h3', device_call_key: 'k3', agent_username: 'a', match_status: 'ignored', direction: 'incoming', duration_seconds: 300 }),
    ];
    const { per_agent, per_day } = computeCallsReport(rows, '2026-07-10');
    expect(per_agent.a.ignored).toBe(2);        // still visible as a count
    expect(per_agent.a.month).toBe(1);          // …but not part of the workload
    expect(per_agent.a.today).toBe(1);
    expect(per_agent.a.outgoing).toBe(1);
    expect(per_agent.a.incoming).toBe(0);
    expect(per_agent.a.answered).toBe(1);
    expect(per_agent.a.total_duration_seconds).toBe(60);
    expect(per_agent.a.avg_duration_seconds).toBe(60);
    expect(per_agent.a.answer_rate).toBe(100);
    expect(per_day['2026-07-10']).toBe(1);      // the daily chart stays honest
  });

  it('still lists an agent whose only calls are ignored, with a zeroed workload', () => {
    const rows = [row({ id: 'i1', device_call_key: 'k1', agent_username: 'a', match_status: 'ignored' })];
    const { per_agent, per_day } = computeCallsReport(rows, '2026-07-10');
    expect(per_agent.a.ignored).toBe(1);
    expect(per_agent.a.month).toBe(0);
    expect(per_agent.a.answer_rate).toBe(0);
    expect(per_day['2026-07-10']).toBeUndefined();
  });
});
