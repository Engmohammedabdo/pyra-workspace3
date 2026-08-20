# WhatsApp analytics + CRM feed — "like the calls system"

**Date:** 2026-08-20
**Status:** design — awaiting owner approval
**Goal (owner, 2026-08-20):** per-agent WhatsApp analytics, **exactly like the calls system** — the
report AND the CRM feed. Each agent works a company-owned **colour line** (Youssef → `yellow`);
the report measures each agent's WhatsApp performance, and WhatsApp activity updates the lead's
`last_contact_at` + timeline so a WhatsApp-active lead is never treated as cold.

Builds on the shipped Phase 0/1 (`docs/superpowers/specs/2026-08-17-whatsapp-agent-line-design.md`):
per-instance token through send/pull + auto-assign a colour line's inbound to its holder + the
`api_key` client-list security fix. Those are **live in prod**.

---

## 1. The core finding that makes this feasible

Calls attribute cleanly because every call row is stamped with `agent_username` **at the source**
(the device authenticates as one agent). WhatsApp cannot: the unit at the source is the Evolution
**line**, not the agent, and **~95 % of outgoing messages are typed on the phone** (pulled with
`fromMe=true`) carrying **no agent identity at all** (live: of 4,317 outgoing rows only 199 have any
`sender_name`, and those are the business push-name "pyramedia", not a person).

**But the owner's model dissolves the problem:** each agent has their **own** colour line. So the
**line identifies the agent** — every message/conversation on `yellow` is Youssef's, full stop. The
only ambiguous line is the shared company line `pyraai`, where credit follows `conversation.assigned_to`.

**Attribution rule (one rule, both line types):**
```
credit_agent = COALESCE(pyra_whatsapp_instances.agent_username,   -- colour line: the holder
                        pyra_whatsapp_conversations.assigned_to)   -- shared line: the assignee
```
On a colour line the holder short-circuits (exact, even historically). On the shared line the
per-conversation assignee decides; unassigned shared-line activity is a "company/unassigned" bucket
(the analog of `unmatched` calls).

## 2. What "like calls" means — the four pieces to build

Mirrors the calls system 1:1. Sources: `lib/calls/report.ts`, `app/api/crm/calls/report/route.ts`,
`app/dashboard/crm/calls/*`, `app/api/mobile/calls/sync/route.ts` (the CRM feed), and the calls
locked decisions (`docs/decisions/crm.md`).

### Piece A — Reliable ingest: `whatsapp-sync` cron (the analog of device sync)
Today the pull runs **only while someone has the chat page open** (browser poll); there is **no
whatsapp cron** (`app/api/cron/` has 13, none for WhatsApp). Analytics need the full message stream.

- New `app/api/cron/whatsapp-sync/route.ts` — auth via the standard cron pattern (`getExternalAuth`
  → `x-api-key` → `pyra_api_keys`, permission `cron.whatsapp-sync` or `*`), calls
  `listPullableInstances()` → `pullInstanceMessages()` for every `auto_sync` line (the exact function
  the browser poll uses; dedup on `message_id` makes overlap harmless).
- Wire an n8n schedule (every ~5 min) — same ops step as the other crons (publish the n8n node).
- `lib/observability/log-error.ts` on failure (cron doctrine).

### Piece B — Attribution: stamp the credited agent on outgoing messages
Add **one nullable column** `pyra_whatsapp_messages.agent_username varchar NULL` (+ index for the
report's `GROUP BY`). Write it **at message-insert time** (freezes credit, immune to later
reassignment / line-holder rotation — the finance "derived-not-current-state" doctrine) in the three
outgoing insert sites, each computing the COALESCE rule:
- `app/api/dashboard/sales/whatsapp/send/route.ts` (system send) → `auth.pyraUser.username` (the true actor).
- `lib/whatsapp/pull-messages.ts` fromMe branch → `line?.agent_username ?? <conv.assigned_to> ?? null` (`line` already fetched there).
- `app/api/dashboard/sales/whatsapp/webhook/route.ts` fromMe individual → line holder ?? conv assignee.
Inbound rows leave `agent_username` NULL (no author; conversation metrics use `conversation.assigned_to`).
The report reads `messages.agent_username` when present, else falls back to the read-time COALESCE —
so **colour-line history is correct from day one**, and rotation on any line is handled going forward.

### Piece C — CRM feed: WhatsApp writes to the lead timeline + `last_contact_at`
Reproduce the calls write-path, with WhatsApp's one simplification: **every real message is a genuine
touch** — there is no "attempt vs contact" split (a WhatsApp message is delivered, unlike a rung-out
call), so **both directions count as contact**. On ingest of a NEW message (pull + webhook) whose
conversation is linked to a lead:
- **Gate on ownership** (calls parity, fail-closed): write only when `lead.assigned_to === credit_agent`
  (`lib/calls/match.ts:isOwnedByAgent` is the model). A message to a colleague's lead writes nothing to
  the lead. (Owner-notify like the calls F-07 notice is **v1.1**, not v1.)
- INSERT `pyra_lead_activities` — `activity_type: 'whatsapp_inbound' | 'whatsapp_outbound'`,
  `metadata: { direction, auto: true, source: 'whatsapp_sync', message_id, at }`, `created_by: credit_agent`.
  The timeline UI **already renders these** (`components/crm/activity/activity-item.tsx:54-55` has the
  icons/tones) — the rows just were never created.
- Then **bump `pyra_sales_leads.last_contact_at`** to the message time — activity write + bump move
  **together** (calls doctrine, `docs/decisions/crm.md`).
- **Dedup:** one activity per `message_id` (a re-pull must not double-write) — check before insert,
  mirroring the message dedup.
- **Recency consumers:** WhatsApp activities SHOULD count as contact, so — unlike `call_attempt` —
  they are **NOT** added to any exclusion filter. Verify the 4 recency consumers (idle-check,
  deals-at-risk, ai-insights, dossier health) treat `whatsapp_*` as contact (they read
  `last_contact_at` + non-excluded activities, so this is automatic — confirm at implementation).

### Piece D — The report (mirror of the calls report)
- **Pure aggregator** `lib/whatsapp/report.ts` → `computeWhatsappReport(messages, conversations, todayKey)`
  returning `{ per_agent: Record<username, AgentWaStats>, per_day: Record<dayKey, number> }`, unit-tested
  in `__tests__/whatsapp-report.test.ts`. `AgentWaStats` (the WhatsApp analog of the 12 call tiles):
  `today`, `month` (messages), `outgoing`, `incoming`, `conversations` (distinct handled),
  `open`, `resolved`, `leads_contacted` (distinct OWNED leads messaged), `replied` +
  `reply_rate` (conversations where the agent answered an inbound — the analog of answered/answer_rate),
  `avg_response_seconds` (mean first-response gap, computed from the raw message stream: inbound
  timestamp → next outbound in the same conversation; **replied-only denominator**, mirroring the
  answered-only doctrine). Bucket `per_day` by `dubaiDayKey(message.timestamp)`.
- **API** `GET /api/crm/whatsapp/report?month=YYYY-MM` — `requireApiPermission('sales_whatsapp.view')`;
  scope split `seeAll = hasPermission(rolePermissions, 'crm_reports.team_view')` → all agents, else
  `credit_agent = self`; service-role read (gate-then-service-role); Dubai month bounds (half-open,
  `+04:00`); `.range(0, 99999)`; returns `{ month, scope, agents:[{username, display_name, ...stats}], per_day }`,
  **omitting zero-activity agents**. **No new permission** — reuse `sales_whatsapp.view` (already held
  by sales_agent + admin) + `crm_reports.team_view` (admin/manager only) exactly as the calls report does.
- **Page** `app/dashboard/crm/whatsapp-report/{page.tsx,whatsapp-report-client.tsx}` — server gate
  `requirePermission('sales_whatsapp.view')`; month picker; `useWhatsappReport(month)`
  (`hooks/useWhatsappReport.ts`, 60s staleTime); per-agent summary cards + per-day chart +
  per-conversation table; agent column/filter appear only when `scope === 'all'`. Same file shape as
  `app/dashboard/crm/calls/*`.
- **Sidebar/nav/guide/i18n:** add `{ key:'whatsappReport', href:'/dashboard/crm/whatsapp-report',
  icon: BarChart3, permission:'sales_whatsapp.view' }` to the `crm` group in
  `components/layout/nav-config.ts` (after `calls`); `whatsappReport` label in `messages/{ar,en}/nav.json`
  (standard Arabic: «تقرير واتساب»); new i18n namespace `whatsapp-report` registered in
  `lib/i18n/messages.ts` + `i18n/global.ts` + `scripts/i18n-check.ts` MIGRATED_PATHS; module-guide entry
  in `lib/config/module-guide.ts` + `messages/{ar,en}/guide.json` + guide SECTIONS.

## 3. Connect the `yellow` line (data foundation — first implementation step)
Insert the `pyra_whatsapp_instances` row (token validated live: `connectionState/yellow` = 200 open,
2,252 messages readable): `instance_name='yellow'`, `agent_username='youssef'`, `phone_number='971524800970'`,
`api_key=<yellow token>`, `status='connected'`, `auto_sync=true`, `is_notification_line=false`,
`webhook_url` WITHOUT the secret. Then a one-time **full paginated backfill** of `yellow`'s history via
`pullInstanceMessages` (attributed to Youssef by the line holder) so the report has data immediately.

## 4. Four-audience check (CLAUDE.md mandate)
- **Admin:** report over all agents (`sales_whatsapp.view` + `crm_reports.team_view` via `*`).
- **Sales agent:** own report only (`sales_whatsapp.view`, no team-view → `scope:'own'`) — this own-scope
  view **is** the self-service "my WhatsApp productivity" screen (calls did NOT build a separate `my-*`; mirror that).
- **Employee:** N/A (no `sales_whatsapp.view`, no WA line; sidebar hidden, page redirects). One-off access
  via `extra_permissions` remains possible, same as chat.
- **Client:** N/A (no portal WhatsApp surface).

## 5. Non-goals / honest caveats
- **Pre-connection history** on the shared line can't be per-agent attributed (no stored author). Colour-line
  history IS attributable (line holder). Report is forward-accurate; shared-line history is best-effort.
- **Response-time / volume accuracy depends on the sync cron** capturing the full stream. Without Piece A the
  numbers undercount.
- **Shared-line (`pyraai`) message-level precision** is lower than colour lines (the credit is the conversation
  assignee, not the literal typist). Acceptable and documented; colour lines are exact.
- Owner-notify when a message hits a colleague's lead (calls F-07 analog) is **v1.1**.
- No new RBAC permission; no `pyra_roles` migration.

## 6. Migrations & tests
- Migration: `pyra_whatsapp_messages.agent_username varchar NULL` + index `idx_wa_messages_agent`. (Activity
  types `whatsapp_inbound`/`whatsapp_outbound` are string values, no enum change; UI already supports them.)
- Tests: `__tests__/whatsapp-report.test.ts` for the pure aggregator (per-agent tallies, replied-only
  response average, per-day bucketing, colour-line vs shared-line credit). `pnpm run check` + `pnpm test` +
  `pnpm build` green before push. n8n `whatsapp-sync` schedule wired (ops).

## 7. Build order (phased, each: code → check/build/test → commit)
1. **Migration + attribution stamp** (column + 3 write sites) — inert until data flows.
2. **whatsapp-sync cron** (Piece A) + wire n8n.
3. **Connect `yellow`** + full backfill → verify data + attribution.
4. **CRM feed** (Piece C) — timeline + last_contact, ownership-gated, deduped.
5. **Report** (Piece D) — aggregator + API + page + nav/guide/i18n.
6. Live-verify on prod; document.
