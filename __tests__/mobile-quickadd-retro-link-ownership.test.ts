import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * END-TO-END gate test for `retroLinkCalls()` in `app/api/mobile/leads/route.ts`
 * — the THIRD path to the lead-ownership boundary, after
 * `__tests__/mobile-calls-sync-ownership.test.ts` (calls/sync) and the
 * withheld-identity branches this same route already has covered.
 *
 * Harness copied from `__tests__/mobile-calls-sync-ownership.test.ts`
 * (mock `createServiceRoleClient` + `requireDeviceAuth`, record
 * `{table, kind, filters, input}` per `.from()` chain), extended with `.is()`
 * and `.neq()` support for retroLinkCalls's sweep query
 * (`.eq('phone_normalized', …).neq('match_status', 'ignored').is('lead_id', null)`)
 * and `.maybeSingle()` support (copied from
 * `__tests__/board-relation-writer-security.test.ts`) for the initial
 * device_call_key lookup and the last_contact_at read.
 *
 * All three tests exercise the route through its EXISTING-LEAD-MATCH branch
 * (`if (match) { … retroLinkCalls(supabase, match.id, …, match.assigned_to) }`)
 * rather than the new-lead-creation branch, so `matchLeadByPhone` genuinely
 * has to resolve the lead by phone — which is why the phone fixtures below
 * must actually collide (see the comment on DIALLED_PHONE).
 */

type QueryKind = 'select' | 'insert' | 'update' | null;

type QueryCall = {
  table: string;
  kind: QueryKind;
  filters: Array<{ column: string; op: string; value: unknown }>;
  terminal?: 'maybeSingle';
  input?: Record<string, unknown>;
};

type QueryResult = { data: unknown; error: null | { message: string; code?: string } };

interface AgentCallRow {
  id: string;
  agent_username: string;
  direction: 'outgoing' | 'incoming' | 'missed';
  duration_seconds: number;
  called_at: string;
}

interface Scenario {
  // The call that triggered this quick-add POST (looked up by device_call_key).
  triggerCall: AgentCallRow & { phone_raw: string; phone_normalized: string; lead_id: string | null };
  // What retroLinkCalls's own SELECT (system-wide sweep, no agent filter)
  // returns for this phone_normalized. Deliberately independent of
  // `triggerCall` above — real DB state would include the trigger call
  // itself here too, but nothing in retroLinkCalls cares which row is
  // "the trigger", so tests list only the rows that matter to the assertion.
  unlinkedCalls: AgentCallRow[];
  existingLeads: Array<{ id: string; name: string; phone: string; assigned_to: string | null }>;
  currentLastContactAt: string | null;
}

// ⚠️ `phoneMatchKey` (lib/utils/phone.ts) keys on the LAST 9 DIGITS. These two
// fixtures DO collide: LEAD_PHONE's digits are '025836444' (9 digits, used
// as-is), and DIALLED_PHONE is already '025836444' — identical key. A test
// using, say, '+971 2 583 6444' (digits '97125836444' → key '125836444')
// instead of DIALLED_PHONE would silently stop matching and every assertion
// below would degrade to the "no match" branch without failing loudly.
const LEAD_PHONE = '02 583 6444';
const DIALLED_PHONE = '025836444';
const PHONE_NORMALIZED = '025836444';

const LEAD_ID = 'sl_existing';
const LEAD_NAME = 'Existing Customer';
const OWNER = 'ali'; // the pre-existing lead's real assigned_to in every test below
const FOREIGN_AGENT = 'youssef';
const DEVICE_CALL_KEY = 'dev:call:quickadd';

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

import { POST as quickAddLead } from '../app/api/mobile/leads/route';

function makeClient(scenario: Scenario) {
  const calls: QueryCall[] = [];
  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, kind: null, filters: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => {
      if (call.kind === null) call.kind = 'select';
      return builder;
    });
    builder.insert = vi.fn((input: Record<string, unknown>) => {
      call.kind = 'insert';
      call.input = input;
      return builder;
    });
    builder.update = vi.fn((input: Record<string, unknown>) => {
      call.kind = 'update';
      call.input = input;
      return builder;
    });
    builder.eq = vi.fn((column: string, value: unknown) => {
      call.filters.push({ column, op: 'eq', value });
      return builder;
    });
    builder.neq = vi.fn((column: string, value: unknown) => {
      call.filters.push({ column, op: 'neq', value });
      return builder;
    });
    builder.is = vi.fn((column: string, value: unknown) => {
      call.filters.push({ column, op: 'is', value });
      return builder;
    });
    builder.not = vi.fn((column: string, op: string, value: unknown) => {
      call.filters.push({ column, op: 'not', value });
      return builder;
    });
    builder.maybeSingle = vi.fn(() => {
      call.terminal = 'maybeSingle';
      return builder;
    });
    builder.then = (
      onFulfilled: (value: QueryResult) => unknown,
      onRejected: (reason: unknown) => unknown,
    ) => Promise.resolve(resolve(call, scenario)).then(onFulfilled, onRejected);
    return builder;
  });
  return { client: { from }, calls };
}

function resolve(call: QueryCall, s: Scenario): QueryResult {
  const { table, kind, terminal } = call;

  if (table === 'pyra_agent_calls') {
    if (kind === 'select') {
      // The initial "find the triggering call" lookup terminates on
      // .maybeSingle(); retroLinkCalls's sweep does not — that difference is
      // what tells the two apart here (both filter by different columns, but
      // this mock resolves by shape, not by echoing the real WHERE clause).
      return terminal === 'maybeSingle'
        ? { data: s.triggerCall, error: null }
        : { data: s.unlinkedCalls, error: null };
    }
    if (kind === 'update') return { data: null, error: null };
  }

  if (table === 'pyra_sales_leads') {
    if (kind === 'select') {
      return terminal === 'maybeSingle'
        // retroLinkCalls's last_contact_at read before the forward-only bump
        ? { data: { last_contact_at: s.currentLastContactAt }, error: null }
        // the unfiltered phone-index read used to build matchLeadByPhone
        : { data: s.existingLeads, error: null };
    }
    if (kind === 'insert' || kind === 'update') return { data: null, error: null };
  }

  if (table === 'pyra_lead_activities' && kind === 'insert') {
    return { data: null, error: null };
  }

  return { data: null, error: null };
}

function writesTo(calls: QueryCall[], table: string, kind: QueryKind) {
  return calls.filter((c) => c.table === table && c.kind === kind);
}

function quickAddRequest() {
  return {
    json: vi.fn(async () => ({
      device_call_key: DEVICE_CALL_KEY,
      name: 'Test Client',
      lead_type: 'b2c',
    })),
  } as never;
}

beforeEach(() => {
  mocks.requireDeviceAuth.mockReset();
  mocks.createServiceClient.mockReset();
  mocks.logError.mockClear();
});

describe('POST /api/mobile/leads — retroLinkCalls ownership gate', () => {
  it("links a foreign agent's connected call but writes no activity and does not move last_contact_at", async () => {
    // youssef quick-adds (wrong number) on a phone that already belongs to
    // ali's lead. youssef's own triggering call is therefore FOREIGN relative
    // to the lead's real owner.
    mocks.requireDeviceAuth.mockResolvedValue({ agentUsername: FOREIGN_AGENT, displayName: 'Youssef' });
    const scenario: Scenario = {
      triggerCall: {
        id: 'ac_trigger',
        agent_username: FOREIGN_AGENT,
        direction: 'outgoing',
        duration_seconds: 45, // connected
        called_at: '2026-08-05T08:00:00.000Z',
        phone_raw: DIALLED_PHONE,
        phone_normalized: PHONE_NORMALIZED,
        lead_id: null,
      },
      unlinkedCalls: [
        {
          id: 'ac_trigger',
          agent_username: FOREIGN_AGENT,
          direction: 'outgoing',
          duration_seconds: 45,
          called_at: '2026-08-05T08:00:00.000Z',
        },
      ],
      existingLeads: [{ id: LEAD_ID, name: LEAD_NAME, phone: LEAD_PHONE, assigned_to: OWNER }],
      currentLastContactAt: null,
    };
    const service = makeClient(scenario);
    mocks.createServiceClient.mockReturnValue(service.client);

    const response = await quickAddLead(quickAddRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    // identity withheld — youssef doesn't own the matched lead
    expect(body.data).toEqual({ lead_id: '', lead_name: '', lead_url: '', already_existed: true });

    // the call IS linked …
    const linkUpdates = writesTo(service.calls, 'pyra_agent_calls', 'update');
    expect(linkUpdates).toHaveLength(1);
    expect(linkUpdates[0].input).toMatchObject({ lead_id: LEAD_ID, match_status: 'matched', activity_id: null });
    // … but writes NO activity …
    expect(writesTo(service.calls, 'pyra_lead_activities', 'insert')).toHaveLength(0);
    // … and does NOT move last_contact_at
    expect(writesTo(service.calls, 'pyra_sales_leads', 'update')).toHaveLength(0);
  });

  it("links the quick-adding agent's own connected call, writes call_logged, and advances last_contact_at", async () => {
    mocks.requireDeviceAuth.mockResolvedValue({ agentUsername: OWNER, displayName: 'Ali' });
    const calledAt = '2026-08-03T09:30:00.000Z';
    const scenario: Scenario = {
      triggerCall: {
        id: 'ac_owner',
        agent_username: OWNER,
        direction: 'outgoing',
        duration_seconds: 30,
        called_at: calledAt,
        phone_raw: DIALLED_PHONE,
        phone_normalized: PHONE_NORMALIZED,
        lead_id: null,
      },
      unlinkedCalls: [
        { id: 'ac_owner', agent_username: OWNER, direction: 'outgoing', duration_seconds: 30, called_at: calledAt },
      ],
      existingLeads: [{ id: LEAD_ID, name: LEAD_NAME, phone: LEAD_PHONE, assigned_to: OWNER }],
      currentLastContactAt: null,
    };
    const service = makeClient(scenario);
    mocks.createServiceClient.mockReturnValue(service.client);

    const response = await quickAddLead(quickAddRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    // ali owns the matched lead — identity is NOT withheld
    expect(body.data).toMatchObject({ lead_id: LEAD_ID, lead_name: LEAD_NAME, already_existed: true });

    // linked …
    const linkUpdates = writesTo(service.calls, 'pyra_agent_calls', 'update');
    expect(linkUpdates).toHaveLength(1);
    expect(linkUpdates[0].input).toMatchObject({ lead_id: LEAD_ID, match_status: 'matched' });
    expect(linkUpdates[0].input?.activity_id).toEqual(expect.any(String));

    // … writes call_logged (not call_attempt) …
    const activities = writesTo(service.calls, 'pyra_lead_activities', 'insert');
    expect(activities).toHaveLength(1);
    expect(activities[0].input).toMatchObject({
      lead_id: LEAD_ID,
      activity_type: 'call_logged',
      created_by: OWNER,
    });

    // … and advances last_contact_at to the call's own called_at
    const bumps = writesTo(service.calls, 'pyra_sales_leads', 'update');
    expect(bumps).toHaveLength(1);
    expect(bumps[0].input).toEqual({ last_contact_at: calledAt });
    expect(bumps[0].filters).toEqual(expect.arrayContaining([{ column: 'id', op: 'eq', value: LEAD_ID }]));
  });

  it("in one batch, links both calls but lands last_contact_at on the OWNER's newest connected call — not the foreign one, even though the foreign call is chronologically newer", async () => {
    mocks.requireDeviceAuth.mockResolvedValue({ agentUsername: OWNER, displayName: 'Ali' });
    const ownerCalledAt = '2026-08-01T08:00:00.000Z'; // OLDER
    const foreignCalledAt = '2026-08-05T08:00:00.000Z'; // NEWER — the trap: a fix that
    // computes "newest connected call" across the whole batch (ignoring
    // ownership) would pick THIS timestamp instead.
    const scenario: Scenario = {
      triggerCall: {
        id: 'ac_owner_2',
        agent_username: OWNER,
        direction: 'outgoing',
        duration_seconds: 20,
        called_at: ownerCalledAt,
        phone_raw: DIALLED_PHONE,
        phone_normalized: PHONE_NORMALIZED,
        lead_id: null,
      },
      unlinkedCalls: [
        { id: 'ac_owner_2', agent_username: OWNER, direction: 'outgoing', duration_seconds: 20, called_at: ownerCalledAt },
        { id: 'ac_foreign', agent_username: FOREIGN_AGENT, direction: 'outgoing', duration_seconds: 90, called_at: foreignCalledAt },
      ],
      existingLeads: [{ id: LEAD_ID, name: LEAD_NAME, phone: LEAD_PHONE, assigned_to: OWNER }],
      currentLastContactAt: null,
    };
    const service = makeClient(scenario);
    mocks.createServiceClient.mockReturnValue(service.client);

    const response = await quickAddLead(quickAddRequest());
    expect(response.status).toBe(200);

    // BOTH calls linked …
    const linkUpdates = writesTo(service.calls, 'pyra_agent_calls', 'update');
    expect(linkUpdates).toHaveLength(2);
    expect(linkUpdates.every((u) => (u.input as { lead_id?: string })?.lead_id === LEAD_ID)).toBe(true);
    const ownerUpdate = linkUpdates.find((u) => u.filters.some((f) => f.value === 'ac_owner_2'));
    const foreignUpdate = linkUpdates.find((u) => u.filters.some((f) => f.value === 'ac_foreign'));
    expect(ownerUpdate?.input?.activity_id).toEqual(expect.any(String));
    expect(foreignUpdate?.input?.activity_id).toBeNull();

    // … but exactly ONE activity (the owner's)
    const activities = writesTo(service.calls, 'pyra_lead_activities', 'insert');
    expect(activities).toHaveLength(1);
    expect(activities[0].input).toMatchObject({ created_by: OWNER, activity_type: 'call_logged' });

    // … and last_contact_at lands on the OWNER's (older) timestamp, never the
    // foreign (newer) one — the assertion that catches a half-applied fix.
    const bumps = writesTo(service.calls, 'pyra_sales_leads', 'update');
    expect(bumps).toHaveLength(1);
    expect(bumps[0].input).toEqual({ last_contact_at: ownerCalledAt });
  });
});
