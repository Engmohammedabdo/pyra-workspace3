import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Regression lock: a deactivated employee's ALREADY-PROVISIONED device key
 * must not authenticate against /api/mobile/*.
 *
 * Why this test exists: the deactivation runbook has four steps that all live
 * outside the app (status flip, GoTrue ban, refresh-token revoke, session
 * delete). None of them touch `pyra_api_keys`, so the only thing standing
 * between a locked-out agent and a working company phone is the owner-status
 * gate inside `requireDeviceAuth`. It was audited on 2026-08-06 and found
 * present — this test keeps it present.
 *
 * The gate deliberately lives HERE and not in `getExternalAuth`: cron and n8n
 * integration keys authenticate through `getExternalAuth` too, and their
 * `created_by` is whichever admin happened to mint them. Gating owner status
 * globally would silently kill every cron the day that admin is deactivated —
 * including `/api/cron/access-reconcile`, the offboarding safety net itself.
 * Org-owned integration keys outlive their creator by design; person-owned
 * device keys must not.
 */

const mocks = vi.hoisted(() => ({
  externalCtx: null as unknown,
  userRow: null as unknown,
}));

vi.mock('@/lib/api/external-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/external-auth')>(
    '@/lib/api/external-auth',
  );
  return {
    // Real hasPermission — only the key lookup is faked.
    hasPermission: actual.hasPermission,
    getExternalAuth: vi.fn(async () => mocks.externalCtx),
  };
});

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'update', 'or']) {
        builder[method] = vi.fn(() => builder);
      }
      builder.maybeSingle = vi.fn(async () => ({ data: mocks.userRow, error: null }));
      // The fire-and-forget app_version_code stamp ends in `.then()`.
      builder.then = (resolvePromise: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolvePromise);
      return builder;
    }),
  })),
}));

import { requireDeviceAuth } from '@/app/api/mobile/_lib/device-auth';

function deviceRequest() {
  return new NextRequest('https://workspace.test/api/mobile/calls/sync', {
    method: 'POST',
    headers: { 'x-api-key': 'irrelevant-the-lookup-is-mocked' },
  });
}

function deviceKey(createdBy: string | null) {
  return {
    apiKey: {
      id: 'ak_test',
      name: `device:${createdBy ?? 'unknown'}:abc123`,
      permissions: ['calls:device'],
      created_by: createdBy,
    },
  };
}

async function statusOf(result: Awaited<ReturnType<typeof requireDeviceAuth>>) {
  expect(result).toBeInstanceOf(NextResponse);
  return (result as NextResponse).status;
}

describe('requireDeviceAuth — owner account-status gate', () => {
  beforeEach(() => {
    mocks.externalCtx = null;
    mocks.userRow = null;
  });

  it('lets an ACTIVE owner through and returns their identity', async () => {
    mocks.externalCtx = deviceKey('cosette');
    mocks.userRow = { username: 'cosette', display_name: 'Cosette', status: 'active' };

    const result = await requireDeviceAuth(deviceRequest());

    expect(result).not.toBeInstanceOf(NextResponse);
    expect(result).toEqual({ agentUsername: 'cosette', displayName: 'Cosette' });
  });

  it('REJECTS an inactive owner even though the key row is still is_active', async () => {
    mocks.externalCtx = deviceKey('cosette');
    mocks.userRow = { username: 'cosette', display_name: 'Cosette', status: 'inactive' };

    expect(await statusOf(await requireDeviceAuth(deviceRequest()))).toBe(403);
  });

  it('fails CLOSED on any non-active status, including NULL', async () => {
    for (const status of ['suspended', null, '', 'ACTIVE']) {
      mocks.externalCtx = deviceKey('cosette');
      mocks.userRow = { username: 'cosette', display_name: 'Cosette', status };

      expect(await statusOf(await requireDeviceAuth(deviceRequest()))).toBe(403);
    }
  });

  it('fails CLOSED when the key has no resolvable owner row', async () => {
    mocks.externalCtx = deviceKey(null);
    mocks.userRow = null;

    expect(await statusOf(await requireDeviceAuth(deviceRequest()))).toBe(403);
  });

  it('rejects a key without calls:device before any owner lookup runs', async () => {
    // A cron/n8n key reaching a mobile route: refused on permission, so its
    // owner's status is never consulted — org-owned keys stay out of this gate.
    mocks.externalCtx = {
      apiKey: {
        id: 'ak_cron',
        name: 'PyraHR_Cron',
        permissions: ['cron.access-reconcile'],
        created_by: 'elharm',
      },
    };
    mocks.userRow = { username: 'elharm', display_name: 'Elharm', status: 'inactive' };

    expect(await statusOf(await requireDeviceAuth(deviceRequest()))).toBe(403);
  });

  it('rejects a missing/invalid key with 401, not 403', async () => {
    mocks.externalCtx = null;

    expect(await statusOf(await requireDeviceAuth(deviceRequest()))).toBe(401);
  });
});

describe('/api/mobile/* route coverage', () => {
  it('routes every mobile handler through a status gate', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { resolve, join } = await import('node:path');

    const root = resolve(process.cwd(), 'app/api/mobile');
    const routes: string[] = [];
    (function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry === 'route.ts') routes.push(full);
      }
    })(root);

    expect(routes.length).toBeGreaterThan(0);

    for (const file of routes) {
      const src = readFileSync(file, 'utf8');
      const handlers = src.match(/export async function (GET|POST|PUT|PATCH|DELETE)/g) ?? [];
      expect(handlers.length, `${file} exports no handler`).toBeGreaterThan(0);

      // Either the shared device guard (which checks owner status) or, for the
      // login route that mints the key in the first place, its own inline gate.
      const guarded =
        src.includes('requireDeviceAuth') || src.includes("status !== 'active'");
      expect(guarded, `${file} has an unguarded handler`).toBe(true);

      // A route must never IMPORT external-auth directly — that is the only
      // way to reach getExternalAuth and bypass the owner-status gate. Matched
      // on the import statement, not a bare mention, so the explanatory
      // comments in ping/route.ts don't read as a violation.
      expect(
        /from ['"][^'"]*api\/external-auth['"]/.test(src),
        `${file} imports external-auth directly, bypassing the owner-status gate`,
      ).toBe(false);
    }
  });
});
