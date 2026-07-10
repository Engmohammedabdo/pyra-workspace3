# Call Tracking (Server + CRM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the server side + CRM UI of call tracking per
`docs/superpowers/specs/2026-07-10-call-tracking-design.md` — device auth,
call ingest with lead matching, quick lead creation with feedback reminder,
ignore list, and the per-agent calls report.

**Architecture:** New service-role-only tables (`pyra_agent_calls`,
`pyra_ignored_numbers`); `/api/mobile/*` routes authenticated by per-device
`pyra_api_keys` rows carrying the narrow `calls:device` permission; pure
aggregation helpers unit-tested with vitest; a new `/dashboard/crm/calls`
report page. The Android app is **Plan 2** (separate doc, written after this
plan ships and the API contract is verified end-to-end with curl).

**Tech Stack:** Next.js 15 App Router · Supabase (service role) · React
Query · vitest · next-intl · Recharts.

## Global Constraints

- Package manager: **pnpm** (never npm). Verify: `pnpm run check` (tsc) +
  `pnpm build` MUST pass before every push.
- Migrations run via `pnpm db:query <file.sql>`; Arabic/non-ASCII SQL MUST
  go through a UTF-8 .sql file, never inline. Record with `pnpm db:record`.
- New tables are **service-role-only**: revoke `anon` + `authenticated`
  (Gap #3 doctrine). Gate-then-service-role in every route.
- All counts DERIVED from `pyra_agent_calls` at read time — no counters.
- "Today" comparisons use `dubaiDayKey()` from `lib/utils/format` — never
  `.toISOString().slice(0,10)`.
- Notifications only via `notify()` from `@/lib/notifications/notify` —
  never raw inserts. **Omit `from` on the feedback notification** (it
  targets the acting agent; passing `from` = same user triggers the helper's
  self-notification skip and the notification silently never sends).
- API responses via `apiSuccess`/`apiError`/`apiServerError` from
  `@/lib/api/response`; catch blocks in long-lived routes call `logError()`.
- Phone normalization: `phoneMatchKey()` from `lib/utils/phone.ts`
  (EXISTS — do not write a new normalizer).
- UI: Arabic RTL (`ms-/me-/ps-/pe-`), dark-mode pairs, `EmptyState`,
  `Skeleton`, React Query hooks (no raw fetch), pages <300 lines.
- i18n: new module namespace `calls` per Phase-6 rules (messages files,
  `NAMESPACE_FILES`, `i18n/global.ts`, `MIGRATED_PATHS`).
- Commit + push after each task (fetch before push — Abdou commits
  concurrently). Branch: current working branch.

---

### Task 1: Migration 037 — call-tracking tables + TypeScript types

**Files:**
- Create: `supabase/migrations/037_call_tracking.sql`
- Modify: `types/database.ts` (append new interfaces)
- Modify: `DATABASE-SCHEMA.md` (document both tables)

**Interfaces:**
- Produces: tables `pyra_agent_calls`, `pyra_ignored_numbers`; TS types
  `AgentCall`, `IgnoredNumber` exported from `types/database.ts`.

- [ ] **Step 1: Write the migration file**

```sql
-- 037_call_tracking.sql
-- Call tracking: per-agent SIM-call log synced from company phones.
-- Spec: docs/superpowers/specs/2026-07-10-call-tracking-design.md
-- Both tables are service-role-only (Gap #3 doctrine).

CREATE TABLE IF NOT EXISTS pyra_agent_calls (
  id               text PRIMARY KEY,
  agent_username   text NOT NULL,
  phone_raw        text NOT NULL,
  phone_normalized text NOT NULL,
  direction        text NOT NULL CHECK (direction IN ('outgoing','incoming','missed')),
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  called_at        timestamptz NOT NULL,
  device_call_key  text NOT NULL,
  lead_id          text NULL REFERENCES pyra_sales_leads(id) ON DELETE SET NULL,
  activity_id      text NULL,
  match_status     text NOT NULL CHECK (match_status IN ('matched','unmatched','ignored')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pyra_agent_calls_agent_key_uniq UNIQUE (agent_username, device_call_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_calls_agent_called
  ON pyra_agent_calls (agent_username, called_at);
CREATE INDEX IF NOT EXISTS idx_agent_calls_phone
  ON pyra_agent_calls (phone_normalized);
CREATE INDEX IF NOT EXISTS idx_agent_calls_lead
  ON pyra_agent_calls (lead_id);

CREATE TABLE IF NOT EXISTS pyra_ignored_numbers (
  id               text PRIMARY KEY,
  agent_username   text NOT NULL,
  phone_normalized text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pyra_ignored_numbers_uniq UNIQUE (agent_username, phone_normalized)
);

REVOKE ALL PRIVILEGES ON TABLE pyra_agent_calls FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE pyra_ignored_numbers FROM anon, authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `pnpm db:query supabase/migrations/037_call_tracking.sql`
Expected: success, no errors.

- [ ] **Step 3: Verify the schema (apply-then-verify-then-record)**

Run: `pnpm db:query "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pyra_agent_calls' ORDER BY ordinal_position"`
Expected: the 12 columns above.
Run: `pnpm db:query "SELECT grantee, privilege_type FROM information_schema.table_privileges WHERE table_name IN ('pyra_agent_calls','pyra_ignored_numbers') AND grantee IN ('anon','authenticated')"`
Expected: 0 rows.

- [ ] **Step 4: Record the migration**

Run: `pnpm db:record 037_call_tracking --by=claude --notes="call tracking tables"`

- [ ] **Step 5: Add TypeScript types**

Append to `types/database.ts`:

```ts
// ── Call tracking (migration 037) ──
export interface AgentCall {
  id: string;
  agent_username: string;
  phone_raw: string;
  phone_normalized: string;
  direction: 'outgoing' | 'incoming' | 'missed';
  duration_seconds: number;
  called_at: string;
  device_call_key: string;
  lead_id: string | null;
  activity_id: string | null;
  match_status: 'matched' | 'unmatched' | 'ignored';
  created_at: string;
}

export interface IgnoredNumber {
  id: string;
  agent_username: string;
  phone_normalized: string;
  created_at: string;
}
```

- [ ] **Step 6: Document in DATABASE-SCHEMA.md** — add both tables in the
same format as neighboring tables (columns + purpose + "service-role-only").

- [ ] **Step 7: Verify + commit**

Run: `pnpm run check` → 0 errors.
```bash
git add supabase/migrations/037_call_tracking.sql types/database.ts DATABASE-SCHEMA.md
git commit -m "feat(calls): migration 037 - agent calls + ignored numbers tables"
```

---

### Task 2: Pure helpers — lead matching + report aggregation (TDD)

**Files:**
- Create: `lib/calls/match.ts`
- Create: `lib/calls/report.ts`
- Test: `__tests__/calls-match.test.ts`, `__tests__/calls-report.test.ts`

**Interfaces:**
- Consumes: `phoneMatchKey(value, length=9)` from `@/lib/utils/phone`;
  `dubaiDayKey(date)` from `@/lib/utils/format`; `AgentCall` from Task 1.
- Produces:
  - `buildLeadPhoneIndex(leads: {id,name,phone}[]): Map<string,{id,name}>`
  - `matchLeadByPhone(index, rawPhone): {id,name} | null`
  - `computeCallsReport(rows: AgentCall[], todayKey: string): CallsReportAgg`
    where `CallsReportAgg = { per_agent: Record<string, AgentCallStats>, per_day: Record<string, number> }`
    and `AgentCallStats = { today: number; month: number; outgoing: number; incoming: number; missed: number; matched: number; unmatched: number; ignored: number; total_duration_seconds: number; avg_duration_seconds: number }`

- [ ] **Step 1: Write failing tests**

`__tests__/calls-match.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildLeadPhoneIndex, matchLeadByPhone } from '@/lib/calls/match';

describe('lead phone matching', () => {
  const index = buildLeadPhoneIndex([
    { id: 'sl_1', name: 'Ahmed', phone: '+971 50 123 4567' },
    { id: 'sl_2', name: 'Sara', phone: '0509998877' },
    { id: 'sl_3', name: 'NoPhone', phone: null },
  ]);

  it('matches international vs local formats via 9-digit key', () => {
    expect(matchLeadByPhone(index, '0501234567')?.id).toBe('sl_1');
    expect(matchLeadByPhone(index, '00971509998877')?.id).toBe('sl_2');
  });
  it('returns null for unknown numbers and empty input', () => {
    expect(matchLeadByPhone(index, '0561112233')).toBeNull();
    expect(matchLeadByPhone(index, '')).toBeNull();
  });
  it('first lead wins on duplicate phone keys', () => {
    const dup = buildLeadPhoneIndex([
      { id: 'sl_a', name: 'A', phone: '0501234567' },
      { id: 'sl_b', name: 'B', phone: '+971501234567' },
    ]);
    expect(matchLeadByPhone(dup, '0501234567')?.id).toBe('sl_a');
  });
});
```

`__tests__/calls-report.test.ts`:
```ts
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
});
```

- [ ] **Step 2: Run tests, verify they FAIL**

Run: `pnpm test -- calls`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`lib/calls/match.ts`:
```ts
import { phoneMatchKey } from '@/lib/utils/phone';

export interface LeadPhoneRef { id: string; name: string }

/** Build key→lead index. First lead wins on duplicate keys (stable). */
export function buildLeadPhoneIndex(
  leads: Array<{ id: string; name: string; phone: string | null }>,
): Map<string, LeadPhoneRef> {
  const index = new Map<string, LeadPhoneRef>();
  for (const lead of leads) {
    const key = phoneMatchKey(lead.phone);
    if (!key || index.has(key)) continue;
    index.set(key, { id: lead.id, name: lead.name });
  }
  return index;
}

export function matchLeadByPhone(
  index: Map<string, LeadPhoneRef>,
  rawPhone: string,
): LeadPhoneRef | null {
  const key = phoneMatchKey(rawPhone);
  if (!key) return null;
  return index.get(key) ?? null;
}
```

`lib/calls/report.ts`:
```ts
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
    s.total_duration_seconds += r.duration_seconds;
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
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `pnpm test -- calls`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/calls/ __tests__/calls-match.test.ts __tests__/calls-report.test.ts
git commit -m "feat(calls): pure match + report helpers with tests"
```

---

### Task 3: Device login — POST /api/mobile/auth/login

**Files:**
- Create: `app/api/mobile/auth/login/route.ts`

**Interfaces:**
- Consumes: `adminLoginLimiter`, `accountLockoutLimiter`, `checkRateLimit`
  from `@/lib/utils/rate-limit`; `escapePostgrestValue` from
  `@/lib/utils/path` (mirror `app/api/auth/login/route.ts` exactly).
- Produces: response `{ data: { device_key, username, display_name } }` —
  `device_key` shown ONCE. Key row: `name = device:{username}:{device_id}`,
  `permissions = ['calls:device']`, `created_by = username`.

- [ ] **Step 1: Implement the route**

```ts
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { adminLoginLimiter, accountLockoutLimiter, checkRateLimit } from '@/lib/utils/rate-limit';
import { escapePostgrestValue } from '@/lib/utils/path';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';
import { logError } from '@/lib/observability/log-error';

const ALLOWED_ROLES = new Set(['sales_agent', 'admin']);
const DEVICE_ID_RE = /^[a-zA-Z0-9._-]{4,64}$/;

export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(adminLoginLimiter, request);
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const deviceId = typeof body?.device_id === 'string' ? body.device_id.trim() : '';
    if (!email || !password) return apiError('البريد الإلكتروني وكلمة المرور مطلوبان', 400);
    if (!DEVICE_ID_RE.test(deviceId)) return apiError('device_id غير صالح', 422);

    const lockoutKey = email.toLowerCase();
    const lockout = accountLockoutLimiter.check(lockoutKey);
    if (lockout.limited) return apiError('تم قفل الحساب مؤقتاً — حاول لاحقاً', 429);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return apiError('بيانات الدخول غير صحيحة', 401);
    // no browser session wanted — the device key is the credential
    await supabase.auth.signOut();

    const svc = createServiceRoleClient();
    const username = data.user.user_metadata?.username || data.user.email;
    const { data: pyraUser } = await svc
      .from('pyra_users')
      .select('username, display_name, role, status')
      .or(`username.eq.${escapePostgrestValue(username)},email.eq.${escapePostgrestValue(email)}`)
      .limit(1)
      .maybeSingle();

    if (!pyraUser) return apiError('هذا الحساب غير مسجل في النظام', 403);
    if (pyraUser.status !== 'active') return apiError('الحساب غير نشط — تواصل مع الإدارة', 403);
    if (!ALLOWED_ROLES.has(pyraUser.role)) return apiError('التطبيق متاح لموظفي المبيعات فقط', 403);

    // one active device per agent: deactivate previous device keys
    await svc
      .from('pyra_api_keys')
      .update({ is_active: false })
      .eq('created_by', pyraUser.username)
      .like('name', 'device:%');

    const rawKey = `pyra_${nanoid(40)}`;
    const { error: insertErr } = await svc.from('pyra_api_keys').insert({
      id: generateId('ak'),
      name: `device:${pyraUser.username}:${deviceId}`,
      key_hash: crypto.createHash('sha256').update(rawKey).digest('hex'),
      key_prefix: rawKey.substring(0, 12),
      permissions: ['calls:device'],
      is_active: true,
      expires_at: null,
      created_by: pyraUser.username,
    });
    if (insertErr) throw insertErr;

    accountLockoutLimiter.reset(lockoutKey);
    return apiSuccess({
      device_key: rawKey,
      username: pyraUser.username,
      display_name: pyraUser.display_name,
    }, undefined, 201);
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_device_login' } });
    return apiServerError();
  }
}
```

- [ ] **Step 2: Verify with curl (use a real sales-agent test account)**

Run:
```bash
curl -s -X POST https://workspace.pyramedia.cloud/api/mobile/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<agent-email>","password":"<pw>","device_id":"test-device-1"}'
```
(Local dev: `http://localhost:3000`.) Expected: 201 with `device_key`
starting `pyra_`. Then verify the key row:
`pnpm db:query "SELECT name, permissions, is_active, created_by FROM pyra_api_keys WHERE name LIKE 'device:%'"`
Expected: one active row, permissions `{calls:device}`.
Re-login with `device_id: test-device-2` → previous key flips `is_active=false`.

- [ ] **Step 3: check + commit**

Run: `pnpm run check` → 0 errors.
```bash
git add app/api/mobile/auth/login/route.ts
git commit -m "feat(calls): mobile device login mints scoped api key"
```

---

### Task 4: Ingest — POST /api/mobile/calls/sync

**Files:**
- Create: `app/api/mobile/_lib/device-auth.ts` (shared device-auth guard)
- Create: `app/api/mobile/calls/sync/route.ts`

**Interfaces:**
- Consumes: `getExternalAuth`, `hasPermission` from
  `@/lib/api/external-auth`; Task 2 helpers; `generateId`.
- Produces: `requireDeviceAuth(request)` → `{ agentUsername, displayName } | Response`;
  sync response `{ data: { results: [{ device_call_key, status: 'matched'|'unmatched'|'ignored'|'duplicate', lead_id?, lead_name? }] } }`.
  The app fires the «رقم غير مسجل» local notification for every `unmatched`.

- [ ] **Step 1: Shared device-auth guard**

`app/api/mobile/_lib/device-auth.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { getExternalAuth, hasPermission } from '@/lib/api/external-auth';
import { apiError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

export interface DeviceAuthContext { agentUsername: string; displayName: string }

/** x-api-key device auth: key must carry calls:device AND its creator must still be active. */
export async function requireDeviceAuth(
  request: NextRequest,
): Promise<DeviceAuthContext | NextResponse> {
  const ctx = await getExternalAuth(request);
  if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
  if (!hasPermission(ctx, 'calls:device')) {
    return apiError('المفتاح لا يملك صلاحية calls:device', 403);
  }
  const svc = createServiceRoleClient();
  const { data: user } = await svc
    .from('pyra_users')
    .select('username, display_name, status')
    .eq('username', ctx.apiKey.created_by)
    .maybeSingle();
  if (!user || user.status !== 'active') {
    return apiError('الحساب غير نشط', 403);
  }
  return { agentUsername: user.username, displayName: user.display_name };
}
```

- [ ] **Step 2: Implement the sync route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../../_lib/device-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { phoneMatchKey } from '@/lib/utils/phone';
import { buildLeadPhoneIndex, matchLeadByPhone } from '@/lib/calls/match';
import { logError } from '@/lib/observability/log-error';

const MAX_BATCH = 100;
const DIRECTIONS = new Set(['outgoing', 'incoming', 'missed']);

interface IncomingCall {
  device_call_key: string; phone: string;
  direction: 'outgoing' | 'incoming' | 'missed';
  duration_seconds: number; called_at: string;
}

function parseCalls(raw: unknown): IncomingCall[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BATCH) return null;
  const out: IncomingCall[] = [];
  for (const c of raw) {
    if (typeof c?.device_call_key !== 'string' || !c.device_call_key.trim()) return null;
    if (typeof c?.phone !== 'string' || !c.phone.trim()) return null;
    if (!DIRECTIONS.has(c?.direction)) return null;
    const dur = Number(c?.duration_seconds);
    if (!Number.isFinite(dur) || dur < 0) return null;
    if (typeof c?.called_at !== 'string' || Number.isNaN(Date.parse(c.called_at))) return null;
    out.push({
      device_call_key: c.device_call_key.trim(), phone: c.phone.trim(),
      direction: c.direction, duration_seconds: Math.round(dur), called_at: c.called_at,
    });
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { agentUsername } = auth;

    const body = await request.json().catch(() => null);
    const calls = parseCalls(body?.calls);
    if (!calls) return apiError(`calls مطلوبة (حد أقصى ${MAX_BATCH})`, 422);

    const supabase = createServiceRoleClient();

    // 1. duplicates: already-synced device_call_keys are echoed back as 'duplicate'
    const keys = calls.map((c) => c.device_call_key);
    const { data: existing } = await supabase
      .from('pyra_agent_calls')
      .select('device_call_key')
      .eq('agent_username', agentUsername)
      .in('device_call_key', keys);
    const existingKeys = new Set((existing ?? []).map((r) => r.device_call_key));

    // 2. lead index + ignore list
    const { data: leads, error: leadsErr } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, phone')
      .not('phone', 'is', null);
    if (leadsErr) throw leadsErr;
    const index = buildLeadPhoneIndex(leads ?? []);

    const { data: ignoredRows } = await supabase
      .from('pyra_ignored_numbers')
      .select('phone_normalized')
      .eq('agent_username', agentUsername);
    const ignoredSet = new Set((ignoredRows ?? []).map((r) => r.phone_normalized));

    const results: Array<Record<string, unknown>> = [];
    for (const call of calls) {
      if (existingKeys.has(call.device_call_key)) {
        results.push({ device_call_key: call.device_call_key, status: 'duplicate' });
        continue;
      }
      const normalized = phoneMatchKey(call.phone);
      const lead = matchLeadByPhone(index, call.phone);
      const connected = call.direction !== 'missed';
      let activityId: string | null = null;

      if (lead && connected) {
        activityId = generateId('la');
        const { error: actErr } = await supabase.from('pyra_lead_activities').insert({
          id: activityId,
          lead_id: lead.id,
          activity_type: 'call_logged',
          description: null,
          metadata: {
            duration_minutes: Math.round((call.duration_seconds / 60) * 10) / 10,
            duration_seconds: call.duration_seconds,
            direction: call.direction === 'incoming' ? 'inbound' : 'outbound',
            auto: true,
            source: 'device_sync',
            called_at: call.called_at,
          },
          created_by: agentUsername,
        });
        if (actErr) {
          console.error('[calls/sync] activity insert failed:', actErr.message);
          activityId = null;
        }
        await supabase
          .from('pyra_sales_leads')
          .update({ last_contact_at: call.called_at })
          .eq('id', lead.id);
      }

      const matchStatus = lead ? 'matched' : ignoredSet.has(normalized) ? 'ignored' : 'unmatched';
      const { error: insErr } = await supabase.from('pyra_agent_calls').insert({
        id: generateId('ac'),
        agent_username: agentUsername,
        phone_raw: call.phone,
        phone_normalized: normalized,
        direction: call.direction,
        duration_seconds: call.duration_seconds,
        called_at: call.called_at,
        device_call_key: call.device_call_key,
        lead_id: lead?.id ?? null,
        activity_id: activityId,
        match_status: matchStatus,
      });
      if (insErr) {
        // unique-violation race (double sync) → report as duplicate, else surface
        results.push({ device_call_key: call.device_call_key, status: 'duplicate' });
        continue;
      }
      results.push({
        device_call_key: call.device_call_key,
        status: matchStatus,
        ...(lead ? { lead_id: lead.id, lead_name: lead.name } : {}),
      });
    }

    return apiSuccess({ results });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_calls_sync' } });
    return apiServerError();
  }
}
```

- [ ] **Step 3: Verify with curl**

Using the Task 3 device key and a phone number that EXISTS on a test lead:
```bash
curl -s -X POST <base>/api/mobile/calls/sync \
  -H "Content-Type: application/json" -H "x-api-key: <device_key>" \
  -d '{"device_id":"test-device-1","calls":[
    {"device_call_key":"t:1","phone":"<lead phone>","direction":"outgoing","duration_seconds":95,"called_at":"2026-07-10T10:00:00+04:00"},
    {"device_call_key":"t:2","phone":"0568887766","direction":"incoming","duration_seconds":30,"called_at":"2026-07-10T10:05:00+04:00"}]}'
```
Expected: `t:1 → matched` (with lead_id + lead_name), `t:2 → unmatched`.
Re-send the same body → both `duplicate`. Verify in DB:
`pnpm db:query "SELECT device_call_key, match_status, lead_id, activity_id FROM pyra_agent_calls ORDER BY created_at DESC LIMIT 5"`
and confirm a `call_logged` activity exists for `t:1` and the lead's
`last_contact_at` updated. Confirm the lead's timeline in the dashboard shows
«تم تسجيل مكالمة».

- [ ] **Step 4: check + commit**

Run: `pnpm run check` → 0 errors.
```bash
git add app/api/mobile/_lib/device-auth.ts app/api/mobile/calls/sync/route.ts
git commit -m "feat(calls): device call-sync ingest with lead matching"
```

---

### Task 5: Quick-add lead + ignore + feedback notification

**Files:**
- Create: `app/api/mobile/leads/route.ts`
- Create: `app/api/mobile/calls/ignore/route.ts`
- Modify: `lib/notifications/notify.ts` (extend `NotificationType` union
  with `'call_feedback_required'`)

**Interfaces:**
- Consumes: `requireDeviceAuth` (Task 4), Task 2 helpers, `notify()`,
  `PIPELINE_STAGE_IDS` from `@/lib/constants/statuses`,
  `getStageDefaultWinProbability` from `@/lib/crm/pipeline-stages`,
  `logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS` from `@/lib/api/activity`.
- Produces: `POST /api/mobile/leads` response
  `{ data: { lead_id, lead_name, lead_url, already_existed: boolean } }`;
  `POST /api/mobile/calls/ignore` response `{ data: { ignored: true, updated_calls: n } }`.

- [ ] **Step 1: Extend NotificationType**

In `lib/notifications/notify.ts`, add `'call_feedback_required'` to the
`NotificationType` union (alphabetical position near the other CRM types).

- [ ] **Step 2: Implement quick-add route**

`app/api/mobile/leads/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../_lib/device-auth';
import { apiSuccess, apiError, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { buildLeadPhoneIndex, matchLeadByPhone } from '@/lib/calls/match';
import { notify } from '@/lib/notifications/notify';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';
import { getStageDefaultWinProbability } from '@/lib/crm/pipeline-stages';
import { logError } from '@/lib/observability/log-error';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Retro-link every unlinked call for this number to the lead + write call_logged activities for connected ones. */
async function retroLinkCalls(
  supabase: SupabaseClient,
  leadId: string,
  phoneNormalized: string,
): Promise<number> {
  const { data: unlinked } = await supabase
    .from('pyra_agent_calls')
    .select('id, agent_username, direction, duration_seconds, called_at')
    .eq('phone_normalized', phoneNormalized)
    .is('lead_id', null);
  if (!unlinked || unlinked.length === 0) return 0;
  for (const call of unlinked) {
    let activityId: string | null = null;
    if (call.direction !== 'missed') {
      activityId = generateId('la');
      await supabase.from('pyra_lead_activities').insert({
        id: activityId,
        lead_id: leadId,
        activity_type: 'call_logged',
        description: null,
        metadata: {
          duration_minutes: Math.round((call.duration_seconds / 60) * 10) / 10,
          duration_seconds: call.duration_seconds,
          direction: call.direction === 'incoming' ? 'inbound' : 'outbound',
          auto: true,
          source: 'device_sync_retro',
          called_at: call.called_at,
        },
        created_by: call.agent_username,
      });
    }
    await supabase
      .from('pyra_agent_calls')
      .update({ lead_id: leadId, match_status: 'matched', activity_id: activityId })
      .eq('id', call.id);
  }
  return unlinked.length;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { agentUsername, displayName } = auth;

    const body = await request.json().catch(() => null);
    const deviceCallKey = typeof body?.device_call_key === 'string' ? body.device_call_key.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const leadType = body?.lead_type === 'b2c' ? 'b2c' : body?.lead_type === 'b2b' ? 'b2b' : null;
    const company = typeof body?.company === 'string' ? body.company.trim() : '';
    if (!deviceCallKey) return apiValidationError('device_call_key مطلوب');
    if (!name) return apiValidationError('اسم العميل مطلوب');
    if (!leadType) return apiValidationError('نوع العميل (شركة/فرد) مطلوب');
    if (leadType === 'b2b' && !company) return apiValidationError('اسم الشركة مطلوب لعميل شركة');

    const supabase = createServiceRoleClient();
    const { data: call } = await supabase
      .from('pyra_agent_calls')
      .select('id, phone_raw, phone_normalized, called_at, lead_id')
      .eq('agent_username', agentUsername)
      .eq('device_call_key', deviceCallKey)
      .maybeSingle();
    if (!call) return apiError('المكالمة غير موجودة', 404);

    // race guard: number may have been registered since the sync
    if (call.lead_id) {
      const { data: l } = await supabase.from('pyra_sales_leads').select('id, name').eq('id', call.lead_id).single();
      return apiSuccess({ lead_id: l!.id, lead_name: l!.name, lead_url: `/dashboard/crm/leads/${l!.id}`, already_existed: true });
    }
    const { data: leads } = await supabase.from('pyra_sales_leads').select('id, name, phone').not('phone', 'is', null);
    const match = matchLeadByPhone(buildLeadPhoneIndex(leads ?? []), call.phone_raw);
    if (match) {
      await retroLinkCalls(supabase, match.id, call.phone_normalized);
      return apiSuccess({ lead_id: match.id, lead_name: match.name, lead_url: `/dashboard/crm/leads/${match.id}`, already_existed: true });
    }

    // create the lead — mirrors /api/crm/leads POST defaults
    const leadId = generateId('sl');
    const { error: insertErr } = await supabase.from('pyra_sales_leads').insert({
      id: leadId,
      name,
      phone: call.phone_raw,
      email: null,
      company: leadType === 'b2b' ? company : null,
      source: 'phone_call',
      stage_id: PIPELINE_STAGE_IDS.NEW_INQUIRY,
      assigned_to: agentUsername,
      notes: null,
      priority: 'medium',
      lead_type: leadType,
      expected_value: 0,
      expected_value_currency: 'AED',
      billing_cycle: 'one_time',
      win_probability: getStageDefaultWinProbability(PIPELINE_STAGE_IDS.NEW_INQUIRY) ?? 0,
      win_probability_overridden: false,
      created_by: agentUsername,
      is_converted: false,
      last_contact_at: call.called_at,
    });
    if (insertErr) throw insertErr;

    await supabase.from('pyra_lead_activities').insert({
      id: generateId('la'),
      lead_id: leadId,
      activity_type: 'lead_created',
      description: null,
      metadata: { source: 'phone_call', created_by: agentUsername },
      created_by: agentUsername,
    });

    const linked = await retroLinkCalls(supabase, leadId, call.phone_normalized);

    // feedback reminder — bell notification. NO `from`: the recipient IS the
    // actor; notify() skips self-notifications when from.username === to.
    await notify(supabase, {
      to: agentUsername,
      type: 'call_feedback_required',
      title: 'مطلوب: إضافة فيدباك',
      message: `تم إنشاء عميل جديد (${name}) من مكالمة — ادخل وسجّل نتيجة المكالمة`,
      link: `/dashboard/crm/leads/${leadId}`,
      entity: { type: 'lead', id: leadId },
    });

    logActivity(
      agentUsername,
      displayName,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.CREATE}`,
      `/dashboard/crm/leads/${leadId}`,
      { lead_id: leadId, source: 'mobile_quick_add', linked_calls: linked },
    );

    return apiSuccess({
      lead_id: leadId, lead_name: name,
      lead_url: `/dashboard/crm/leads/${leadId}`, already_existed: false,
    }, undefined, 201);
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_quick_add_lead' } });
    return apiServerError();
  }
}
```
NOTE: before implementing, open ONE existing `logActivity(...)` call site
(e.g. in `app/api/crm/leads/route.ts`) and match its exact signature — if it
takes a supabase/request argument first, mirror that shape.

- [ ] **Step 3: Implement ignore route**

`app/api/mobile/calls/ignore/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../../_lib/device-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logError } from '@/lib/observability/log-error';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { agentUsername } = auth;

    const body = await request.json().catch(() => null);
    const deviceCallKey = typeof body?.device_call_key === 'string' ? body.device_call_key.trim() : '';
    if (!deviceCallKey) return apiError('device_call_key مطلوب', 422);

    const supabase = createServiceRoleClient();
    const { data: call } = await supabase
      .from('pyra_agent_calls')
      .select('id, phone_normalized, lead_id')
      .eq('agent_username', agentUsername)
      .eq('device_call_key', deviceCallKey)
      .maybeSingle();
    if (!call) return apiError('المكالمة غير موجودة', 404);
    if (call.lead_id) return apiError('المكالمة مرتبطة بعميل بالفعل', 409);

    await supabase.from('pyra_ignored_numbers').upsert(
      {
        id: generateId('ign'),
        agent_username: agentUsername,
        phone_normalized: call.phone_normalized,
      },
      { onConflict: 'agent_username,phone_normalized', ignoreDuplicates: true },
    );

    const { data: updated } = await supabase
      .from('pyra_agent_calls')
      .update({ match_status: 'ignored' })
      .eq('agent_username', agentUsername)
      .eq('phone_normalized', call.phone_normalized)
      .is('lead_id', null)
      .select('id');

    return apiSuccess({ ignored: true, updated_calls: (updated ?? []).length });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_call_ignore' } });
    return apiServerError();
  }
}
```

- [ ] **Step 4: Verify with curl**

1. Quick-add on the unmatched `t:2` call from Task 4:
```bash
curl -s -X POST <base>/api/mobile/leads \
  -H "Content-Type: application/json" -H "x-api-key: <device_key>" \
  -d '{"device_call_key":"t:2","name":"عميل تجريبي","lead_type":"b2b","company":"شركة تجريبية"}'
```
Expected: 201, `already_existed: false`. Verify: lead exists with
`source='phone_call'`; the `t:2` call row now `matched` with `lead_id`; the
lead timeline shows `lead_created` + `call_logged`; a
`call_feedback_required` row exists in `pyra_notifications` for the agent
(check the dashboard bell).
2. Validation: same request without `company` → 422 «اسم الشركة مطلوب».
   With `"lead_type":"b2c"` and no company → passes validation.
3. Ignore: sync a new fake call `t:3`, then:
```bash
curl -s -X POST <base>/api/mobile/calls/ignore \
  -H "Content-Type: application/json" -H "x-api-key: <device_key>" \
  -d '{"device_call_key":"t:3"}'
```
Expected: `ignored: true`. Re-sync another call `t:4` from the SAME number →
sync response status `ignored` (no notification for the app to fire).

- [ ] **Step 5: check + commit**

Run: `pnpm run check` → 0 errors.
```bash
git add app/api/mobile/leads/route.ts app/api/mobile/calls/ignore/route.ts lib/notifications/notify.ts
git commit -m "feat(calls): quick-add lead from call + ignore list + feedback notification"
```

---

### Task 6: Report API + RBAC + team-performance

**Files:**
- Create: `app/api/crm/calls/report/route.ts`
- Modify: `lib/auth/rbac.ts` (add `CALLS_VIEW: 'calls.view'` to
  `PERMISSIONS` under the CRM/leads module group; add `'calls.view'` to
  `ROLE_EXTRAS.sales_agent`)
- Modify: `app/api/crm/dashboard/team-performance/route.ts` (add
  `calls_month` per agent)
- Create: `scripts/sql/grant-calls-view-sales-role.sql` (one-off DB grant)

**Interfaces:**
- Consumes: `computeCallsReport` (Task 2), `dubaiDayKey` from
  `@/lib/utils/format`, `requireApiPermission` from `@/lib/api/auth`,
  `hasPermission` from `@/lib/auth/rbac`.
- Produces: `GET /api/crm/calls/report?month=YYYY-MM` →
  `{ data: { month, agents: [{ username, display_name, ...AgentCallStats }], per_day, scope: 'all'|'own' } }`.

- [ ] **Step 1: RBAC changes**

In `lib/auth/rbac.ts`: add the permission constant + register it in the
module group that renders the role editor (follow how `LEADS_VIEW` is
declared and grouped), then append `'calls.view'` to
`ROLE_EXTRAS.sales_agent`.

- [ ] **Step 2: Grant to the live "Sales" DB role (locked lesson — code-only is inert)**

`scripts/sql/grant-calls-view-sales-role.sql`:
```sql
UPDATE pyra_roles
SET permissions = array_append(permissions, 'calls.view')
WHERE name = 'Sales' AND NOT ('calls.view' = ANY(permissions));
```
Run: `pnpm db:query scripts/sql/grant-calls-view-sales-role.sql`
Verify: `pnpm db:query "SELECT name, permissions FROM pyra_roles WHERE name='Sales'"`
Expected: `calls.view` present.

- [ ] **Step 3: Implement the report route**

```ts
import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';
import { dubaiDayKey } from '@/lib/utils/format';
import { computeCallsReport } from '@/lib/calls/report';
import { logError } from '@/lib/observability/log-error';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function dubaiMonthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${y}-${pad(m)}-01T00:00:00+04:00`,
    end: `${nextY}-${pad(nextM)}-01T00:00:00+04:00`,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('calls.view');
    if (isApiError(auth)) return auth;

    const monthParam = request.nextUrl.searchParams.get('month');
    const month = monthParam && MONTH_RE.test(monthParam)
      ? monthParam
      : dubaiDayKey(new Date()).slice(0, 7);
    const { start, end } = dubaiMonthBounds(month);

    // admins / report-holders see all agents; agents see their own rows
    const seeAll = hasPermission(auth.pyraUser.rolePermissions, 'crm_reports.team_view');

    const supabase = createServiceRoleClient();
    let query = supabase
      .from('pyra_agent_calls')
      .select('*')
      .gte('called_at', start)
      .lt('called_at', end);
    if (!seeAll) query = query.eq('agent_username', auth.pyraUser.username);
    const { data: rows, error } = await query;
    if (error) throw error;

    const agg = computeCallsReport(rows ?? [], dubaiDayKey(new Date()));

    const usernames = Object.keys(agg.per_agent);
    const { data: users } = usernames.length
      ? await supabase.from('pyra_users').select('username, display_name').in('username', usernames)
      : { data: [] };
    const nameMap = new Map((users ?? []).map((u) => [u.username, u.display_name]));

    return apiSuccess({
      month,
      scope: seeAll ? 'all' : 'own',
      agents: usernames.map((u) => ({
        username: u,
        display_name: nameMap.get(u) ?? u,
        ...agg.per_agent[u],
      })),
      per_day: agg.per_day,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'calls_report' } });
    return apiServerError();
  }
}
```
NOTE: confirm `requireApiPermission` exposes `rolePermissions` on
`auth.pyraUser` (open `lib/api/auth.ts` and check the returned shape; adjust
the property name to match).

- [ ] **Step 4: team-performance `calls_month`**

In `app/api/crm/dashboard/team-performance/route.ts`, after the existing
per-agent aggregation, add one grouped query over `pyra_agent_calls` for the
current Dubai month (reuse `dubaiMonthBounds` logic inline or import) and
attach `calls_month: number` to each agent bucket. Widen the corresponding
type in `hooks/useCRMDashboard.ts` in lock-step.

- [ ] **Step 5: Verify**

Admin session: `GET /api/crm/calls/report` → both agents (scope `all`).
Agent session: same call → own rows only (scope `own`).
Counts match Task 4/5 test rows.

- [ ] **Step 6: check + commit**

Run: `pnpm run check` + `pnpm test -- calls` → pass.
```bash
git add app/api/crm/calls/report/route.ts lib/auth/rbac.ts app/api/crm/dashboard/team-performance/route.ts hooks/useCRMDashboard.ts scripts/sql/grant-calls-view-sales-role.sql
git commit -m "feat(calls): per-agent calls report api + rbac + team-performance count"
```

---

### Task 7: CRM UI — /dashboard/crm/calls report page

**Files:**
- Create: `app/dashboard/crm/calls/page.tsx`
- Create: `app/dashboard/crm/calls/calls-client.tsx`
- Create: `components/crm/calls/CallsSummaryCards.tsx`,
  `components/crm/calls/CallsByDayChart.tsx`
- Create: `hooks/useCallsReport.ts`
- Create: `messages/ar/calls.json`, `messages/en/calls.json`
- Modify: `lib/i18n/messages.ts` (`NAMESPACE_FILES`), `i18n/global.ts`,
  `scripts/i18n-check.ts` (`MIGRATED_PATHS` += the new page + components)
- Modify: `components/layout/nav-config.ts` + `messages/ar/nav.json` +
  `messages/en/nav.json` (sidebar entry, CRM group, `permission: 'calls.view'`)
- Modify: `lib/config/module-guide.ts` + `app/dashboard/guide/page.tsx`
  SECTIONS (guide entry)

**Interfaces:**
- Consumes: `GET /api/crm/calls/report` (Task 6 response shape).
- Produces: `useCallsReport(month: string)` React Query hook.

- [ ] **Step 1: Hook**

`hooks/useCallsReport.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';

export interface CallsReportAgent {
  username: string; display_name: string;
  today: number; month: number;
  outgoing: number; incoming: number; missed: number;
  matched: number; unmatched: number; ignored: number;
  total_duration_seconds: number; avg_duration_seconds: number;
}

export interface CallsReport {
  month: string;
  scope: 'all' | 'own';
  agents: CallsReportAgent[];
  per_day: Record<string, number>;
}

export function useCallsReport(month: string) {
  return useQuery<CallsReport>({
    queryKey: ['calls-report', month],
    queryFn: () => fetchAPI(`/api/crm/calls/report?month=${month}`),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Page (server) + client**

`page.tsx`: server component, `requirePermission('calls.view')` from
`@/lib/auth/guards`, renders `<CallsClient />` (mirror any sibling CRM page
e.g. `app/dashboard/crm/follow-ups/page.tsx`).

`calls-client.tsx` (keep <300 lines — cards + chart split into the two
components): month picker (`<input type="month">` styled like existing
filters, default = current Dubai month via `dubaiDayKey().slice(0,7)`),
`useCallsReport(month)`, `<Skeleton>` while loading, `<EmptyState>` when
`agents.length === 0` (icon `Phone`, copy from the `calls` namespace).
Per agent: summary card (اليوم / الشهر / صادر / وارد / فائتة / مرتبطة /
غير مرتبطة / متوسط المدة). `CallsByDayChart` = Recharts `BarChart` over
`per_day` sorted by day key. All strings via `useTranslations('calls')`.
Durations rendered `م:ث` (e.g. `3:40`) — pure format inline helper.

- [ ] **Step 3: i18n catalogs**

`messages/ar/calls.json` (top-level namespace `calls`, no arrays):
```json
{
  "calls": {
    "title": "تقرير المكالمات",
    "subtitle": "مكالمات فريق المبيعات من هواتف الشركة",
    "monthLabel": "الشهر",
    "today": "اليوم",
    "month": "الشهر",
    "outgoing": "صادر",
    "incoming": "وارد",
    "missed": "فائتة",
    "matched": "مرتبطة بعميل",
    "unmatched": "غير مرتبطة",
    "ignored": "متجاهلة",
    "avgDuration": "متوسط المدة",
    "totalDuration": "إجمالي المدة",
    "byDay": "المكالمات باليوم",
    "emptyTitle": "لا توجد مكالمات مسجلة",
    "emptyDescription": "المكالمات هتظهر هنا تلقائيًا أول ما تطبيق الهاتف يبدأ المزامنة"
  }
}
```
`messages/en/calls.json`: same keys, English values ("Calls report",
"Sales team calls from company phones", "Today", "This month", "Outgoing",
"Incoming", "Missed", "Linked to lead", "Unlinked", "Ignored",
"Avg duration", "Total duration", "Calls by day", "No calls recorded yet",
"Calls will appear here automatically once the phone app starts syncing").
Register the namespace in `NAMESPACE_FILES` (lib/i18n/messages.ts) and
`i18n/global.ts`; append the new page + components paths to
`MIGRATED_PATHS` in `scripts/i18n-check.ts`.

- [ ] **Step 4: Sidebar + guide**

- `components/layout/nav-config.ts`: add item in the CRM group —
  key `calls`, href `/dashboard/crm/calls`, icon `Phone`,
  `permission: 'calls.view'`; label keys in `messages/{ar,en}/nav.json`.
- `lib/config/module-guide.ts`: entry for `/dashboard/crm/calls`
  (description/goal + 6-10 sentence-length tips per Phase 17 standard —
  cover: month picker, matched-vs-unmatched meaning, ignore-list behavior
  «التجاهل يوقف التنبيه لكن المكالمة تفضل محسوبة», device sync cadence,
  feedback notification flow).
- `app/dashboard/guide/page.tsx`: add href to SECTIONS.

- [ ] **Step 5: Verify UI**

Run: `pnpm i18n:check` → clean. `pnpm run check` + `pnpm build` → 0 errors.
Dev-run: admin sees both agents; sales agent sees own card only; dark mode +
RTL sanity pass; sidebar entry hidden for plain employees.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/crm/calls components/crm/calls hooks/useCallsReport.ts messages lib/i18n/messages.ts i18n/global.ts scripts/i18n-check.ts components/layout/nav-config.ts lib/config/module-guide.ts app/dashboard/guide/page.tsx
git commit -m "feat(calls): crm calls report page + sidebar + guide + i18n"
```

---

### Task 8: End-to-end contract verification + docs + push

**Files:**
- Create: `docs/CALL-TRACKING.md` (API contract for the Android app +
  provisioning checklist)
- Modify: `CLAUDE.md` (architecture map: new routes/tables/page, one line each)

- [ ] **Step 1: Full curl scenario against production (or local + prod smoke)**

In order, with the real test agent: login → sync (matched + unmatched) →
duplicate re-sync → ignore → quick-add (b2b validation + b2c) → report as
agent → report as admin. Each expected result as specified in Tasks 3-6.

- [ ] **Step 2: Clean up test rows**

```
pnpm db:query "DELETE FROM pyra_agent_calls WHERE device_call_key LIKE 't:%'"
pnpm db:query "DELETE FROM pyra_ignored_numbers WHERE phone_normalized IN ('<test keys>')"
```
Delete the test lead from the dashboard (or SQL) + its activities; deactivate
the test device key from Settings → API keys.

- [ ] **Step 3: Write `docs/CALL-TRACKING.md`**

Contents: the 4 mobile endpoints with request/response JSON examples
(copied from the verified curl outputs), auth model (device key lifecycle),
sync semantics (idempotency, batch cap, missed-call rule, retro-link), and
the per-phone provisioning checklist from the spec (install → permissions →
battery Unrestricted + never-sleeping + adaptive-battery off → login → test
call → verify in CRM).

- [ ] **Step 4: Final verification + push**

Run: `pnpm test` → all pass. `pnpm run check` → 0 errors. `pnpm build` → success.
```bash
git add docs/CALL-TRACKING.md CLAUDE.md
git commit -m "docs(calls): api contract + provisioning checklist"
git fetch origin && git pull --rebase && git push
```

---

## Plan 2 (separate doc, written after Task 8): Android app

`pyra-calls-app/` Kotlin project — login screen, CallLog cursor sync
(WorkManager 15-min + PHONE_STATE immediate), quick-add form (b2b/b2c),
local notifications, provisioning. Written against the contract locked in
`docs/CALL-TRACKING.md` so the app is built once against verified endpoints.
