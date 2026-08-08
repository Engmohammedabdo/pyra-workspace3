import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * END-TO-END gate test for GET /api/crm/leads/lookup.
 *
 * This route serves two goods that pull against each other, and the test's job
 * is to pin BOTH so neither can be "simplified" away later:
 *
 *   1. Duplicate hygiene — the search is SYSTEM-WIDE, so the warning fires even
 *      when the only card carrying the number belongs to another rep. (Restore
 *      the old `getLeadScopeFilter` .eq() and the unowned test fails: `match`
 *      goes null and no warning renders at all.)
 *   2. Ownership boundary — an unowned match is `{ visible: false }` and
 *      NOTHING else. (Delete the withholding and the same test fails on the
 *      leaked id/name.)
 *
 * A mirror pair on purpose: the unowned test alone would also pass if the route
 * returned nothing ever, so the owned test proves the honest path still hands
 * back the full identity. The third test proves a crm_reports.team_view holder
 * sees the identity for a lead that is NOT theirs — the same `seeAll` decision
 * /api/crm/calls uses, exercised through the REAL `hasPermission` (rbac is
 * deliberately NOT mocked, so a wildcard admin is covered by the same path).
 *
 * Harness follows __tests__/mobile-calls-sync-ownership.test.ts: mock
 * createServiceRoleClient, record `{ table, filters }` per `.from()` chain,
 * then assert on the response AND on the filters the route actually sent.
 */

type QueryCall = {
  table: string;
  filters: Array<{ op: string; column: string; value: unknown }>;
};

const LEAD_PHONE = '050 123 4567';
const TYPED_PHONE = '0501234567';

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
  requireApiPermission: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock('next-intl/server', () => ({ getTranslations: mocks.getTranslations }));
vi.mock('@/lib/api/auth', () => ({
  requireApiPermission: mocks.requireApiPermission,
  isApiError: vi.fn((value: unknown) => value instanceof Response),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import { GET as lookup } from '@/app/api/crm/leads/lookup/route';

/** One seeded lead on LEAD_PHONE, assigned to `leadOwner`. */
function makeClient(leadOwner: string) {
  const calls: QueryCall[] = [];
  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, filters: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    const record = (op: string) => (column: string, value: unknown) => {
      call.filters.push({ op, column, value });
      return builder;
    };
    builder.select = vi.fn(() => builder);
    builder.ilike = vi.fn(record('ilike'));
    builder.eq = vi.fn(record('eq'));
    builder.in = vi.fn(record('in'));
    builder.limit = vi.fn(() => builder);
    builder.then = (
      onFulfilled: (value: { data: unknown; error: null }) => unknown,
      onRejected: (reason: unknown) => unknown,
    ) => Promise.resolve(resolve(table, leadOwner)).then(onFulfilled, onRejected);
    return builder;
  });
  return { client: { from }, calls };
}

function resolve(table: string, leadOwner: string): { data: unknown; error: null } {
  if (table === 'pyra_sales_leads') {
    return {
      data: [{
        id: 'sl_x',
        name: 'Acme Trading',
        assigned_to: leadOwner,
        phone: LEAD_PHONE,
        company: 'Acme',
        stage_id: 'stg_new_inquiry',
        is_converted: false,
      }],
      error: null,
    };
  }
  if (table === 'pyra_users') {
    return { data: [{ username: leadOwner, display_name: `${leadOwner} display` }], error: null };
  }
  return { data: [], error: null };
}

function auth(username: string, rolePermissions: string[], role = 'sales_agent') {
  return {
    userId: 'auth-1',
    email: `${username}@example.test`,
    pyraUser: { username, display_name: username, role, rolePermissions },
  };
}

function request() {
  return new NextRequest(
    `http://localhost/api/crm/leads/lookup?phone=${encodeURIComponent(TYPED_PHONE)}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTranslations.mockResolvedValue((key: string) => key);
});

describe('GET /api/crm/leads/lookup — identity gate', () => {
  it('withholds the identity of a colleague\'s lead but still warns', async () => {
    mocks.requireApiPermission.mockResolvedValue(auth('cosette', ['leads.view']));
    const service = makeClient('youssef'); // the surviving card is youssef's
    mocks.createServiceRoleClient.mockReturnValue(service.client);

    const body = await (await lookup(request())).json();

    // the warning DID fire — the search was not scoped away
    expect(body.data.match).toEqual({ visible: false });
    expect(body.data.matches).toEqual([{ visible: false }]);
    // …and nothing about the colleague's lead came back
    expect(JSON.stringify(body)).not.toContain('sl_x');
    expect(JSON.stringify(body)).not.toContain('Acme');
    expect(JSON.stringify(body)).not.toContain('youssef');

    // the lead query carried NO ownership filter (good #1)
    const leadQuery = service.calls.find((c) => c.table === 'pyra_sales_leads');
    expect(leadQuery?.filters.filter((f) => f.op === 'eq')).toHaveLength(0);
    // and no display-name lookup was even attempted for the withheld assignee
    expect(service.calls.some((c) => c.table === 'pyra_users')).toBe(false);
  });

  it('returns the full identity for the caller\'s OWN lead', async () => {
    mocks.requireApiPermission.mockResolvedValue(auth('cosette', ['leads.view']));
    const service = makeClient('cosette');
    mocks.createServiceRoleClient.mockReturnValue(service.client);

    const body = await (await lookup(request())).json();

    expect(body.data.match).toEqual({
      visible: true,
      id: 'sl_x',
      name: 'Acme Trading',
      assigned_to: 'cosette',
      assigned_display_name: 'cosette display',
      phone: LEAD_PHONE,
      company: 'Acme',
      stage_id: 'stg_new_inquiry',
      is_converted: false,
    });
  });

  it('shows a crm_reports.team_view holder the identity of someone else\'s lead', async () => {
    mocks.requireApiPermission.mockResolvedValue(
      auth('manager', ['leads.view', 'crm_reports.team_view']),
    );
    const service = makeClient('youssef');
    mocks.createServiceRoleClient.mockReturnValue(service.client);

    const body = await (await lookup(request())).json();

    expect(body.data.match).toMatchObject({
      visible: true,
      id: 'sl_x',
      name: 'Acme Trading',
      assigned_to: 'youssef',
      assigned_display_name: 'youssef display',
    });
  });

  it('shows a wildcard admin the identity of someone else\'s lead', async () => {
    mocks.requireApiPermission.mockResolvedValue(auth('abou', ['*'], 'admin'));
    const service = makeClient('youssef');
    mocks.createServiceRoleClient.mockReturnValue(service.client);

    const body = await (await lookup(request())).json();

    expect(body.data.match).toMatchObject({ visible: true, id: 'sl_x', name: 'Acme Trading' });
  });

  it('prefers the caller\'s OWN card as the best match over a colleague\'s', async () => {
    mocks.requireApiPermission.mockResolvedValue(auth('cosette', ['leads.view']));
    // Two cards on the same number, colleague's row returned FIRST by the DB.
    const calls: QueryCall[] = [];
    const rows = [
      { id: 'sl_y', name: 'Y', assigned_to: 'youssef', phone: LEAD_PHONE, company: null, stage_id: null, is_converted: false },
      { id: 'sl_c', name: 'C', assigned_to: 'cosette', phone: LEAD_PHONE, company: null, stage_id: null, is_converted: false },
    ];
    const from = vi.fn((table: string) => {
      const call: QueryCall = { table, filters: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.ilike = vi.fn(() => builder);
      builder.in = vi.fn(() => builder);
      builder.limit = vi.fn(() => builder);
      builder.then = (onFulfilled: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(
          table === 'pyra_sales_leads'
            ? { data: rows, error: null }
            : { data: [{ username: 'cosette', display_name: 'Cosette' }], error: null },
        ).then(onFulfilled);
      return builder;
    });
    mocks.createServiceRoleClient.mockReturnValue({ from });

    const body = await (await lookup(request())).json();

    // hers wins the `match` slot — dropping the scope must not cost her the
    // named warning she got before this change
    expect(body.data.match).toMatchObject({ visible: true, id: 'sl_c', name: 'C' });
    // …and the colleague's row is still withheld in the tail
    expect(body.data.matches[1]).toEqual({ visible: false });
  });
});
