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
- [Calls — Contact Semantics + Update Enforcement (Locked, 2026-07-29)](#calls-contact-semantics-update-enforcement-locked-2026-07-29)

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

---

## Calls — Contact Semantics + Update Enforcement (Locked, 2026-07-29)

Shipped to prod 2026-07-29/30 across three waves (urgent fixes → agent app →
call attempts + update enforcement). Full operational runbook lives in
`docs/CALL-TRACKING.md`; this section records only what must not be
re-litigated. Origin: the reps reported "our calls don't show on the lead" —
the investigation found the opposite defect underneath it (dials nobody
answered were being recorded as real contact).

### 1. `isConnectedCall()` is the ONE contact predicate
`lib/calls/match.ts`:

```ts
direction !== 'missed' && duration_seconds > 0
```

A dial that rang out is **not** contact. Before this, the gate was
`direction !== 'missed'` alone, duplicated in two routes: 257 fake
`call_logged` rows and 164 poisoned `last_contact_at` values (backfilled
2026-07-25; a further 41 from the quick-add path on 2026-07-29). **Never
re-inline a direction check** — both mobile write paths
(`app/api/mobile/calls/sync/route.ts`, `app/api/mobile/leads/route.ts`) import
the predicate, and it is unit-tested in `__tests__/calls-connected-gate.test.ts`.

### 2. `call_attempt` is visible effort, never a "touch"
An unanswered dial on a **matched** lead writes an `activity_type='call_attempt'`
row so the rep can see the work. It must never make a lead look contacted, so
every "last touched" consumer excludes it:

| Consumer | Site |
|---|---|
| Idle-lead cron | `app/api/cron/lead-idle-check/route.ts:163` |
| Deals at risk | `app/api/crm/dashboard/deals-at-risk/route.ts:69` |
| AI insights | `app/api/crm/dashboard/ai-insights/route.ts:124` |
| Customer dossier (health recency) | `app/api/crm/customers/[lead_id]/dossier/route.ts:204` |

**Adding a fifth recency consumer means adding the fifth
`.neq('activity_type', 'call_attempt')`.** Verified live: a lead whose only
fresh activity is an attempt is still selected as idle. `last_contact_at` moves
only for connected calls, and the quick-add retro-link bump is forward-only.

### 2b. The ignore list beats the lead match — order is load-bearing
`app/api/mobile/calls/sync/route.ts` classifies a call as ignored **before** it
looks for a lead, and an ignored call carries `lead = null`:

```ts
const isIgnored = ignoredSet.has(normalized);
const lead = isIgnored ? null : matchLeadByPhone(index, call.phone);
const matchStatus = isIgnored ? 'ignored' : lead ? 'matched' : 'unmatched';
```

The original order (`lead ? 'matched' : ignored…`) made the ignore list
unreachable whenever a lead happened to carry that number — and the owner's own
two lines **were** saved as leads ("boss", "mohamed abdou"), so 24 internal
calls between him and his team were filed as customer contact with 19 timeline
rows (cleaned 2026-07-31, snapshots in `backups/own-numbers-*.json`). Ignoring
first also means an ignored call writes no activity and never moves
`last_contact_at`, even if someone re-creates a lead on that number later.

Two supporting rules:
- **`agent_username = '*'` is a fleet-wide ignore** (company lines, owner
  mobile) — the sync route reads `.in('agent_username', [agentUsername, '*'])`,
  same wildcard convention as the cron scopes, so a newly provisioned agent
  inherits them on day one instead of needing per-agent rows.
- **Quick-add's `retroLinkCalls()` excludes `match_status='ignored'`** — without
  it, creating a lead on an ignored number would pull every internal call onto
  the new card.
- **`computeCallsReport` counts an ignored call in `ignored` and nothing else**
  — not the workload, day chart, answer rate, or average.

### 3. Attempt vs. answered must be distinguishable at a glance
`call_attempt` renders **rose + `PhoneMissed`** in both the lead timeline
(`components/crm/activity/activity-item.tsx`) and the dashboard feed
(`components/crm/dashboard/dashboard-activity-feed.tsx`). Deliberately NOT
amber (owned by `note`/`idle_warning`) and NOT sky/indigo (owned by
`call_logged`) — the first build shipped it amber, i.e. indistinguishable from
a note, which defeats the entire point of the type.

### 4. Call metrics are answered-only
`lib/calls/report.ts` counts `answered` with the same predicate, divides the
average duration by `answered` (not by all non-missed dials), and reports
`answer_rate = answered / (outgoing + incoming)`. The old all-dials average
under-reported by ~36 % (47 s displayed vs 73 s true).

### 5. Unbounded `.in('lead_id', ids)` is a production outage
754 ids ≈ 13.5 KB of query string → PostgREST "URI too long"; it killed
`lead-idle-check` silently for 11 days. Chunk through `lib/utils/chunk.ts`
(150/batch). Bounded-by-headcount `.in()` calls are fine — the rule is about
lists that grow with lead volume.

### 6. Update enforcement — Android channel + blocking rules
- The high-importance channel is **`updates_v2`**; the old `updates` channel is
  deleted on upgrade. Android freezes a channel's importance at creation, so
  raising it in place is a **silent no-op on every existing phone** — a new
  channel id is the only way to change importance. Same trap applies to any
  future importance change.
- A persistent, non-dismissable Home banner shows for **any** newer release.
  The full-screen `UpdateRequiredScreen` shows **only** for a release published
  as mandatory.
- The blocked branch sits **after** permissions + login, so a logged-out rep is
  never trapped behind it.
- **Call sync never stops while blocked** (owner's hard rule, E2E-proven: a
  13 s call placed with the blocking screen up reached `pyra_agent_calls`).
  `SyncWorker` / `SyncScheduler` / `PhoneStateReceiver` / `QuickAddActivity`
  bypass MainActivity's composition entirely — keep it that way.

### 7. `--mandatory` is per-release and always escapable
- Set only at publish: `pnpm app:publish <apk> --app pyra-calls --mandatory`.
  Never retroactive, never a default, rejected together with `--activate`
  (a rollback re-activates that row's existing flag as-is).
- **The one undo:** `pnpm app:publish --set-mandatory <code> false --app pyra-calls`
  — PATCHes `is_mandatory` only, never `is_active`, no upload.
- While blocked, the screen polls the **server** every 60 s, so the undo frees
  the phone in ~60 s with no force-close and no reinstall (the 6 h throttle
  applies only to the normal update path). A network error, 401, or malformed
  response can **never** clear a block — only a real server answer can.
- v1.5.0 was deliberately published **non-mandatory**: the block is reserved
  for a release with a real reason. Habituating reps to it destroys its value.

### 8. Publishing order and limits
Deploy the server to `main` **first**, verify, then `pnpm app:publish` — a
phone that self-updates ahead of the endpoints gets screens that 404. The prod
channel refuses debuggable or wrong-package APKs, and the `pyra-private` bucket
caps uploads at **10 MiB** (v1.5.0 signed release = 7.87 MB; the debug build was
10.56 MB and could not be uploaded).

---

## Calls — Lead Ownership Boundary + The Follow-Up Loop (Locked, 2026-08-08)

Two pieces of work that shipped together (2026-08-07 night → 08-08) and whose
decisions interlock: **wave C — "the follow-up loop closes"** (v1.7.0,
versionCode 8) and the **cross-agent lead-ownership fix** that wave C's own
pre-publish code audit surfaced underneath it (backlog B-12). The operational
contract lives in `docs/CALL-TRACKING.md`, the item ledger in
`docs/CALL-TRACKING-BACKLOG.md`; this section records only what must not be
re-litigated.

Items 1–9 are the ownership boundary, 10–14 the follow-up loop. **Items 1, 2,
3 and 5 look like the defect rather than the fix.** Each of them is the
intuitive "cleanup" a future reader will reach for, and each one re-opens a
worse hole than the one being closed. Do not change them without reading the
item.

### 1. The lead phone index stays system-wide; the WRITE is what gets gated

`app/api/mobile/calls/sync/route.ts` keeps building its lead phone index with
**no `assigned_to` filter**, on purpose. Filtering the index is the intuitive
fix and the worst available one: every call to a colleague's lead would come
back `unmatched`, which fires the app's «رقم غير مسجل» quick-add prompt — and
`POST /api/mobile/leads` builds its **own** unfiltered index, so the rep
quick-adds the number and is handed the colleague's lead straight back
(`already_existed: true`). That converts a silent write into a louder leak,
plus duplicate-lead pressure on exactly the numbers that already have too many
cards. **Gate the write, never the match.**

### 2. `pyra_agent_calls.lead_id` stays SET on an unowned match

This is the line that looks like the leak, and it is the line holding the gate
shut. Two consumers depend on the link existing:

- `retroLinkCalls` (`app/api/mobile/leads/route.ts`) selects unlinked calls
  with `.is('lead_id', null)` and **no agent filter**. A NULL link would leave
  every unowned call eligible, so the next quick-add on that number would
  re-link them all and re-write precisely the activities the gate suppressed.
- `app/api/mobile/calls/ignore/route.ts`'s only guard is
  `if (call.lead_id) return 409`. A NULL link would let a rep mark a
  **colleague's customer number** as ignored — and an ignored call drops out of
  every bucket in `lib/calls/report.ts`, erasing the rep's own workload from
  the calls report along with it.

### 3. `match_status` stays `'matched'` for an unowned match, and no new value was added

Three independent reasons, any one of which is sufficient:

- `lib/calls/report.ts` does `s[r.match_status] += 1` over a fixed key set, so
  an unlisted value yields `undefined + 1 = NaN` and silently corrupts the
  whole calls report.
- The value would fall outside the `MATCH_STATUSES` whitelist in
  `app/api/crm/calls/route.ts` and outside the `types/database.ts` union.
- It would retroactively shift the 25 existing cross-agent rows out of the
  matched bucket, rewriting history to describe a rule that did not exist when
  they were written.

**And never emit `status: 'error'` for an unowned match.** `SyncPlanner.kt`
returns null on the literal `'error'`, `SyncWorker` then returns
`Result.retry()` and never advances `lastSyncedCallLogId` — freezing that
handset's uploads **permanently**, on both live versions (7 and 8). An
ownership decision must never be expressed through a transport-level status.

### 4. The activity insert and the `last_contact_at` bump are gated TOGETHER

Gating only the bump is the tempting middle path ("keep the visible timeline
row, just don't move recency") and it does not work.
`app/api/cron/lead-idle-check/route.ts:189-193` computes
`lastTouched = max(latest activity created_at excluding call_attempt, last_contact_at)`
with **no `created_by` filter** — so a surviving `call_logged` row keeps the
owner's going-cold nudge suppressed entirely on its own, bump or no bump.

Verified while making this change: the other three recency consumers —
`deals-at-risk`, `ai-insights`, and the customer dossier's health-score
recency — all derive recency the same way and **none** of them filters by
author either. Gating both writes together is what keeps all four consistent;
gating one leaves four consumers disagreeing with the rule.

### 5. The duplicate-key tiebreak is the root-cause fix, and it had to ship WITH the gate, not after it

`buildLeadPhoneIndex` (`lib/calls/match.ts`) now takes an optional
`preferAssignedTo` and prefers the caller's own lead when two lead rows collide
on one phone key.

**Measured: 14 of the 25 cross-agent matched calls in production were duplicate
lead cards for the same business on the same number, where the caller owned
their own row** — and first-match-wins over an unordered PostgREST select had
picked the colleague's. A bare ownership gate, shipped without the tiebreak,
would therefore have erased **14 real conversations** from the CRM: no
notification, no outcome sheet, no follow-up attach. That is why the two
changes are one change. With `preferAssignedTo` omitted or null the function is
byte-identical to its previous behaviour, so no existing caller shifted.

Two imperatives fall out of it:

- **The inversion failure mode only shows when the preferred lead arrives
  SECOND in the array.** Mutation-verified, and production hits that ordering
  deterministically because the colleague's duplicate is the older row — so any
  test that only checks preferred-first **passes against a broken
  implementation**. Keep a second-position case in the suite.
- **The select needs its `ORDER BY created_at, id`.** Without it, *which*
  duplicate wins — and therefore the value of `owned` itself — is not
  reproducible between two syncs of the same number.

### 6. Three read paths were closed alongside the write

A write gate is worthless if the same datum is one click away. All three now
gate on the same ownership predicate:

- `app/api/crm/calls/route.ts` was enriching `lead_name` keyed only on
  `lead_id` with no ownership filter, and `CallsTable` rendered it as a **link
  to the colleague's lead page** — so a rep read the name off their **own**
  calls report.
- Two branches of `POST /api/mobile/leads` returned the colleague's `lead_id`,
  `lead_name` and `lead_url`.
- `retroLinkCalls` linked **and wrote** a foreign agent's calls onto a
  newly quick-added lead, sourcing its `last_contact_at` from a dial the
  lead's owner never made.

### 7. `QuickAddData`'s withheld fields are empty strings — not omitted, not null

A live-crash guard, not a style choice. `lead_id`, `lead_name` and `lead_url`
are declared **non-nullable with no defaults** in `core/Payloads.kt`, so
omitting or nulling them throws `MissingFieldException` on versionCode 7 and 8.
`ApiClient`'s `runCatching` turns that into `ApiResult.Err(200, …)`, which
shows the rep a red error, skips `Notifier.cancel`, and retries a request that
**already succeeded** — forever. Empty strings decode cleanly and are read
nowhere on that path (`already_existed == true` takes the toast branch).

**Do not make the Kotlin fields nullable to "clean this up".** The live fleet
is what decodes the response; a future tolerant build does not make v7/v8
tolerant.

### 8. Two backfill scripts were fixed with the same rule

`scripts/backfill-quickadd-last-contact.ts` and
`scripts/backfill-zero-duration-contact.ts` joined `pyra_agent_calls` on
`lead_id` with no agent filter. On `--apply` they would have set a colleague's
lead's `last_contact_at` from a foreign dial — the exact write the gate now
refuses. Both require `c.agent_username = l.assigned_to`. **Any future script
that reads a call and writes to its lead inherits this predicate.**

### 9. The policy this establishes: the phone stops being the exception

An admin can still log a call on ANY lead through the web composer, and that
path does bump `last_contact_at` — unchanged. A sales agent cannot, because
`canAccessLead` is own-or-admin. The phone was the one surface where a
non-admin could write to a lead they do not own. After this change **the phone
is simply no longer the exception.**

### 10. `STAGE_NOT_INTERESTED` is pinned by value in code, not by an `is_terminal` column

Owner decision, 2026-08-07. `ps_zT_9mNvS8qxMq-7d` is a **custom, UI-generated**
stage: `pyra_sales_pipeline_stages` has no column marking a stage terminal
(`is_default` is its only flag). So **any future terminal stage must be added
to `PIPELINE_TERMINAL_STAGE_IDS` (`lib/constants/statuses.ts`) by hand**, and
`__tests__/pipeline-terminal-stages.test.ts` is the only guard that anyone
remembered to.

`ps_e-w41Um9opZvPTPf` («لا يرد») is deliberately **NOT** terminal — a lead that
did not answer still needs chasing, and marking it done would quietly retire
live prospects.

### 11. `follow-ups/complete` accepts exactly two reasons, assignee-only, no admin override

`duplicate` and `wrong_number`. The two rejected candidates were rejected for
reasons, not for scope:

- «اتواصلنا خارج النظام» **does not exist as a concept** — every conversation
  goes through a company line.
- «العميل مش مهتم» is a **stage move, not a close reason**. It belongs to
  `call-outcome`'s `not_interested_reason` so the lead actually leaves the
  pipeline, instead of quietly losing its reminder while sitting in the same
  stage.

Unlike the web route, `POST /api/mobile/follow-ups/complete` has **no admin
override**: a device key carries no RBAC scope, so there is no admin to
recognise. Assignee-only, and the ownership predicate stays with the caller
while the state transition stays in `lib/crm/close-follow-up.ts`.

### 12. A converted closed-won customer cannot be moved to «غير مهتم» from a phone — it refuses, it does not reopen

`markNotInterested` returns `terminal_won` and the route answers **422**.
Without that branch the phone bypassed the admin-only reopen gate the web
enforces, and produced a lead that was simultaneously `is_converted = true`,
`win_probability = 100` and sitting in the not-interested column. **A phone
must never be able to reopen a won customer as a side effect of a call
outcome.**

### 13. `classifyCloseAccess` owns the ORDER, not just the predicate

Ownership is tested **BEFORE** the open / already-closed split. Reversed, an
"already closed → 200" answer becomes an oracle revealing which follow-up ids
exist. That ordering was gotten wrong once during this wave, which is why two
tests assert `isOwner` is called **exactly once** and **never** for
`not_found` / `db_error` — those are the tests that fail if anyone reverses it
again.

### 14. PostgREST: a `select=` projection on a MUTATION swallows an `or=` filter

The trap that cost the most this wave. On an `UPDATE` carrying `select=`,
PostgREST resolves `or=` against the **projection** instead of leaving it in
the mutation's `WHERE`. Measured against the live API on one compare-and-swap:

| Shape | Result |
|---|---|
| `.or(…) + .select('id')` | `400` `42703 column … does not exist` — on a column that exists |
| `.or(…) + .select('id, stage_id')` | `200` returning `[]` — the filter is re-applied to the RETURNING row, which already holds the NEW value. **The UPDATE commits and the caller wrongly concludes it lost a race** |
| `.or(…) + { count: 'exact' }`, **no** `.select()` | `204`, `Content-Range: 0-0/1` — correct |

Plain `.eq()` filters are **unaffected**: `app/api/mobile/calls/ignore/route.ts`
has a filtered `.update().select('id')` on columns it does not project and is
fine in production — **do not "fix" that one to match.**

Why this is recorded as a decision and not a bug note: it shipped through
**1,092 passing tests**, a reviewer who explicitly flagged `.update()+.or()` as
unverifiable, and a four-lens audit. Only the real-device test caught it — and
because the route treats a stage-move failure as warn-don't-fail, the damage
was **silent**: note written, follow-up closed, HTTP 200, lead never moved. The
long form with the full evidence is the PostgREST-gotcha section in
`docs/CALL-TRACKING.md`.

### Measured 2026-08-08 — the forensics, so nobody re-derives them

Cross-agent matched calls in production, all-time:

| Fact | Value |
|---|---|
| Cross-agent matched calls | **25** of 1,546 matched (**1.6 %**), across **15** leads |
| Callers involved | two only — youssef→cosette **19**, cosette→youssef **6** |
| Carried an activity id | **23** · of those, **20** rows still exist |
| Connected (real conversation) | **17** |
| Leads still carrying a traceable `last_contact_at` | **2** |
| Leads in live harm | **exactly 1** |
| Phone keys with more than one lead row | **18** · **8** split across the two active agents |

The one lead in live harm: **`sl_njsQ6XfyPCOL_Z12`** ("milestones coffee",
cosette) — suppressed from the idle nudge for **14 consecutive cron ticks**.
And it is a **duplicate** of **`sl_LIEiSbMcadQDcS-Z`** ("Milestones Coffee Abu
Dhabi Mall", youssef) on **025836444**, where youssef was calling **his own**
prospect. The flagship case for the duplicate-card problem is the same row as
the flagship case for the leak.

Nothing in the data looks fabricated: two device install ids, monotonic CallLog
row ids, sync lag ranging 8 s–87 min, Dubai working hours, varied non-round
durations. This is ordinary misdialling and duplicate cards, not abuse.

**The numbers UNDERCOUNT.** `assigned_to` is mutable, and at least one call
reads as same-agent *today* only because of the 2026-07-31 departed-agent
reshuffle. For the same reason the older docs' **"11 of 846"** figure is not
exactly reproducible — it was true when measured; do not treat the discrepancy
as an error in either number.

### Deliberately not done — fix the duplicate, not the timeline

The 20 surviving historical activity rows were **NOT** deleted, and the 2
`last_contact_at` values were **NOT** reset.

Restoring the single suppressed nudge would require destroying **20 true
records of real conversations**, honestly attributed in `created_by` — and it
would not even work, because the idle cron takes the **max** of
`last_contact_at` and the latest activity **with no author filter** (item 4).
Deleting the bump alone changes nothing while the activity rows stand, and
deleting the activity rows falsifies the record.

The correct remedy is a **human handoff** on that one lead plus **merging the
duplicate cards** (backlog). **Fix the duplicate, not the timeline.**

---

## Calls — The Trapped Phone, the Frozen Sync, and the Owner's Notice (Locked, 2026-08-10)

Wave د closed the last of the calls backlog: B-14, B-15, F-07 and T-01…T-05.
Shipped as `af387f2` (B-14/B-15) · `35056af` (F-07) · `b289bb7` (T-01…T-05),
plus release **v1.7.1 / versionCode 9**. Several of the decisions below read as
mistakes until you know what they are avoiding.

### 1. Never show a blocking screen to someone who cannot complete its action

The rule already existed — CA-C2 put `blocked` after `loggedIn` so a logged-OUT
rep is not stranded on a screen whose single action needs a session. **B-15 was
that same rule with a case missing.** A revoked device key produces the exact
condition in disguise: `AppPrefs.isLoggedIn()` is `true` (the key is stored, it
is simply no longer accepted), so a phone both behind a mandatory release *and*
holding a dead key fell through to `UpdateRequiredScreen` — and was
**permanently stuck**, because BOTH escape hatches sit behind the dead key:

| Escape hatch | Why it was closed |
|---|---|
| The 60s `app-version` poll that lifts a mistaken block | `requireDeviceAuth` → 401 forever, and the screen only writes to prefs on the SUCCESS branch |
| The "update now" button | `app-download` needs the same key → cannot fetch the APK |
| Home's session-dead banner and its re-login button | `blocked` had already replaced Home |

Net effect: clear app data or uninstall. **`core/AppGate.kt` now owns the branch
order** — pure, and unit-tested against the full 16-case matrix, because *the
order is the fix* and a `when` inside an Activity cannot be tested. One test
asserts the invariant directly: **no combination involving a dead session may
ever reach the update screen.**

- **`SESSION_DEAD_BLOCKED` is the INTERSECTION only.** A dead session on its own
  still goes Home — the banner there explains the cause (usually "you signed in
  on another handset") and the rep can still see their work. Taking the whole
  screen away would be a downgrade.
- **The screen deliberately has NO "update now" button.** It would 401, and a
  button that cannot work is worse than no button: the rep taps it, nothing
  happens, and they conclude the app is broken rather than that they must sign
  in. Signing in is not merely the better first step — it is the only possible
  one.
- **`UpdateRequiredScreen`'s poll now records its own auth outcome**, and
  `onRecheck` fires on EVERY branch, not only success. Without both, a key
  revoked while the rep is parked on that screen stays invisible there until the
  next app resume — the same "a safety valve that slow is not a safety valve"
  reasoning CA-C3 applied to the block itself. Two consecutive 401s (~2 min) now
  surface the way out unprompted.

### 2. A bad row is dropped; `status: 'error'` is forbidden (T-02)

`parseCalls` returned `null` — a 422 for the WHOLE batch — the moment any single
row failed validation, and **the device cursor only advances on a 2xx**
(`SyncPlanner.nextCursor`). One unparseable row therefore **froze that handset's
sync permanently**, every later call piling up unseen while the phone looked
healthy. The row need not be exotic: the payload is built from the SIM call log,
where a withheld number can surface with a blank number field.

Now in `lib/mobile/parse-calls.ts` (10 tests). Three parts are load-bearing:

- **The envelope stays fatal, the rows do not.** Non-array / empty / over
  `MAX_BATCH` is a client bug and still 422s. A bad row inside a valid envelope
  is dropped.
- **An all-invalid batch returns 2xx with an empty result list.** A 422 there
  would rebuild the identical freeze one layer down; rows that can never be
  persisted must not be re-sent forever.
- **It must NEVER come back as `status: 'error'`.** That is the one value
  `SyncPlanner` treats as "nothing persisted, do not advance" — using it for a
  permanently-bad row is the freeze again in a different hat.

Every dropped row is written to `pyra_error_logs`. Dropping is right; dropping
*silently* would turn lost call data into an invisible hole.

### 3. The device gate asks for a PERMISSION, never a role (T-03)

Owner `status === 'active'` only asks whether the account exists. A rep moved
off sales stays active, and their device key kept ingesting calls, writing lead
activity and creating leads for a role with no business doing it. Deactivation
was covered; **role change was not.**

Gated on **`leads.view`** via `buildUserPermissions` — deliberately NOT
`role === 'sales_agent'`:

- Per-user `extra_permissions` exist precisely to grant a capability WITHOUT the
  role. A role equality check would contradict the system's own design and lock
  out a legitimately-granted user.
- `leads.view` is **absent from `BASE_EMPLOYEE`**, which is what makes it a real
  gate rather than a formality.
- `buildUserPermissions` also handles the admin `'*'` wildcard, so an
  admin-owned device still works.

⚠️ **This gate runs on EVERY `/api/mobile/*` request, so verify it against
production data BEFORE shipping.** Done here: all three real agents resolve
through the DB "Sales" role, whose permissions include `leads.view`, and
`e2e.upgrade` has no `role_id` so it falls back to the legacy mapping, which
also includes it — both paths covered. Confirmed live afterwards with
`test.sales` (`ping` + `my-day` → 200).

`hasPermission` is imported **aliased** in `device-auth.ts`: the one already
there checks an API KEY's scopes (`calls:device`), this one checks a USER's RBAC
permissions. Two different questions with the same verb — unaliased, a future
edit calls the wrong one and silently widens the gate.

### 4. F-07's notice is verbose because the lead timeline is empty by design

The ownership boundary writes NOTHING to the lead on an unowned match. That is
the correct security answer, and it left the owner blind: before the gate they
found out by accident, through a timeline row that falsely implied they had made
the call themselves; after it, nothing at all.

So this notification is the **only** record the owner ever sees, and
`lib/calls/colleague-call-notice.ts` states who, which customer, which
direction, how long, when — and **where the call actually lives** (the calls
report), so nobody hunts through a timeline that is empty on purpose.

- **Connected calls only.** An unanswered dial at a colleague's customer is
  effort, not contact — the same `isConnectedCall` predicate every consumer
  uses. Without it, a wrong number redialled three times is three alerts about
  nothing.
- **Direction flips the wording.** "Your colleague called your customer" and
  "your customer called your colleague" call for different reactions.
- **`lead_called_by_colleague` was added to the `NotificationType` union
  properly.** `NotifyArgs.type` is `NotificationType | string`, so a bare-string
  typo would have shipped silently. There is no CHECK constraint on the column,
  so no migration was needed — and the name **starts with `lead` on purpose**,
  because `NotificationBell`'s `typeVisual()` resolves icons by PREFIX, so it
  renders in the CRM group with zero UI changes.
- **The `lead.assigned_to` guard in the branch is NOT redundant with
  `!owned`.** `isOwnedByAgent` fails CLOSED on a null assignee, so an unassigned
  lead lands in exactly this branch with nobody to notify. Zero of 1,245
  phone-bearing leads are unassigned today — which is precisely how an unguarded
  `to: null` would have sat there undetected until someone unassigned one.

### 5. B-14 — idempotent for a retry, recording for a correction

`markNotInterested` returned early for a lead already in the stage with no write
of any kind, so a rep correcting or expanding their reason lost it silently —
not the column, not the timeline. The two requirements pull against each other,
and `shouldRecordCorrectedReason` is where the line sits:

- **Trimmed before comparing** — a resend differing by a newline is a retry, not
  a correction, and writing a timeline row for it is the doubling the
  short-circuit exists to prevent.
- **Not case-folded, not diacritic-normalised.** These are sentences a human
  typed; treating two spellings as one discards the newer on the assumption the
  difference is noise.
- **An empty incoming reason never records and never erases** what is there.
- It writes a **`note`, not a second `stage_change`**: nothing moved, and a
  `stage_change` with identical from/to would corrupt every consumer that reads
  the timeline as stage history — the productivity report walks exactly those
  rows.

### 6. v1.7.1 shipped NON-mandatory, and the reason inverts

**B-15 fixes a trap that only exists once a mandatory release is published.**
Shipping v1.7.1 itself as mandatory would have dropped any phone holding a
revoked key straight into that trap while still running the version *without*
the fix — and the fix cannot rescue a phone that cannot download it. Once
v1.7.1 is on the fleet, future mandatory releases are safe again.

Related: the Arabic release notes were set through a UTF-8 file via
`pnpm db:query`, **not** `pnpm app:publish --notes`. That text is rendered to
the rep by `UpdateActivity`, and a Windows command line turns Arabic into
literal `?` silently and unrecoverably.

### 7. T-05's obvious fix would have been theatre

`@Synchronized` / `synchronized(this)` on `recordAuthOutcome` **guards nothing
here.** `AppPrefs` is constructed at **seven separate call sites** (SyncWorker,
MainActivity, UpdateActivity, CallOutcomeActivity, QuickAddActivity,
IgnoreReceiver, PyraCallsApp), so concurrent writers hold DIFFERENT objects
while writing one SharedPreferences file — a lock that reads as protection and
provides none. The monitor lives in a `companion object` instead. There are
**three** writers now, not the two the note assumed: B-15 made
`UpdateRequiredScreen`'s poll record its own auth outcome.

### 8. T-01's precondition was verified, not assumed

"Remove after a full fleet cycle" is only checkable against real fleet data, and
`pyra_api_keys.app_version_code` is that data: the migration shipped
**2026-07-16** (`9d0123c`) and both live handsets are on **code 8**, built
2026-08-07. 75 lines and the Google-deprecated dependency removed. **The
session-loss tripwire stays** — it detects a session vanishing for ANY reason,
not just the encrypted store.

### Measured in passing, not fixed

- **The fleet is TWO phones, not one.** The backlog said one (youssef);
  cosette's handset is live and synced the same evening. Two phones changes the
  risk calculus of every release. Corrected in the backlog.
- **`sayed`'s device key is still `is_active = true`** while the user has been
  `inactive` since 2026-07-11. The status gate does stop it, but the key was
  never revoked — that is `access-reconcile`'s job, and **that cron is still not
  running** (its node exists only in the n8n draft).
- **`phone_call` is the largest lead source in the CRM** — 777 of 1,260 (62%) —
  and every one rendered as the unknown-value fallback until T-04. The label
  already existed in `messages/`; only the icon entry was missing.
  `pyra_sales_leads.source` has **no DB constraint**, so `SOURCE_MAP` is the only
  thing between a new writer and a wall of question marks: add the entry in the
  same change that starts writing a new value.
