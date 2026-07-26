# CRM — Locked Decisions Archive

Pipeline, leads, customers, follow-ups, WhatsApp-adjacent CRM surfaces, and the mobile/visual passes.

> **Archive of locked decisions.** These were settled after audit → design → implementation → review, and are recorded so they are **not re-litigated**.
> `CLAUDE.md` carries a one-line index of everything here; open this file when the index says a decision touches what you are about to change.

## Contents

- [CRM Module — Locked Decisions & PRD Deviations](#crm-module-locked-decisions-prd-deviations)
- [CRM Conventions (Phase 8+)](#crm-conventions-phase-8)
- [CRM Phase 9 — Locked Decisions](#crm-phase-9-locked-decisions)
- [CRM Health Score (Phase 9)](#crm-health-score-phase-9)
- [CRM Phase 11 — Locked Decisions](#crm-phase-11-locked-decisions)
- [CRM Phase 11 Refinement — Locked Decisions](#crm-phase-11-refinement-locked-decisions)
- [CRM Phase 11.5 — Locked Decisions](#crm-phase-115-locked-decisions)
- [CRM Phase 10 — Locked Decisions](#crm-phase-10-locked-decisions)
- [CRM Phase 12 — Locked Decisions](#crm-phase-12-locked-decisions)
- [CRM Phase 13 — Locked Decisions](#crm-phase-13-locked-decisions)
- [Phase 15.1 — Locked Decisions](#phase-151-locked-decisions)
- [Phase 15.2 — Locked Decisions](#phase-152-locked-decisions)
- [CRM — Lead Reassignment UI (Locked Decisions, 2026-06-19)](#crm-lead-reassignment-ui-locked-decisions-2026-06-19)
- [CRM Audit Remediation — Locked Decisions (2026-07-02)](#crm-audit-remediation-locked-decisions-2026-07-02)
- [CRM — Admin Lead-Data Edit + Full Activity Logging (Locked, 2026-07-03)](#crm-admin-lead-data-edit-full-activity-logging-locked-2026-07-03)
- [CRM "Pyra Pro" Redesign — Locked Decisions (2026-07-10)](#crm-pyra-pro-redesign-locked-decisions-2026-07-10)

---

## CRM Module — Locked Decisions & PRD Deviations

These are **intentional, documented deviations** from the CRM-PRD,
locked during Phase 7 closure. **Do NOT re-litigate.** Future sessions
encountering the original PRD wording should defer to the decisions
recorded here. CRM phase tracking lives in `CRM-PROGRESS.md` (separate
from the workspace-level `PROGRESS.md`).

### 1. Mobile stage picker — deferred to CRM Phase 10 (was Q-UI-001 Phase 4/7)

**Decision:** the mobile button-picker for stage moves on pipeline cards
is scoped to **CRM Phase 10 (Mobile PWA Polish)**, NOT Phase 4 or Phase 7.

**Rationale:**
- The 8-test exit gate for CRM Phase 7 (PRD §05) doesn't include
  mobile-specific tests
- Sayed's primary work mode is desktop — no operational gap from deferring
- CRM Phase 8 (Sales Dashboard) provides higher daily-management value
- CRM Phase 10 is the natural home for all mobile-touch concerns

**Phase 10 implementation hint** (when work begins):
- Button in `<PipelineCard>` source wrapper, NOT inside `<PipelineCardView>`
  (preserves Phase 7 Chunk 3 architecture below)
- Per-card `useState` for sheet open/close (no prop drilling)
- shadcn `Sheet` primitive at `components/ui/sheet.tsx`; reference patterns:
  `components/portal/portal-mobile-nav.tsx`, `components/layout/mobile-nav.tsx`
- Reuses `MoveStageConfirmModal`, closed_won client-side guard, and
  `useMoveLeadStage` mutation — zero modifications to any of those

### 2. My Work Inbox — `closed_won_pending` not surfaced (Option iii)

**Decision:** PRD wording "My Work Inbox shows
`lead_closed_won_pending_approval` for managers" is satisfied implicitly
via the notification bell + `/dashboard/crm/approvals` dedicated surface.

**Rationale:**
- closed_won_pending notifications fire to managers via the bell
  (verified in CRM Phase 7 Test 4)
- `/dashboard/crm/approvals` is a dedicated, context-rich surface with
  lead details + attachment preview + approve/reject buttons — strictly
  better UX than a generic line item in My Work Inbox
- Adding it to MyWorkInbox would be visual duplication: managers would
  see the same workflow item in two places without UX benefit

**Future sessions: do NOT "fix" this gap by wiring `closed_won_pending`
into My Work Inbox.** That would re-introduce visual duplication.

### 3. Pipeline kanban — three deviations from `project-kanban.tsx` (CRM Phase 7 Chunk 3)

The CRM pipeline at `components/crm/pipeline/` mirrors the working
production pattern from `components/projects/project-kanban.tsx` with
**three deliberate deviations**:

1. **Source uses `opacity-0 pointer-events-none` while dragging** (NOT
   `opacity-30`). HubSpot-style UX — only the floating `<DragOverlay>`
   ghost paints, no double-vision of the source.
2. **`<DragOverlay dropAnimation={null}>`** — avoids the snap-back
   animation jank when paired with our optimistic update flow that
   immediately moves the source out of its old column on drop.
3. **`collisionDetection={pointerWithin}`** (NOT `closestCorners`). The
   default `closestCorners` measures rect corners in document space and
   mis-targets columns under `dir="rtl"` because visual column order
   doesn't match DOM order. `pointerWithin` tests cursor-vs-rect bounds
   in viewport coordinates and is layout-direction-agnostic.

Architecture invariants in the same module (also locked):

- **Three-tier component split** in `components/crm/pipeline/pipeline-card.tsx`:
  - `<PipelineCard>` source wrapper — plain `<div>` with `useDraggable` +
    transform style; inner `<Link>` for navigation receives
    `{...attributes} {...listeners}`
  - `<PipelineCardView>` pure visual presentational component (internal,
    not exported) — NO @dnd-kit hooks; reused by source AND overlay
  - `<PipelineCardOverlay>` thin wrapper around `<PipelineCardView isDragging />`
    rendered inside `<DragOverlay>` — NO @dnd-kit hooks
- **`useDraggable` is on a plain `<div>` wrapper, NEVER on the `<Link>`
  directly.** Putting it on the Link broke things during Phase 7 Chunk 3.
- **Only one `useDraggable` call per `lead.id` at any time** (the source's).
  Earlier patterns where the overlay also called `useDraggable` overwrote
  the source's entry in @dnd-kit's `draggableNodes` Map → `activeNodeRect`
  became null → `PositionedOverlay` returned null → no overlay paint.

These are LOCKED. If you find yourself questioning any of them, **STOP
and ask before changing.** The full debugging arc is in
`docs/PHASE7-CHUNK4-HANDOFF.md` — that file is a historical handoff and is no
longer maintained; this section is the authoritative record of the conclusions.

## CRM Conventions (Phase 8+)

These conventions apply to the new CRM module under `/dashboard/crm/*`.
Locked during Phase 8 planning (Sales Dashboard); future CRM features
should follow the same patterns.

### CRM AI Insights — Severity Scheme

The Sales Dashboard's AI Insights banner uses **4 severity levels**.
Server-side rules in `app/api/crm/dashboard/ai-insights/route.ts` emit
insights with these severities; client renders the top 3 sorted by
severity (critical > high > medium > low).

| Severity | Trigger condition | Example rule types |
|---|---|---|
| `critical` | Pending approvals > 5 | `approvals_pending` |
| `high` | Idle deals ≥ 3 **OR** overdue follow-ups > 5 | `idle_warning`, `overdue_followups` |
| `medium` | Upcoming follow-ups today **OR** conversion rate dropped vs last period | `followups_today`, `conversion_dropped` |
| `low` | Positive trends — closed-won streak, exceeded target | `closed_won_streak`, `target_exceeded` |

Add new rule types in v1.1+ without breaking the existing severity
contract. The `CRMInsight.type` union in `hooks/useCRMDashboard.ts`
must be widened in lock-step with new server-side rules.

### CRM Caching Conventions

React Query `staleTime` + `refetchInterval` per CRM dashboard hook.
Tighter intervals on hot data (KPIs, funnel, recent activity) and
looser on cold data (team performance, deals-at-risk, AI rules).

| Hook | `staleTime` | `refetchInterval` |
|---|---|---|
| `useCRMKPIs` | `60_000` (1 min) | `60_000` |
| `useCRMFunnel` | `60_000` (1 min) | `60_000` |
| `useDealsAtRisk` | `300_000` (5 min) | none |
| `useTeamPerformance` | `300_000` (5 min) | none |
| `useCRMRecentActivity` | `30_000` (30 s) | `30_000` |
| `useCRMInsights` | `120_000` (2 min) | none |

Rationale: KPIs and funnel update as deals move (high signal); deals-
at-risk and team performance change slowly (cheap to be stale); recent
activity is the live-feel hook; AI insights are derived from rules
that re-evaluate every 2 min.

## CRM Phase 9 — Locked Decisions

These are **intentional, documented deviations** from the CRM-PRD,
locked during Phase 9 closure. **Do NOT re-litigate.** Future sessions
encountering the original PRD wording should defer to the decisions
recorded here. Phase 9 closes the Active Customer Page at
`/dashboard/crm/customers/[id]` plus the basic index list at
`/dashboard/crm/customers`.

### 1. Convert-to-customer: password in body, no automated welcome email (Q-A1)

PRD §03 line 368 calls for "send portal welcome email (use existing
template)". No template/sender infrastructure exists in the workspace
today (only `WelcomeBanner` UI component + the `portal_welcome_message`
settings string — neither is a mailer). v1 matches the existing
`/api/clients` POST pattern: admin sets `password` in the request body
and shares credentials with the client out-of-band (WhatsApp/email).

**Future sessions: do NOT add automated email here without first
shipping the email infrastructure** — there's no template, no sender,
no domain config in v1. Adding a fire-and-forget `notify(...)` here
would silently no-op and make future debugging harder.

### 2. Milestone `status='invoiced'` counts as completed (Q-A4)

Production milestones use `status='invoiced'` for done-and-billed
state (verified against Etmam contracts: `cm_iIED1bYZMScoFXLt`,
`cm_KjkMotloVwS8yB6Z`). The Phase 9 dossier endpoint counts both
`'completed'` AND `'invoiced'` as terminal in `kpis.milestones_completed`.

Inline icon mapping in `<ContractMilestones>` mirrors this — the emerald
`CheckCircle2` icon shows for both statuses. The KPI label is
"milestones_completed" but the spirit is "terminal/done milestones."

### 3. Health score returned for unconverted leads (Q-A5)

The `/api/crm/customers/[lead_id]/dossier` endpoint computes and returns
a health score regardless of `lead.is_converted`. UI gates entry to
`/customers/[id]` via the pipeline-card redirect (Step F): converted
leads land there from the pipeline, unconverted leads go to
`/leads/[id]`. Direct API/URL access on a pre-conversion lead returns
an activity-driven score (recency + engagement contribute; contracts
and payment factors return 0 — no contract data, no invoices).

This is **honest data, not defensive null.** Defense-in-depth not
needed; if a caller hits the endpoint manually, they get a score
that reflects what we can measure.

### 4. Single "عرض العقد" link button per contract card (Q-D2)

The originally-approved 2 buttons (View PDF + New Invoice) collapsed
to a single link. The workspace has no standalone
`/api/finance/contracts/[id]/pdf` route — viewing, PDF download, AND
invoice generation all live on the existing
`/dashboard/finance/contracts/[id]` detail page. Splitting into 2
buttons that go to the same destination would be confusing UX.

v1.1 may split actions if a separate PDF-download route is added;
the contract card's action area is structured to accept additional
buttons without restructuring.

### 5. Notes tab read-only (Q-E2)

Inline notes editing already exists at `/dashboard/crm/leads/[id]`
(Phase 5/6 lead detail). The customer page is read-mostly per PRD §04
line 23 "two views of same data, different shells" — the lead detail
remains the editable surface; the customer page is the relationship
overview.

`<CustomerNotesTab>` provides a "تعديل في صفحة الـ Lead" CTA that
deep-links to the lead detail editor. v1.1 may add inline-edit on the
customer page if usage shows demand.

### 6. Customer index `/dashboard/crm/customers` = basic list (Step F)

The index list at `/dashboard/crm/customers` is a simple table — name,
contact, assigned_to, last contact relative date. **No per-row
aggregated KPIs** (LTV, MRR, contracts count, health score).

Adding richer per-row data would require either (a) N dossier calls
per page render — bad — or (b) a new bulk `/api/crm/customers`
endpoint that joins lead + contracts summary in one query. Phase 9
ships the simpler version since the v1 customer base is small (likely
<50). v1.1 adds the aggregated endpoint when the list grows.

The list reuses the existing `useLeads` hook with
`{ is_converted: 'true' }` — no new endpoint, no new schema.

### Implementation invariants (locked, do not regress)

- **Dossier endpoint is the single source for the customer page.** All
  4 customer page tabs that consume real data (Overview, Contracts,
  Activity, Notes) read from `useCustomerDossier(leadId)`. Adding new
  tabs that need additional data: extend the dossier, don't introduce
  a parallel endpoint.

- **Pipeline-card redirect is bidirectional via `is_converted`.** The
  same `<PipelineCard>` source-variant `<Link>` chooses
  `/customers/[id]` or `/leads/[id]` based on the lead's
  `is_converted` flag. Both routes remain accessible by direct URL.
  Don't introduce a third routing layer.

- **Portal toggle never creates/destroys the `pyra_clients` row.** It
  only flips `portal_active`. Conversion creates the row;
  un-converting later would require a dedicated rollback endpoint
  (not built — admin manually deletes via `/dashboard/clients` if
  truly needed).

- **`canAccessLead()` enforces sales-agent scope server-side** on the
  dossier endpoint. The customer page's "404 → غير موجود" empty state
  surfaces this gracefully without leaking lead existence.

The full debugging arc + sub-step commits are tracked in
`CRM-PROGRESS.md` (which can be the canonical Phase 9 archive once
later phases land).

## CRM Health Score (Phase 9)

The Active Customer Page (`/dashboard/crm/customers/[id]`) shows a 0-100
**Health Score** ring computed by
`/api/crm/customers/[lead_id]/dossier`. Locked formula (Phase 9 Q9-3):

| Factor | Weight | Computation |
|---|---|---|
| **Recency** | 30% | Days since most recent `pyra_lead_activities.created_at` (falls back to `lead.last_contact_at` if no activity rows). `<7d` → 30, `7-30d` → 20, `30-90d` → 10, `>90d` → 0. |
| **Payment** | 30% | % of last-180d invoices paid on or before `due_date` (compares `MAX(pyra_payments.payment_date)` per invoice). `>90%` → 30, `70-90%` → 20, `50-70%` → 10, `<50%` → 0. |
| **Active contracts** | 20% | Has retainer contract with `status='active'` OR project contract with `status IN ('in_progress','active')` → 20. Only `completed` contracts → 10. None → 0. |
| **Engagement** | 20% | Count of `pyra_lead_activities` rows in last 30 days. `>5` → 20, `1-5` → 10, `0` → 0. |

**Total = sum, max 100. Color thresholds:**
- 75-100 → emerald (excellent)
- 50-74 → amber (steady)
- 25-49 → orange (needs attention)
- 0-24 → red (at risk)

The dossier endpoint returns the score plus a `breakdown` object (per-
factor contribution) and a `factors` object (raw values like
`days_since_last_activity` for the UI's hover tooltip).

**Implementation notes** (Phase 9 locked decisions):
- The contract-`type` derivation prefers the `pyra_contracts.contract_type`
  column (values seen in production: `'retainer'`, `'milestone'`,
  `'fixed'`) and only falls back to a heuristic for null rows (defensive
  default).
- **Milestone "completed" semantic (Q-A4):** the per-contract
  `kpis.milestones_completed` count treats both `status='completed'` AND
  `status='invoiced'` as terminal/done. Production data uses `'invoiced'`
  for done-and-billed milestones (verified against Etmam contracts). The
  KPI label is "milestones_completed" but the spirit is "terminal."
- **Unconverted leads (Q-A5):** the dossier endpoint returns a health
  score regardless of `lead.is_converted`. UI gates `/customers/[id]` by
  `is_converted=true`; if a caller hits the endpoint via direct API or URL
  on a pre-conversion lead, the activity-driven score is honest data
  (recency + engagement contribute, contracts/payment factors return 0).
  Defense-in-depth not needed; the score is informative, not misleading.

**v1.1 tuning notes** (when refining the formula):
- Weights are tunable inline in `app/api/crm/customers/[lead_id]/dossier/route.ts`
  (search for `recencyScore`, `paymentScore`, `activeContractsScore`,
  `engagementScore`).
- Adding a new factor: bump existing weights down to maintain max-100,
  define the new threshold scheme, surface in `breakdown` + `factors` so
  the UI's tooltip stays informative.
- **Tune weights based on observed churn correlation** once we have 6+
  months of converted-customer data. Current weights are heuristic; the
  retrospective question is "which factor most predicted contract
  cancellation / churn?"

## CRM Phase 11 — Locked Decisions

These are **intentional, documented deviations** from the CRM-PRD,
locked during Phase 11 closure. **Do NOT re-litigate.** Future
sessions encountering the original PRD wording should defer to the
decisions recorded here. Phase 11 closes the cron-jobs + WhatsApp
integration stack: workspace-owned cron logic at
`/api/cron/follow-up-reminders` and `/api/cron/lead-idle-check`,
plus additive Lead-Detail-timeline activity logging in the
WhatsApp webhook.

### 1. Reminder destination = agent's WhatsApp number, NOT the lead's (Q-C3-1 a)

The follow-up-reminders cron sends WhatsApp to the **AGENT's**
number (via their connected `pyra_whatsapp_instances` row). The
lead's name + phone appear in the message body for context.

**Rationale:** this is a "do this thing" reminder for the
salesperson, not customer outreach. Sending to the lead would be
off-pattern (we have separate marketing/comms flows for that) and
risks unsolicited contact.

### 2. Idle check skips unassigned leads (Q-C3-2 c)

The lead-idle-check cron filters `assigned_to IS NOT NULL`.
Unassigned mid-pipeline leads are NOT included in idle warnings.

**Rationale:** the cron is a per-agent reminder ("X of YOUR deals
are stale"). Unassigned leads are an admin-triage problem, not a
stale-deal problem. Admin can find them via the leads list with
the "unassigned" filter; no notification needed.

### 3. Sequential await loop, no row cap (Q-C3-3 e)

`/api/cron/follow-up-reminders` processes due rows one at a time
via sequential `await`. No cap — the natural rate-limiting comes
from Evolution's per-instance throughput.

**Rationale:** v1 volume is low (<10 reminders/tick expected).
Adding batching now would be premature. **v1.1 may add
`Promise.all` batching with a concurrency cap if production
volume exceeds ~50 reminders / 5-min tick** — see v1.1 backlog.

### 4. Per-agent: single most-recently-connected instance (Q-11-1)

When an agent has multiple `pyra_whatsapp_instances` rows, the
cron picks ONE — `status='connected'` ordered by
`last_connected_at DESC NULLS LAST`, `LIMIT 1`.

**Rationale:** multi-instance per agent is rare; if it ever
becomes common, an explicit "primary instance" flag on the
user/agent record is cleaner than picking-by-recency. Until
then, recency is a sane proxy.

### 5. Per-lead 7-day idle_warning dedup (Q-11-2)

Before inserting an `idle_warning` row, the cron checks for any
prior `idle_warning` activity on the same `lead_id` within the
past 7 days. If found, skip the insert (and skip the agent
notification grouping for that lead).

**Rationale:** the cron runs daily but a lead can stay idle for
weeks. Without dedup, the timeline would fill with daily
duplicate warnings. The 7-day window matches the idle threshold
itself — one warning per idle period, not one per day.

### 6. Per-agent daily Dubai-grouped notification (Q-11-3)

Idle-check notifications are GROUPED per agent: one notif/day
with `{count, total_expected_value}` summary. Re-running the
cron the same Dubai-day is a no-op for already-notified agents.

**Rationale:** N notifications/agent/day = noise. One grouped
notif with the count + total value gives the agent a daily
action item without inbox spam. "Today" boundary uses
Asia/Dubai midnight (UTC+4, no DST) so the daily idempotency
works regardless of DB-server timezone.

### Implementation invariants (locked, do NOT regress)

- **Architecture: Option β.** Workspace owns the cron logic; n8n
  workflow **PyraCRM_Cron** (separate from `PyraWhatsapp_Agent` at
  workflow ID `XswCOuU2T3gaExUk`) hosts ONLY Schedule Triggers +
  HTTP Request nodes. Mixing schedule triggers into
  `PyraWhatsapp_Agent` was rejected — it conflates AI auto-reply
  scope with cron scope.

- **Idempotency trade-off: flip `whatsapp_reminder_sent=true`
  regardless of Evolution send outcome.** Documented at the top
  of `app/api/cron/follow-up-reminders/route.ts`. Manual recovery
  via `pg/query` if a real outage is confirmed. Alternative
  (don't flip on failure) would risk message storms during
  Evolution flapping — much worse outcome.

- **Timezone math: JS-side, not Postgres.** Asia/Dubai = UTC+4
  (no DST). `dubaiTodayUtcIso` is computed inline in
  `app/api/cron/lead-idle-check/route.ts` (search for
  `dubaiOffsetMs`) — kept entirely in JS to avoid a
  timezone-conversion roundtrip on every tick.

- **Webhook activity logging is additive.** No existing webhook
  behaviour modified — message insert, `last_contact_at` update,
  business-hours auto-reply, profile-photo fetch, CSAT detection,
  and notifications all untouched. The activity insert is gated
  on `matchedLead?.id` and uses the `void <builder>.then(...)`
  lazy-thenable pattern.

### Phase 11 v1.1 backlog

- [ ] **Webhook notifications use direct INSERT** (lines 352, 364
  of `app/api/dashboard/sales/whatsapp/webhook/route.ts`) — pre-
  existing violation of "central `notify()` helper" rule. Phase 7
  grep test missed because JS syntax differs from raw SQL pattern.
  Migrate to `notify()`.
- [ ] **`Promise.all` batching with concurrency cap** for
  follow-up-reminders cron (replace sequential `await` loop) —
  only if production volume exceeds ~50 reminders / 5-min tick.
- [ ] **24h-window reminder UI flag** in the follow-up create
  form — let the agent set a custom `reminder_at` instead of
  always defaulting to `due_at - 30min`.
- [ ] **Agent-instance-down notification** — when cron finds 0
  connected instances for an assigned agent, surface a one-time
  admin alert (currently silent skip).
- [ ] **Retry mechanism for failed Evolution sends** — currently
  flagged as sent regardless of outcome (idempotency trade-off).
  v1.1 could add a small retry queue with max-attempts before
  flipping the flag.

## CRM Phase 11 Refinement — Locked Decisions

These are **intentional, documented deviations** from the
pre-Refinement Phase 11 design, locked during Phase 11 Refinement
closure. **Do NOT re-litigate.** Future sessions encountering the
original "agent owns a connected instance" assumption should defer
to the decisions recorded here. Phase 11 Refinement adds a
dedicated routing layer (`pyra_agent_whatsapp_settings`) so a
single shared Evolution instance can serve multiple agents, each
routed to their own WhatsApp number — resolves the silent-skip bug
where pre-Refinement Phase 11's cron required each agent to OWN a
connected instance row.

### 1. Dedicated table over `pyra_settings` KV reuse (Schema A1)

A new `pyra_agent_whatsapp_settings` table was added in migration
014 instead of encoding the routing config as JSON blobs in the
existing `pyra_settings` flat KV table. The KV path would have
required JSON-encoding every record into a `text` column — losing
per-agent indexing, FK enforcement, and clean SELECT/UPDATE
patterns. Dedicated table wins on relational integrity + index
efficiency.

### 2. One config per agent — UNIQUE constraint (Q-R-1)

`agent_username` carries a UNIQUE constraint at the DB level. One
agent has at most one routing row at any time. Multi-row would
require tie-breaker logic in the cron ("which is the active
one?") — a UX foot-gun. The PATCH endpoint forbids renaming
`agent_username` (returns 422 with helpful Arabic message) to
preserve identity invariants; to "move" an agent's routing across
instances or numbers, admin updates the existing row OR deletes +
recreates.

### 3. Soft validation at write time; hard validation at cron fire time (Q-R-2)

The API accepts ANY non-empty string for `sender_instance_name`
at INSERT/UPDATE. The UI's instance picker is `Input + datalist`
(free-text + HTML5 suggestions) — admin can type an instance name
that doesn't yet exist in `pyra_whatsapp_instances`. The cron at
fire time hard-validates: the configured instance must exist AND
have `status='connected'`, otherwise skip + in-app fallback.

**Rationale:** "preparing the row before the Evolution instance is
up" is a real workflow. Hard validation at write time would force
admin to create the Evolution instance first, then the routing
row second — backward and brittle. The cron's hard validation
provides defence-in-depth without blocking config prep.

### 4. `is_active` defaults FALSE (Q-R-3)

The DB column default is `false`; the form's initial state matches
(`useState(false)`). Admin must explicitly opt-in to activation by
toggling the Switch ON before saving (or after). The Reviewer
agent caught the original Implementer's `useState(true)` violation
of this rule before push — orchestra mode value demonstrated.

**Rationale:** "safe by default" — a new row doesn't immediately
start routing real reminders. Admin can prepare a row for an
agent who's about to be onboarded without triggering the cron
prematurely.

### 5. Relaxed phone validation, v1 (Q-R-4)

`recipient_phone` accepts any non-empty trimmed string at API +
UI level. No E.164 regex, no country-code enforcement.

**Rationale:** Pyramedia is UAE-primary; the v1 surface is
admin-only — admin can self-correct typos during manual routing
setup. The displayed value in the row list is the digits-only
stored value (NO leading `+`) to prevent copy-paste-into-Edit
corruption (Reviewer caught this). v1.1 backlog includes the
regex upgrade.

### 6. Empty-state guidance, no proactive warning banner (Q-R-5)

When the settings table is empty, the UI shows an EmptyState that
prompts admin to add the first row. When an agent has follow-ups
but no active routing row, v1 does NOT surface a proactive
warning banner — the cron's per-row `console.warn` is the only
signal. v1.1 backlog includes the warning banner.

**Rationale:** v1 is admin-only and the population is small (~2
sales agents). Adding a proactive warning before there's
meaningful data to warn against is over-engineering.

### 7. `settings.{view,manage}` permission gates (Q-R-7)

GET uses `settings.view` (read-only inspection allowed for any
admin role). POST/PATCH/DELETE use `settings.manage` (write
operations admin-only). Reuses the existing `settings.*`
permission scope rather than adding a new
`agent_whatsapp_settings.manage`.

**Rationale:** sales_agents shouldn't self-configure their own
routing — that would let them silently route their boss's
reminders elsewhere. Admin-only is the right scope.

### Implementation invariants (locked, do NOT regress)

- **Two-step cron lookup is the contract.** Step 1: settings table
  → `(sender_instance_name, recipient_phone)` filtered by
  `is_active=true`. Step 2: `pyra_whatsapp_instances` →
  `status='connected'` check filtered by the configured
  `instance_name`. Both must succeed for a WA send. Any future
  cron-routing change goes through this two-step shape.

- **The settings layer is canonical for routing;
  `pyra_whatsapp_instances` is canonical for Evolution-API
  wiring.** Don't conflate. Don't add agent-routing fields to
  `pyra_whatsapp_instances` (would re-introduce the silent-skip
  bug). Don't add Evolution-lifecycle fields to
  `pyra_agent_whatsapp_settings` (would dilute its single
  responsibility).

- **Trust boundary: `row.assigned_to` +
  `setting.sender_instance_name` are workspace-controlled values,
  not user input.** The cron takes both from prior parameterized
  SELECTs. UI POST/PATCH takes admin-input strings but
  `requireApiPermission('settings.manage')` gates the write. No
  raw SQL concat anywhere; all Supabase calls use parameterized
  `.eq()`.

- **Graceful degradation: every skip path falls through to the
  in-app `notify()` + `whatsapp_reminder_sent=true` flip.** No
  early returns / continues inside the per-row try block. The
  outer try/catch protects loop continuity on per-row throws.

- **Idempotency: `whatsapp_reminder_sent = true` flips on EVERY
  path** — success, no setting, instance offline, no phone, AND
  Evolution send failure. Documented at file top of
  `app/api/cron/follow-up-reminders/route.ts`. The trade-off
  ("flag set even though delivery failed") is intentional — the
  alternative ("don't flip on failure") risks message storms
  during Evolution flapping.

- **File split for new section components.** New settings
  sub-sections live in
  `components/settings/<feature>/{section,list,dialog}.tsx` —
  set during Commit 3 to start paying down the 1000+ LOC
  `settings-client.tsx` debt. v1.1 backlog includes extracting
  the existing inline subsections.

### Phase 11 Refinement v1.1 backlog

- [ ] `usePermission` loading-state flicker — admin sees write
  actions briefly hidden on settings page load. Requires
  distinguishing 'loading' from 'no permission' in hook return
  shape; touches all settings sections.
- [ ] Extract existing `settings-client.tsx` inline subsections
  (`ApiKeysSection`, `ModuleSettingsTab`) to
  `components/settings/<feature>/` directories matching the new
  pattern.
- [ ] Combobox-with-status-badge for instance dropdown — replace
  HTML5 datalist (plain-text only) with Popover + Command
  Combobox that renders status badges inline.
- [ ] E.164 regex validation for `recipient_phone` — fast feedback
  on bad input.
- [ ] Warning banner: "agent has follow-ups but no active
  setting" — surface at top of Settings tab and/or My Work Inbox.
- [ ] Sayed personal WhatsApp number setup — operational task to
  enable end-to-end live verification of follow-up reminder WA
  delivery.

## CRM Phase 11.5 — Locked Decisions

These are **intentional, documented deviations** from the
pre-Phase 11.5 design, locked during Phase 11.5 closure. **Do NOT
re-litigate.** Phase 11.5 adds the "ربط بعميل موجود" admin UI for
linking a `pyra_sales_leads` row to an existing `pyra_clients` row
(the workflow previously handled by SQL manual intervention — the
Dr. Ahmed Mamoun precedent at activity `la_5a8173108128e943`).

### 1. Hide button when already linked — no "تغيير الربط" UX in v1 (Q1)

When `lead.client_id !== null`, the "ربط بعميل موجود" button is
hidden entirely. There is no in-UI re-link / unlink flow. Admin
SQL-manual remains the escape hatch for the rare correction case.

**Rationale:** simplicity + safety. Re-linking is rare; the cost
of UI complexity (a "تغيير" button + an unlink confirmation
dialog) outweighs the benefit for a 2-user team. v1.1 backlog
includes the unlink mechanism if usage demands it.

### 2. GET response extended with `client_name` (one round trip) (Q2)

`GET /api/crm/leads/[id]` now performs a secondary fetch on
`pyra_clients` when `lead.client_id` is set, and returns
`lead.client_name` in the response. The UI renders the
"مرتبط بـ {client_name}" badge from this single response — no
second `useClient()` hook call, no badge-loading flicker.

**Rationale:** one round trip beats two. Cost: ~5 LOC of
conditional SELECT in the route handler; skipped entirely when
`client_id` is null.

### 3. Permission = `leads.update` + `canAccessLead()` (Q3)

The endpoint uses the two-step gate matching the PATCH lead route,
NOT the heavier `leads.manage` that convert-to-customer uses.

**Rationale:** linking is a lighter operation than conversion
(no new `pyra_clients` row created). Sales agents should be able
to link their own leads to existing customers as part of their
day-to-day pipeline workflow. `canAccessLead()` already scopes
agents to their own leads.

### 4. Activity log shape preserves spec consistency (Q4)

The `pyra_lead_activities` insert uses:

- `activity_type = 'field_updated'` (reuse, no new constant —
  the existing timeline renderer at `activity-item.tsx:93-95`
  auto-produces the Arabic title from `metadata.field`)
- `metadata.field = 'client_id'`
- `metadata.source = 'manual_link_via_ui'` (distinguishes UI
  events from the manual fix's `manual_link_pre_phase_11_5`)
- `metadata.client_id` + `metadata.lead_stage_at_link`

**Rationale:** reuse over invention. The existing timeline
machinery handles `field_updated` activities; introducing a new
type would require new label entries, new variant config, and
new audit query patterns for negligible benefit.

### 5. No name correction in v1 modal (Q5)

The modal is single-purpose: client search + select + confirm.
Name correction is NOT bundled in. Admin uses the existing lead
edit (PATCH) flow if a name differs at link time.

**Rationale:** keeps Phase 11.5 surgical (~1 hour total scope).
Bundling name correction would add modal complexity + decision
points that the v1 user (admin) doesn't need.

### Architectural principle: action_type vs metadata.source

**LOCKED Phase 11.5.** When writing to `pyra_activity_log` via
`logActivity()`:

- `action_type` parameter — ALWAYS use the
  `` `${ENTITY_TYPES.X}_${ACTIVITY_ACTIONS.Y}` `` pattern, where
  both halves come from the constants exported in
  `lib/api/activity.ts`. Examples: `'lead_update'`,
  `'invoice_create'`, `'expense_approve'`.
- Specificity — when an action category has multiple "flavours"
  (e.g. PATCH-lead vs link-client are both `lead_update`), the
  specific flavour goes in `metadata.source` (free-form string).
  Example: `metadata.source = 'manual_link_via_ui'`.
- Reasoning — `action_type` is "what category of action";
  `metadata.source` is "what flavour".

**Why this pattern:**

1. **Type safety.** Constants are TypeScript-checked; hardcoded
   strings like `'lead_linked_to_client'` are typo-vulnerable.
2. **Analytics simplicity.** Queries like "all lead updates in
   period N" stay simple with a generic `action_type`. Drift to
   specific strings makes audit dashboards painful.
3. **Pattern consistency.** Once a codebase has constants in
   place, bypassing them for "self-documenting strings" is a
   slippery slope — every new flavour could justify its own
   specific string, gradually eroding the constant system.
4. **Specificity isn't lost.** `metadata.source` carries the
   exact flavour, and `details` carries the full context. The
   audit-log reader sees both `action_type` (for filtering) and
   the metadata (for understanding the specific event).

This principle was discovered during Phase 11.5 orchestra review:
Implementer A initially used a specific `'lead_linked_to_client'`
string; Reviewer flagged the pattern violation; Lead Architect
initially rejected the flag (favoring audit specificity); user
override revealed the architectural insight that constants +
metadata.source give us both properties (consistency AND
specificity) without trade-off.

**Applies to:** all future `logActivity()` calls. Existing
violations (e.g. any pre-Phase-11.5 code that used specific
strings) are v1.1 backlog cleanup, not blocking.

### Phase 11.5 v1.1 backlog

- [ ] **Unlink mechanism** — admin UI to detach a lead from its
  current client. Deferred per Q1; admin SQL-manual is the
  escape hatch until usage demands it.
- [ ] **Bulk link from leads list** — multi-select leads + assign
  to a single client. Deferred (low volume in v1).
- [ ] **Auto-suggest based on phone match** — when opening the
  modal, pre-select likely matches based on `lead.phone` vs
  `pyra_clients.phone` similarity. Quality-of-life improvement.
- [ ] **Audit-log action_type cleanup** — sweep existing
  `logActivity()` call sites for hardcoded strings that don't
  follow the `${ENTITY_TYPES}_${ACTIVITY_ACTIONS}` pattern.
  Migrate to constants + metadata.source.

## CRM Phase 10 — Locked Decisions

These are **intentional, documented design choices** locked during
Phase 10 closure (Mobile PWA Polish). **Do NOT re-litigate.** Future
sessions adding mobile surfaces or PWA features should defer to the
decisions recorded here.

### 1. Mobile stage picker uses bottom Sheet (Q-UI-001)

The deferred Phase 7 Chunk 4 "نقل المرحلة" button now opens a
shadcn Sheet primitive (`side="bottom"`) rather than a Combobox,
Select, or inline expand. Reuses `MoveStageConfirmModal`, the
closed_won guard, and `useMoveLeadStage` mutation — zero
modifications to any of those.

**Rationale:** Sheet primitive already in the codebase; bottom-slide
is the native mobile pattern; the closed_won + contract_signed +
closed_lost gating in `pipeline-client.tsx`'s `handleDropChangeStage`
applies to both desktop drag AND mobile sheet via the shared callback
chain.

### 2. Per-card useState for sheet open (no prop drilling)

`<PipelineCard>` owns its own `[sheetOpen, setSheetOpen] =
useState(false)`. The state is NOT lifted to a parent
(`PipelineBoard` or `pipeline-client`) and prop-drilled down. Each
card manages its own sheet instance.

**Rationale:** locked Phase 7 Chunk 3 architecture. Lifting would
require either an active-card-id state or a `Map<leadId, boolean>`;
both add complexity without UX benefit.

### 3. `useMoveLeadStageWithToasts` hook extraction

The toast-wrapped wrapper around `useMoveLeadStage` was extracted
from `pipeline-client.tsx` (~88 LOC) into a named hook in
`hooks/useLeads.ts`. Both desktop drag-drop AND the mobile stage
sheet consume the same hook — single source of truth for the 5
success variants + 4 error variants (403, 409/410, 422+message,
422 generic, fallback).

**Rationale:** the pattern locked Phase 11.5 (no prop drilling +
single source of truth for shared logic). Each consumer calls the
hook via the existing callback chain — no shared mutation state
across components.

### 4. Mobile sidebar uses Sheet with `side="right"`

`<LeadSidebar>` on max-md is wrapped in a Sheet with `side="right"`.
In `dir="rtl"`, `side="right"` maps to `inset-y-0 end-0` which
anchors the sheet at the VISUAL LEFT side of the viewport —
matching the existing desktop sidebar position (CSS Grid under
`dir="rtl"` flips column visual order, putting
`grid-cols-[1fr_22rem]`'s column 2 / LeadSidebar at visual LEFT).

**Rationale:** consistency between desktop and mobile sidebar
position. `ChevronLeft` on the trigger button = visual forward
arrow in RTL (text flows right-to-left, so "expand forward"
semantic = pointing visually leftward).

### 5. `ACCENT_DOT` in `lib/constants/pipeline-colors.ts`

Visual constants (e.g., the stage-accent color palette) live in
`lib/constants/pipeline-colors.ts`, NOT inline in UI components. UI
imports from constants — never the other way around.

**Rationale:** matches the Phase 11.5 action_type architectural
principle (constants belong in `lib/constants/`, not parked in UI
components for "smaller blast radius"). Layering correctness:
avoids the silent-drift anti-pattern of "copy inline with sync
comment".

### 6. PWA: explicit `STATIC_CACHE` lookup for `/offline` fallback

The service worker's offline-fallback path uses
`caches.open(STATIC_CACHE).then(c => c.match('/offline'))` rather
than the unqualified `caches.match('/offline')`. The unqualified
call scans all caches in implementation-defined order — could
serve a stale empty entry from `CACHE_NAME` before reaching
`STATIC_CACHE`.

**Rationale:** defensive coding for a load-bearing fallback path.
Pre-existing bug made load-bearing by Phase 10 Commit 3 (the new
`/offline` page is the precached fallback target).

### 7. Touch target minimum: `h-11` (44px) on mobile

All interactive trigger elements (buttons, select triggers,
inputs) on mobile-visible surfaces use `h-11` (44px). shadcn's
defaults are `h-10` (40px) for Input/SelectTrigger and `h-9`
(36px) for `Button size="sm"`.

**Rationale:** WCAG 2.5.5 Level AAA + Apple HIG minimum tap target
size. Bumping from `h-10` to `h-11` is +4px (one Tailwind unit) —
visual delta is negligible on desktop, gain is material on touch.

### Implementation invariants (locked, do NOT regress)

- **Phase 7 Chunk 3 architecture invariants** (drag-overlay 3-tier
  split, `opacity-0 pointer-events-none` source, `pointerWithin`
  collision detection, single `useDraggable` per `lead.id`) are
  preserved verbatim through Phase 10 Commit 1. Mobile stage
  picker added zero new `useDraggable` calls.

- **`md:hidden` / `hidden md:block` gating pattern** for
  desktop-vs-mobile splits is the only acceptable approach. Don't
  conditionally render based on a `useIsDesktop()` hook in places
  where Tailwind's responsive classes suffice — saves a hydration
  flicker.

- **Sheet primitive (`components/ui/sheet.tsx`) is the workspace
  standard for any slide-out / bottom-sheet UX on mobile.** Don't
  hand-roll. The primitive provides Portal, focus trap, ESC,
  backdrop, animations, and ARIA out of the box.

- **`/offline` is a Server Component (no `'use client'`, no
  hooks).** The whole point of the SW fallback is that JS may not
  be available — the page must render from static HTML.

### Phase 10 v1.1 backlog

See `CRM-PROGRESS.md` → "## CRM Phase 10" → "### v1.1 backlog (8
items)" for the actionable list. Highlights:
- PWA icon PNG upload (operational, awaiting Abdou)
- next-pwa plugin migration
- Push notifications via SW
- Dashboard widget per-component mobile audit
- Code-split heavy charts via `dynamic()`
- Per-chip × removal on FilterBar chip strip
- Vertical compactness on 375px admin filter bar
- Visual verification on real device for Commit 2 RTL choices

## CRM Phase 12 — Locked Decisions

These are **intentional, documented design choices** locked during
Phase 12 closure (Old Sales Module Sunset). **Do NOT re-litigate.**
Future sessions encountering legacy `/dashboard/sales/*` references
should defer to the decisions recorded here.

### 1. Five routes REDIRECTed (page files deleted, middleware 307)

The 5 `/dashboard/sales/*` routes that had direct CRM equivalents
were sunset in Phase 12:
- `/dashboard/sales` (bare root) → `/dashboard/crm`
- `/dashboard/sales/leads` → `/dashboard/crm/pipeline`
- `/dashboard/sales/leads/[id]` → `/dashboard/crm/leads/[id]`
- `/dashboard/sales/follow-ups` → `/dashboard/crm/follow-ups`
- `/dashboard/sales/reports` → `/dashboard/crm`

Their page.tsx files were deleted in Commit 2 (`272619d`). The
middleware `CRM_REDIRECTS` table (lines 15-23 of `middleware.ts`)
fires 307 redirects BEFORE Next.js attempts page rendering — so old
bookmarks, deep links, and historical notification target_paths all
work transparently.

**Rationale:** complete sunset. The CRM module is feature-complete
and serves as the canonical destination for these surfaces.

### 2. Five routes PROTECTED (intentionally preserved)

The 5 `/dashboard/sales/*` routes WITHOUT a CRM equivalent stay:
- `/dashboard/sales/chat` — WhatsApp shared inbox (real-time
  messaging, conversation routing, CSAT, SLA — orthogonal to CRM
  lead management)
- `/dashboard/sales/whatsapp-analytics` — CSAT + SLA dashboards
- `/dashboard/sales/whatsapp-campaigns` — bulk WA campaign manager
- `/dashboard/sales/approvals` — `pyra_quote_approvals` workflow
  (CATEGORICALLY DIFFERENT from `/dashboard/crm/approvals` which is
  the lead closed-won pipeline approval workflow)
- `/dashboard/sales/settings` — pipeline stage management,
  WhatsApp instance wiring, canned responses, SLA policies. FOLD
  to `/dashboard/crm/settings` is v1.1 backlog (design-heavy).

**Rationale:** these surfaces are genuinely distinct from
CRM-specific routes. Deleting them would lose user-facing
functionality with no migration path.

### 3. Email URL bypass-middleware risk

`lib/email/notify.ts:368` builds external email links that mail
clients follow directly to the origin — **middleware is NOT
involved**. Phase 12 Commit 1 updated this URL from
`/dashboard/sales/leads/<id>` to `/dashboard/crm/leads/<id>`. Any
future code that builds external (email / SMS / WhatsApp) URLs must
hit the new CRM paths directly — NOT rely on middleware redirects.

**Invariant:** when building URLs for delivery outside the app
(emails, SMS, WhatsApp message bodies, PDF download links, etc.),
always use the canonical CRM path. Middleware-redirect-as-cleanup is
only safe for in-app navigation.

### 4. `sales.*` permissions intentionally preserved

`lib/auth/rbac.ts` still declares the legacy `sales.*`,
`sales_leads.*`, `sales_whatsapp.*`, `quote_approvals.*` permissions.
These gate the 5 PROTECTED routes' RBAC. Per Q5 (Phase 12 plan), the
permission RENAMING was deferred to v1.1 — too many call sites
touched for a phase that's about sunset, not refactor.

**Rationale:** scope discipline. Phase 12 = sunset only. Renaming
permissions touches dozens of API routes + components + the
`buildUserPermissions` helper.

### 5. Module-guide collision-resolution pattern

`lib/config/module-guide.ts` and `app/dashboard/guide/page.tsx`
SECTIONS array had multiple entries that, after applying the strict
REDIRECT mapping, would have collided on the same target. Example:
`/dashboard/sales/reports` and `/dashboard/sales` (bare root) both
map to `/dashboard/crm`. The Implementer deduplicated by:
1. Keeping the more-specific entry (or the better description)
2. Merging keywords/tips from the dropped entry into the survivor

**Invariant:** future redirect-sunset work that collapses N URLs to
1 destination should dedup the module-guide registry the same way.

### 6. Audit-log target_path semantic upgrades

When updating `logActivity()` target_path values from `/dashboard/
sales/<bare>` to a REDIRECT mapping, the Implementer was permitted
to choose a MORE-SPECIFIC destination when one was contextually
correct. Examples (both accepted by Reviewer):
- `approvals/route.ts:20` → `/dashboard/sales/approvals` (the
  PROTECTED page the audit entry actually relates to)
- `follow-ups/route.ts:99` → `/dashboard/crm/follow-ups` (specific
  destination > generic dashboard root)

**Invariant:** audit-log destinations should point at the canonical
page for the action, not the generic dashboard root. When a
PROTECTED page is the canonical destination, point at it directly
(audit logs aren't subject to middleware redirects anyway — they're
internal click-throughs).

## CRM Phase 13 — Locked Decisions

These are **intentional, documented design choices** locked during
Phase 13 closure (Visual Polish — the final CRM phase). **Do NOT
re-litigate.** Future visual work should defer to the decisions
recorded here.

### 1. EmptyState scope: full-page contexts only

`<EmptyState>` from `@/components/ui/empty-state` is calibrated for
**full-page** or **full-tab** empty states. It renders an 80px icon
ring with blur backdrop + `text-lg font-semibold` title + `py-16`
default padding — a deliberately substantial visual unit.

**Compact contexts (sidebar slots, narrow card stacks) use an
inline stub** instead — the pattern matching the surrounding cards.
For sidebar slots specifically, the canonical inline-stub shape is:

```tsx
<Card className="p-4 space-y-2">
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-semibold">{title}</h3>
    <Icon className="size-4 text-muted-foreground" aria-hidden />
  </div>
  <p className="text-xs text-muted-foreground">{copy}</p>
</Card>
```

**Rationale:** EmptyState's full-page visual hierarchy dominates a
compact sidebar; forcing it produces visual mismatch. A
`size="compact"` variant of EmptyState is v1.1 backlog — until then,
sidebar contexts inline.

This decision was surfaced by the Reviewer agent in Phase 13 Commit
2 (CONDITIONAL PASS finding); applied per the orchestra-deviation
pattern established in Phase 11.5 + Phase 12.

### 2. User-facing language: no developer-internal references

**NEVER** ship production UI with "Phase X" / "قيد البناء" / "TODO" /
"Coming in v2" / "in progress" / similar developer-internal text.

**DO use:** "قريباً" (coming soon) or "قريباً في v1.1" (coming in
v1.1) when honest about a feature being deferred.

**Rationale:** Phase numbers + developer language leak internal
process to users. The Tags sidebar card showed "إدارة العلامات —
قيد البناء (Phase 6)" through Phases 6-12 — a developer-facing
placeholder that survived 6 phases without anyone catching it.
Phase 13 Q-001a removed it.

### 3. Gradient subtlety standard

**Customer/feature card overlays** use low-opacity warm gradient:
`bg-gradient-to-br from-orange-500/5 via-amber-500/[0.03] to-transparent`.
Implemented as an absolute `pointer-events-none aria-hidden` layer
inside a `relative overflow-hidden` parent, with content positioned
via `relative` to sit above.

**Bold gradients** (e.g., the lead-header's mobile
`from-zinc-900 to-zinc-800` hero) are reserved for **hero/avatar
contexts** where visual prominence is desired.

**Rationale:** Phase 9 Q-C2 deferred the customer-header gradient
to Phase 13; the chosen palette is brand-aware without competing
with KPI cards + health-ring rendered below. Subtlety at 5%/3%
opacity blends in both light and dark modes.

### 4. Non-link card hover: bg-based, not border-based

**Non-link interactive cards** (rows with buttons inside, not
wrapped in a `<Link>` or `<a>`) use:

```tsx
className="... hover:bg-muted/30 transition-colors"
```

**Link cards** (entire card area is navigable, wrapped in `<Link>`)
use:

```tsx
className="... hover:border-orange-300 dark:hover:border-orange-700/60 hover:shadow-sm transition-all"
```

**Rationale:** the bg-based pattern matches workspace conventions
(`StatementTable`, `version-history`, `data-table` rows). The
border-based pattern matches pipeline-card / action-card. Both are
correct in their respective contexts; mixing them creates
inconsistency.

Verified by Reviewer in Phase 13 Commit 2 (Q-003a follow-up row
hover).

## Phase 15.1 — Locked Decisions

These are **intentional, documented design choices** locked during
Phase 15.1 closure (Team Collaboration). **Do NOT re-litigate.**
Phase 15.1 covers 6 ship commits: (1) @-mentions in lead activity
timeline + DOM-based highlight UX; (2) lead-attached tasks (new
`pyra_lead_tasks` table); (3) lead tasks UI tab + my-tasks source
discrimination; (4) calendar events unified feed API; (5) calendar
UI (4 views) + follow-up highlight handler; (6) dashboard calendar
widget.

### 1. Lead activity highlight pattern is the canonical deep-link UX

Commit 1 established the highlight pattern; Commit 5 re-used it
verbatim for follow-ups. Any future deep-link surface (mentions on
new entity types, scroll-to-row from notifications, etc.) MUST
mirror this exact shape:

```ts
const idParam = sp.get('highlight');  // or domain-specific
useEffect(() => {
  if (!idParam) return;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let targetEl: HTMLElement | null = null;
  const FLASH_CLASSES = ['ring-2', 'ring-orange-400', 'ring-offset-2', 'rounded-lg'];
  const raf = requestAnimationFrame(() => {
    targetEl = document.querySelector<HTMLElement>(
      `[data-X-id="${CSS.escape(idParam)}"]`,
    );
    if (!targetEl) return;
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetEl.classList.add(...FLASH_CLASSES);
    timer = setTimeout(() => targetEl?.classList.remove(...FLASH_CLASSES), 2000);
  });
  return () => {
    cancelAnimationFrame(raf);
    if (timer !== null) clearTimeout(timer);
    targetEl?.classList.remove(...FLASH_CLASSES);
  };
}, [idParam, /* data-loaded dep */]);
```

**Invariants:**
- `data-X-id` attribute uses a namespace prefix (`data-activity-id`,
  `data-followup-id`) so multiple highlight contexts on the same page
  don't collide.
- `CSS.escape()` is mandatory — defense against malicious IDs (basic
  hygiene; nanoid IDs don't need it but external IDs might).
- Cleanup function MUST run all 3 ops: `cancelAnimationFrame` +
  `clearTimeout` + `classList.remove`. Skipping any one leaks state
  on unmount or hot-reload.
- Effect deps include the loaded-data signal (e.g. `q.isLoading` or
  the array reference) — querySelector before render = silent no-op.
- Graceful no-op when target isn't in the DOM (e.g. limit:1 list and
  the targeted item is older) — log nothing, just skip. The user
  still landed on the correct page; that's the better-than-nothing
  fallback.

### 2. Lead tasks live in `pyra_lead_tasks` — NOT a reuse of `pyra_tasks`

Commit 2 lock Q2 = (c) — a new dedicated table, NOT a reuse of board
tasks. Rationale: lead lifecycle is independent from project boards;
forcing leads to live on a board would either require N hidden boards
or bloat board columns with mixed lead+project work.

Permission model (LOCKED):
- GET   `leads.view`   + `canAccessLead()`
- POST  `leads.update` + `canAccessLead()`
- PATCH `leads.update` + `canAccessLead()` + cross-resource guard
- DELETE `leads.update` + `canAccessLead()` + (admin OR creator)

**Per-lead resource pattern (Phase 15.1 + Phase 15.2 inheritance):**
the cross-resource guard via double-eq (`WHERE id = childId AND
parent_id = parentId`) is the standard for any per-lead sub-resource
mutation. Future per-lead resources (tags when implemented, notes-as-
resource if extracted) MUST follow this pattern. DO NOT invent new
permission scopes — reuse `leads.update`.

### 3. Calendar is a derived projection, NOT a new source of truth

`/api/calendar/events` (Commit 4) is **read-only**. It aggregates 3
existing sources (`pyra_lead_tasks` + `pyra_sales_follow_ups` +
`pyra_lead_activities` with `activity_type='meeting_scheduled'`).
NO writes via this endpoint — edits go through the source-specific
endpoints.

**Future "manual calendar events" feature (v1.1 backlog) requires a
NEW table** (`pyra_calendar_events`) — DO NOT shoehorn into the
existing projection. The projection's value is that it has no
state to manage; adding write-capability would re-introduce all the
complexity (status, ownership, validation) that the source-specific
endpoints already handle.

### 4. `dubaiDayKey()` is MANDATORY for "today in Dubai" comparisons

`.toISOString().slice(0, 10)` returns the **UTC** day, which differs
from the **Dubai** day for the last 4 hours of every Dubai day
(Dubai 20:00–23:59 = UTC 16:00–19:59 same day; Dubai 00:00–03:59
NEXT day = UTC 20:00–23:59 same day). For a Dubai user at 23:30,
`.toISOString().slice(0,10)` returns tomorrow's date — the "today"
highlight, the today bucket, and the today-key route param ALL go
wrong.

Phase 15.1 Commit 5 HIGH 1 surfaced this. Fix: `dubaiDayKey(date?)`
helper in `lib/utils/format.ts` — pure offset math (Dubai = UTC+4,
no DST):

```ts
export function dubaiDayKey(d: Date = new Date()): string {
  const utcMs = d.getTime();
  const dubaiMs = utcMs + 4 * 60 * 60 * 1000;
  const dubai = new Date(dubaiMs);
  return `${dubai.getUTCFullYear()}-${
    String(dubai.getUTCMonth() + 1).padStart(2, '0')
  }-${String(dubai.getUTCDate()).padStart(2, '0')}`;
}
```

**Rule:** any component that derives a YYYY-MM-DD key for comparison
against the API's Dubai-offset ISO strings (`event.start` format)
MUST use `dubaiDayKey`. Code review focus area: grep for
`.toISOString().slice(0, 10)` as a regression smell — this regressed
once already (Commit 6 review caught it didn't, but verified by
inspection; same Reviewer focus area used in Commits 7+).

Sister helper from Commit 4: `toDubaiIso(input)` for converting
UTC datetimes TO Dubai-offset ISO strings. Same pure-offset math,
different output shape (full ISO with `+04:00` vs date-only key).

### 5. URL state persistence pattern for multi-view UIs

Calendar (Commit 5) is the v1 reference implementation for any UI
that has multiple "views" or "modes" the user switches between with
meaningful state per view. Pattern:

```ts
const sp = useSearchParams();
const view = parseView(sp.get('view'), defaultView);
const date = parseDate(sp.get('date'));
const types = parseTypes(sp.get('types'));

const updateUrl = useCallback((patch) => {
  const params = new URLSearchParams(sp.toString());
  // ... patch handling ...
  router.replace(qs ? `?${qs}` : '?', { scroll: false });
}, [router, sp]);
```

**Invariants:**
- `router.replace`, NOT `router.push` — back/forward navigation
  should not record every filter toggle as a history entry.
- `scroll: false` — URL change should not jump to top.
- **Defaults NOT serialized to URL** (e.g. `date=today` → empty
  params, NOT `?date=2026-05-16`). Cleaner shareable URLs.
- **EXCEPT for fields whose default can DYNAMICALLY change**
  (Commit 5 Reviewer MEDIUM fix): the calendar's `mobileDefault`
  flips between `agenda` (mobile) and `month` (desktop) on
  viewport rotation. If `view` were deleted-when-equal-to-
  mobileDefault, rotating to desktop with a `?view=agenda`
  bookmark would silently swap to month. Fix: ALWAYS serialize
  view to URL once explicitly chosen.

Future multi-view UIs (e.g. Pipeline with view=kanban|table,
Reports with view=summary|detailed) MUST follow this pattern —
back/forward + share-URL + refresh-preserves-state.

### 6. Section-header-as-link affordance pattern

Dashboard widget (Commit 6) demonstrates this:

```tsx
<Link
  href={destinationHref}
  className="group flex items-center justify-between rounded-lg
             px-2 py-1.5 hover:bg-muted/50 transition-colors
             cursor-pointer"
  aria-label={`افتح التقويم على ${title}`}
>
  <div className="flex items-center gap-2">
    <Icon className={tone} />
    <span className={`text-sm font-semibold ${tone}`}>{title}</span>
    <Badge count={count} tone={tone} />
  </div>
  <ArrowUpRight
    className="h-3 w-3 text-muted-foreground opacity-0
               group-hover:opacity-100 transition-opacity rtl:rotate-90"
    aria-hidden
  />
</Link>
```

**Rule:** any widget header that navigates to a destination context
(not just an informational label) MUST surface clickability with:
- Whole-row click target (NOT just the text)
- `cursor-pointer` (redundant on `<a>` but explicit-is-fine)
- `hover:bg-muted/50` transition for visible affordance
- ArrowUpRight (or similar directional icon) appearing on hover
  via `opacity-0 group-hover:opacity-100 transition-opacity`
- ARIA label naming the destination

DO NOT render a bare `<div>` with click handler — keyboard-nav +
screen-reader users get nothing.

`<Link>` vs `<button>` is acceptable per LOCK ("buttons/anchors"
wording) — anchors are right when click navigates; buttons are
right when click triggers in-place state change.

### 7. RTL chevron icons use `rtl:rotate-180`

Workspace convention (verified via `components/layout/breadcrumb.tsx:106`):
LTR-semantic icon names (ChevronLeft = previous = visually left in
LTR) + `rtl:rotate-180` Tailwind utility for visual mirroring.

```tsx
{/* prev button — points visually rightward in RTL (= back in
    Arabic reading flow) via rtl:rotate-180 */}
<ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />

{/* next button — points visually leftward in RTL (= forward) */}
<ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
```

Phase 15.1 Commit 5 HIGH 2 surfaced this — calendar toolbar
initially used inverted icons (ChevronRight for prev, ChevronLeft
for next) WITHOUT the utility, expecting the SVG paths to "auto-
mirror" in RTL. SVGs don't auto-mirror; the utility is required.

**Rule:** any directional navigation icon (prev/next, expand/
collapse, scroll-up/down) MUST follow the LTR-semantic + `rtl:`
utility pattern. Don't try to "pre-compensate" by swapping the
icon name — fragile + breaks if the page ever renders LTR.

### 8. `logActivity()` action_type discipline (Phase 11.5 inheritance)

Phase 11.5 locked: `action_type = ${ENTITY_TYPES.X}_${ACTIVITY_ACTIONS.Y}`
+ specificity in `metadata.source`. Phase 15.1 Commits 2 + 3 follow
this for lead tasks:

```ts
// task created
logActivity(..., `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
  `/dashboard/crm/leads/${leadId}?tab=tasks`,
  { lead_id: leadId, source: 'task_created', task_id: taskId, ... });

// task status changed
logActivity(..., `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
  `/dashboard/crm/leads/${leadId}?tab=tasks`,
  { lead_id: leadId, source: 'task_status_changed', from_status, to_status, ... });
```

`pyra_lead_activities` (timeline) uses parallel discipline:
`activity_type='field_updated'` + `metadata.source` for specificity.
The existing timeline renderer at `activity-item.tsx:93-95` auto-
produces the Arabic title from `metadata.field`.

DO NOT introduce specific action_type strings like
`'lead_task_created'` directly. Phase 11.5 lock is in force; any new
flavour goes in `metadata.source`.

### Phase 15.1 v1.1 backlog

See `CRM-PROGRESS.md` → "## Phase 15.1" → "### Phase 15.1 v1.1
items" for the actionable list. Highlights: manual calendar events
table, drag-and-drop reschedule, email notifications for mentions,
generic standalone tasks, calendar event recurrence, minute-
precision week/day positioning, midnight-staleness fix for
MyCalendarWidget.

---

## Phase 15.2 — Locked Decisions

These are **intentional, documented design choices** locked during
Phase 15.2 closure (Mobile Experience Completion). **Do NOT
re-litigate.** Phase 15.2 covers Commit 1 (lead image attachments)
and Commit 2 (lead voice notes); Commit 3 (Push notifications) is
deferred to v1.1 pending the Q-B-004 iOS 16.4+ prerequisite check.

### 1. Lead attachments use existing `pyraai-workspace` bucket

NOT a new private bucket with signed URLs. Path:
`lead-attachments/{lead_id}/{ts}-{nanoid}.{ext}`. Public bucket +
obscure path is the v1 security model — matches existing workspace
pattern for invoices, contracts, WhatsApp media. v1.1 backlog: RLS
policies + signed URLs if security model evolves.

### 2. Client-side Canvas resize, not server-side `sharp`

`lib/utils/image-resize.ts`:
- `createImageBitmap(file)` → decodes any browser-supported format
  (including HEIC on iOS 13+)
- `drawImage` to `OffscreenCanvas` (with `HTMLCanvasElement`
  fallback)
- `toBlob('image/jpeg', 0.82)` → max 1920×1920 (downscale only —
  smaller images still re-encode to strip EXIF)

**EXIF stripped as side effect of Canvas re-encode** — Canvas does
NOT preserve image metadata. Zero new npm dependencies, smaller
upload bandwidth, runs on Sayed's iPhone where the resize matters
most. v1.1 may add server-side `sharp` for thumbnail generation if
needed.

### 3. Hard caps: 5MB per file + 10 per lead (combined)

Per-file: 5 MB after client resize (server enforces ceiling
defensively — malicious client could skip resize). Per-lead: 10
attachments TOTAL — images + voice notes share the same budget
(Q1(a) lock: mixed grid). Concurrent-upload race window
acknowledged: max overflow = (concurrent uploads - 1), accepted
for v1.

### 4. Voice notes share `LeadAttachmentsTab` (mixed grid)

Q1(a) lock: NOT a separate "voice notes" tab; NOT a sub-tab. Single
surface. Voice cells render with `Volume2` icon + duration badge.
Image cells unchanged. Clicking either opens the same Sheet detail
panel — branches on `file_type` for preview shape (`<img>` vs
`<audio controls>`).

**Tab key remained `files` for URL stability** — old `?tab=files`
bookmarks still land here. Label changed `الملفات` → `مرفقات`; icon
changed `FolderOpen` → `Paperclip`.

### 5. `useVoiceRecorder` is NEW, not extracted from `chat-input.tsx`

Q4(a) lock at Phase 15.2 Commit 2: pre-existing
`components/sales/chat/chat-input.tsx` voice recorder (the
WhatsApp shared inbox surface) remains UNTOUCHED. The new
`hooks/useVoiceRecorder.ts` is a parallel implementation with:

- 5-minute HARD CAP + auto-stop + 4:30 warning toast (chat-input
  has no cap)
- Returns a generic `{ blob, durationSeconds, mimeType, ext }` shape
  for any consumer (chat-input was tightly coupled to its own
  `processFile()`)
- Same MediaRecorder pattern: prefer `audio/webm`, fall back to
  `audio/mp4` on Safari/iOS
- MediaStream cleanup on unmount (no leaked iOS mic indicator)

v1.1 may consolidate if both surfaces converge on identical
requirements.

### 6. Native `<audio controls>` playback

Q5(a) lock: NO custom waveform player in v1. The detail Sheet's
audio preview uses the browser's native `<audio controls
preload="metadata">`. Zero JS, browser handles play/pause/seek.
v1.1 may add a WhatsApp-style waveform player.

### 7. Storage path is 100% server-controlled

No part of `file.name` ever flows into the storage path.
Extension comes from validated MIME via `MIME_TO_EXT` map, with
**hard-error on miss** (Reviewer-flagged defense at Commit 1
closure):

```ts
const canonicalExt = MIME_TO_EXT[file.type];
if (!canonicalExt) {
  logError({ error: new Error(`MIME_TO_EXT missing entry for ${file.type}`), ... });
  return apiServerError('خطأ داخلي في تحديد نوع الملف');
}
const storagePath = `lead-attachments/${leadId}/${Date.now()}-${generateId('img').slice(4)}${canonicalExt}`;
```

If a future MIME is added to `ALLOWED_*_MIME` without updating
`MIME_TO_EXT`, the upload aborts cleanly rather than silently
leaking user-supplied extension into the storage path. Defends the
"storage path is 100% server-controlled" invariant against future
maintenance drift.

### 8. SVG explicitly REJECTED

`ALLOWED_IMAGE_MIME` does NOT include `image/svg+xml`. SVGs can
carry `<script>` elements (XSS vector). Extension allowlist also
excludes `.svg`.

### 9. Delete permission: admin OR uploader (small-team safety)

Q-E6 lock: NOT uploader-only. Admin can also delete (admin override
for moderating colleague uploads). Sales agents CANNOT delete each
other's uploads on the same lead. Cross-lead deletion blocked via
double-eq guard (`.eq('id', attachmentId).eq('lead_id', leadId)`).

### 10. Activity dual-write (Phase 11.5 pattern preserved)

Each upload + delete writes BOTH:
- `pyra_lead_activities` row with `activity_type='attachment_added'`
  or `'attachment_removed'` (free-form lead timeline)
- `pyra_activity_log` row via `logActivity()` with `action_type =
  ${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}` and
  `metadata.source = 'attachment_added'` or `'attachment_removed'`
  (stable category + specific flavour per Phase 11.5 lock)

### Implementation invariants (locked, do NOT regress)

- **`canAccessLead` enforcement is identical** between image and
  voice upload paths — no divergence.
- **Both client and server enforce the 5-min voice cap.** Client
  auto-stops at 300s with 4:30 warning. Server rejects 422 if
  `duration_seconds > 300`.
- **`useUploadAttachment` accepts `UploadInput`**, not raw `File`.
  Caller passes `{ file, fileType?, durationSeconds? }`. Backwards
  compat: `fileType` defaults to `'image'`.
- **`useDeleteAttachment` uses `mutateAPI`**, NOT raw `fetch()` —
  per CLAUDE.md mandate. The FormData exemption applies only to
  `useUploadAttachment` (multipart needs browser-set Content-Type
  boundary).
- **No HEIC server-side decode in v1.** Client Canvas reads HEIC on
  iOS, re-encodes to JPEG. Desktop browsers that can't decode HEIC
  will fail the upload — accepted for v1 (target user is Sayed on
  iPhone).

### Q-B-004 iOS prerequisite for Push (v1.1 unblocker)

Phase 15.2 Commit 3 (Push notifications) is gated on **iOS 16.4+**
on Sayed's Safari (Apple's web push support shipped March 2023).
Workspace-side TODOs blocked behind that:
- VAPID key generation + storage
- `web-push` npm package
- Service worker `push` event listener in `public/sw.js`
- Permission UI ("Enable notifications" toggle)
- Push-subscription storage per user

See `CRM-PROGRESS.md` "Phase 15.2" section for full unblocker
procedure.

### Phase 15.2 v1.1 backlog

See `CRM-PROGRESS.md` → "Phase 15.2 v1.1 items" — Push notifications
(Commit 3), bucket RLS + signed URLs, server-side thumbnails,
orphan storage sweep cron, chat-input.tsx consolidation, custom
waveform player, shared duration constant, shadcn AlertDialog for
delete, HEIC server-side fallback, per-file size warning during
recording.

## CRM — Lead Reassignment UI (Locked Decisions, 2026-06-19)

Restored the lead-reassignment UI removed by the Phase 12 sunset (the deleted
`/dashboard/sales/leads` page had been the only bulk-assign surface; the bulk +
transfer API routes survived UI-less). Surfaced during the first multi-agent
migration. **Do NOT re-litigate.** Full arc in `CRM-PROGRESS.md`.

### 1. Two surfaces, both gated by `leads.assign` (admin-only)
- **Per-lead:** "تغيير المسؤول" on the lead-detail header → reuses CRM
  `PATCH /api/crm/leads/[id]` (`assignment_changed` activity + `lead_transferred`
  notify).
- **Bulk:** pipeline "تحديد متعدد" → `POST /api/dashboard/sales/leads/bulk`
  (≤50). Sales agents lack `leads.assign` so neither surface renders for them;
  the server also re-gates (bulk on `sales_leads.manage` + own-lead scope).

### 2. Bulk selection MUST NOT break the locked Phase 7 kanban
Selection mode disables drag by reusing the board's existing sensor kill-switch
(`MAX_SAFE_INTEGER` activation distance — the same mechanism mobile uses). The
selectable card variant is an EARLY RETURN before the locked draggable `<Link>`
path, so the default (non-selection) drag path is byte-identical, and
`useDraggable` is still called unconditionally (rules of hooks). Do NOT touch the
3-tier card split / single-`useDraggable`-per-lead / `pointerWithin` invariants.

### 3. `useLeadCapableUsers` — single source for reassignment targets
`hooks/useLeadCapableUsers.ts` returns `{ all, leadCapable }` from the shared
`['users','lite']` cache. `leadCapable` = `status==='active' && role ∈
{sales_agent, admin}`. BOTH the per-lead modal and the bulk bar use it — never
re-implement the filter inline. An inactive (departed) or non-lead-capable
(employee) target would re-orphan the lead under someone who can't open it.
`/api/users/lite` returns `status`+`role` (additive) to support this.

### 4. `notifyBatch` for N distinct notifications
`lib/notifications/notify.ts`: `notify` (1→1), `notifyMany` (same msg → many
recipients), `notifyBatch` (N DISTINCT notifications, one insert). Bulk reassign
uses `notifyBatch` to ping the new owner once per lead → A/B parity: single AND
bulk reassign both notify.

### 5. Supabase lazy-thenable — `void <builder>` NEVER executes (re-confirmed)
The bulk route shipped (pre-this-work) with three `void supabase…insert(…)`
calls lacking `.then()`/await — built but NEVER sent, so bulk reassign logged no
activity (caught by end-to-end DB verification; fixed `0f08bc8`). ALWAYS `await`
or `.then()` a Supabase query builder. Documented across many phases — the bulk
route was a missed instance. Grep smell: `void supabase` not followed by `.then(`.

### 6. Manual pg/query SQL writes need `PYTHONUTF8=1` on Windows
The pg/query helper pipes SQL through `python json.dumps`; Windows `python`
defaults stdin to cp1252, mojibake-ing multi-byte UTF-8 (Arabic) on insert. Use
`PYTHONUTF8=1` (or `PYTHONIOENCODING=utf-8`) and ALWAYS re-read after a manual
write to confirm encoding. Backfilled audit rows carry `backfill:true` +
`backfill_reason` so reconstructed rows are never mistaken for live-logged ones.

## CRM Audit Remediation — Locked Decisions (2026-07-02)

A comprehensive CRM audit (14 parallel finders → adversarial per-finding
verification → 48 confirmed findings) followed by a 4-batch fix effort merged to
`main` (`6aa8f79` Batch 1, `ac32e00` Batch 2, `bbd86a0` Batch 3+4). **Do NOT
re-litigate.** Full audit report (48 findings + remediation roadmap) at
`docs/CRM-AUDIT-2026-07-02.md`.

### 1. Lead soft-archive is the feature behind `leads.delete` (migration 030)
`pyra_sales_leads.archived_at` + `archived_by` (nullable) is a SOFT archive —
NOT a hard delete. `DELETE /api/crm/leads/[id]` (gate `leads.delete` +
`canAccessLead`; admin OR owner) sets/clears them; body `{ unarchive: true }`
restores. `GET /api/crm/leads` hides archived by default (`archived_at IS NULL`);
`?include_archived=true` shows both, `?archived=only` shows just archived. UI is
the lead-header archive/un-archive button + AlertDialog confirm + "مؤرشف" badge;
`useArchiveLead({ id, unarchive? })`. Archive is effectively admin-only in v1
(only admin holds `leads.delete` via `*`). Do NOT convert this to a hard delete.

### 2. `assigned_to` on create is gated by `leads.assign` (not just `leads.create`)
POST `/api/crm/leads` AND POST `/api/crm/follow-ups`: a caller-supplied
`assigned_to` that differs from the creator requires `leads.assign` AND the
target must pass `isAssignableUser` (exists + `status='active'`). Mirrors the
PATCH reassignment gate — closes the arbitrary-assignment / orphaning hole.
`isAssignableUser` lives in `lib/auth/lead-scope.ts` — use it, don't re-inline.

### 3. Reopen a closed_won lead → clear conversion state, KEEP the client link
`move-stage` reopen branch resets `is_converted=false`, `converted_at=null`,
`win_probability_overridden=false`, and recomputes `win_probability` from the
target stage — but does NOT touch `client_id` (the `pyra_clients` row/link is
preserved; user's locked choice). Without this the reopened deal stayed a
100%-won customer forever and froze win_probability recompute on every future move.

### 4. convert-to-customer: coalesce company + fatal-rollback on link failure
`company: lead.company || contactName` (pyra_clients.company is NOT NULL; a B2C
lead can be company-less → was a 500 that permanently blocked conversion). A
failed `lead.client_id` UPDATE is now FATAL: roll back the just-created client
row (+ Auth user) and 500, so a retry works cleanly (the old soft-warn left an
orphan client that made every retry 409). convert-to-customer + portal-access
also enforce own-lead scope on top of `leads.manage`.

### 5. Multi-currency: per-currency for actual money, dominant-label for projections
"Never sum across currencies." `formatCurrencyMap(map, fallbackCurrency)` in
`lib/utils/format.ts` renders one figure per currency. The **dossier** returns
`ltv_by_currency` / `mrr_by_currency` + a dominant `currency` (was hardcoded
'AED'); customer stat-strip + contracts-tab render per-currency. The **dashboard
kpis/funnel** (projections from `expected_value`) return a dominant `currency`
derived from the scoped leads and the UI labels with it instead of 'AED' — a
lighter fix because all production data is AED today (verified 2026-07-02: 221
leads / 3 contracts / 23 invoices, all AED). v1.1: full per-currency dashboard
maps once mixed-currency pipelines exist.

### 6. Dossier revenue = ALL invoices (contract-linked + standalone)
`/api/crm/customers/[lead_id]/dossier` unions invoices by `contract_id IN (...)`
OR `client_id = lead.client_id` (DB-deduped). LTV = sum of ALL payments; payment
health uses the full invoice set — a client paying only standalone invoices no
longer reads 0-revenue / at-risk. Health-score **recency** uses the true
most-recent activity (a dedicated `limit(1)` query with NO 30-day floor) so the
30-90d / >90d buckets are reachable — the windowed engagement query can't surface
an activity older than its 30-day window.

### 7. `is_converted IS NOT TRUE`, not `= false` (NULL-safe)
deals-at-risk, ai-insights, and lead-idle-check filter `.not('is_converted','is',
true)` — a bare `.eq('is_converted', false)` drops legacy NULL rows (migrations
010/011 treat NULL as not-converted), silently hiding active leads from the
surfaces. lead-idle-check also includes NULL-`stage_id` leads via
`.or('stage_id.is.null,stage_id.not.in.(...)')` and fails CLOSED on swallowed
activity/dedup/notif SELECT errors (was emitting false idle warnings).

### 8. Overdue follow-ups are a live not-done state
The check-due cron flips due-past `pending` → `overdue`. The CRM follow-ups list
default ("قيد الانتظار") now surfaces `pending`+`overdue` (they were vanishing);
an "متأخرة" chip narrows to overdue; overdue rows stay completable;
`next_follow_up` recompute includes overdue. Do NOT filter follow-ups on
`status='pending'` alone anywhere user-facing.

### 9. Dubai-day everywhere (Phase 15.1 lock re-applied)
activity-timeline day-dividers, contract-milestones overdue badge, ai-insights
"today" window, and the idle-summary entity id all use `dubaiDayKey()` — never a
raw `.toISOString().slice(0,10)` for a "today in Dubai" comparison.

### 10. Legacy `/api/dashboard/sales/*` routes stay (WhatsApp chat still uses them)
The WhatsApp chat create-lead + schedule-followup dialogs are LIVE and still hit
`/api/dashboard/sales/leads` + `/follow-ups`. Their `void <supabase-builder>`
lazy-thenables (activity / audit / notification / `next_follow_up` / score never
persisted) were fixed IN PLACE (await + `notify()` + `logActivity()`), NOT
migrated — decision to stop the data loss without touching the chat UI. The
orphaned legacy `/convert` route was fixed to not-always-500 (dropped the
non-existent `notes` column + added the NOT NULL client fields).

### 11. Attachment integrity + storage-path secrecy
Attachment GET/POST strip `storage_path` (private-bucket path never leaves the
server). DELETE deletes the DB row FIRST, then best-effort storage remove (a
failed remove leaves a harmless orphan file, not a broken row → broken image
cell). move-stage contract/invoice attachment is scoped to the lead/client
(rejects a foreign "signed proof").

### Deferred (documented, NOT done)
- **Pipeline keyboard-drag a11y** — a `KeyboardSensor` needs `closestCenter`
  collision, which conflicts with the LOCKED `pointerWithin` kanban invariant
  (Phase 7). Needs a dedicated approved design (or a focusable desktop
  stage-picker that doesn't touch the drag machinery). Do NOT add a KeyboardSensor
  to the existing `pointerWithin` board.
- **Full per-currency dashboard maps** — deferred until mixed-currency pipelines
  exist (all-AED today).

### CRM Audit v1.1 backlog
- Team-performance per-agent scoping — only needed if `crm_reports.team_view` is
  ever granted to a non-admin (admin-only today).
- Lead-list `activity_count` server-side grouped count if activity volume grows
  past a page's worth (verified 2026-07-02: no `db-max-rows` cap, <1k rows).
- Legacy `/api/dashboard/sales/*` full deprecation once the WhatsApp chat dialogs
  migrate to `/api/crm/*`.

## CRM — Admin Lead-Data Edit + Full Activity Logging (Locked, 2026-07-03)

Added an **admin-only** capability to edit a lead's own data, closed the
field-edit timeline gap, and fixed the Team-Activity month counter. **Do NOT
re-litigate.** Shipped after audit → design → implement → adversarial review
(opus, 3 lenses) → fix.

### 1. `leads.edit_core` = admin-only edit of the lead's OWN data
New permission `PERMISSIONS.LEADS_EDIT_CORE = 'leads.edit_core'` (rbac.ts). NOT
in `BASE_EMPLOYEE` or `ROLE_EXTRAS.sales_agent` — admin holds it via the `*`
wildcard only. It also appears in the role-editor catalogue so an admin could
grant it to a specific user via `extra_permissions` (auto-whitelisted through
`Object.values(PERMISSIONS)`).

`PATCH /api/crm/leads/[id]` gates it: after the existing `assigned_to` →
`leads.assign` guard, any body key in `CORE_FIELDS` (= all `PATCHABLE_KEYS`
EXCEPT `assigned_to`) requires `leads.edit_core`, else 403
(`تعديل بيانات الليد متاح للمشرف فقط`). Agents still reach the handler via
`leads.update` for the reassign-only flow (manager + `leads.assign`), and keep
their workflow untouched: activities/notes (`/activities`), stage moves
(`/move-stage`), follow-ups (`/follow-ups`) are separate routes. **Verified by
review: agents cannot edit name/phone/company; reassign-only still works; admin
passes via `*`; no field leak.**

UI: admin-only `<EditLeadDialog>` (button in the lead-header admin-actions row,
gated by `usePermission('leads.edit_core')` — button AND dialog mount both
gated). The dialog **diffs against the opened-form snapshot and PATCHes ONLY
changed keys** — this is load-bearing: it prevents (a) phantom `field_updated`
timeline rows on every save and (b) silently writing seeded defaults
(`deal_type→'other'`, `source→'manual'`, etc.) onto leads whose DB value was
NULL. Do NOT revert to a full-payload submit.

### 2. Every changed lead field now writes a timeline entry (GAP 1)
The PATCH previously logged a `field_updated` `pyra_lead_activities` row only for
6 "fields of interest". Now it logs **one row per CHANGED field** (name / phone /
email / company / notes / … — everything in `CORE_FIELDS`), with old/new values,
so edits are visible on the lead timeline. `assigned_to` keeps its dedicated
`assignment_changed` activity. Numeric columns (`expected_value`,
`win_probability`) use a **numeric-aware compare** (`Number(a) !== Number(b)`)
because PostgREST serializes `numeric` as a STRING — a plain `!==` logged phantom
changes (`"5000.00" !== 5000`). `custom_fields` (jsonb) uses a JSON-string
compare. Audit trail (`logActivity`) was already 100% — this was a timeline-only
gap.

Task edits (GAP 2): `tasks/[taskId]` PATCH now emits a timeline row for
`title|description|due_date|priority|assigned_to` changes (was status/title
only), so reassigning/rescheduling a task is traceable.

**Manual notes/comments were already fully logged** (`ActivityComposer` →
`/activities` → `pyra_lead_activities` + `logActivity`) — no change needed there.

### 3. Team-Activity counter — Dubai month window
`/api/dashboard/kpis/team-workload` (the "نشاط الفريق هذا الشهر" widget) was
counting a **UTC** calendar month via `.toISOString().split('T')[0]`, mis-
attributing activity in the ~4h Dubai/UTC boundary band + fragile on non-UTC
hosts. Now uses `dubaiDayKey()` + explicit `+04:00` bounds with a half-open
`[monthStart, nextMonthStart)` interval (Dec→Jan rollover handled). The counter
itself was otherwise correct (no zeroing/double-unwrap). `TeamWorkloadChart`
migrated `useState/useEffect` → React Query (`['dashboard','team-workload']`,
`staleTime 60_000`).

## CRM "Pyra Pro" Redesign — Locked Decisions (2026-07-10)

A scoped VISUAL redesign of the CRM module (`/dashboard/crm/*`) to the "Pyra
Pro" concept — warm-neutral (stone) palette, JetBrains-Mono numerics, 16px warm
cards, always-visible pipeline quick-actions, a new Today strip, and a derived
per-card next-step line. **Logic, hooks, permissions, and data are UNTOUCHED —
this is a styling layer only.** Shipped after research (parallel surface-mapping)
→ per-surface implementation → adversarial review → tsc/i18n/build/test green.
**Do NOT re-litigate.**

### 1. Warm palette is SCOPED to CRM via `.crm-theme` — never the shared shell
The design's warm-neutral palette = Tailwind's stone family (canvas `#FBFAF9`,
ink `#1C1917`, taupe `#7A7570`, warm border `#F1EDE8`); the orange `--primary`
already matched. Applied as CSS-var OVERRIDES on a `.crm-theme` wrapper
(`app/dashboard/crm/layout.tsx`) — light + dark (`.crm-theme` / `.dark
.crm-theme` in `globals.css`). The shared sidebar/topbar render one level up in
`app/dashboard/layout.tsx` (OUTSIDE the wrapper) and intentionally KEEP the
app's cool-neutral palette; other modules are untouched. Do NOT move the warm
vars to `:root`/`.dark` (repaints the whole app).

### 2. CRM portaled overlays are retinted WITHOUT leaking to the shell
Radix/shadcn overlays (Select/Dialog/Sheet/Popover/AlertDialog) portal to
`document.body`, OUTSIDE `.crm-theme`. `<CrmThemeScope>` (client) sets
`document.body.dataset.crm` while a CRM route is mounted; `globals.css` applies
the SAME warm vars to `body[data-crm] [data-radix-popper-content-wrapper]`,
`[role="dialog"]`, `[role="alertdialog"]` ONLY — transient overlay containers,
NEVER the persistent `<nav>`/`<header>` shell. Cleared on unmount.

### 3. `font-mono` (JetBrains Mono) ONLY on pure-Latin numerics — NEVER Arabic
JetBrains Mono → `monospace` has NO Arabic glyphs, so any `font-mono` span
containing Arabic (or mixed Arabic+number) falls back off-Cairo. Apply
`font-mono` ONLY to spans whose content is currency/counts/percentages from
`formatCurrency` (en-AE, Latin) or raw numbers. NEVER on ICU-plural strings with
an Arabic word (`{n} صفقة`), `formatRelativeDate` output (`منذ ٣ أيام`), or any
Arabic label. For a shared component whose value is SOMETIMES Arabic (e.g.
lead-stat-strip's "last activity"), gate mono behind a `mono?: boolean` prop.
Regression smell: grep `font-mono` near any `t(...)`/`formatRelativeDate`/ICU
content. (This exact bug was introduced + caught in adversarial review, 6 spots.)

### 4. Per-card "next step" line is DERIVED — no schema field (v1)
`lib/crm/next-step.ts` `deriveNextStep({stageIndex, stageCount, nextFollowUpIso})`
returns an i18n key: an overdue follow-up → `overdue` (at-risk color), else a
stage-position ladder (`contact`→`qualify`→`proposal`→`negotiate`→`complete`).
Pure + unit-tested. `stageIndex`/`stageCount` thread board → column → card
(optional props, default to the first-rung fallback). A real free-text "next
step" field is a v2 item — do NOT invent a DB column.

### 5. Pipeline dnd invariants PRESERVED — only the hover-gate was removed
The redesign removed ONLY the quick-action `opacity-0 group-hover:opacity-100`
gate (Call/WhatsApp now always visible — the #1 "feels unclear" complaint),
as an inline footer action row. Everything LOCKED in the Phase 7/10 sections
stayed byte-equivalent: the drag-SOURCE `opacity-0 pointer-events-none`, the
3-tier split, single `useDraggable` per lead, `pointerWithin`, `DragOverlay
dropAnimation={null}`, mobile stage-sheet in the wrapper. The new column
entrance is OPACITY-ONLY (`.crm-col-enter`/`pyraFade`, NO transform) so it never
creates a containing block over the droppables — do NOT switch it to
`pyraFadeUp`/`.crm-enter` (those translate).

### 6. Lead-detail underline tabs via call-site override, not the primitive
The segmented→underline tab change uses `className` overrides on
`TabsList`/`TabsTrigger` at the lead-detail call site (twMerge neutralizes the
shadcn base: `bg-transparent`/`rounded-none`/`border-b-2` active). The shared
`components/ui/tabs.tsx` primitive was NOT modified (no app-wide ripple).

### Redesign v1.1 backlog
- Data-driven pipeline header subtitle (count + per-currency value) — deferred
  to avoid summing across currencies.
- Real "next step" free-text field + edit UI.
- Real-RTL-device verification of the scroll-fade + entrance polish.
