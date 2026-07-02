# CRM Deep Audit — Round 2 (2026-07-03)

> Second deep-research pass, run AFTER the 2026-07-02/03 fix wave (commits
> `b5e1873`, `cb4a70c`, `9bc1f24`, `b928eb8`, `3140a7b` + the earlier 4-batch
> remediation `6aa8f79`/`ac32e00`/`bbd86a0`). Method: 24 agents — 1 delta-verifier
> re-checked all 36 prior findings at HEAD, 1 live-DB forensics agent (read-only
> SQL against production), 4 fresh finders over the newly-shipped code, and 18
> adversarial verifiers (every new finding independently attacked before
> inclusion; 0 refuted, several downgraded).
>
> Prior report: the 2026-07-02 systemic pass (36 findings). This document is the
> authoritative delta + new-findings record.

---

## Executive Summary

**Prior 36 findings at HEAD: 10 fixed · 7 partial · 19 open.**
**New verified findings this round: 15 unique (4 high · 8 medium · 3 low) + 6 unverified lows.**

Three headline discoveries:

1. **The entire "overdue" machinery is dormant.** The only endpoint that flips
   `pending → overdue` (`/api/dashboard/sales/follow-ups/check-due`) is
   session-auth-gated (`requireApiPermission('sales_leads.view')`) — the n8n
   cron infra (`getExternalAuth` + x-api-key) **cannot call it**, and repo-wide
   grep finds **zero callers**. Production proof: 25 follow-ups are past due
   (oldest 10 days) yet **0 rows carry `status='overdue'`** — the flip has never
   executed once. Everything shipped around overdue (chip, CAS, complete-route
   acceptance) is correct but exercised by no data; the ai-insights banner
   counts 25 while its deep-link lands on an empty list.

2. **The CRM dashboard's money KPIs are permanently zero.** `kpis/route.ts`
   locates contracts exclusively via `.in('lead_id', …)` (closed-won cash line
   91-94, MRR line 128-131) — but **no code path writes `pyra_contracts.lead_id`**
   (production: 3 contracts, all `lead_id NULL`). The (lead_id OR client_id)
   union fix landed in dossier + lead-detail but **not** in the dashboard KPIs,
   and finance contract POST still doesn't accept `lead_id`.

3. **WhatsApp bell notifications never fire — at all.** Both notification
   inserts in the webhook (lines 415, 427) are bare `void supabase…insert()`
   lazy-thenables with no `.then()` — **the queries are never sent**. On top of
   that, the new-conversation branch addresses `recipient_username: 'admin'`, a
   phantom username (the real admin is `elharm`), and existing-unassigned
   conversations (522 of 524 in production) match no notify branch at all.
   Verified live: 0 WhatsApp notification rows exist despite 524 conversations.

**And the operational headline unchanged from round 1: the 137 stranded leads
are STILL stranded.** Live DB today: 137/221 non-archived leads (62%) owned by
inactive agents (`mo.hanach` 69, `kassem` 54, `sayed` 14) + 18 open follow-ups.
The admin tooling to fix it (departed-owner filter, select-all, chunked bulk
assign) shipped and works — but the reassignment itself has not been performed.
Activity pulse confirms mass staleness: 82% of the last 14 days' timeline rows
are system-generated idle warnings (201) vs ~17 human actions.

---

## Part 1 — Delta: the 36 prior findings at HEAD

### ✅ Fixed (10)

| Prior finding | Fixed where |
|---|---|
| Idle/reminder crons escalate to dead inboxes | `lead-idle-check:110-115` active-owner filter; `follow-up-reminders:175-197` skip + flag preserved |
| Reminder cron fires for archived leads | `follow-up-reminders:194-215` (flag flipped + skip) |
| No admin surface for inactive-owner leads | `?assigned_status=` filter + "(مغادر)" dropdown + archived page |
| My Work drops overdue follow-ups | `my-work:279` `.in(['pending','overdue'])` |
| Overdue follow-ups uncompletable | `complete:50` accepts both + CAS at `:78` |
| check-due wrong notification column | `check-due:76` `recipient_username` |
| My Work `is_converted=false` NULL-blind | `my-work:258` `IS NOT TRUE` |
| Quote-created activity void-thenable | `quotes/route.ts:391-400` `.then()` attached |
| Reject never cleared conversion flags | `reject:87-96` resets `is_converted`/`converted_at` |
| `next_follow_up` recompute writers disagree | complete + create both `.in(['pending','overdue'])` |

### 🟡 Partial (7)

| Prior finding | What's fixed | What remains |
|---|---|---|
| Convert back-fill (2a/2b) | Quotes back-filled at convert | **Contracts** not back-filled; `link-client` back-fills **nothing** |
| CRM notify no active-recipient check | Crons skip inactive | convert/approve/reject/transfer/reopen still notify `assigned_to` blindly; no `notifyLeadOwner` helper |
| Contract `lead_id` dead linkage (3a/3b) | Reads unioned in dossier + lead-detail; move-stage attachment scoped | **Finance POST still never writes `lead_id`**; **dashboard KPIs still lead_id-only** (new HIGH below) |
| from-quote null client_id | Mitigated upstream by convert back-fill | Route itself unchanged; pre-conversion signed quote still mints unlinked invoice |
| No CAS on stage transitions (7a) | approve/reject CAS + 409 | **move-stage still updates `.eq('id')` only** — no expectedFrom guard |

### 🔴 Open (19) — clustered

- **Offboarding lifecycle (entire Theme 1)** — `users/[username]/route.ts`
  deactivate/DELETE still perform zero CRM offboarding; DELETE block-check omits
  all CRM tables; `cleanupTables:527` still targets phantom `pyra_notifications.username`
  column; **both reassign writers (per-lead PATCH + bulk) still skip `isAssignableUser`**
  (only CREATE paths validate).
- **WhatsApp theme (all 4)** — conversation not updated on reassign/offboard;
  inbound not routed to lead owner; phantom `'admin'` notify (now proven
  never-executing); non-deterministic phone matching.
- **Phone dedup trio** — lookup still matches normalized key against raw column
  via `ilike('%key%')`; no `phone_normalized` column; no unique constraint/merge.
- **DB integrity** — no FK on the three `assigned_to` columns (migrations end at 031).
- **Others** — health-score payment factor counts not-yet-due invoices as
  failures; lead-score split-brain (retire-or-wire undecided); email-only
  convert dedup; `UserScope.clientIds` typed lie; stale `lost_reason` never cleared.

---

## Part 2 — Live production forensics (2026-07-03)

| # | Metric | Value | Verdict |
|---|---|---|---|
| 1 | Non-archived leads by owner status | **inactive 137 / active 84** (of 221) | 🔴 62% stranded — unchanged |
| 2 | Stranded per owner | mo.hanach 69 · kassem 54 · sayed 14 | 🔴 reassignment never performed |
| 3 | Open follow-ups by assignee status | inactive 18 / active 16 | 🔴 |
| 4 | Reshuffle stage usage | 0 leads | ✅ deployed, unused |
| 5 | Archived leads | 0 | ✅ deployed, unused |
| 6 | Converted leads (`is_converted=true`) | **0 rows** | ⚠️ odd — clients + 3 contracts exist but zero converted leads; conversion state was evidently reset/reopened or clients created outside CRM. Business should confirm. |
| 7 | Converted leads missing client_id | 0 (vacuous) | — |
| 8 | Duplicate phone groups (right-9 key) | **12 pairs / 24 rows (~11%)** | ⚠️ merge candidates |
| 9 | Contracts lead-linkage | **3 contracts, ALL `lead_id NULL`** | ⚠️ feeds new HIGH #2 |
| 10 | Post-convert lead-quotes missing client_id | 0 | ✅ |
| 11 | Notifications → inactive users (30d) | 30 (sayed 22, kassem 6, mo.hanach 2; latest 2026-07-02 01:00 — pre-fix tick) | 🔴 residue; should stop accruing post-deploy |
| 12 | `next_follow_up` cache drift | 0 leads | ✅ |
| 13 | Activity pulse (14d) | idle_warning 201 · lead_created 173 · human actions ~17 | ⚠️ 82% system noise = mass staleness |
| 14 | Overdue follow-ups | `status='overdue'`: **0** · pending-past-due: **25** (oldest 10 days) | 🔴 flip cron has never run — new HIGH #1 |

---

## Part 3 — New findings (adversarially verified; 0 refuted)

### HIGH (4)

**H1. The pending→overdue flip endpoint is unscheduled AND unschedulable**
`app/api/dashboard/sales/follow-ups/check-due/route.ts:16`
Gated `requireApiPermission('sales_leads.view')` (cookie-session only — no
x-api-key branch exists in `lib/api/auth.ts`), so n8n cannot authenticate;
zero callers repo-wide; the sole `status='overdue'` writer in the codebase.
Production: 25 past-due pending, 0 overdue — never ran once. Everything built
on "overdue" (chip, insights severity, one-time bell) is dormant, and the
ai-insights banner self-contradicts its own deep-link.
*Fix:* new `/api/cron/follow-ups-check-due` on the Phase-11 cron pattern
(`getExternalAuth` + `cron.*` permission) scheduled in n8n PyraCRM_Cron — or a
lazy flip inside the follow-ups GET/my-work reads.

**H2. Dashboard money KPIs permanently 0 — contracts queried by lead_id only**
`app/api/crm/dashboard/kpis/route.ts:91-94, 128-131`
Closed-won cash + MRR filter `pyra_contracts` via `.in('lead_id', myLeadIds)`;
no code writes `lead_id` (finance POST omits it; production 3/3 contracts NULL).
The union fix reached dossier + lead-detail but not the KPIs route. The
closed-won cash card renders beside a non-zero deal count — actively misleading.
*Fix:* mirror the dossier union (`lead_id IN … OR client_id IN …`, dedup by id);
separately have finance contract POST accept/resolve `lead_id`.

**H3. WhatsApp bell notifications are silently dead (never executed)**
`app/api/dashboard/sales/whatsapp/webhook/route.ts:413-437`
Both notify inserts are bare `void supabase…insert()` with no `.then()` — the
known lazy-thenable class; they have never dispatched (0 WhatsApp notification
rows vs 524 conversations, verified live). Additionally the new-conversation
branch targets phantom `recipient_username:'admin'` (no such user; admin is
`elharm`), and existing-unassigned conversations (522/524) match no branch.
*Fix:* replace with `notify()`/`notifyMany()` to the assigned agent, else all
active admins; make the else-branch cover existing-unassigned conversations.

**H4. Chat create-lead dialog defaults to legacy `stage_new` → invisible lead**
`components/sales/chat/dialogs/create-lead-dialog.tsx:40-45`
The dialog fetches the LEGACY stages endpoint (returns all 15 rows; DB has TWO
`is_default=true` rows) and `.find(is_default)` deterministically picks legacy
`stage_new`. The CRM board only renders `stg_*` columns and silently drops
other leads (`pipeline-board.tsx:97`); funnel/at-risk exclude it too. The
legacy POST fallback `.single()` on 2 default rows errors → hardcoded
`'stage_new'`. 0 leads affected today (migrations remapped) — the NEXT use of
the live dialog re-introduces one, on the default path, silently.
*Fix:* point the dialog at `/api/crm/pipeline-stages` + default
`stg_new_inquiry` (NOT stages[0] — that's reshuffle now); harden the legacy
POST stage validation; DB hygiene: clear `is_default` on `stage_new`.

### MEDIUM (8)

**M1. Bulk 'assign' validates nothing about the target** — `bulk/route.ts:63-70`
No `isAssignableUser`; any string accepted → orphan under ghost/departed user.
(Downgraded from high: UI offers only active users; admin-recoverable.)

**M2. sales_agent can bulk-reassign own leads to ANYONE** — `bulk/route.ts:27,48-58`
Route gates only `sales_leads.manage` (agents have it); no `leads.assign` check
server-side — the per-lead PATCH forbids exactly this. UI hides the button but
the server is the trust boundary.

**M3. Bulk 'stage' bypasses ALL move-stage guards** — `bulk/route.ts:121-145`
Raw update: no closed_won block (self-declared wins bypass the approval
workflow), no attachment/lost_reason requirements, no win_probability recompute,
no archived filter. Sibling `'delete'` action hard-deletes (cascades activities/
follow-ups/tasks/attachments) around the soft-archive model. No UI calls either —
remove both actions or route through move-stage logic.

**M4. WhatsApp inbound not routed to lead owner** — `webhook:257, 684-757`
`resolveAutoAssignment` ignores `lead.assigned_to` (not even selected). Live:
522/524 conversations unassigned; agents can't see unassigned. (Downgraded:
admin-operated inbox is the current working mode; historic impact ~0 active
agents.) Fix: prefer the matched lead's ACTIVE owner, fall back to auto-assign.

**M5. lead-idle-check doesn't skip archived leads** — `lead-idle-check:80-89`
The archived-skip landed only in follow-up-reminders. Archived lead → perpetual
idle_warning every ~7 days (the warning itself resets the clock) + inflated
daily grouped notification, deep-linking to a hidden lead. One-line fix.

**M6. Archive only hides pipeline/list — everything else still counts it**
`kpis:50` + funnel + deals-at-risk + team-performance + ai-insights + approvals
queue + sidebar badge + my-work: none filter `archived_at`. Archived junk keeps
inflating pipeline_value/forecast/conversion denominators; an archived
contract_signed lead sits in the approvals queue forever.

**M7. Archived lead's follow-ups keep nagging + one-way WA flag ratchet**
Follow-ups list/my-work/calendar/my-tasks don't exclude archived leads; the
reminder cron flips `whatsapp_reminder_sent=true` for archived leads' rows and
unarchive never re-arms it — reminder silently lost even after restore.

**M8. Quotes created AFTER conversion still get `client_id NULL`**
`quotes/route.ts:322` + `quotes/new` page never reads `lead.client_id`. The
convert back-fill runs once; every later lead-surface quote is portal-invisible
again. Fix: POST resolves `client_id` from the lead when absent.

### LOW (9, includes downgrades)

- ai-insights Rules 3+4 + sidebar badge filter `status='pending'` alone —
  locked-rule violation, latent until H1 lands (fix together, 2 lines).
- Archived leads fully mutable server-side (move-stage/PATCH/follow-ups/tasks/
  convert) — decide + enforce the frozen contract.
- Phone edit doesn't re-point/clear the WhatsApp conversation `lead_id`
  (manual unlink exists in chat UI; messages self-heal).
- Follow-ups creatable against archived leads (chat + CRM routes) → accepted
  then reminder silently eaten.
- Mobile filter chip leaks `__inactive__` sentinel + raw usernames.
- `hooks/useSales.ts` fully dead (zero importers) — delete.
- Archived page hard-caps at 50, header count lies, client-search only the
  loaded page.
- (from delta) `lost_reason` never cleared on leaving closed_lost.
- (from delta) health-score payment factor counts future-due invoices as failures.

---

## Part 4 — Recommended roadmap

**Batch 0 — Operations (no deploy, TODAY):**
Reassign the 137 stranded leads + 18 follow-ups using the shipped admin tooling
(pipeline → فلتر "كل المغادرين" → تحديد الكل → توزيع). This unblocks 62% of the
pipeline and stops the idle-warning noise at its source. Confirm the
zero-converted-leads oddity with the business (metric 6).

**Batch 1 — Money + visibility integrity (HIGH):**
H2 KPIs union + finance POST lead_id · H1 overdue cron (proper `/api/cron/*`
pattern + n8n schedule) + the 2 pending-only stragglers · H4 chat create-lead
stage fix + DB `is_default` cleanup.

**Batch 2 — WhatsApp notifications + routing:**
H3 dead notify inserts → `notify()`/active admins · M4 route inbound to active
lead owner · (delta) update conversation `assigned_to` on lead reassign.

**Batch 3 — Bulk route hardening:**
M1 `isAssignableUser` · M2 `leads.assign` server gate · M3 remove/guard
'stage' + 'delete' actions.

**Batch 4 — Archive contract completion:**
M5 idle-check skip · M6 analytics/approvals filters · M7 follow-up residue
policy + flag re-arm on unarchive · archived-page pagination.

**Batch 5 — The remaining round-1 opens:**
Offboarding lifecycle (Theme 1 — biggest remaining root cause) · move-stage CAS ·
contracts back-fill at convert + link-client parity · phone_normalized + dedup +
merge · assigned_to FKs · notifyLeadOwner helper · health-score due-bound ·
lost_reason clear · lead-score retire-or-wire decision.

---

*Method note: all 18 verified findings survived independent adversarial
verification (0 refuted; 7 downgraded in severity for this deployment's size —
1 admin + 2 active agents). The 6 unverified lows are finder-reported only.
Live-DB metrics are read-only SELECTs against production on 2026-07-03.*
