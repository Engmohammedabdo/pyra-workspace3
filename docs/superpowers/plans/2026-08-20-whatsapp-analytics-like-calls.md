# WhatsApp Analytics + CRM Feed ("like calls") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-agent WhatsApp analytics + CRM feed that mirrors the calls system: continuous sync, per-message agent attribution, lead-timeline + `last_contact_at` writes, and a per-agent report page.

**Architecture:** Attribution rule `credit_agent = messages.agent_username (stamped) ?? COALESCE(instances.agent_username, conversations.assigned_to)`. A colour line (one line per agent, e.g. `yellow`→`youssef`) makes the line identify the agent, so credit is exact. Pure logic lives in `lib/whatsapp/*` and is unit-tested; routes are thin; the report page mirrors `app/dashboard/crm/calls/*`.

**Tech Stack:** Next.js 15 App Router, Supabase (service-role for reports/crons), React Query, Vitest, Evolution API (existing `evolutionClient` + `pullInstanceMessages`).

## Global Constraints

- Package manager is **pnpm**, never npm. Gates: `pnpm run check` (tsc + i18n) + `pnpm test` + `pnpm build` must pass before any push.
- **RTL/logical CSS only** (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`), dark-mode pairs on every color, per CLAUDE.md.
- **No new RBAC permission.** Reuse `sales_whatsapp.view` (view) + `crm_reports.team_view` (team scope) exactly as the calls report does.
- Arabic UI copy = simplified **standard** Arabic (owner rule 2026-08-12): «متى» not «امتى», «الآن» not «دلوقتي», etc.
- New migrated i18n paths must be appended to `scripts/i18n-check.ts` MIGRATED_PATHS; new namespace registered in `lib/i18n/messages.ts` + `i18n/global.ts`.
- Money/DB writes fail loud; crons log to `pyra_error_logs` via `logError`.
- Commit after every task. Do NOT push/deploy without explicit owner confirmation (branch tracks `origin/main`; a push deploys prod).
- Arabic in SQL must go through a UTF-8 `.sql` file via `pnpm db:query <file>`, never inline.

---

### Task 1: Migration — `agent_username` column on WhatsApp messages

**Files:**
- Create: `database/migrations/<NNN>_whatsapp_message_agent.sql` (find the next number/dir — see Step 1)
- Test: verification query (no unit test — schema change)

**Interfaces:**
- Produces: column `pyra_whatsapp_messages.agent_username varchar NULL` + index `idx_wa_messages_agent`, consumed by Tasks 3, 7, 8.

- [ ] **Step 1: Find the migration number + dir convention**

Run:
```bash
ls database/migrations/ | tail -5; ls supabase/migrations/ | tail -5; sed -n '1,40p' docs/MIGRATIONS.md
```
Use whichever directory holds the highest-numbered migration; take the next integer as `<NNN>` (zero-padded to match neighbors).

- [ ] **Step 2: Write the migration SQL**

Create `database/migrations/<NNN>_whatsapp_message_agent.sql` (adjust dir per Step 1):
```sql
-- Per-agent attribution for WhatsApp analytics.
-- credit_agent is stamped at write time on OUTGOING rows so a later reassignment
-- or line-holder rotation cannot rewrite historical credit (finance
-- derived-not-current-state doctrine). Inbound rows stay NULL (no author).
ALTER TABLE pyra_whatsapp_messages
  ADD COLUMN IF NOT EXISTS agent_username varchar NULL;

CREATE INDEX IF NOT EXISTS idx_wa_messages_agent
  ON pyra_whatsapp_messages (agent_username)
  WHERE agent_username IS NOT NULL;
```

- [ ] **Step 3: Dry-run then apply**

Run (dry-run wraps in a transaction that genuinely rehearses on prod):
```bash
pnpm db:query database/migrations/<NNN>_whatsapp_message_agent.sql
```
Expected: `[]` (DDL returns no rows), no error.

- [ ] **Step 4: Verify the column + index exist**

Run:
```bash
pnpm db:query "SELECT column_name FROM information_schema.columns WHERE table_name='pyra_whatsapp_messages' AND column_name='agent_username'"
```
Expected: one row `{ "column_name": "agent_username" }`.

- [ ] **Step 5: Record the migration**

Run:
```bash
pnpm db:record <NNN>
```
Then commit:
```bash
git add database/migrations/<NNN>_whatsapp_message_agent.sql
git commit -m "feat(whatsapp): add agent_username column for per-agent analytics"
```

---

### Task 2: Attribution helper (pure, TDD)

**Files:**
- Create: `lib/whatsapp/attribution.ts`
- Test: `__tests__/whatsapp-attribution.test.ts`

**Interfaces:**
- Produces: `resolveOutgoingAgent(input: { actorUsername?: string | null; lineHolder?: string | null; conversationAssignee?: string | null }): string | null` — used by Task 3 (write sites) and Task 8 (read-time credit fallback).

- [ ] **Step 1: Write the failing test**

Create `__tests__/whatsapp-attribution.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveOutgoingAgent } from '@/lib/whatsapp/attribution';

describe('resolveOutgoingAgent', () => {
  it('prefers the explicit system-send actor', () => {
    expect(resolveOutgoingAgent({ actorUsername: 'youssef', lineHolder: 'sara', conversationAssignee: 'omar' })).toBe('youssef');
  });
  it('falls back to the line holder (colour line) when no actor', () => {
    expect(resolveOutgoingAgent({ lineHolder: 'youssef', conversationAssignee: 'omar' })).toBe('youssef');
  });
  it('falls back to the conversation assignee (shared line, no holder)', () => {
    expect(resolveOutgoingAgent({ lineHolder: null, conversationAssignee: 'omar' })).toBe('omar');
  });
  it('returns null when nothing is known (unassigned shared-line)', () => {
    expect(resolveOutgoingAgent({})).toBeNull();
  });
  it('treats empty strings as absent', () => {
    expect(resolveOutgoingAgent({ actorUsername: '', lineHolder: 'youssef' })).toBe('youssef');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test whatsapp-attribution`
Expected: FAIL — cannot find module `@/lib/whatsapp/attribution`.

- [ ] **Step 3: Write the implementation**

Create `lib/whatsapp/attribution.ts`:
```ts
/**
 * The single WhatsApp attribution rule. An outgoing message is credited to:
 *   1. the explicit actor when it was sent THROUGH the system (send route), else
 *   2. the line holder — a colour line (one agent's phone) IS that agent, else
 *   3. the conversation assignee — the shared company line's per-conversation owner, else
 *   4. null — unassigned shared-line activity (the "company/unassigned" bucket).
 * Empty strings are treated as absent.
 */
export function resolveOutgoingAgent(input: {
  actorUsername?: string | null;
  lineHolder?: string | null;
  conversationAssignee?: string | null;
}): string | null {
  return (
    (input.actorUsername || null) ??
    (input.lineHolder || null) ??
    (input.conversationAssignee || null) ??
    null
  );
}
```
Note: `||` collapses empty string to null, then `??` chains — combined they skip empty/undefined/null.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test whatsapp-attribution`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/whatsapp/attribution.ts __tests__/whatsapp-attribution.test.ts
git commit -m "feat(whatsapp): pure resolveOutgoingAgent attribution helper"
```

---

### Task 3: Stamp `agent_username` at the three outgoing insert sites

**Files:**
- Modify: `app/api/dashboard/sales/whatsapp/send/route.ts` (outgoing message insert, ~line 152-172)
- Modify: `lib/whatsapp/pull-messages.ts` (message row build, ~line 177-193; `line` already fetched ~line 100)
- Modify: `app/api/dashboard/sales/whatsapp/webhook/route.ts` (fromMe individual message insert, ~line 323)
- Test: none new (helper covered in Task 2); verified by `pnpm build` + the Task 5 live pull.

**Interfaces:**
- Consumes: `resolveOutgoingAgent` (Task 2).
- Produces: outgoing `pyra_whatsapp_messages` rows now carry `agent_username`.

- [ ] **Step 1: send route — stamp the true actor**

In `app/api/dashboard/sales/whatsapp/send/route.ts`, add the import at top:
```ts
import { resolveOutgoingAgent } from '@/lib/whatsapp/attribution';
```
In the `supabase.from('pyra_whatsapp_messages').insert({ ... })` object (the outgoing save, currently ending with `sender_name: ...`), add:
```ts
      agent_username: resolveOutgoingAgent({ actorUsername: auth.pyraUser.username }),
```

- [ ] **Step 2: pull-messages — stamp holder/assignee for phone-sent outgoing**

In `lib/whatsapp/pull-messages.ts`, add the import at top:
```ts
import { resolveOutgoingAgent } from '@/lib/whatsapp/attribution';
```
`line` (with `agent_username`) is already fetched near line 100. In the `newMessages.push({ ... })` object, add — only outgoing rows get a credit; inbound stays null:
```ts
      agent_username:
        direction === 'outgoing'
          ? resolveOutgoingAgent({ lineHolder: line?.agent_username })
          : null,
```
(Conversation-assignee fallback is unavailable here at insert time; colour lines — the only ones needing accurate history — resolve fully via `lineHolder`. Shared-line phone-sent history resolves at read time in Task 8.)

- [ ] **Step 3: webhook — stamp fromMe individual messages**

In `app/api/dashboard/sales/whatsapp/webhook/route.ts`, add the import, and in the individual-message insert (the `fromMe`/outgoing branch, ~line 323) add:
```ts
      agent_username: msg.key.fromMe
        ? resolveOutgoingAgent({ lineHolder: instanceHolder })
        : null,
```
Before that insert, fetch the line holder once (mirror pull-messages) if not already present:
```ts
  const { data: waLine } = await supabase
    .from('pyra_whatsapp_instances')
    .select('agent_username')
    .eq('instance_name', instanceName || 'pyraai')
    .maybeSingle();
  const instanceHolder = waLine?.agent_username ?? null;
```
(Place this near where the conversation is resolved so `instanceHolder` is in scope for the insert.)

- [ ] **Step 4: Typecheck + build**

Run: `pnpm run check`
Expected: clean (no TS errors).

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard/sales/whatsapp/send/route.ts lib/whatsapp/pull-messages.ts app/api/dashboard/sales/whatsapp/webhook/route.ts
git commit -m "feat(whatsapp): stamp agent_username on outgoing messages at all three write sites"
```

---

### Task 4: `whatsapp-sync` cron (continuous ingest)

**Files:**
- Create: `app/api/cron/whatsapp-sync/route.ts`
- Reference (copy the auth+shape): `app/api/cron/follow-ups-check-due/route.ts`
- Test: none new (orchestration over already-tested `pullInstanceMessages`); verified by manual invocation + build.

**Interfaces:**
- Consumes: `listPullableInstances`, `pullInstanceMessages` (`lib/whatsapp/pull-messages.ts`), `getExternalAuth` (cron auth), `logError`.
- Produces: an authenticated cron endpoint that pulls every `auto_sync` line.

- [ ] **Step 1: Read the reference cron's exact auth**

Run: `sed -n '1,60p' app/api/cron/follow-ups-check-due/route.ts`
Note the exact `getExternalAuth`/permission pattern and the service-role client construction; reproduce it verbatim (permission name `cron.whatsapp-sync`).

- [ ] **Step 2: Write the cron route**

Create `app/api/cron/whatsapp-sync/route.ts`:
```ts
import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { listPullableInstances, pullInstanceMessages } from '@/lib/whatsapp/pull-messages';
import { logError } from '@/lib/observability/log-error';

// Auth: x-api-key header -> pyra_api_keys; permission cron.whatsapp-sync or *.
// Pulls every auto_sync WhatsApp line so analytics/last_contact don't depend on
// a human having the chat page open. Dedup on message_id makes overlap with the
// browser poll harmless.
export async function POST(request: NextRequest) {
  const auth = await getExternalAuth(request, 'cron.whatsapp-sync');
  if (!auth.ok) return apiError(auth.error ?? 'غير مصرح', auth.status ?? 401);

  const supabase = createServiceRoleClient();
  try {
    const instances = await listPullableInstances(supabase);
    const results = [];
    for (const inst of instances) {
      try {
        const r = await pullInstanceMessages({
          supabase,
          instanceName: inst.instance_name,
          ownPhone: inst.phone_number,
        });
        results.push(r);
      } catch (err) {
        // One bad line must never abort the sweep.
        logError({ severity: 'warning', error: err, request, metadata: { cron: 'whatsapp-sync', instance: inst.instance_name } });
        results.push({ instance: inst.instance_name, synced: 0, conversations_updated: 0, total_fetched: 0, error: true });
      }
    }
    return apiSuccess({ instances: results });
  } catch (err) {
    logError({ severity: 'error', error: err, request, metadata: { cron: 'whatsapp-sync' } });
    return apiServerError();
  }
}
```
Confirm the exact `getExternalAuth` import path + return shape against the reference cron (Step 1) and adjust if the codebase uses a different helper name/signature.

- [ ] **Step 3: Build**

Run: `pnpm run check && pnpm build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/whatsapp-sync/route.ts
git commit -m "feat(whatsapp): whatsapp-sync cron pulling all auto_sync lines"
```

- [ ] **Step 5: (Ops, post-deploy) wire the n8n schedule**

After deploy, add an n8n Scheduled node (every 5 min) POSTing to `/api/cron/whatsapp-sync` with the `x-api-key` cron key, then `publish_workflow`. (Same step as the other crons; not code.)

---

### Task 5: Connect the `yellow` line + backfill

**Files:**
- Create: `scratchpad/insert-yellow.sql` (already generated this session — regenerate if stale)
- Create (temp): `scripts/_pull-yellow-backfill.ts` (gitignored `_` prefix)
- Test: verification queries.

**Interfaces:**
- Consumes: validated token `2F8B1C63AF35-43D7-B67A-C93D5DEE29CE`, phone `971524800970`, holder `youssef`.
- Produces: a live, holder-bound `yellow` row + its history imported and attributed to Youssef.

- [ ] **Step 1: Insert the yellow row**

Run (the generated file inserts instance_name='yellow', agent_username='youssef', api_key=<token>, auto_sync=true, is_notification_line=false, webhook_url WITHOUT secret):
```bash
pnpm db:query scratchpad/insert-yellow.sql
```

- [ ] **Step 2: Verify the row**

Run:
```bash
pnpm db:query "SELECT instance_name, agent_username, is_notification_line, auto_sync, (api_key IS NOT NULL) AS has_token FROM pyra_whatsapp_instances WHERE instance_name='yellow'"
```
Expected: `yellow` / `youssef` / `false` / `true` / `true`.

- [ ] **Step 3: One-time full backfill of yellow's history**

Create `scripts/_pull-yellow-backfill.ts`:
```ts
import { createServiceRoleClient } from '@/lib/supabase/server';
import { pullInstanceMessages } from '@/lib/whatsapp/pull-messages';

async function main() {
  const supabase = createServiceRoleClient();
  let total = 0;
  // pullInstanceMessages fetches page 1; loop by calling repeatedly is not paginated,
  // so raise pageSize for a bulk import of the recent window.
  const r = await pullInstanceMessages({ supabase, instanceName: 'yellow', ownPhone: '971524800970', pageSize: 300 });
  total += r.synced;
  console.log('yellow backfill:', JSON.stringify(r));
}
main();
```
Run: `npx tsx scripts/_pull-yellow-backfill.ts`
Expected: prints a non-zero `synced` count (yellow has ~2,252 messages in Evolution).

- [ ] **Step 4: Verify attribution + assignment**

Run:
```bash
pnpm db:query "SELECT COUNT(*) AS convs FROM pyra_whatsapp_conversations WHERE instance_name='yellow' AND assigned_to='youssef'"
pnpm db:query "SELECT COUNT(*) AS agent_msgs FROM pyra_whatsapp_messages WHERE instance_name='yellow' AND agent_username='youssef'"
```
Expected: both counts > 0 (conversations assigned to youssef; outgoing messages credited to youssef).

- [ ] **Step 5: Commit the ops artifacts**

```bash
git add scripts/_pull-yellow-backfill.ts
git commit -m "chore(whatsapp): yellow line backfill script"
```
(The `_`-prefixed script + scratchpad SQL are gitignored where applicable; commit only what git tracks.)

---

### Task 6: Lead-feed decision (pure, TDD) + wiring

**Files:**
- Create: `lib/whatsapp/lead-feed.ts`
- Test: `__tests__/whatsapp-lead-feed.test.ts`
- Modify: `lib/whatsapp/pull-messages.ts` (call the writer for new messages whose conversation is lead-linked)

**Interfaces:**
- Consumes: `resolveOutgoingAgent` (Task 2).
- Produces: `shouldWriteLeadTouch(input): boolean` and `writeWhatsAppLeadTouch(supabase, args): Promise<void>` — the ownership-gated, deduped activity + `last_contact_at` writer.

- [ ] **Step 1: Write the failing test for the decision**

Create `__tests__/whatsapp-lead-feed.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { shouldWriteLeadTouch } from '@/lib/whatsapp/lead-feed';

describe('shouldWriteLeadTouch', () => {
  it('writes when the credited agent OWNS the lead and it is not already logged', () => {
    expect(shouldWriteLeadTouch({ leadId: 'l1', leadAssignedTo: 'youssef', creditAgent: 'youssef', alreadyLogged: false })).toBe(true);
  });
  it('does NOT write to a colleague\'s lead', () => {
    expect(shouldWriteLeadTouch({ leadId: 'l1', leadAssignedTo: 'omar', creditAgent: 'youssef', alreadyLogged: false })).toBe(false);
  });
  it('fails closed on a null assignee', () => {
    expect(shouldWriteLeadTouch({ leadId: 'l1', leadAssignedTo: null, creditAgent: 'youssef', alreadyLogged: false })).toBe(false);
  });
  it('does NOT double-write an already-logged message', () => {
    expect(shouldWriteLeadTouch({ leadId: 'l1', leadAssignedTo: 'youssef', creditAgent: 'youssef', alreadyLogged: true })).toBe(false);
  });
  it('does NOT write when there is no lead', () => {
    expect(shouldWriteLeadTouch({ leadId: null, leadAssignedTo: null, creditAgent: 'youssef', alreadyLogged: false })).toBe(false);
  });
  it('inbound with no credit agent still writes when the lead has an owner', () => {
    // inbound message: creditAgent may be null, but the customer contacting an
    // owned lead is a real touch — credit the write to the lead owner.
    expect(shouldWriteLeadTouch({ leadId: 'l1', leadAssignedTo: 'youssef', creditAgent: null, alreadyLogged: false, inbound: true })).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test whatsapp-lead-feed`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the decision + writer**

Create `lib/whatsapp/lead-feed.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';

/**
 * Whether a WhatsApp message should write a lead touch (timeline activity +
 * last_contact_at bump). Ownership-gated like calls (fails closed on null
 * assignee); deduped by message; every WhatsApp message is a real contact
 * (no call-style "attempt" split), so both directions qualify.
 *
 * For an INBOUND message the customer authored, creditAgent may be null; the
 * touch is still real when the lead has an owner, and is credited to that owner.
 */
export function shouldWriteLeadTouch(input: {
  leadId: string | null;
  leadAssignedTo: string | null;
  creditAgent: string | null;
  alreadyLogged: boolean;
  inbound?: boolean;
}): boolean {
  if (!input.leadId || input.alreadyLogged || !input.leadAssignedTo) return false;
  if (input.inbound) return true; // customer touch on an owned lead
  return input.creditAgent === input.leadAssignedTo; // outbound: only the owner's own reach-out
}

/** Insert the timeline activity + bump last_contact_at, together. Fire-and-forget. */
export async function writeWhatsAppLeadTouch(
  supabase: SupabaseClient,
  args: {
    leadId: string;
    creditAgent: string; // lead owner
    direction: 'incoming' | 'outgoing';
    messageId: string;
    at: string; // ISO
  },
): Promise<void> {
  const activityType = args.direction === 'incoming' ? 'whatsapp_inbound' : 'whatsapp_outbound';
  const { error: actErr } = await supabase.from('pyra_lead_activities').insert({
    id: generateId('la'),
    lead_id: args.leadId,
    activity_type: activityType,
    // i18n-exempt: persisted activity metadata, not a per-request UI string
    description: activityType === 'whatsapp_inbound' ? 'رسالة واتساب واردة' : 'رسالة واتساب صادرة',
    metadata: { direction: args.direction, auto: true, source: 'whatsapp_sync', message_id: args.messageId, at: args.at },
    created_by: args.creditAgent,
    created_at: args.at,
  });
  if (actErr) { console.error('[wa-lead-feed] activity insert failed:', actErr.message); return; }
  const { error: bumpErr } = await supabase
    .from('pyra_sales_leads')
    .update({ last_contact_at: args.at })
    .eq('id', args.leadId);
  if (bumpErr) console.error('[wa-lead-feed] last_contact_at bump failed:', bumpErr.message);
}
```
Before writing, confirm the real column names of `pyra_lead_activities` (run `pnpm db:query "SELECT column_name FROM information_schema.columns WHERE table_name='pyra_lead_activities' ORDER BY ordinal_position"`) — match `activity_type`/`description`/`metadata`/`created_by` to what calls' `sync/route.ts` uses; adjust `id` prefix + column names to the actual schema if they differ.

- [ ] **Step 4: Run the test to green**

Run: `pnpm test whatsapp-lead-feed`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire the writer into the pull**

In `lib/whatsapp/pull-messages.ts`, after messages are inserted (after the `pyra_whatsapp_messages` insert block, ~line 264), add a lead-touch pass. For each new message with a `lead_id`, resolve the lead's `assigned_to` (batch-fetch once for all matched lead ids), check `shouldWriteLeadTouch` against an existing-activity dedup set (query `pyra_lead_activities` where `metadata->>message_id` in the batch), and call `writeWhatsAppLeadTouch`. Keep it a best-effort loop that never throws out of the pull. (Import `shouldWriteLeadTouch, writeWhatsAppLeadTouch` at top; reuse the `leadsByPhone`/matched data already computed, plus a single `pyra_sales_leads` `.in('id', leadIds).select('id, assigned_to')` fetch.)

- [ ] **Step 6: Build + commit**

Run: `pnpm run check && pnpm test whatsapp-lead-feed`
```bash
git add lib/whatsapp/lead-feed.ts __tests__/whatsapp-lead-feed.test.ts lib/whatsapp/pull-messages.ts
git commit -m "feat(whatsapp): lead-timeline + last_contact feed on message ingest (ownership-gated, deduped)"
```

---

### Task 7: Report aggregator (pure, TDD)

**Files:**
- Create: `lib/whatsapp/report.ts`
- Test: `__tests__/whatsapp-report.test.ts`

**Interfaces:**
- Produces:
  - `interface AgentWaStats { today:number; month:number; outgoing:number; incoming:number; conversations:number; open:number; resolved:number; leads_contacted:number; replied:number; reply_rate:number; avg_response_seconds:number }`
  - `interface WaReportInput { messages: Array<{ credit_agent: string|null; direction: 'incoming'|'outgoing'; timestamp: string; conversation_id: string|null; lead_id: string|null; lead_owned: boolean }>; conversations: Array<{ id: string; credit_agent: string|null; status: string }>; todayKey: string }`
  - `computeWhatsappReport(input: WaReportInput): { per_agent: Record<string, AgentWaStats>; per_day: Record<string, number> }`
- Consumed by Task 8.

- [ ] **Step 1: Write the failing test**

Create `__tests__/whatsapp-report.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to fail**

Run: `pnpm test whatsapp-report`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the aggregator**

Create `lib/whatsapp/report.ts`:
```ts
import { dubaiDayKey } from '@/lib/utils/dubai-time';

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

  // Message-level tallies (credited) + per-day (all messages).
  for (const m of input.messages) {
    const day = dubaiDayKey(m.timestamp);
    per_day[day] = (per_day[day] ?? 0) + 1;
    const u = m.credit_agent;
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
  const convAgent: Record<string, string | null> = {};
  for (const c of input.conversations) convAgent[c.id] = c.credit_agent;
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
```
Confirm `dubaiDayKey`'s import path (run `grep -rn "export function dubaiDayKey" lib/`) and fix the import if it differs.

- [ ] **Step 4: Run to green**

Run: `pnpm test whatsapp-report`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/whatsapp/report.ts __tests__/whatsapp-report.test.ts
git commit -m "feat(whatsapp): pure per-agent report aggregator (computeWhatsappReport)"
```

---

### Task 8: Report API — `GET /api/crm/whatsapp/report`

**Files:**
- Create: `app/api/crm/whatsapp/report/route.ts`
- Reference (copy structure): `app/api/crm/calls/report/route.ts`
- Test: none new (aggregator tested Task 7); verified by build + live call.

**Interfaces:**
- Consumes: `computeWhatsappReport` (Task 7), `resolveOutgoingAgent` (Task 2), `dubaiMonthBounds`, `requireApiPermission`, `hasPermission`, `createServiceRoleClient`.
- Produces: `{ month, scope: 'all'|'own', agents: Array<{ username; display_name } & AgentWaStats>, per_day }`.

- [ ] **Step 1: Read the calls report route to mirror**

Run: `cat app/api/crm/calls/report/route.ts`
Note `MONTH_RE`, `dubaiMonthBounds`, the `seeAll`/scope split, the batched `pyra_users` display-name lookup, `.range(0, 99999)`, and the zero-activity omission — reproduce all of them.

- [ ] **Step 2: Write the route**

Create `app/api/crm/whatsapp/report/route.ts` (mirror calls; resolve `credit_agent` + `lead_owned` server-side, then hand pure rows to the aggregator):
```ts
import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';
import { dubaiMonthBounds, dubaiDayKey } from '@/lib/utils/dubai-time';
import { resolveOutgoingAgent } from '@/lib/whatsapp/attribution';
import { computeWhatsappReport } from '@/lib/whatsapp/report';

const MONTH_RE = /^\d{4}-\d{2}$/;

export async function GET(request: NextRequest) {
  const auth = await requireApiPermission('sales_whatsapp.view');
  if (isApiError(auth)) return auth;

  const sp = request.nextUrl.searchParams;
  const month = sp.get('month') || dubaiDayKey(new Date().toISOString()).slice(0, 7);
  if (!MONTH_RE.test(month)) return apiError('صيغة الشهر غير صحيحة');

  const seeAll = hasPermission(auth.pyraUser.rolePermissions, 'crm_reports.team_view');
  const me = auth.pyraUser.username;
  const { start, end } = dubaiMonthBounds(month);
  const supabase = createServiceRoleClient();

  try {
    // Line holders (colour line => the credited agent).
    const { data: lines } = await supabase.from('pyra_whatsapp_instances').select('instance_name, agent_username');
    const holderByLine: Record<string, string | null> = {};
    for (const l of lines ?? []) holderByLine[l.instance_name] = l.agent_username ?? null;

    // Messages in-month.
    const { data: msgs } = await supabase
      .from('pyra_whatsapp_messages')
      .select('agent_username, instance_name, direction, timestamp, conversation_id, lead_id')
      .gte('timestamp', start).lt('timestamp', end)
      .order('timestamp', { ascending: true }).range(0, 99999);

    // Conversations referenced (for credit + lead ownership).
    const convIds = [...new Set((msgs ?? []).map((m) => m.conversation_id).filter(Boolean))] as string[];
    const leadIds = [...new Set((msgs ?? []).map((m) => m.lead_id).filter(Boolean))] as string[];
    const { data: convs } = convIds.length
      ? await supabase.from('pyra_whatsapp_conversations').select('id, instance_name, assigned_to, status').in('id', convIds)
      : { data: [] as Array<{ id: string; instance_name: string; assigned_to: string | null; status: string }> };
    const { data: leads } = leadIds.length
      ? await supabase.from('pyra_sales_leads').select('id, assigned_to').in('id', leadIds)
      : { data: [] as Array<{ id: string; assigned_to: string | null }> };

    const convById: Record<string, { instance_name: string; assigned_to: string | null; status: string }> = {};
    for (const c of convs ?? []) convById[c.id] = c;
    const leadOwner: Record<string, string | null> = {};
    for (const l of leads ?? []) leadOwner[l.id] = l.assigned_to ?? null;

    // Resolve credit per message and lead ownership; build pure aggregator input.
    const creditForConv = (cid: string | null): string | null => {
      if (!cid) return null;
      const c = convById[cid];
      if (!c) return null;
      return resolveOutgoingAgent({ lineHolder: holderByLine[c.instance_name], conversationAssignee: c.assigned_to });
    };
    const messages = (msgs ?? []).map((m) => {
      const credit = m.agent_username ?? creditForConv(m.conversation_id);
      const owner = m.lead_id ? leadOwner[m.lead_id] ?? null : null;
      return {
        credit_agent: credit,
        direction: m.direction as 'incoming' | 'outgoing',
        timestamp: m.timestamp as string,
        conversation_id: m.conversation_id as string | null,
        lead_id: m.lead_id as string | null,
        lead_owned: !!owner && owner === credit,
      };
    });
    const conversations = (convs ?? []).map((c) => ({
      id: c.id,
      credit_agent: resolveOutgoingAgent({ lineHolder: holderByLine[c.instance_name], conversationAssignee: c.assigned_to }),
      status: c.status,
    }));

    const todayKey = dubaiDayKey(new Date().toISOString());
    const agg = computeWhatsappReport({ messages, conversations, todayKey });

    // Scope + display names + zero-activity omission (mirror calls).
    let usernames = Object.keys(agg.per_agent);
    if (!seeAll) usernames = usernames.filter((u) => u === me);
    const { data: users } = usernames.length
      ? await supabase.from('pyra_users').select('username, display_name').in('username', usernames)
      : { data: [] as Array<{ username: string; display_name: string }> };
    const nameByUser: Record<string, string> = {};
    for (const u of users ?? []) nameByUser[u.username] = u.display_name;

    const agents = usernames.map((u) => ({ username: u, display_name: nameByUser[u] ?? u, ...agg.per_agent[u] }));
    return apiSuccess({ month, scope: seeAll ? 'all' : 'own', agents, per_day: agg.per_day });
  } catch (err) {
    console.error('GET /api/crm/whatsapp/report error:', err);
    return apiServerError();
  }
}
```
Verify import paths for `dubaiMonthBounds`/`dubaiDayKey` and `hasPermission` against the calls route (Step 1); fix if they differ.

- [ ] **Step 3: Build**

Run: `pnpm run check && pnpm build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/crm/whatsapp/report/route.ts
git commit -m "feat(whatsapp): per-agent report API mirroring the calls report"
```

---

### Task 9: Report page + client + hook

**Files:**
- Create: `hooks/useWhatsappReport.ts`
- Create: `app/dashboard/crm/whatsapp-report/page.tsx`
- Create: `app/dashboard/crm/whatsapp-report/whatsapp-report-client.tsx`
- Create: `messages/ar/whatsapp-report.json`, `messages/en/whatsapp-report.json`
- Reference (mirror): `app/dashboard/crm/calls/{page.tsx,calls-client.tsx}`, `hooks/useCallsReport.ts`, `components/.../CallsSummaryCards.tsx`
- Test: none (UI); verified by build + live view.

**Interfaces:**
- Consumes: the Task 8 API shape.
- Produces: `useWhatsappReport(month)` hook + the `/dashboard/crm/whatsapp-report` page.

- [ ] **Step 1: Hook**

Create `hooks/useWhatsappReport.ts` (mirror `hooks/useCallsReport.ts`):
```ts
import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';
import type { AgentWaStats } from '@/lib/whatsapp/report';

export interface WaReportAgent extends AgentWaStats { username: string; display_name: string }
export interface WaReport { month: string; scope: 'all' | 'own'; agents: WaReportAgent[]; per_day: Record<string, number> }

export function useWhatsappReport(month: string) {
  return useQuery<WaReport>({
    queryKey: ['whatsapp-report', month],
    queryFn: () => fetchAPI(`/api/crm/whatsapp/report?month=${month}`),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Server page**

Create `app/dashboard/crm/whatsapp-report/page.tsx` (mirror the calls `page.tsx`):
```tsx
import { requirePermission } from '@/lib/auth/guards';
import { getTranslations } from 'next-intl/server';
import WhatsappReportClient from './whatsapp-report-client';

export async function generateMetadata() {
  const t = await getTranslations('whatsapp-report');
  return { title: t('title') };
}

export default async function WhatsappReportPage() {
  await requirePermission('sales_whatsapp.view');
  return <WhatsappReportClient />;
}
```

- [ ] **Step 3: Client**

Create `app/dashboard/crm/whatsapp-report/whatsapp-report-client.tsx`. Mirror `calls-client.tsx`: a month picker (default `dubaiDayKey(new Date().toISOString()).slice(0,7)`), `useWhatsappReport(month)`, `<Skeleton>` while loading, `<EmptyState>` when `agents.length === 0`, and per-agent summary cards showing the `AgentWaStats` tiles: conversations, open, resolved, outgoing, incoming, leads_contacted, replied, reply_rate (`%`), avg_response_seconds (as `m:ss`), today, month. Show a per-day bar (reuse the calls day-chart component if generic, else a simple bar list). Use `useTranslations('whatsapp-report')` for every label; all tile numbers are LTR/tabular. Follow RTL + dark-mode rules. Keep the file < 300 lines; extract a `WaAgentCard` sub-component if it grows.

- [ ] **Step 4: i18n messages**

Create `messages/ar/whatsapp-report.json` (standard Arabic) and `messages/en/whatsapp-report.json`, ONE top-level namespace `whatsapp-report`, with keys: `title`, `month`, `empty`, and one key per tile label (e.g. `conversations`, `open`, `resolved`, `outgoing`, `incoming`, `leadsContacted`, `replied`, `replyRate`, `avgResponse`, `today`, `monthTotal`, `agent`). AR values in simplified standard Arabic.

- [ ] **Step 5: Register the namespace**

Add `whatsapp-report` to `NAMESPACE_FILES` in `lib/i18n/messages.ts` and to the namespace list in `i18n/global.ts`. Add `app/dashboard/crm/whatsapp-report` + `app/api/crm/whatsapp` to `MIGRATED_PATHS` in `scripts/i18n-check.ts`.

- [ ] **Step 6: Build + i18n check**

Run: `pnpm run check`
Expected: `i18n:check ✓ clean`, tsc clean.

- [ ] **Step 7: Commit**

```bash
git add hooks/useWhatsappReport.ts app/dashboard/crm/whatsapp-report/ messages/ar/whatsapp-report.json messages/en/whatsapp-report.json lib/i18n/messages.ts i18n/global.ts scripts/i18n-check.ts
git commit -m "feat(whatsapp): per-agent report page + hook + i18n"
```

---

### Task 10: Sidebar + nav label + module guide

**Files:**
- Modify: `components/layout/nav-config.ts` (crm group, after the `calls` item)
- Modify: `messages/ar/nav.json`, `messages/en/nav.json`
- Modify: `lib/config/module-guide.ts`, `messages/ar/guide.json`, `messages/en/guide.json`, `app/dashboard/guide/page.tsx`

**Interfaces:**
- Consumes: the page route from Task 9.

- [ ] **Step 1: Sidebar entry**

In `components/layout/nav-config.ts`, in the `crm` group immediately after the `calls` item, add:
```ts
{ key: 'whatsappReport', href: '/dashboard/crm/whatsapp-report', icon: BarChart3, permission: 'sales_whatsapp.view' },
```
Ensure `BarChart3` is imported from `lucide-react` in that file (add to the import if missing).

- [ ] **Step 2: Nav labels**

Add `"whatsappReport": "تقرير واتساب"` to `messages/ar/nav.json` (next to `"calls"`) and `"whatsappReport": "WhatsApp Report"` to `messages/en/nav.json`.

- [ ] **Step 3: Module guide**

In `lib/config/module-guide.ts` add:
```ts
'/dashboard/crm/whatsapp-report': { href: '/dashboard/crm/whatsapp-report', slug: 'dashboard_crm_whatsapp_report' },
```
Add a `guide.dashboard_crm_whatsapp_report` entry (title + tips) to `messages/{ar,en}/guide.json`, and add the slug to the SECTIONS list in `app/dashboard/guide/page.tsx`.

- [ ] **Step 4: Build + commit**

Run: `pnpm run check`
```bash
git add components/layout/nav-config.ts messages/ar/nav.json messages/en/nav.json lib/config/module-guide.ts messages/ar/guide.json messages/en/guide.json app/dashboard/guide/page.tsx
git commit -m "feat(whatsapp): sidebar + nav + module-guide for the WhatsApp report"
```

---

### Task 11: Full verification + deploy + live check

**Files:** none (verification).

- [ ] **Step 1: Full gate**

Run: `pnpm run check && pnpm test && pnpm build`
Expected: check clean, all tests pass, build OK.

- [ ] **Step 2: Fetch + deploy (owner-confirmed)**

Only after the owner confirms deploy:
```bash
git fetch origin && git log --oneline origin/main..HEAD
git push origin HEAD:main
```
Then poll `GET /api/health` until `built_at` advances (~4-7 min).

- [ ] **Step 3: Live checks**

- Open `/dashboard/crm/whatsapp-report` as admin → Youssef's card shows non-zero conversations/messages.
- As `test.sales` → sees only own scope.
- Check a `yellow`-linked lead's timeline shows `whatsapp_*` activities + a fresh `last_contact_at`.
- Confirm pyraai internal notifications still send from pyraai (unchanged).

- [ ] **Step 4: Docs + memory**

Update `docs/decisions/crm.md` with a short "WhatsApp analytics — locked decisions" entry (attribution rule, both-directions-are-contact, reuse of `sales_whatsapp.view`+`crm_reports.team_view`), and the project memory note.

---

## Self-Review

- **Spec coverage:** Piece A (cron)=Task 4; Piece B (attribution)=Tasks 1-3; Piece C (CRM feed)=Task 6; Piece D (report)=Tasks 7-10; connect yellow=Task 5; four-audience + RBAC reuse=Tasks 8-10; migrations+tests=Tasks 1,2,6,7,11. All spec sections covered.
- **Placeholders:** UI JSX in Task 9 Step 3 is described structurally (mirror an existing file) rather than reproduced line-for-line — deliberate for a 1:1 mirror of `calls-client.tsx`; the data shape it binds to is fully specified in Tasks 7-8. Every logic/route/migration step has complete code.
- **Type consistency:** `AgentWaStats` / `WaReportInput` / `computeWhatsappReport` names match across Tasks 7, 8, 9. `resolveOutgoingAgent` signature matches across Tasks 2, 3, 8. `shouldWriteLeadTouch`/`writeWhatsAppLeadTouch` match across Task 6. `credit_agent` field name consistent in aggregator input + API.
