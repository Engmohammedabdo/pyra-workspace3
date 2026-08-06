# Chat Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the presentation layer of `/dashboard/sales/chat` to the approved hybrid design (spec: `docs/superpowers/specs/2026-08-06-chat-redesign-design.md`) — Pyra Pro identity, needs-reply prioritization, always-visible sales tools — WITHOUT touching the data layer that was verified green (1020 tests) on 2026-08-06.

**Architecture:** Two-column layout. New pure helpers (`lib/whatsapp/inbox.ts`) drive section split/sorting/waiting labels and thread merging, unit-tested first. The conversations API gains server-computed counts in `meta`. The store gains one additive `quickFilter` field. Everything else is component restyling/recomposition that REUSES the existing hooks, mutations and dialogs.

**Tech Stack:** Next.js 15 App Router · React Query hooks (existing) · shadcn/ui + Tailwind logical props · Vitest.

## Global Constraints

- Branch `integrate-pending-fixes`; push `git push origin HEAD:integrate-pending-fixes`. **NEVER push to origin/main** (deploys prod — owner's «انشر» only). NEVER `git add -A` — stage exact paths.
- Verify per task: `pnpm run check` then `pnpm build`; tests via `npx vitest run <file>` (full `pnpm test` in the closure task).
- RTL: only `ms-/me-/ps-/pe-/start-/end-/text-start/text-end` — never `ml-/mr-/pl-/pr-/left-/right-`.
- NO hardcoded color hexes in components — theme tokens/Tailwind semantic classes only (`bg-background`, `bg-card`, `bg-muted`, `text-muted-foreground`, `border-border`, `bg-primary`, `bg-orange-500/10 text-orange-600 dark:text-orange-400`, etc.). The warm palette arrives via the `.crm-theme` wrapper (already defined in `app/globals.css:249`).
- Arabic literals allowed in `components/sales/chat/**` (Phase 6e not migrated) — match existing style.
- Files < 300 lines; new UI goes in `components/sales/chat/` subfolders.
- Reuse, never rewrite: AssignDialog, create-lead-dialog, send-quote-dialog, send-invoice-dialog, schedule-followup-dialog, add-note-dialog, snooze-picker, label-picker, `useUpdateConversation`, `useConversations`, `useWAInstances`, `lineLabel`/`isNonCompanyLine` (`components/sales/chat/line-label.ts`).
- Multi-line lock (2026-08-06): never hardcode `'pyraai'` in anything new; keep line badges; do not touch `/send`, webhook, poll, or `lib/whatsapp/pull-messages.ts`.
- SDD ledger: append one line per task to `.superpowers/sdd/progress.md` (committed with the task).

## Verified ground truth (2026-08-06 — build on this, do not re-derive)

- `pyra_whatsapp_conversations` carries `last_customer_message_at`, `last_agent_message_at`, `status`, `assigned_to`, `instance_name`, `lead_id`, `unread_count`, `snoozed_until`, `is_group`, `merged_into_id` (see `WA_CONVERSATION_FIELDS`, `lib/supabase/fields.ts:202`).
- Conversations route: `app/api/dashboard/sales/whatsapp/conversations/route.ts` — params status/assigned/search/label/team/priority/assigned_agents/sort/type/instance/limit; agent scoping `.eq('assigned_to', username)` for non-admins; excludes own number + merged rows. The hook `useConversations` (hooks/useWhatsApp.ts:140) already passes `meta` through (`result?.meta`).
- Store: `components/sales/chat/use-chat-store.ts` — `FilterState {priority[], assignedTo[], team, label, instance}`, TABS defs, `activeFilterCount`, bulk mode, `activeDialog: 'quote'|'invoice'|'lead'|'note'|'followup'|null`. `chat-layout.tsx:73-85` builds queryParams from tab+sort+filters.
- Dialog open mechanism: `setActiveDialog('quote' etc.)` — dialogs are mounted in `chat-panel/index.tsx` / `chat-layout.tsx` (implementer: grep `activeDialog` for mount points before moving anything).
- Pipeline stages: no hook — `create-lead-dialog.tsx:46` does `fetchAPI<PipelineStage[]>('/api/crm/pipeline-stages')` inline. Stage rows carry `id, name, name_ar` (+ order field — implementer must check the API response shape, e.g. `sort_order`, before relying on it).
- Lead data: conversation rows carry `lead_id`; lead fetch exists via `fetchAPI('/api/crm/leads/<id>')`-style endpoints — CHECK `hooks/` for an existing lead hook (`useLead`) before writing one inline.
- Lead activities (for inline call events): `hooks/useLeadActivities.ts` exists (used by the CRM timeline); activity types `call_logged`/`call_attempt` with `metadata.duration_seconds`/`direction`.
- Follow-ups: `GET /api/crm/follow-ups` scoped by assignee; open follow-up for a lead can be read with a `lead_id` param — implementer verifies the param name in the route before use.
- `.crm-theme` scope class: `app/globals.css:249` — apply to the page-level wrapper; popovers/dialogs inherit ONLY when `body[data-crm]` is set, which the CRM layout does via `document.body.dataset.crm` (see `docs/decisions/crm.md` "Pyra Pro Redesign" §2) — the chat page must replicate that dataset toggle in a `useEffect` for its dialogs to pick up the warm palette.
- Existing WhatsApp-clone hexes to eliminate live in: `chat-layout.tsx`, `conversation-list.tsx`, `conversation-list/conversation-item.tsx`, `chat-panel/*` , `message-bubble.tsx`, `filters/filter-bar.tsx` (grep `#00a884|#f0f2f5|#111b21|#202c33|#2a3942|#e9edef|#313d45|#667781|#8696a0`).
- Pre-existing test count: 1020 passing (2026-08-06). One historically flaky-unrelated file: none currently — full suite green.

## Approved-mockup color mapping (mockup hex → code)

| Mockup | In components |
|---|---|
| `#FBFAF9` canvas | `bg-background` (inside `.crm-theme`) |
| `#FFFFFF` card | `bg-card` |
| `#F5F3F1` warm surface | `bg-muted` / `bg-secondary` |
| `#F1EDE8` border | `border-border` |
| `#7A7570` taupe | `text-muted-foreground` |
| `#F97316` orange | `bg-primary text-primary-foreground` / `text-orange-600 dark:text-orange-400` |
| `#FFF7ED` orange-soft | `bg-orange-500/10` (+ `border-orange-500/20`) |
| emerald badges | existing line-badge classes (keep) |
| amber wait / `#FFFBEB` | `bg-amber-500/10 text-amber-700 dark:text-amber-300` |
| red late / `#FEF2F2` | `bg-red-500/10 text-red-700 dark:text-red-300` |

---

### Task CR-T1: Pure inbox helpers (TDD)

**Files:**
- Create: `lib/whatsapp/inbox.ts`
- Test: `__tests__/whatsapp-inbox.test.ts`

**Interfaces (Produces):**
```ts
export const LATE_THRESHOLD_MINUTES = 120;
export interface InboxConversationLike {
  id: string; status: string;
  last_customer_message_at: string | null;
  last_agent_message_at: string | null;
  last_message_at: string | null;
}
export function needsReply(c: InboxConversationLike): boolean;
// minutes the customer has been waiting; null when not needs-reply
export function waitingMinutes(c: InboxConversationLike, nowMs: number): number | null;
// 'ok' | 'late' — late when waitingMinutes >= LATE_THRESHOLD_MINUTES
export function waitingSeverity(mins: number): 'ok' | 'late';
// Arabic label ladder: <60 → '٤٥د' style minutes, >=60 → hours 'س', >=24h → days 'ي'
export function formatWaiting(mins: number): string;
// Splits + sorts: needsReply oldest-customer-message FIRST; rest by last_message_at desc
export function splitInbox<T extends InboxConversationLike>(list: T[], nowMs: number): { needs: T[]; rest: T[] };
export interface ThreadEvent { kind: 'message' | 'call'; at: number; item: unknown }
// Merges chat messages with call activities (call_logged/call_attempt) by timestamp asc
export function mergeThread(
  messages: Array<{ timestamp: string }>,
  calls: Array<{ created_at: string; activity_type: string }>,
): ThreadEvent[];
```

Rules encoded: `needsReply` = `status === 'open'` AND `last_customer_message_at` present AND (`last_agent_message_at` null OR customer > agent). Digits in `formatWaiting` are Arabic-Indic (`'٠١٢٣٤٥٦٧٨٩'` map) to match the mockup.

- [ ] **Step 1: Write failing tests** — cases: open+customer-after-agent → needs; agent replied after → not; resolved → not; null agent timestamp + customer message → needs; waitingMinutes math; severity boundary at exactly 120 → 'late'; formatWaiting 45→'٤٥د', 180→'٣س', 2900→'٢ي'; splitInbox orders needs by OLDEST customer message first and rest by last_message_at desc; mergeThread interleaves and sorts asc, empty-calls passthrough.
- [ ] **Step 2:** `npx vitest run __tests__/whatsapp-inbox.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `lib/whatsapp/inbox.ts` (pure, no imports from React).
- [ ] **Step 4:** `npx vitest run __tests__/whatsapp-inbox.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(chat): pure inbox prioritization helpers` + ledger line.

### Task CR-T2: Server counts in conversations meta

**Files:**
- Modify: `app/api/dashboard/sales/whatsapp/conversations/route.ts`

**Interfaces (Produces):** response `meta.counts = { needs_reply: number; unassigned: number; late: number }`, computed with `count: 'exact', head: true` queries that respect the SAME base scoping as the list (own-number exclusion, merged exclusion, agent scoping, instance filter) but NOT the status/tab filters — the chips are global for the current line+scope. `late` uses `last_customer_message_at <= now-120min` on needs-reply rows (`LATE_THRESHOLD_MINUTES` imported from `lib/whatsapp/inbox`).

- [ ] **Step 1:** Add a `buildBaseQuery()` local helper applying own-number/merged/agent-scope/instance to a fresh builder (Supabase builders are lazy `let q = …; q = q.eq(…)` — reassign, never fork one builder).
- [ ] **Step 2:** Three head-count queries: needs_reply = `status='open'` + `not('last_customer_message_at','is',null)` + OR(`last_agent_message_at` is null, customer > agent — use `.or()` with ISO column comparison is NOT possible in PostgREST; instead compute needs_reply as `.filter('last_customer_message_at','gt','last_agent_message_at')`? PostgREST cannot compare two columns — so: fetch counts via one RPC-free approximation: `status='open'` and `.is('last_agent_message_at', null)` count PLUS a second count where both set and customer>agent is NOT expressible → therefore compute needs_reply/late from a light projection query (`id,last_customer_message_at,last_agent_message_at,status,assigned_to` with `.limit(2000)`) evaluated with `needsReply()`/`waitingMinutes()` in JS, and `unassigned` via a true head-count. Document the 2000 cap with a `console.warn` breach alarm (same pattern as my-day).
- [ ] **Step 3:** Wire counts into the existing `apiSuccess(data, meta)` shape (check the file's current meta usage first and extend, not replace).
- [ ] **Step 4:** `pnpm run check` + `pnpm build` → clean. Manual probe: hit the route in dev with an admin session OR rely on typecheck + CR-T3's visible counters against known DB state (`pnpm db:query` the same predicate to cross-check once).
- [ ] **Step 5:** Commit `feat(whatsapp): server-computed inbox counts (needs_reply/unassigned/late)` + ledger.

### Task CR-T3: Theme scope + top bar (counters-as-filters, line switcher, Ctrl+K)

**Files:**
- Modify: `components/sales/chat/use-chat-store.ts` (add `quickFilter: '' | 'needs_reply' | 'unassigned' | 'late'` + setter + include in `activeFilterCount`)
- Create: `components/sales/chat/top-bar.tsx`
- Modify: `components/sales/chat/chat-layout.tsx` (mount TopBar; apply `.crm-theme` + `body.dataset.crm` effect; map `quickFilter` → list filtering)
- Modify: `components/sales/chat/filters/filter-bar.tsx` (line section stays as-is; no removal)

**Interfaces:** TopBar consumes `useConversations` meta.counts + `useWAInstances` + store (`filters.instance`, `setFilters`, `quickFilter`, `setQuickFilter`). `quickFilter` filtering happens client-side in chat-layout: `needs_reply` → keep `needsReply(c)`; `unassigned` → `!c.assigned_to`; `late` → `waitingMinutes(...) >= LATE_THRESHOLD_MINUTES`.

- [ ] **Step 1:** Store: add field + setter (mirrors existing patterns; update `EMPTY_FILTERS`? No — `quickFilter` is a sibling of filters, reset by `resetFilters` is NOT required; chips toggle off by clicking again).
- [ ] **Step 2:** Build TopBar per mockup: title «المحادثات», three chips (orange/amber/red tinted classes from the color-mapping table, active state = solid tint + ring), segmented line switcher (buttons from `useWAInstances`, `lineLabel()`, «الكل» first; sets `filters.instance`), Ctrl+K chip; `useEffect` keydown listener (Ctrl/Cmd+K → `document.getElementById('wa-conv-search')?.focus()`).
- [ ] **Step 3:** chat-layout: wrap the page container with `crm-theme` class + `useEffect(() => { document.body.dataset.crm = '1'; return () => { delete document.body.dataset.crm; }; }, [])` (per the locked Pyra-Pro scoping decision); mount TopBar above the columns; apply quickFilter to the conversations array before it reaches the list; give the existing search input `id="wa-conv-search"`.
- [ ] **Step 4:** `pnpm run check` + `pnpm build` → clean; visual smoke in dev (`pnpm dev`, admin login) — chips render counts, clicking filters, line switcher filters.
- [ ] **Step 5:** Commit `feat(chat): Pyra Pro theme scope + top bar with counter-filters and line switcher` + ledger.

### Task CR-T4: Conversation list restyle (sections, waiting chips, row quick actions)

**Files:**
- Modify: `components/sales/chat/conversation-list.tsx` (sections via `splitInbox`)
- Modify: `components/sales/chat/conversation-list/conversation-item.tsx` (tokens, waiting chip, hover actions, dimmed resolved)

**Interfaces:** consumes CR-T1 helpers; «⤺ إسناد» triggers the same path the header uses today (implementer: grep how AssignDialog is opened — lift a `onQuickAssign(conv)` callback up to chat-layout where AssignDialog is mounted); «✓ حل» calls `useUpdateConversation` with `{status: 'resolved'}` (check exact mutation signature in hooks/useWhatsApp.ts before use).

- [ ] **Step 1:** conversation-list: replace the flat map with `splitInbox(visibleConvs, Date.now())` → section header rows («محتاج رد — الأقدم الأول» orange-tinted, «باقي المحادثات» muted) — headers only when the needs section is non-empty.
- [ ] **Step 2:** conversation-item: strip every WhatsApp hex → token classes (mapping table); add waiting chip (`formatWaiting` + severity coloring) for needs-reply rows; `opacity-60` when `status === 'resolved'`; hover-revealed quick-action buttons (visible on `group-hover`, admin-gated for إسناد — get `isAdmin` the same way filter-bar/chat-layout does); KEEP the line badge, unread badge, pin/mute icons, bulk-mode checkbox, `data-testid`, `contentVisibility` perf style.
- [ ] **Step 3:** Wire callbacks through `conversation-list` props from chat-layout (assign dialog with a conversation override, resolve mutation with optimistic invalidation as the hook already does).
- [ ] **Step 4:** `pnpm run check` + `pnpm build`; dev smoke: sections split correctly against live data, resolve works, assign opens prefilled.
- [ ] **Step 5:** Commit `feat(chat): prioritized conversation list with row-level assign/resolve` + ledger.

### Task CR-T5: Deal banner + context drawer

**Files:**
- Create: `components/sales/chat/deal-banner.tsx` (<300 lines; split `stage-steps.tsx` if needed)
- Create: `components/sales/chat/context-drawer.tsx` (wraps existing contact-panel content in a shadcn `Sheet`, restyled)
- Modify: `components/sales/chat/chat-panel/index.tsx` + `chat-panel/chat-header.tsx` (header slims down; banner mounts above messages)

**Interfaces:** DealBanner props `{ conversation, onOpenDialog(d), onToggleDrawer() }`. Internally: lead via existing lead hook (or inline `useQuery(['crm-lead', id], fetchAPI('/api/crm/leads/'+id), {enabled:!!id})` matching the CLAUDE.md inline pattern); stages via inline `useQuery(['crm-pipeline-stages'], …)` shared 60s staleTime; open follow-up via the follow-ups endpoint filtered by lead (verify param). No-lead degraded mode per spec (row 1 + «إنشاء عميل» primary).

- [ ] **Step 1:** Build StageSteps (done/current/todo from stages list vs `lead.stage_id`; order by the API's order field — verify its name in the response; final stages closed_won/closed_lost render as the 5th step's state). Read-only.
- [ ] **Step 2:** Build DealBanner rows 1–3 per mockup (KPIs: آخر تواصل relative via `formatRelativeDate`, المصدر label; actions row buttons call `onOpenDialog('quote'|'invoice'|'followup'|'note')` + إسناد callback; follow-up chip when an open one exists).
- [ ] **Step 3:** ContextDrawer: shadcn Sheet (`side` = logical end; full-screen on mobile) hosting the EXISTING contact-panel component (restyle pass: tokens only, no logic changes).
- [ ] **Step 4:** Recompose chat-panel: banner above messages; old header reduced to back-button + search + kebab (mobile keeps back behavior); ensure existing dialogs still mount/open (grep `activeDialog` consumers).
- [ ] **Step 5:** `pnpm run check` + `pnpm build`; dev smoke: linked-lead conversation shows stage steps + KPIs; no-lead conversation shows degraded banner; drawer opens/closes; all five dialogs open from the banner.
- [ ] **Step 6:** Commit `feat(chat): deal banner with stage steps + context drawer` + ledger.

### Task CR-T6: Messages, inline call events, input bar

**Files:**
- Modify: `components/sales/chat/message-bubble.tsx` (tokens; internal-note variant per mockup)
- Modify: `components/sales/chat/chat-panel/message-list.tsx` (merge call events via `mergeThread`)
- Create: `components/sales/chat/call-event-pill.tsx`
- Modify: `components/sales/chat/chat-input.tsx` + `chat-panel/note-input.tsx` (token restyle; segmented رد/ملاحظة per mockup — reuse existing `inputMode` store state)

**Interfaces:** message-list consumes `useLeadActivities(conversation.lead_id)` filtered to `call_logged|call_attempt` (hook already exists — verify its param/enabled shape) + `mergeThread` from CR-T1. CallEventPill renders centered: call_logged → emerald pill «📞 مكالمة m:ss — {agent}» (duration from `metadata.duration_seconds`, reuse the existing `callDuration`-style formatting found in `components/crm/activity/activity-item.tsx:88`), call_attempt → rose pill «محاولة اتصال — لم يرد».

- [ ] **Step 1:** CallEventPill (pure presentational, tokens only).
- [ ] **Step 2:** message-list: build the merged array with `useMemo`; render `kind==='call'` as pill, else existing bubble; day separators unchanged.
- [ ] **Step 3:** Bubble restyle: incoming `bg-card border-border`, outgoing `bg-orange-500/10 border-orange-500/20`, note variant amber-dashed + tag; keep reply-preview, media, statuses, group sender names intact.
- [ ] **Step 4:** Input bar restyle (segmented toggle + round primary send).
- [ ] **Step 5:** `pnpm run check` + `pnpm build`; dev smoke on the «Hi8» conversation + a lead-linked conversation with calls.
- [ ] **Step 6:** Commit `feat(chat): warm thread with inline call events + restyled composer` + ledger.

### Task CR-T7: Sweep — kill remaining WhatsApp hexes, mobile + dark audit

**Files:** every file under `components/sales/chat/` still matching the hex grep; `app/dashboard/sales/chat/page.tsx` if it carries styles.

- [ ] **Step 1:** `grep -rn "#00a884\|#f0f2f5\|#111b21\|#202c33\|#2a3942\|#e9edef\|#313d45\|#667781\|#8696a0\|#dfe5e7\|#6b7b8a" components/sales/chat app/dashboard/sales/chat` → replace ALL hits with tokens (filters, csat, sla, dialogs' embedded styles, bulk bar…). Zero hits when done.
- [ ] **Step 2:** Mobile smoke at 375px (list/chat switch, drawer as sheet, top bar wraps) + dark-mode smoke (`.dark`) — fix pairs per CLAUDE.md dark-mode table.
- [ ] **Step 3:** `pnpm run check` + `pnpm build` clean.
- [ ] **Step 4:** Commit `refactor(chat): retire the WhatsApp clone palette everywhere` + ledger.

### Task CR-T8: Closure — full suite, review package, docs

- [ ] **Step 1:** `pnpm test` full → 1020+ passing (new inbox tests added), zero regressions; `pnpm run check`; `pnpm build`.
- [ ] **Step 2:** `scripts/review-package <base> HEAD` → whole-wave review per repo convention; fix Criticals/Importants.
- [ ] **Step 3:** Docs: CLAUDE.md architecture map — one line for `lib/whatsapp/inbox.ts`; ledger closure entry; memory update (`whatsapp-shared-inbox.md` — redesign shipped, remaining backlog).
- [ ] **Step 4:** Report to owner in Arabic with what to eyeball; deploy ONLY on «انشر».

## Self-review notes

- Spec coverage: pains 1/2/3 → T3+T7 (identity), T1+T2+T3+T4 (find fast), T5 (tools visible); admin layer → T3 chips + T4 row assign; line invariants → constraints + T3 switcher; acceptance 1–5 map to T7/T3+T4/T5/T4/untouched-send.
- PostgREST cannot compare two columns — T2 deliberately computes needs_reply/late in JS over a capped projection (documented alarm), unassigned as a true head-count.
- Type consistency: `LATE_THRESHOLD_MINUTES`, `needsReply`, `waitingMinutes`, `formatWaiting`, `splitInbox`, `mergeThread` names used identically in T1→T2/T3/T4/T6.
