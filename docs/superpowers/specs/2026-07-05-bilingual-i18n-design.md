# Bilingual UI (Arabic + English) — Design Spec

**Date:** 2026-07-05
**Status:** Approved by Abdou (brainstorming session)
**Audience:** All 4 audiences — Admin, Employee, Sales Agent (dashboard) + Client (portal). Every user picks a preferred language from their own account settings; the whole UI (and eventually notifications + outbound documents) follows it.

---

## 1. Problem

The entire system is Arabic-only, hardcoded:

- UI strings are written inline in components/pages (no translation layer exists).
- `<html lang="ar" dir="rtl">` is fixed in `app/layout.tsx`; ~40 more inline `dir="rtl"` are scattered on dialogs/tabs/toolbars.
- API routes return Arabic error/success messages directly (`apiError('غير مصرح', 403)`).
- Notifications are rendered to Arabic text at WRITE time and stored in `pyra_notifications.title/message`.
- Client-facing documents (invoice/quote PDFs, emails, WhatsApp messages) are Arabic-only.

Abdou wants the system fully bilingual (AR/EN), easy switching, and a per-user
preferred language stored in account settings.

**Measured scale (grep `[؀-ۿ]` over ts/tsx, 2026-07-05 — real numbers, not estimates):**

| Area | Files | Arabic-containing lines |
|---|---|---|
| `components/` | 277 | 3,532 |
| `app/dashboard/` | 155 | 3,373 |
| `app/api/` | 325 | 1,848 |
| `lib/` | 36 | 1,501 (module-guide 641, rbac 160, statuses 148, PDFs ~280) |
| `app/portal/` | 23 | 250 |
| `hooks/` | 18 | 75 |
| **Total** | **838** | **10,601** |

This is the largest single retrofit in the codebase's history. The design's #1
job is making it shippable in independent phases without ever breaking the
Arabic experience.

## 2. Locked Decisions (from brainstorming, 2026-07-05)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Both surfaces** support both languages — dashboard implemented first, portal after | Dashboard is the larger/higher-value surface; portal parity is a CLAUDE.md mandate |
| D2 | **Notifications get a full template system** — new notifications store `type + params` and are rendered in the VIEWER's language at display time; legacy rows fall back to their stored Arabic text | Abdou explicitly chose the clean architecture over dual-write or defer |
| D3 | **Outbound documents/messages ARE in scope** — invoice/quote PDFs, emails, WhatsApp messages render in the RECIPIENT's language (last phases) | Abdou explicitly chose to include them |
| D4 | **Phased rollout** — infra → app shell → dashboard module-by-module → portal → notifications → documents. Untranslated parts show Arabic (never blank, never raw keys) | 10.6k strings cannot ship big-bang safely |
| D5 | **Library: `next-intl` WITHOUT locale routing** — locale comes from user preference (DB → cookie), URLs never change (no `/en/` prefix) | Zero blast radius on stored notification `target_path`s, email links, middleware redirects, bookmarks. SEO is irrelevant behind auth |
| D6 | **Default language = Arabic** for every new/existing user and client | Current user base is Arabic-first; EN is opt-in per user |
| D7 | **Fallback = Arabic** — a missing EN key renders the AR string (deep-merge at load), never a raw key or empty string | This is what makes phased delivery safe |
| D8 | **Same font (Cairo) for both languages** | Cairo already ships the `latin` subset; one brand identity, no font swap complexity |

## 3. Existing Infrastructure Reused (discovery findings)

| Piece | Where | Relevance |
|---|---|---|
| Logical CSS properties everywhere (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`) — enforced by ESLint guard rails | whole codebase, `eslint.config.mjs` | **LTR flip mostly "just works"** — the single biggest cost-saver |
| `rtl:rotate-180` pattern for directional icons (Phase 15.1 lock §7) | breadcrumbs, calendar, attendance | Already direction-aware — works unchanged in LTR |
| Cairo font with `arabic` + `latin` subsets | `app/layout.tsx` | No font work needed |
| `formatCurrency` uses `en-AE` + LTR marks | `lib/utils/format.ts` | Already locale-stable; unchanged |
| `formatDate`/`formatRelativeDate` with date-fns `ar` locale | `lib/utils/format.ts` | Needs a locale parameter (see §7) |
| Central `notify()` helper + `NotificationType` union (~40 types) | `lib/notifications/notify.ts` | Single choke point for the template system (D2) |
| Centralized status labels (17 entity types) | `lib/constants/statuses.ts` | Single choke point for status label localization |
| Server PDF asset injection pattern (fonts/logo injected by server routes) | `lib/pdf/pdf-assets-server.ts` (Quote System lock §5) | Same injection pattern reused for label catalogs (D3) |
| `pyra_agent_whatsapp_settings` / mailer / Evolution client | lib/email, lib/evolution | Outbound channels for D3 recipient-language rendering |
| Users profile page + portal profile page | `/dashboard/profile`, `/portal/profile` | Natural home for the language preference control |

**No existing i18n library or infra of any kind** (verified — the only `locale`
hits are `toLocaleString`/date-fns calls).

## 4. Architecture

### 4.1 Library + mode

`next-intl` (latest 4.x), configured in **"without i18n routing"** mode:

- `next.config.ts` wrapped with `createNextIntlPlugin()`.
- `i18n/request.ts` — `getRequestConfig` reads the locale from the
  `pyra_locale` cookie (default `'ar'`), loads + deep-merges messages (§5).
- NO `middleware` changes, NO `[locale]` segment, NO URL changes.
- `NextIntlClientProvider` mounted in `app/layout.tsx` (with per-section
  message subsetting later if payload size demands it — see §12 Risks).

Supported locales: `['ar', 'en']`, typed via the next-intl `AppConfig`
augmentation so `t()` keys and locales are TypeScript-checked.

### 4.2 Locale resolution chain (source of truth → cache)

```
pyra_users.preferred_language  (DB — source of truth, dashboard users)
pyra_clients.preferred_language (DB — source of truth, portal clients)
        │  written on login + on every preference change
        ▼
pyra_locale cookie (1-year maxAge, path=/)   ← what the server reads per request
        ▼
i18n/request.ts getRequestConfig → locale    ← next-intl context for RSC/client/API
        ▼
<html lang={locale} dir={locale==='ar' ? 'rtl' : 'ltr'}>
```

- **Login** (`/api/auth/login` + portal login): after auth succeeds, read the
  user/client's `preferred_language` and set the `pyra_locale` cookie on the
  response.
- **Switching**: the profile PATCH endpoint updates the DB column AND re-sets the
  cookie in the same response, then the client does `router.refresh()` (full
  RSC re-render in the new locale — no hard reload needed, but a hard reload
  is the acceptable simple fallback if refresh proves glitchy).
- **Pre-auth pages** (login screens): a local toggle writes the cookie only
  (no DB yet); after login the DB value wins and re-sets the cookie.
- Cookie is a CACHE. On any mismatch the DB value wins (login always rewrites).

### 4.3 Migration 035 — `preferred_language`

```sql
ALTER TABLE pyra_users
  ADD COLUMN IF NOT EXISTS preferred_language varchar(2) NOT NULL DEFAULT 'ar'
  CHECK (preferred_language IN ('ar','en'));

ALTER TABLE pyra_clients
  ADD COLUMN IF NOT EXISTS preferred_language varchar(2) NOT NULL DEFAULT 'ar'
  CHECK (preferred_language IN ('ar','en'));
```

Additive, idempotent, zero backfill needed (default covers existing rows).
The notifications `params` column is a SEPARATE migration in Phase 8 (§9).

### 4.4 Switcher UI (3 surfaces per app)

| Surface | Dashboard | Portal |
|---|---|---|
| Quick toggle | Topbar globe icon (next to theme toggle) — flips AR ⇄ EN in one click | Portal topbar, same pattern |
| Account settings | `/dashboard/profile` — language select persisted to `pyra_users` | `/portal/profile` — persisted to `pyra_clients` |
| Pre-auth | Login page corner toggle (cookie-only) | Portal login, same |

Admin bonus: the users edit dialog gets a read-only display of the user's
current language (admin does NOT set it — it's personal preference; avoids
fighting between admin and user).

## 5. Message Catalogs

### 5.1 Layout

```
messages/
  ar/
    common.json        ← buttons, actions, generic empty/loading/error states
    nav.json           ← sidebar groups, topbar, command palette, breadcrumbs
    auth.json          ← login, 2FA
    statuses.json      ← ALL entity status labels (from lib/constants/statuses.ts)
    notifications.json ← per-NotificationType templates (Phase 8)
    dashboard.json, boards.json, crm.json, finance.json, hr.json,
    settings.json, reports.json, files.json, whatsapp.json,
    portal.json, guide.json  ← per-module namespaces, added phase by phase
  en/
    (mirrors ar/ file-by-file)
```

- **AR catalogs are extracted from the code as-is** (the current Arabic IS the
  source content — extraction is mechanical, not re-authoring).
- **EN is authored alongside during each phase** by Claude; Abdou spot-reviews
  per phase (ERP terminology is standardized; flagged terms get a glossary
  entry in the doc header of `messages/en/common.json`).
- Key convention: `namespace.section.key` (e.g. `crm.pipeline.addLead`,
  `common.actions.save`). camelCase keys, English key names.

### 5.2 Fallback (D7 — the safety rule)

In `i18n/request.ts`:

```ts
const arMessages = await loadNamespaces('ar');
const messages = locale === 'ar'
  ? arMessages
  : deepMerge(arMessages, await loadNamespaces('en')); // EN overrides, AR fills gaps
```

A missing EN key therefore renders the Arabic string. Raw keys/blank strings
are structurally impossible. This single rule is what allows shipping
module-by-module.

### 5.3 Plurals + interpolation

ICU MessageFormat via next-intl. Arabic's 6 plural categories
(zero/one/two/few/many/other) MUST be used for every count-bearing message —
no manual `count > 1 ?` string logic. Example:

```json
"tasksDue": "{count, plural, zero {لا مهام} one {مهمة واحدة} two {مهمتان} few {# مهام} many {# مهمة} other {# مهمة}}"
```

## 6. RTL/LTR Mechanics

1. `<html lang dir>` becomes dynamic (per §4.2). `Toaster dir` follows it.
2. **Sweep the ~40 inline `dir="rtl"`** (list captured in discovery): the rule
   is *components inherit direction from `<html>`* — the attribute is removed
   unless the element is a genuine opposite-direction island.
3. Legitimate direction islands keep explicit dir, switched to `dir="auto"`
   where the content is user-generated (WhatsApp message bubbles, client
   names, notes) so Arabic content renders correctly inside an EN UI and vice
   versa.
4. `components/ui/scroll-area.tsx` hardcodes `dir="rtl"` — parametrized from
   the active locale.
5. The kanban boards' locked `pointerWithin` collision detection (Phase 7
   lock) is layout-direction-agnostic by design — explicitly re-verified in
   LTR during the boards module phase. **The locked drag invariants are not
   touched.**
6. Existing `rtl:` Tailwind utilities are conditioned on the html dir and need
   no changes.

## 7. Dates, Numbers, Currency

- `formatDate`/`formatRelativeDate` gain an optional `locale` param
  (`'ar' | 'en'`, resolved from a new `lib/i18n/date-locale.ts` helper mapping
  to date-fns `ar`/`enUS`). A client hook `useAppLocale()` supplies it;
  server code passes it explicitly.
- `formatCurrency`/`formatNumber` stay `en-AE` (Western digits, LTR-marked) —
  correct for BOTH locales; finance figures do not change presentation.
- `formatTime` (ar-AE, Arabic-Indic digits) gains the locale param → `en-AE`
  in EN (Latin digits).
- `MONTH_NAMES_AR` / weekday arrays (duplicated in a few components + shared
  constants) route through the catalogs (`common.months.*`, `common.days.*`).
- `dubaiDayKey()` and all Dubai-timezone math are LOCALE-INDEPENDENT and
  untouched (Phase 15.1 lock).

## 8. Status Labels + Shared Constants

`lib/constants/statuses.ts` keeps the status VALUE constants (unchanged — they
gate logic everywhere). The `*_STATUS_LABELS` maps migrate to
`messages/{locale}/statuses.json` with a typed accessor:

```ts
// lib/i18n/status-labels.ts
useStatusLabels('invoice')  // client hook → (status) => localized label
getStatusLabels(t, 'invoice') // server variant
```

Migration is per-module (a module's phase swaps its `*_LABELS` imports). The
old Arabic maps remain exported until the last consumer migrates, then are
deleted. Same treatment for `ATTENDANCE_STATUS_STYLES`-style label+style maps
(styles stay in code; labels move to catalogs).

`lib/auth/rbac.ts` permission display names (160 Arabic lines — role editor
catalogue) and `lib/config/module-guide.ts` (641 lines of guide content) are
CONTENT-heavy: they migrate in the settings/guide module phase with the same
catalog approach (`guide.json` is the single largest translation deliverable).

## 9. Server-Side Messages (API routes — 1,848 lines)

- Route handlers use `getTranslations({namespace})` from `next-intl/server` —
  the request config (cookie) resolves the CALLER's locale automatically.
  `apiError()`/`apiSuccess()` signatures are UNCHANGED (they take final
  strings).
- Migrated **module-by-module together with that module's UI phase** (an
  invoice-page phase migrates `app/api/invoices/*` messages in the same PR).
- Cron/external/webhook routes (no user cookie) stay Arabic — their consumers
  are machines and admins; log/error text is out of scope by definition.
- Zod validation messages shown to users follow the same per-module treatment.

## 10. Notifications Template System (D2 — Phase 8)

### 10.1 Storage

Migration (Phase 8): `pyra_notifications ADD COLUMN params jsonb NULL`.
Existing `title`/`message` columns stay — they are the legacy fallback AND
remain populated (see dual-write below).

### 10.2 Write path — `notify()` v2

Call sites (30+) migrate from passing rendered Arabic strings to:

```ts
await notify(supabase, {
  to: 'ahmed.s',
  type: 'task_assigned',                       // existing NotificationType union
  params: { actorName: actor.display_name, taskTitle: task.title },
  link: `/dashboard/boards/${boardId}?task=${taskId}`,
  entity: { type: 'task', id: taskId },
  from: {...},
});
```

`notify()` renders the AR title/message from the catalog server-side and
stores BOTH (`title`/`message` = Arabic render, `params` = raw values). This
dual-write keeps every legacy consumer working (portal bell, WhatsApp sends,
anything reading title/message) during and after the transition.

### 10.3 Read path

The notification bell (dashboard + portal) renders per row:
`params != null` → render from `notifications.{type}.title/message` catalog in
the viewer's locale with ICU interpolation; `params == null` (legacy rows) →
show stored Arabic text. ~40 `NotificationType` templates authored AR+EN.

### 10.4 Delivery channels

WhatsApp/email deliveries of notifications render AT SEND TIME in the
RECIPIENT's `preferred_language` (recipient ≠ viewer distinction matters here).

## 11. Recipient-Language Documents (D3 — Phase 9)

Principle: **the RECIPIENT's language, not the actor's.**

| Output | Language source | Notes |
|---|---|---|
| Invoice / quote / statement PDFs | `pyra_clients.preferred_language` | EN rendering is technically EASIER (jsPDF native LTR, built-in fonts); AR path (locked Arabic engine) unchanged |
| Client emails (quote sent, invoice, portal notices) | `pyra_clients.preferred_language` | `lib/email` templates get EN variants |
| Employee documents (payslip PDF) | `pyra_users.preferred_language` | |
| HR legal docs (offer letter, NDA, asset handover) | **stay Arabic/bilingual as-is** | UAE legal documents — existing locked generators untouched |
| WhatsApp to leads / lead reminders | **stay Arabic in v1** | Leads have no language preference field; adding one is a v1.1 item |
| Agent-facing WhatsApp reminders (follow-up cron) | `pyra_users.preferred_language` | |

PDF generators gain a `locale` param + injected label catalog (same injection
pattern as the server-font lock — generators stay isomorphic and pure; the
server route supplies `{ fonts, defaultLogo, labels, locale }`).

## 12. Phasing Roadmap

Each phase independently: code → `pnpm run check` → `pnpm build` → visual QA
(RTL + LTR + dark mode) → commit → push → deploy. Arabic experience must be
pixel-identical after every phase.

| Phase | Deliverable | Exit criteria |
|---|---|---|
| **0 — Infra** | next-intl setup (no routing), migration 035, cookie plumbing in both logins, dynamic `<html lang dir>` + Toaster, `useAppLocale`, catalog skeleton + deep-merge fallback, locale switcher (topbar + profile + login) for dashboard AND portal shells, format helpers locale param | Switching locale flips `lang`/`dir`/toasts globally; ALL content still Arabic; Arabic UX unchanged; both switch surfaces persist to DB |
| **1 — App shell** | sidebar, topbar, command palette, breadcrumbs, login/2FA, shared UI (EmptyState, DataTable chrome, dialog buttons, pagination), `statuses.json` + accessor, `common`/`nav`/`auth` catalogs, `dir` sweep of shared components | Full chrome bilingual; a user in EN sees EN navigation around Arabic page bodies |
| **2 — Work core** | My Work inbox, my-tasks, boards/tasks (incl. task-sheet), calendar + their API routes | |
| **3 — CRM** | pipeline, leads, customers, follow-ups, approvals, CRM dashboard + API routes | LTR drag-and-drop explicitly verified (locked invariants untouched) |
| **4 — Finance** | invoices, quotes, contracts, expenses, payments, reports + API routes | Money formatting verified identical in both locales |
| **5 — HR** | attendance, leave, payroll, evaluations, documents vault, onboarding UI + API routes | |
| **6 — Admin tail** | settings, users/roles (rbac display names), error-logs, guide + module-guide content (641 lines), remaining dashboard pages + API routes | Dashboard 100% bilingual |
| **7 — Portal** | all portal pages + portal API messages + portal notifications display | Portal parity reached (D1 complete) |
| **8 — Notifications templates** | §10 in full: migration, notify() v2, 30+ call sites, ~40 templates AR+EN, bell renderers | New notifications appear in viewer's language; legacy rows still render |
| **9 — Outbound documents** | §11 in full: PDF locale param + EN labels, email EN templates, WA recipient-language | Client with EN pref receives EN invoice PDF + EN email |

Phases 2–6 order can be re-prioritized by Abdou between phases without
re-design — they are independent by construction.

## 13. Guardrails

1. **Fallback rule (D7)** — structurally no blank strings/raw keys.
2. **`pnpm i18n:check` script** — greps migrated paths (allowlist grows per
   phase) for literal `[؀-ۿ]` outside `messages/` and fails loudly;
   run alongside `pnpm run check` before every push. Prevents regression of
   hardcoded Arabic into migrated modules.
3. Existing ESLint RTL guard rails stay (logical properties enforcement).
4. TypeScript-checked message keys (next-intl `AppConfig` augmentation) —
   a typo'd key is a compile error, not a runtime blank.
5. Per-phase visual QA checklist: both locales × light/dark × mobile width.
6. **Never touch locked invariants**: kanban drag stack, Arabic PDF engine
   internals, `notify()` fire-and-forget semantics, Dubai-day math.

## 14. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Scale drift (10.6k strings, months of phases) | D4 phasing + D7 fallback: every intermediate state is shippable and Arabic-safe |
| Client message payload grows (all catalogs to browser) | Namespace subsetting: dashboard layout provides dashboard namespaces, portal layout provides portal namespaces; measured at Phase 1 exit, split further only if >~150KB gzipped |
| Mixed-direction content (Arabic data in EN UI) | `dir="auto"` on user-content elements during each module's sweep |
| EN translation quality (ERP domain terms) | Glossary in `messages/en/common.json` header + Abdou spot-review per phase |
| `router.refresh()` leaving stale client state after switch | Locale switch also invalidates React Query cache (`queryClient.clear()`); hard reload as documented fallback |
| Search/command palette misses EN names | module-guide `keywords` arrays gain EN keywords in Phase 6 |
| notify() v2 breaking a call site silently | Dual-write keeps legacy columns populated; call sites migrate with per-site verification (the `void supabase` lazy-thenable lesson applies) |

## 15. Out of Scope / v1.1

- Lead-facing WhatsApp language preference (leads keep Arabic).
- HR legal document translation (offer letter/NDA stay as locked).
- Translating historical DB content (old notifications, activity logs, stored
  Arabic data rows).
- Third language support (the architecture trivially allows it later — add a
  locale to the array + catalogs).
- Machine-translation pipeline / external TMS tooling — catalogs are
  hand-maintained JSON in-repo.
- Cron/webhook/log Arabic strings (machine consumers).
