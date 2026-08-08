import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * END-TO-END gate test for POST /api/crm/leads' `duplicate_warning`.
 *
 * Mirrors __tests__/crm-lead-lookup-identity-gate.test.ts: the create route's
 * post-insert duplicate check used to `ilike` the phone with NO ownership
 * filter and hand back `existing_lead_name` unconditionally — a rep could
 * create a lead anyway and read a colleague's client's business name straight
 * out of the success toast, one click after the anonymous lookup notice.
 *
 * This test pins the fix: the SAME predicate as /api/crm/leads/lookup
 * (crm_reports.team_view OR assigned_to === caller, exercised through the
 * REAL hasPermission so a wildcard admin is covered by the same path) now
 * gates the identity on this route too.
 *
 *   1. Owned duplicate    → still names the lead (must not regress the common
 *      case).
 *   2. Unowned duplicate  → `{ visible: false }` and NOTHING else — no id, no
 *      name, no assignee anywhere in the response.
 *   3. team_view / admin  → sees the identity of someone else's duplicate.
 *
 * Harness follows crm-lead-lookup-identity-gate.test.ts: mock
 * createServiceRoleClient, record `{ table, ops }` per `.from()` chain, then
 * assert on the response AND that the leaked strings never appear on the wire.
 * logActivity / notify are stubbed (fire-and-forget, orthogonal to this gate).
 */

type QueryCall = { table: string; ops: Array<{ op: string; args: unknown[] }> };

const LEAD_ID = 'sl_new_test';
const DUP_ID = 'sl_x';
const DUP_NAME = 'Acme Trading';
const CALLER_PHONE = '0501234567';

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
  requireApiPermission: vi.fn(),
  createServiceRoleClient: vi.fn(),
  logActivity: vi.fn(),
  notify: vi.fn(async () => undefined),
}));

vi.mock('next-intl/server', () => ({ getTranslations: mocks.getTranslations }));
vi.mock('@/lib/api/auth', () => ({
  requireApiPermission: mocks.requireApiPermission,
  isApiError: vi.fn((value: unknown) => value instanceof Response),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock('@/lib/utils/id', () => ({
  generateId: (prefix: string) => `${prefix}_test`,
}));
vi.mock('@/lib/api/activity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/activity')>();
  return { ...actual, logActivity: mocks.logActivity };
});
vi.mock('@/lib/notifications/notify', () => ({ notify: mocks.notify }));

import { POST } from '@/app/api/crm/leads/route';

/** One duplicate row on CALLER_PHONE, assigned to `dupOwner`. */
function makeClient(dupOwner: string | null) {
  const calls: QueryCall[] = [];
  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, ops: [] };
    calls.push(call);
    let insertedLeads = false;
    const builder: Record<string, unknown> = {};
    const chain = (op: string) => (...args: unknown[]) => {
      call.ops.push({ op, args });
      if (op === 'insert' && table === 'pyra_sales_leads') insertedLeads = true;
      return builder;
    };
    builder.insert = vi.fn(chain('insert'));
    builder.select = vi.fn(chain('select'));
    builder.eq = vi.fn(chain('eq'));
    builder.neq = vi.fn(chain('neq'));
    builder.ilike = vi.fn(chain('ilike'));
    builder.limit = vi.fn(chain('limit'));
    builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    builder.single = vi.fn(() =>
      Promise.resolve(
        table === 'pyra_sales_leads' && insertedLeads
          ? {
              data: {
                id: LEAD_ID,
                name: 'New Co',
                phone: CALLER_PHONE,
                assigned_to: 'cosette',
              },
              error: null,
            }
          : { data: null, error: null },
      ),
    );
    builder.then = (
      onFulfilled: (v: { data: unknown; error: null }) => unknown,
      onRejected?: (r: unknown) => unknown,
    ) => {
      let result: { data: unknown; error: null } = { data: [], error: null };
      if (table === 'pyra_sales_leads' && !insertedLeads) {
        // the post-insert duplicate check
        result = {
          data: [{ id: DUP_ID, name: DUP_NAME, assigned_to: dupOwner }],
          error: null,
        };
      }
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };
    return builder;
  });
  return { client: { from }, calls };
}

function auth(username: string, rolePermissions: string[], role = 'sales_agent') {
  return {
    userId: 'auth-1',
    email: `${username}@example.test`,
    pyraUser: { username, display_name: username, role, rolePermissions },
  };
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/crm/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTranslations.mockResolvedValue((key: string) => key);
});

describe('POST /api/crm/leads — duplicate_warning identity gate', () => {
  it('still names the lead for the caller\'s OWN duplicate', async () => {
    mocks.requireApiPermission.mockResolvedValue(auth('cosette', ['leads.create']));
    const service = makeClient('cosette');
    mocks.createServiceRoleClient.mockReturnValue(service.client);

    const body = await (
      await POST(request({ name: 'New Co', phone: CALLER_PHONE }))
    ).json();

    expect(body.data.duplicate_warning).toEqual({
      visible: true,
      existing_lead_id: DUP_ID,
      existing_lead_name: DUP_NAME,
    });
  });

  it('withholds identity for a COLLEAGUE\'s duplicate but still warns', async () => {
    mocks.requireApiPermission.mockResolvedValue(auth('cosette', ['leads.create']));
    const service = makeClient('youssef'); // the existing card is youssef's
    mocks.createServiceRoleClient.mockReturnValue(service.client);

    const res = await POST(request({ name: 'New Co', phone: CALLER_PHONE }));
    const body = await res.json();

    // the warning DID fire
    expect(body.data.duplicate_warning).toEqual({ visible: false });
    // …and nothing about the colleague's lead came back anywhere on the wire
    expect(JSON.stringify(body)).not.toContain(DUP_ID);
    expect(JSON.stringify(body)).not.toContain(DUP_NAME);
    expect(JSON.stringify(body)).not.toContain('youssef');
  });

  it('shows a crm_reports.team_view holder the identity of someone else\'s duplicate', async () => {
    mocks.requireApiPermission.mockResolvedValue(
      auth('manager', ['leads.create', 'crm_reports.team_view']),
    );
    const service = makeClient('youssef');
    mocks.createServiceRoleClient.mockReturnValue(service.client);

    const body = await (
      await POST(request({ name: 'New Co', phone: CALLER_PHONE }))
    ).json();

    expect(body.data.duplicate_warning).toEqual({
      visible: true,
      existing_lead_id: DUP_ID,
      existing_lead_name: DUP_NAME,
    });
  });

  it('shows a wildcard admin the identity of someone else\'s duplicate', async () => {
    mocks.requireApiPermission.mockResolvedValue(auth('abou', ['*'], 'admin'));
    const service = makeClient('youssef');
    mocks.createServiceRoleClient.mockReturnValue(service.client);

    const body = await (
      await POST(request({ name: 'New Co', phone: CALLER_PHONE }))
    ).json();

    expect(body.data.duplicate_warning).toMatchObject({
      visible: true,
      existing_lead_id: DUP_ID,
      existing_lead_name: DUP_NAME,
    });
  });
});
