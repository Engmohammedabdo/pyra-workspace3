import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * END-TO-END gate test for the calls/sync ownership boundary.
 *
 * `lib/calls/match.ts::isOwnedByAgent` has its own unit tests, but they only
 * restate that function's expression. The ACTUAL security boundary is the two
 * `owned &&` conjuncts in `app/api/mobile/calls/sync/route.ts` plus the
 * response spread — delete all three and every `isOwnedByAgent` test still
 * passes. These two tests are the ones that fail.
 *
 * Harness copied from `__tests__/board-relation-writer-security.test.ts`: mock
 * `createServiceRoleClient`, record `{ table, kind, input, filters }` per
 * `.from()` chain, then assert on what was (and was NOT) written.
 *
 * The two tests are a MIRROR PAIR on purpose. The unowned test alone passes
 * trivially if the route stops writing anything at all; the owned test is what
 * proves the honest path still writes the activity, the last_contact_at bump
 * and the activity_id back-fill.
 */

type QueryKind = 'select' | 'insert' | 'update' | 'delete' | null;

type QueryCall = {
  table: string;
  kind: QueryKind;
  filters: Array<{ column: string; value: unknown }>;
  input?: unknown;
};

type QueryResult = { data: unknown; error: null | { message: string; code?: string } };

// ⚠️ `phoneMatchKey` keys on the LAST 9 DIGITS, so '+971 2 583 6444' (digits
// 97125836444 → key 125836444) and '025836444' (key 025836444) do NOT collide.
// The existing match tests were bitten by exactly this. These two fixtures DO
// collide: '02 583 6444' strips to 025836444, which IS 9 digits, so it is its
// own key — identical to the dialled '025836444'.
const LEAD_PHONE = '02 583 6444';
const DIALLED_PHONE = '025836444';
const CALLED_AT = '2026-08-07T09:15:00.000Z';
const DEVICE_CALL_KEY = 'dev:call:1';

const mocks = vi.hoisted(() => ({
  requireDeviceAuth: vi.fn(),
  createServiceClient: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/app/api/mobile/_lib/device-auth', () => ({
  requireDeviceAuth: mocks.requireDeviceAuth,
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: mocks.createServiceClient,
}));
vi.mock('@/lib/observability/log-error', () => ({ logError: mocks.logError }));
// Deterministic ids — the prefix already distinguishes the call row ('ac') from
// the timeline activity ('la'), so a fixed suffix is enough to assert the
// activity_id back-fill points at the activity that was just inserted.
vi.mock('@/lib/utils/id', () => ({ generateId: (prefix: string) => `${prefix}_test` }));

import { POST as syncCalls } from '../app/api/mobile/calls/sync/route';

function makeClient(leadAssignedTo: string) {
  const calls: QueryCall[] = [];
  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, kind: null, filters: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => {
      if (call.kind === null) call.kind = 'select';
      return builder;
    });
    builder.insert = vi.fn((input: unknown) => {
      call.kind = 'insert';
      call.input = input;
      return builder;
    });
    builder.update = vi.fn((input: unknown) => {
      call.kind = 'update';
      call.input = input;
      return builder;
    });
    builder.eq = vi.fn((column: string, value: unknown) => {
      call.filters.push({ column, value });
      return builder;
    });
    builder.in = vi.fn((column: string, value: unknown) => {
      call.filters.push({ column, value });
      return builder;
    });
    builder.not = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.range = vi.fn(() => builder);
    builder.then = (
      onFulfilled: (value: QueryResult) => unknown,
      onRejected: (reason: unknown) => unknown,
    ) => Promise.resolve(resolve(call, leadAssignedTo)).then(onFulfilled, onRejected);
    return builder;
  });
  return { client: { from }, calls };
}

function resolve(call: QueryCall, leadAssignedTo: string): QueryResult {
  if (call.kind === 'select') {
    switch (call.table) {
      // no device_call_key already synced → nothing is a duplicate
      case 'pyra_agent_calls':
        return { data: [], error: null };
      // the SINGLE seeded lead — assigned_to is what the two tests vary
      case 'pyra_sales_leads':
        return {
          data: [{ id: 'sl_x', name: 'X', phone: LEAD_PHONE, assigned_to: leadAssignedTo }],
          error: null,
        };
      case 'pyra_ignored_numbers':
        return { data: [], error: null };
      case 'pyra_sales_follow_ups':
        return { data: [], error: null };
      default:
        return { data: [], error: null };
    }
  }
  return { data: null, error: null };
}

function syncRequest() {
  return {
    json: vi.fn(async () => ({
      calls: [{
        device_call_key: DEVICE_CALL_KEY,
        phone: DIALLED_PHONE,
        direction: 'outgoing',
        duration_seconds: 60,
        called_at: CALLED_AT,
      }],
    })),
  } as never;
}

function writesTo(calls: QueryCall[], table: string, kind: QueryKind) {
  return calls.filter((c) => c.table === table && c.kind === kind);
}

beforeEach(() => {
  mocks.requireDeviceAuth.mockReset().mockResolvedValue({
    agentUsername: 'cosette',
    displayName: 'Cosette',
  });
  mocks.createServiceClient.mockReset();
  mocks.logError.mockClear();
});

describe('POST /api/mobile/calls/sync — lead ownership gate', () => {
  it('writes NOTHING onto a colleague\'s lead and withholds its identity', async () => {
    const service = makeClient('youssef'); // the lead belongs to youssef, not cosette
    mocks.createServiceClient.mockReturnValue(service.client);

    const response = await syncCalls(syncRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    // the call itself is still recorded — one row, exactly once
    expect(writesTo(service.calls, 'pyra_agent_calls', 'insert')).toHaveLength(1);
    // …but nothing lands on the colleague's lead
    expect(writesTo(service.calls, 'pyra_lead_activities', 'insert')).toHaveLength(0);
    expect(writesTo(service.calls, 'pyra_sales_leads', 'update')).toHaveLength(0);
    // …and the response carries no lead id, no lead name
    expect(body.data.results[0]).toEqual({
      device_call_key: DEVICE_CALL_KEY,
      status: 'matched',
      owned: false,
    });
  });

  it('still writes the activity, the bump and the back-fill on the agent\'s OWN lead', async () => {
    const service = makeClient('cosette'); // same setup, the lead is now hers
    mocks.createServiceClient.mockReturnValue(service.client);

    const response = await syncCalls(syncRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(writesTo(service.calls, 'pyra_agent_calls', 'insert')).toHaveLength(1);

    // the timeline activity — a CONNECTED call, so 'call_logged' (not 'call_attempt')
    const activities = writesTo(service.calls, 'pyra_lead_activities', 'insert');
    expect(activities).toHaveLength(1);
    expect(activities[0].input).toMatchObject({
      id: 'la_test',
      lead_id: 'sl_x',
      activity_type: 'call_logged',
      created_by: 'cosette',
    });

    // the last_contact_at bump, on the matched lead only
    const bumps = writesTo(service.calls, 'pyra_sales_leads', 'update');
    expect(bumps).toHaveLength(1);
    expect(bumps[0].input).toEqual({ last_contact_at: CALLED_AT });
    expect(bumps[0].filters).toEqual([{ column: 'id', value: 'sl_x' }]);

    // the activity_id back-fill onto the call row
    const backFills = writesTo(service.calls, 'pyra_agent_calls', 'update');
    expect(backFills).toHaveLength(1);
    expect(backFills[0].input).toEqual({ activity_id: 'la_test' });

    // and the response DOES carry the identity
    expect(body.data.results[0]).toMatchObject({
      device_call_key: DEVICE_CALL_KEY,
      status: 'matched',
      lead_id: 'sl_x',
      lead_name: 'X',
      owned: true,
    });
  });
});
