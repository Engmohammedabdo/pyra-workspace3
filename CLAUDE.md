# Pyra Workspace

ERP + CRM for Pyramedia X (UAE). Next.js 15 App Router + Supabase + Tailwind + shadcn/ui.
Arabic RTL UI. Orange brand (`orange-500`/`orange-600`).

## Commands

```bash
pnpm dev          # Dev server (turbopack)
pnpm build        # Production build — MUST pass before push
pnpm lint         # Lint
pnpm run check    # tsc --noEmit + i18n:check — MUST pass before push
pnpm test         # Vitest (single run) · pnpm test:watch for watch mode
pnpm i18n:check   # Hardcoded-Arabic gate over migrated paths (also inside `check`)
```

Database + release (details in [DB Migrations](#db-migrations-run-directly--never-ask-user)):

```bash
pnpm db:query <file.sql>   # Canonical SQL runner — Arabic MUST go via a UTF-8 file
pnpm db:backup [<label>]   # Pre-migration snapshot
pnpm db:record <version>   # Record a migration AFTER manually verifying it
pnpm db:check-drift        # Compare recorded checksums vs files
pnpm app:publish           # Publish an Android call-tracking app release
```

## Data Layer — React Query (MANDATORY)

**All data fetching and mutations use React Query (`@tanstack/react-query`).**
**NEVER use raw `fetch()` in components.** Use the hooks and helpers below.

### API Helpers (`hooks/api-helpers.ts`)
```tsx
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';

// Data fetching
fetchAPI<T>(url: string): Promise<T>

// Mutations (POST/PUT/PATCH/DELETE)
mutateAPI<T>(url: string, method: string, body?: unknown): Promise<T>
```

### Using Existing Hooks (42+ hooks available)
```tsx
// Dashboard hooks (hooks/use*.ts)
import { useMyWork } from '@/hooks/useMyWork';        // Unified inbox aggregator
import { useClients } from '@/hooks/useClients';
import { useProjects } from '@/hooks/useProjects';
import { useInvoices } from '@/hooks/useInvoices';
import { useFiles } from '@/hooks/useFiles';
import { useQuotes } from '@/hooks/useQuotes';
import { useTeams } from '@/hooks/useTeams';
import { useUsers } from '@/hooks/useUsers';
import { useSettings } from '@/hooks/useSettings';
import { useNotifications } from '@/hooks/useNotifications';
import { useAutomations } from '@/hooks/useAutomations';
import { useExpenses } from '@/hooks/useExpenses';
import { useContracts } from '@/hooks/useContracts';
import { useRecurring } from '@/hooks/useRecurring';
import { useCreditNotes } from '@/hooks/useCreditNotes';
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useLeave } from '@/hooks/useLeave';
import { useAttendance } from '@/hooks/useAttendance';
import { usePayroll } from '@/hooks/usePayroll';
import { useKnowledgeBase } from '@/hooks/useKnowledgeBase';
import { useEvaluations } from '@/hooks/useEvaluations';
import { useBoards } from '@/hooks/useBoards';
import { useRoles } from '@/hooks/useRoles';
import { useSales } from '@/hooks/useSales';

// Portal hooks
import { usePortalDashboard } from '@/hooks/usePortalDashboard';
import { usePortalProjects } from '@/hooks/usePortalProjects';
import { usePortalFiles } from '@/hooks/usePortalFiles';
import { usePortalContracts } from '@/hooks/usePortalContracts';
import { usePortalRecurring } from '@/hooks/usePortalRecurring';
import { usePortalNotifications } from '@/hooks/usePortalNotifications';
import { usePortalProfile } from '@/hooks/usePortalProfile';
import { usePortalKB } from '@/hooks/usePortalKB';
```

### Inline useQuery (when no hook exists)
```tsx
import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';

const { data, isLoading } = useQuery({
  queryKey: ['resource-name', filters],
  queryFn: () => fetchAPI<MyType>('/api/endpoint'),
});
```

### Mutations (POST/PUT/DELETE)
```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mutateAPI } from '@/hooks/api-helpers';

const queryClient = useQueryClient();
const mutation = useMutation({
  mutationFn: (data: Input) => mutateAPI('/api/endpoint', 'POST', data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['related-key'] });
    toast.success('تم بنجاح');
  },
  onError: () => toast.error('حدث خطأ'),
});
```

### API Helpers — Full Reference (`hooks/api-helpers.ts`)
```tsx
fetchAPI<T>(url)              // GET — unwraps { data } from response
mutateAPI<T>(url, method, body?)  // POST/PATCH/DELETE — unwraps { data }
buildQueryString(params?)     // { status: 'active' } → '?status=active'
```

### Hook Patterns
```tsx
// List hook with filters
export function useClients(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<Client[]>({
    queryKey: ['clients', params],
    queryFn: () => fetchAPI(`/api/clients${qs}`),
    staleTime: 60_000,       // Cache for 1 min
  });
}

// Single item (with enabled gate — prevents fetch when id is undefined)
export function useClient(id: string | undefined) {
  return useQuery<Client>({
    queryKey: ['clients', id],
    queryFn: () => fetchAPI(`/api/clients/${id}`),
    enabled: !!id,            // Only fetch when id exists
    staleTime: 60_000,
  });
}

// Create mutation
export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Client>) => mutateAPI('/api/clients', 'POST', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}

// Delete mutation
export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateAPI(`/api/clients/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}
```

### staleTime Conventions
| Data type | staleTime | Example |
|-----------|-----------|---------|
| Rarely changes | `60_000` (1 min) | Clients, settings, roles |
| Changes often | `30_000` (30s) | Invoices, expenses, tasks |
| Real-time | `15_000` + `refetchInterval: 30_000` | Notifications, automations |

### QueryClientProvider
Configured in `components/providers/query-provider.tsx` → mounted in `app/layout.tsx`.
Defaults: `staleTime: 30_000`, `refetchOnWindowFocus: false`.

### Adding a New Hook
1. Create `hooks/useNewResource.ts` following the pattern in `hooks/useClients.ts`
2. Use `fetchAPI` for queries, `mutateAPI` for mutations, `buildQueryString` for filters
3. Export typed hook with query params + single-item hook with `enabled: !!id`
4. Include cache invalidation on mutations (invalidate list + single item)
5. Use types from `types/database.ts` — avoid `[key: string]: unknown`

## STOP — Ask "WHO?" Before Writing Code

This system has **4 audiences**. Every feature must be evaluated against ALL of them:

```
┌─────────────────────────────────────────────────────────┐
│                    /dashboard (RBAC)                     │
│  ┌─────────┐  ┌────────────┐  ┌──────────────────────┐ │
│  │  Admin   │  │  Employee   │  │  Sales Agent /       │ │
│  │  كل شيء  │  │ مهام،إجازات │  │  Call Center          │ │
│  │          │  │ حضور،راتبي  │  │  leads,واتساب,عروض   │ │
│  └─────────┘  └────────────┘  └──────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                /portal (Cookie Auth)                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Client — يشوف بياناته فقط (مشاريع،ملفات،فواتير) │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**BEFORE writing ANY code, answer:**
1. **Admin** → إيه اللي يتحكم فيه؟ (إعدادات، إدارة، صلاحيات)
2. **Employee** → هل يشوف حاجة؟ هل ليه view مختلف (self-service)؟
3. **Sales Agent** → هل مرتبط بمبيعات أو عملاء؟
4. **Client** → هل يشوفها في البورتال؟ هل يتفاعل معاها؟

**Claude's recurring mistakes — NEVER repeat these:**
- ❌ Building a feature only for Admin, forgetting Employee has a different view
- ❌ Adding dashboard feature without portal parity for clients
- ❌ Building a module without admin settings/controls
- ❌ Adding something new without connecting it to existing system
- ❌ Guessing who should see what — ASK THE USER if unsure

**Use `/project:plan-feature` command to generate full impact analysis before coding.**

## ⚠️ MANDATORY: Orchestra Development Process

**When the user asks to ADD or DEVELOP any feature, you MUST follow this exact process:**

### Phase 1: Research (لا تكتب أي كود)
1. Read ALL documentation files: `CLAUDE.md`, `DATABASE-SCHEMA.md`, `docs/SYSTEM-STRUCTURE.md`, `docs/FEATURE-IMPACT-MAP.md`
2. Read all related source files (pages, APIs, components, types)
3. Understand the full dependency chain — what connects to what
4. Map which of the 4 audiences are affected

### Phase 2: Ask Questions
5. Ask the user **at least 3-5 clarifying questions** before writing any plan
6. Questions must cover: scope, audience, edge cases, integration points
7. Wait for answers — NEVER assume

### Phase 3: Plan
8. Build a comprehensive phased plan with clear deliverables per phase
9. Present the plan to the user for approval
10. Adjust based on feedback

### Phase 4: Execute (Orchestra Mode)
11. Execute phase by phase — each phase: code → `pnpm run check` → `pnpm build` → commit → push
12. Use parallel agents for independent research tasks
13. After each phase, verify on the live system if possible
14. Update documentation after all phases complete

**NEVER skip phases. NEVER start coding without completing Phase 1-3.**
**The user has explicitly requested this workflow. Violating it wastes time.**

## Architecture

```
app/dashboard/            → Admin + Employee + Sales (Supabase Auth + RBAC)
app/dashboard/page.tsx    → "صندوق شغلي" inbox — surfaces tasks, approvals, conversations, leads, follow-ups
app/dashboard/approvals/  → Manager Approvals dashboard (leave/expense/timesheet from direct reports)
app/portal/               → Clients (Cookie Auth, separate from dashboard)
app/api/dashboard/        → Admin API endpoints
app/api/portal/           → Client API endpoints (scoped to client data)
app/api/external/         → External API (n8n, Telegram Bot — API key auth)
app/api/boards/           → Board CRUD, columns, tasks, labels, members, star
app/api/tasks/            → Task CRUD, move, duplicate
app/api/finance/contracts → Contract management + invoice generation (retainer_amount = source of truth)
app/api/my-work/          → Unified employee inbox aggregator (one round trip, all sections)
app/api/approvals/team/   → Manager approvals data (leave + expense + timesheet, scoped to direct reports)
app/api/hr/overview/      → HR admin aggregator (hr.view gate + service role; headcount/attendance/leave/payroll/evaluations/alerts/celebrations)
app/api/hr/documents/     → HR document CRUD (documents.manage gate + service role; GET returns signed_url, strips storage_path)
app/api/hr/document-types/ → Document-types catalogue CRUD (documents.manage gate + service role)
app/api/my-documents/     → Employee own-scope document list + signed-URL refresh (documents.view gate + service role)
app/api/cron/document-expiry-check/ → Daily expiry cron (getExternalAuth + cron.document-expiry-check or *; 30-day + 7-day tiers; flag-flip then notify)
app/dashboard/hr/         → HR Overview page (admin-only, requirePermission('hr.view'))
app/dashboard/hr/documents/ → HR document management page (admin; DataTable + upload + row actions)
app/dashboard/hr/documents/settings/ → Document-types catalogue admin page
app/dashboard/my-documents/ → Employee read-only document list + download
hooks/                    → 42+ React Query hooks (data fetching + mutations)
hooks/api-helpers.ts      → fetchAPI() + mutateAPI() — shared fetch wrappers
hooks/useMyWork.ts        → Inbox aggregator hook (30s staleTime, refetch on focus)
hooks/useHROverview.ts    → HR Overview hook (60s staleTime, refetchOnWindowFocus)
hooks/useDocumentTypes.ts → Document-types CRUD hooks (useDocumentTypes + create/update/delete mutations)
hooks/useEmployeeDocuments.ts → HR doc hooks (useEmployeeDocuments, useEmployeeDocumentsByUser, useUploadEmployeeDocument [raw fetch FormData exemption], useUpdateEmployeeDocument, useDeleteEmployeeDocument)
hooks/useMyDocuments.ts   → Employee own-scope doc hook (documents.view; read-only)
hooks/useAttendance.ts    → Shared attendance hooks (useAttendanceRecords, useAttendanceSummary, useClockIn, useClockOut, useUpsertAttendance)
hooks/usePayroll.ts       → Shared payroll hooks (usePayrollRuns, usePayrollRun, useMyPayslips, useCreatePayroll, useCalculatePayroll, useUpdatePayroll)
hooks/useEmployeePayments.ts → Employee payments hooks (useEmployeePayments, useCreateEmployeePayment, useUpdateEmployeePayment)
components/ui/            → Shared primitives (both dashboard + portal)
components/layout/        → Dashboard layout (sidebar, topbar)
components/portal/        → Portal layout
components/boards/        → Board components (toolbar, task-sheet, calendar, list, settings)
components/sales/chat/    → WhatsApp chat (conversation list, chat window, contact sidebar)
components/files/         → Unified file-preview (shared between dashboard + portal)
components/dashboard/MyWorkInbox.tsx → 5-section inbox card
components/hr/overview/   → HR Overview widgets (HrAlerts, HrKpiRow, HeadcountChart, PayrollTrendChart, UpcomingLeaveList, EvaluationsStatusCard, CelebrationsCard)
components/hr/documents/  → Document vault sub-components (UploadDocumentDialog, DocumentRowActions, DocTypeRow, UserDocumentsTab)
components/attendance/    → Attendance sub-components (AttendanceCalendar, AttendanceSummaryCards, TodayClockCard, AdminAttendanceDialog)
components/payroll/       → Payroll sub-components (PayrollRunsTable, PayrollRunRow, EmployeePaymentsTab, CreatePayrollDialog, AddPaymentDialog)
lib/hr/overview-helpers.ts → computeCelebrations() + deriveAlerts() — pure helpers unit-tested in __tests__/hr-overview-helpers.test.ts
lib/hr/document-expiry.ts → classifyExpiry(expiryDate, todayKey) → ExpiryTier ('expired'|'expiring_7'|'expiring_30'|'ok'|'none') + EXPIRY_BADGE map — unit-tested in __tests__/document-expiry.test.ts
lib/hr/create-employee.ts → createEmployeeUser() — DRY user-creation helper (factored from /api/users POST); seeds leave balances for employee + sales_agent
lib/hr/store-generated-document.ts → storeGeneratedDocument() — uploads a PDF Buffer to pyra-private bucket + inserts pyra_employee_documents row (signed-URL pattern)
lib/pdf/arabic.ts        → prepareRtl() + drawRtlParagraph() + drawBilingualClause() — jsPDF Arabic reshaping + bidi helpers; callers must setFont('Amiri') first
lib/pdf/offer-letter-pdf.ts → generateOfferLetterPdf(offerData) — Arabic offer-letter PDF; sales vs non-sales content branching
lib/pdf/nda-pdf.ts       → generateNdaPdf(offerData) — Arabic NDA PDF
lib/pdf/asset-handover-pdf.ts → generateAssetHandoverPdf(offerData, assets) — Arabic asset-handover PDF
lib/constants/onboarding.ts → DEFAULT_ONBOARDING_TASKS — seed list for pyra_onboarding_tasks
hooks/useOnboarding.ts   → useOnboardings, useOnboarding, useCreateOnboarding, useUpdateOnboarding, useToggleOnboardingTask, useRegenerateOnboardingDoc
lib/auth/rbac.ts          → 79+ permissions, BASE_EMPLOYEE, ROLE_EXTRAS, buildUserPermissions()
lib/auth/auth-mapping.ts  → resolveAuthUserId() — heals legacy users missing pyra_auth_mapping rows
lib/auth/team-scope.ts    → getDirectReports / getManagerOf / isManager / canApproveFor()
lib/auth/whatsapp-scope.ts → canAccessWhatsAppMessage() — gates message-level mutations
lib/auth/scope.ts         → Dynamic scoping (team → project → board → member chain)
lib/auth/guards.ts        → requireAuth / requirePermission for server pages
lib/api/auth.ts           → getApiAuth / requireApiPermission for API routes
lib/api/activity.ts       → logActivity() — fire-and-forget audit trail helper
lib/api/response.ts       → apiSuccess()/apiError() — consistent API responses
lib/notifications/notify.ts → notify() / notifyMany() — central pyra_notifications writer
lib/evolution/client.ts   → Evolution API v2 client (WhatsApp)
lib/constants/statuses.ts → Centralized status constants (17 entity types)
lib/config/module-guide.ts → Guide data for every page
eslint.config.mjs         → ESLint guard rails (raw fetch warning, RTL class warning)
types/database.ts         → All TypeScript types
app/api/hr/productivity/     → Admin productivity report (hr.view gate + service role; metrics derived from pyra_task_stage_history)
app/api/my-productivity/     → Employee own-scope current-month production stats (productivity.view)
app/api/cron/task-deadline-reminders/    → Daily pipeline-task deadline reminders (in-app + WhatsApp; per-task/day dedup)
app/api/cron/attendance-checkin-reminder/ → Check-in reminder for users with personal work schedules (15-min grace)
lib/production/metrics.ts    → Pure journey/summary metrics (unit-tested in __tests__/production-metrics.test.ts)
lib/production/report.ts     → computeProductivity() server aggregation (boards → tasks → stage history → attendance)
lib/notifications/whatsapp.ts → sendWhatsAppToUser() — user-level WA: profile phone by default, agent_whatsapp_settings row as admin override
lib/utils/notification-sound.ts → Web Audio chime + mute persistence (dashboard bell)
hooks/useProductivity.ts     → useProductivityReport(month) + useMyProductivity()
app/api/mobile/*             → Android call-tracking app (device x-api-key auth via getExternalAuth + 'calls:device'; login/calls/sync/leads/calls/ignore/my-day/call-outcome/app-version/app-download/log-error/ping — see docs/CALL-TRACKING.md)
app/api/crm/calls/report/    → Per-agent calls report (calls.view gate; scope 'own' unless crm_reports.team_view)
app/dashboard/crm/calls/     → Calls report page (admin: all agents; sales agent: own)
app/api/cron/error-digest/   → Daily admin digest of new/unresolved pyra_error_logs (silent on a clean day; Dubai-day dedup)
lib/calls/match.ts           → buildLeadPhoneIndex() + matchLeadByPhone() + isConnectedCall() — the ONE contact predicate (see the calls locked decisions)
lib/calls/report.ts          → computeCallsReport() — pure per-agent/per-day aggregation; answered-only average + answer_rate
lib/utils/chunk.ts           → chunk() — batch unbounded .in() lists (150/batch) so PostgREST never 414s
pyra_agent_calls / pyra_ignored_numbers → Call-tracking tables (migration 037; service-role-only, Gap #3 doctrine)
pyra_app_releases            → Android release channel (migration 039 + 056 is_mandatory); publish via pnpm app:publish
lib/production/deadlines.ts  → Dubai-zoned deadline parsing/comparison for pipeline tasks
lib/production/quality.ts    → Rejection/review-round events derived from task activity (feeds the quality deduction tier)
lib/production/attribution.ts → Who owns a task's first-review outcome (assignee snapshot at review time)
lib/production/my-work.ts / productivity-export.ts → Employee production view + report export

Employee deductions (shipped 2026-07-22 — see the deductions policy below):
app/dashboard/hr/deductions/ → Admin deductions review page
app/api/hr/deductions/       → List (hr.manage) · approve · cancel · manual · attendance-tracking (all hr.manage)
app/api/hr/deductions/me/    → Employee own-scope "at risk this month" panel (payroll.view)
lib/constants/deductions.ts  → Tier constants — DELIVERY_DEDUCTION_PERCENT, MONTHLY_DEDUCTION_CAP_PERCENT (25),
                               DELIVERY_MIN_LEAD_TIME_HOURS, QUALITY_* thresholds, MANUAL_DEDUCTION_BASIS
lib/hr/deductions.ts         → Pure detection/eligibility core (attendance tiers, delivery, quality)
lib/hr/deduction-approval.ts → Approval + cap enforcement
lib/hr/manual-deduction.ts   → Admin-attested manual deductions (explicit basis required)
lib/hr/deductions-report.ts  → Evidence assembly for the admin review cards
hooks/useDeductions.ts · components/hr/deductions/ → Admin cards, evidence, manual + cancel dialogs, employee risk panel

lib/stripe/settle.ts         → Stripe settlement core — every money write checks its Supabase { error } and
                               fails loud (a swallowed error used to return HTTP 200 and lose the payment)
lib/payroll/payment-policy.ts → Deductions can NOT be approved/paid directly — they settle with their payroll run
lib/payroll/payment-period.ts → effective_month attribution for employee payments

Public quote signing (shipped 2026-07-27 — see the locked decisions below):
app/d/[token]/                          → Public, no-login quote page — Server Component reads via service role (no API route, no 401/envelope bugs)
app/api/public/quotes/[token]/sign/     → Unauthenticated public sign endpoint, token-gated (rate-limited)
app/api/quotes/[id]/link/               → Mint/read/revoke the public link (quotes.edit; mint is revoke-then-insert)
app/api/quotes/[id]/offline-signature/  → Attest a signature obtained OUTSIDE the system (counter-signed PDF/image evidence)
app/api/quotes/[id]/offline-signature/evidence/ → Short-TTL signed URL for the stored evidence file
lib/documents/link-state.ts  → classifyLinkState() — valid/expired/revoked; revocation wins over expiry
lib/documents/token.ts       → generateDocumentLinkToken() — 256-bit CSPRNG, base64url
lib/quotes/signability.ts    → canSignQuote() — one signability gate shared by portal, public and offline paths
lib/quotes/sign-quote.ts     → signQuote() — the one place a quote becomes signed (race-safe conditional update)
lib/quotes/public-payload.ts → PUBLIC_QUOTE_FIELDS allowlist — bank_details deliberately absent (D-1)
lib/quotes/content-hash.ts   → quoteContentHash() — binds a link to the content it was minted against (S-8)
lib/quotes/delivery.ts       → deriveDelivery() — honest sent/no_email/not_delivered from the send route's own result
lib/quotes/evidence-upload.ts → Offline-signature evidence validation (10 MiB cap, MIME allowlist, PDF magic-byte check)
hooks/useDocumentLinks.ts · hooks/useOfflineSignature.ts → Mint/revoke link + offline-signature mutations
components/quotes/PublicLinkDialog.tsx · OfflineSignDialog.tsx → Link-sharing + offline-attestation dialogs
components/quotes/QuoteDetailView.tsx → Shared quote view (moved from components/portal/ + translated, D-4) — used by portal AND the public page
```

### Page Structure Pattern
```
app/dashboard/[module]/page.tsx            → Server component (layout, metadata)
app/dashboard/[module]/[module]-client.tsx → Client component ('use client', hooks, UI)
```
Large pages are split into focused sub-components to keep files <300 lines.

### Role Permission Inheritance (`lib/auth/rbac.ts`)
**ALL internal roles inherit `BASE_EMPLOYEE` permissions automatically.**
When adding employee-facing features, add permission to `BASE_EMPLOYEE` — all roles get it.

**Permission action naming (strictly enforced):**
- `*.view` — read OWN data (self-service)
- `*.create` — create OWN records (e.g. submit leave, log own timesheet)
- `*.approve` — approve OTHERS' records (manager / HR — combine with `canApproveFor()` for scope)
- `*.manage` — admin-level CRUD on ANY record (NEVER in `BASE_EMPLOYEE` — leaks data via list endpoints)

```
BASE_EMPLOYEE (every internal user — HR self-service ONLY):
  dashboard.view, notifications.view, directory.view, announcements.view,
  timesheet.view, timesheet.create, leave.view, leave.create,
  attendance.view, attendance.create, payroll.view (my-payslips),
  evaluations.view, overtime.view

ROLE_EXTRAS (added on top):
  employee:     (nothing extra — base only)
  sales_agent:  + sales, leads, whatsapp, whatsapp_groups, quotes, clients
  // Future: call_center, accountant, project_manager, etc.
```

### Permission Build Pipeline (`buildUserPermissions()` in rbac.ts)
**Single source of truth.** Every permission build goes through this helper:

```ts
final = BASE_EMPLOYEE ∪ (DB role.permissions ?? legacy mapping) ∪ extra_permissions
```

Three entry points all call `buildUserPermissions(legacyRole, dbRolePermissions, extraPermissions)`:
- `lib/api/auth.ts::getApiAuth` — every API request
- `lib/auth/guards.ts::loadUserWithRole` — every server page render
- `app/api/auth/login/route.ts` — login dashboard.view check

Special cases (short-circuit):
- `legacyRole === 'admin'` OR DB role contains `'*'` → returns `['*']`
- `legacyRole === 'client'` → returns minimal portal permissions

**Why centralized:** previously each call site did `dbRolePermissions ?? legacyMapping` — meaning any user with a DB role_id silently lost BASE_EMPLOYEE permissions (no leave, no attendance, etc.). The helper guarantees inheritance even when a DB role is set.

### Per-User Extra Permissions

Beyond role permissions, individual users can be granted additional permissions via the `pyra_users.extra_permissions` jsonb column. The final permission set for a user is:

```
user's final permissions = role permissions ∪ extra_permissions
```

**When to use:**
- Grant a single employee access to WhatsApp chat without making them a sales_agent
- Give an employee admin-level access to one specific module
- Bypass role assignment for temporary access grants

**How to assign:**
- Admin opens user edit dialog → "صلاحيات إضافية" section
- Check any permissions to grant them on top of role defaults
- Save — permissions take effect immediately

**Implementation:**
- Merged in `lib/api/auth.ts` at the `rolePermissions` construction
- No UI changes needed — sidebar/APIs automatically filter based on the merged set
- Additive only — cannot REMOVE role permissions, only ADD on top

### Default Roles & What They See
| Role | Sidebar Groups | Key Pages |
|------|---------------|-----------|
| `admin` | ALL (9 groups) | Everything — full control |
| `employee` | عام + موارد بشرية | my-tasks, timesheet, attendance, leave, my-payslips, directory, announcements, profile |
| `sales_agent` | عام + مبيعات + موارد بشرية | sales/*, leads, WhatsApp, quotes, clients + ALL employee HR pages |

Portal (Client) has its own sidebar: `components/portal/portal-sidebar.tsx`

### Feature Connections (Trace Before Coding)
```
Client → Projects → Files (client_visible) → Portal
      → Invoices → Payments (Stripe) → Statement → Portal
      → Quotes → Signature → Sales Approval → Portal
      → Contracts → Milestones → Generate Invoice → Portal
      → Scripts → Reviews → Portal
Lead → Activities → Convert to Client → full chain above
Employee → Attendance + Leave + Timesheet → Payroll → Expenses
         → Employee Payments (commission/task/bonus) → Payslips
         → User Detail Page (/dashboard/users/[username])
         → manager_username → Direct Manager → Approvals Dashboard → notify()
Manager → /dashboard/approvals (leave + expense + timesheet of direct reports)
       → canApproveFor() guard on every approval mutation
       → Admin override: role === 'admin' bypasses scope
Board → Columns → Tasks → Assignees + Labels + Checklist + Comments
     → Calendar View + List View + Pipeline View
     → Board Members (per-board access) → Scope System
WhatsApp → Conversations → Messages → Lead matching
        → Agent Scoping → Assignments → Contact Sidebar
        → canAccessWhatsAppMessage() guard on every message-level mutation
        → Lead detail "Messages" tab filters by lead_id (agent must own lead)
        → Quick Actions (send quote/invoice, create lead, notes, follow-ups)
Contract (retainer) → retainer_amount + retainer_cycle (source of truth)
                   → Generate Invoice → Billing History
                   → Editing retainer fields auto-syncs linked recurring invoice
Contract (milestone) → Complete Milestone → Generate Invoice
My Work Inbox (/dashboard/page.tsx + /api/my-work):
  → Tasks (assigned to me, overdue/today/this_week)
  → Approvals (leave/expense/timesheet from direct reports + leave.approve gate)
  → WhatsApp (conversations assigned + unread)
  → Leads (assigned + needs follow-up)
  → Follow-ups (due ≤24h)
```

### Notifications — Central Helper (`lib/notifications/notify.ts`)
**NEVER `INSERT INTO pyra_notifications` directly.** Always go through `notify()`:

```ts
import { notify, notifyMany } from '@/lib/notifications/notify';

await notify(supabase, {
  to: 'ahmed.s',                                       // recipient_username
  type: 'task_assigned',                               // see NotificationType union
  title: 'تم تعيينك في مهمة',
  message: `قام ${actor.display_name} بتعيينك`,
  link: `/dashboard/boards/${boardId}?task=${taskId}`,  // deep link → target_path
  entity: { type: 'task', id: taskId },                 // for grouping/dedup
  from: { username: actor.username, displayName: actor.display_name },
});
```

Why: 30+ scattered insert sites previously used wrong column names (`username`, `link`)
and silently failed. The helper enforces correct shape, auto-skips self-notifications
(actor == recipient), and is fire-and-forget (errors logged, never thrown).

#### Inactive-recipient gate (LOCKED 2026-07-15) — do NOT regress

All three writers (`notify` / `notifyMany` / `notifyBatch`) drop recipients whose
`pyra_users.status !== 'active'`, so **no caller needs its own status filter**. Before
this, an open task assigned to a departed employee re-notified them every cron day,
forever (confirmed live: `abdelrahman.morshedy`, departed 2026-07-14, still received
`task_overdue` rows on 07-15). The gate also stops the web-push dispatch that follows
each insert — it has no status filter of its own, so a departed employee's phone kept
buzzing.

Three properties are load-bearing — `selectUndeliverableRecipients()` in
`lib/notifications/notify.ts` is pure and unit-tested (`__tests__/notify-recipients.test.ts`)
to keep them honest:

- **Denylist, not allowlist.** ONLY a username whose `pyra_users` row EXISTS and is
  non-active is dropped. `recipient_username` has **no foreign key** (`DATABASE-SCHEMA.md`
  claims one — the doc is wrong) and prod holds orphan assignees, so an unknown username
  is warned about and still sent. Swallowing it would hide the missing-validation defect
  upstream of it.
- **Predicate matches the auth gates byte-for-byte** (`!== 'active'`, so NULL and any
  other value are undeliverable) — same as `lib/api/auth.ts` and `lib/auth/guards.ts`.
  There is no CHECK constraint on `status`, so never assume the TS union is enforced.
  Keeping the predicates identical is what stops the gate and the auth gates disagreeing.
- **Fails OPEN.** A lookup error inserts anyway — a transient DB blip must never eat a
  real notification.

Not a bug, do not "fix": money/offboarding paths (final settlement, payslip, HR docs)
DO notify departed employees, and the gate drops those rows. That is correct — they
cannot log in to read the bell, so the row was never deliverable. Reach them out-of-band.

### Authorization Helpers — Use, Don't Reinvent

| Helper | File | Purpose |
|---|---|---|
| `buildUserPermissions(role, dbPerms, extras)` | `lib/auth/rbac.ts` | Build final permission array (use in any new auth entry point) |
| `hasPermission(perms, 'leave.view')` | `lib/auth/rbac.ts` | Check single permission with `*` wildcard support |
| `requireApiPermission('leave.view')` | `lib/api/auth.ts` | Gate an API route — returns auth or 401/403 NextResponse |
| `requirePermission('leave.view')` | `lib/auth/guards.ts` | Gate a server page — redirects on failure |
| `getDirectReports(supabase, manager)` | `lib/auth/team-scope.ts` | List usernames reporting to a manager |
| `getManagerOf(supabase, employee)` | `lib/auth/team-scope.ts` | Get manager_username for a user |
| `canApproveFor(supabase, approver, role, employee)` | `lib/auth/team-scope.ts` | **Authoritative** — admin OR direct manager. Required on every approval mutation. |
| `canAccessWhatsAppMessage(supabase, user, isAdmin, msgId)` | `lib/auth/whatsapp-scope.ts` | Required on every message-level mutation (forward/react/save-to-files). Returns false if agent doesn't own the conversation. |
| `resolveAuthUserId(supabase, username)` | `lib/auth/auth-mapping.ts` | Resolve Supabase Auth user ID; auto-heals missing `pyra_auth_mapping` rows for legacy users. |
| `resolveUserScope(auth)` | `lib/auth/scope.ts` | Compute team→project→board chain for project-scoped data |

**Rule:** approval mutations (leave/expense/timesheet) MUST combine permission + scope:
```ts
// 1. Permission gate — does the role allow approving leave at all?
if (!hasPermission(rolePerms, 'leave.approve')) return apiError('غير مصرح', 403);
// 2. Scope gate — admin override OR is this employee's direct manager?
const allowed = await canApproveFor(supabase, auth.pyraUser.username, auth.pyraUser.role, existing.username);
if (!allowed) return apiError('يمكنك فقط اعتماد طلبات موظفينك المباشرين', 403);
```

## Status Constants (`lib/constants/statuses.ts`)
**NEVER hardcode status strings.** Import from `@/lib/constants/statuses`:
```tsx
import { INVOICE_STATUS, INVOICE_STATUS_LABELS, INVOICE_PAID_STATUSES } from '@/lib/constants/statuses';

// Use constants in API routes:
.in('status', INVOICE_PAID_STATUSES)

// Use labels in UI:
<Badge>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
```
Entities with centralized statuses: Invoice, Quote, Contract, Expense, Leave, Payroll, PO, CreditNote, Subscription, Timesheet, FileApproval, PaymentMethod, BillingCycle, EmployeePayment, Evaluation, ContentPipeline, FollowUp, Client, Lead, Conversation.

## i18n — Bilingual AR/EN (Phases 0–5 + 6a/6b shipped; 6c in progress)

Phase 6 (admin tail) ships as 5 sub-waves: 6a admin/rbac/settings ✅ · 6b
module-guide ✅ · 6c clients/projects/files/teams (foundation `be6ed04`;
next: clients stack) · 6d content-ops · 6e misc + WhatsApp chat. Then
Phases 7 portal → 8 notification templates → 9 recipient-language docs.
Full task-by-task record: `.superpowers/sdd/progress.md` (committed) +
plans in `docs/superpowers/plans/2026-07-*.md`.

next-intl WITHOUT locale routing — URLs never change. Locale = `pyra_locale`
cookie (cache) ← `pyra_users.preferred_language` / `pyra_clients.preferred_language`
(source of truth, migration 035). `<html lang dir>` + Toaster are dynamic in
`app/layout.tsx`. Switchers: topbar `LocaleSwitcher`, profile `LocaleSelect`,
pre-auth `LocaleToggleAnon`; `LocaleSync` heals cookie↔DB drift in both authed
layouts.

**Rules (do NOT regress):**
- Messages live in `messages/{ar,en}/<namespace>.json` — ONE top-level
  namespace per file. Loader `lib/i18n/messages.ts` deep-merges EN OVER AR:
  a missing EN key renders Arabic — never a raw key. AR strings are extracted
  VERBATIM from code, never re-authored.
- Client components: `useTranslations`; server pages + route handlers:
  `getTranslations` (cookie-resolved — pass an explicit locale only for
  recipient-language rendering or cron/webhook contexts).
- Status labels: new/migrated modules use `useStatusLabels(entity)` from
  `lib/i18n/status-labels.ts` — the legacy `*_STATUS_LABELS` Arabic maps remain
  ONLY for not-yet-migrated modules.
- Nav lives in `components/layout/nav-config.ts` + `messages/*/nav.json`
  (sidebar, mobile-nav, palette, breadcrumb all consume it — never re-inline
  a label list).
- `pnpm i18n:check` gates hardcoded Arabic in migrated paths (manifest inside
  `scripts/i18n-check.ts` — append every newly migrated path). Escape hatch:
  `// i18n-exempt: <reason>`.
- Adding a translated module (Phases 2+): create `messages/{ar,en}/<mod>.json`,
  register in `NAMESPACE_FILES` + `i18n/global.ts`, swap the module's UI +
  API strings, extend MIGRATED_PATHS, QA both locales.
- The `api` namespace is the shared server-response-message namespace for API
  route handlers — `const t = await getTranslations('api')`. Notification /
  WhatsApp / DB-data strings inside routes STAY Arabic with a documented
  `// i18n-exempt:` comment until Phase 8 (they're persisted content, not
  per-request response messages).
- Server-computed display strings (e.g. CRM AI-insight messages) render per-
  request locale via `getTranslations` and ship as `message` alongside a
  legacy `message_ar` — the client reads `message ?? message_ar`, never
  re-derives the text itself.
- CLDR plural categories key on `n mod 100`, not raw thresholds — when
  reproducing a legacy flat-threshold Arabic ladder (e.g. a duration label
  with hand-picked cutoffs), keep the thresholds in CODE with plain
  interpolation keys instead of forcing ICU plural categories (see the
  contract-card `monthsLabel` helper) — ICU `few`/`many` would silently
  diverge from the original behavior past the ladder's tested range.
- Board-template SEEDED column/label names (`lib/config/board-templates.ts` →
  columns written into real `pyra_columns` rows on board creation) remain
  Arabic DB data — creator-locale seeding (localizing template content at
  creation time) is a v1.1 item, not part of the UI-string migration.
- Catalogs must NEVER contain JSON arrays — arrays poison next-intl's type
  inference. Use keyed objects instead (see `calendar.dayNames`, which is an
  object keyed `sun`–`sat`, not a `string[]`).
- Dates: `formatDate/formatRelativeDate/formatTime/formatTaskDueDate` take a
  trailing `locale` param (default `'ar'`). Currency/number formatting is
  locale-stable (`en-AE`) by design — do not localize digits in money.

## Business Entities (Multi-License)
Table `pyra_business_entities` — select trade license per invoice/quote. Entity logo and company name appear in PDF.
- API: `/api/settings/business-entities` (CRUD)
- Entity ID saved on invoice/quote → PDF uses entity-specific logo + name

## Finance — Cash-Basis Accounting
**Revenue = actual payments received** (from `pyra_payments.payment_date`), NOT invoice issue date.
- Dashboard, P&L, VAT, Client Profitability, Project Profitability — all use `pyra_payments`
- Credit notes create **negative payment records** and recalculate `amount_paid`/`amount_due`
- Aging report uses `due_date` (not issue_date) — standard accounting practice
- Invoices auto-marked overdue when `due_date < today`

## Employee Deductions (SHIPPED 2026-07-22 — read before touching payroll money)

The full continuation guide is `docs/EMPLOYEE-DEDUCTIONS-HANDOFF.md` — read it
before changing attendance deductions, delivery scoring, production deadlines,
quality warnings, approval, cancellation, or payroll integration. Plans under
`docs/superpowers/` are implementation history and do not override it.

Deductions are a **separate detect → admin-approve pipeline**, NOT part of the
payroll calculation. This is the reconciliation of two rules that otherwise look
contradictory:

- The payroll **calculation** still deducts only approved **unpaid leave** — the
  fixed-salary lock holds ([Payroll Integrity](docs/decisions/hr.md#payroll-integrity-fixes-locked-decisions-2026-06-30)).
- Attendance/delivery/quality money reaches payroll **only** as
  `pyra_employee_payments` rows with `source_type='deduction'`, created by an
  explicit admin approval. Nothing is auto-applied.

Constants live in `lib/constants/deductions.ts` + `lib/hr/attendance-policy.ts` —
**never hardcode these numbers**:

| Tier | Rule |
|---|---|
| Attendance | `ATTENDANCE_GRACE_MINUTES` 15 → then ≤60 min = ¼ day, ≤120 min = ½ day, beyond = full day. Daily rate uses `DEDUCTION_DAYS_PER_MONTH` (30) |
| Delivery | `DELIVERY_DEDUCTION_PERCENT` 3 / 7 / 12 % (minor/moderate/major); tasks with under `DELIVERY_MIN_LEAD_TIME_HOURS` (24 h) lead time are excluded |
| Quality | Rework/rejection thresholds over `QUALITY_CONSECUTIVE_MONTHS_REQUIRED` months — **warning only: `QUALITY_DEDUCTION_APPROVAL_ENABLED = false`, quality money approvals fail closed pending the owner's decision** |
| Cap | `MONTHLY_DEDUCTION_CAP_PERCENT` 25 % — applies to delivery + quality + manual disciplinary money. **Attendance is explicitly outside the cap** (owner override 2026-07-22) |

Lifecycle invariants (`lib/payroll/payment-policy.ts`): a deduction is born
approved through its own capped RPC and **cannot** be approved or paid directly —
it settles only when its linked payroll run is paid.

## Environment Validation (`lib/env.ts`)
Zod schema validates all env vars at import time. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: Stripe, Evolution API.

## Testing (`pnpm test`)
Vitest + Testing Library. Tests in `__tests__/`. Run: `pnpm test` (single run) or `pnpm test:watch` (watch mode).

## Critical Rules

### RTL (ALWAYS)
NEVER: `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left`/`text-right`/`border-l`/`border-r`/`rounded-l`/`rounded-r`/`float-left`/`float-right`
USE: `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`/`text-end`/`border-s`/`border-e`/`rounded-s`/`rounded-e`/`float-start`/`float-end`
Exception: `left-1/2 -translate-x-1/2` (centering) is OK.

### Dark Mode (ALWAYS pair)
`bg-{c}-50` → add `dark:bg-{c}-950/30` · `bg-{c}-100` → `dark:bg-{c}-900/50`
`text-{c}-600` → `dark:text-{c}-400` · `text-{c}-700/800` → `dark:text-{c}-300`
`border-{c}-200` → `dark:border-{c}-800/40` · `bg-white` → `dark:bg-gray-900`
Safe (no dark: needed): `bg-{c}-500/10`, `text-{c}-500`, CSS vars (`bg-muted`, `text-muted-foreground`), shadcn Badge.

### Components & Patterns
- **Data fetching** → React Query hooks from `hooks/` — NEVER raw `fetch()` in components
- **Mutations** → `useMutation` + `mutateAPI` — NEVER raw `fetch()` for POST/PUT/DELETE
- Empty states → `<EmptyState>` from `@/components/ui/empty-state` — NEVER inline
- Loading → `<Skeleton>` from `@/components/ui/skeleton` — NEVER blank pages (use `isLoading` from hooks)
- Notifications → `toast` from `sonner` — NEVER `alert()`
- API auth → `requireApiPermission()` or `requireApiAuth()` from `@/lib/api/auth`
- API response → `apiSuccess()`/`apiError()` from `@/lib/api/response`
- Activity logging → `logActivity()` from `@/lib/api/activity` (fire-and-forget, never blocks response)
- Error observability → `logError({ error, request, user?, metadata? })` from `@/lib/observability/log-error` in catch blocks of long-lived routes (cron, webhooks, state-change). Server-side only — Client Component error boundaries POST to `/api/observability/log-client-error` instead. `apiServerError(message?, err?, request?)` auto-logs when `err` is passed (Phase 14.1). PII-redacted (email/phone/headers) before insert into `pyra_error_logs`.
- No transactions → backup-rollback pattern (see `docs/ARCHITECTURE.md`)
- Code: English · UI: Arabic · `'use client'` for interactive components
- `cn()` from `@/lib/utils/cn` · `formatDate()`/`formatCurrency()` from `@/lib/utils/format`
- Icons: `lucide-react` · Components: `shadcn/ui` base
- Pages: `page.tsx` · Client wrappers: `[feature]-client.tsx` · API: `route.ts`

## New Feature Checklist

- [ ] **WHO uses it?** — Answer for all 4 audiences (Admin/Employee/Sales/Client)
- [ ] **Data layer** → Create hook in `hooks/` or use inline `useQuery`/`useMutation` — NEVER raw fetch
- [ ] **Sidebar** → `components/layout/sidebar.tsx` with correct navGroup + `permission:`
- [ ] **Module guide** → `lib/config/module-guide.ts` + `app/dashboard/guide/page.tsx` SECTIONS
- [ ] **RBAC** → `lib/auth/rbac.ts` — `module.view` / `module.manage`
- [ ] **Portal parity** → If client sees it → portal page + portal hook + `/api/portal/` endpoint
- [ ] **Admin controls** → If configurable → settings/management page
- [ ] **Employee self-service** → If employee-facing → check my-* pattern (my-tasks, my-payslips)
- [ ] **Empty state + Dark mode + RTL** → Use shared components, pair dark: variants
- [ ] **DB changes** → `DATABASE-SCHEMA.md` + RLS policies
- [ ] **Activity logging** → `logActivity()` from `@/lib/api/activity` for all write operations
- [ ] **Page size** → Keep pages <300 lines. Split large pages into sub-components
- [ ] **Verify** → `pnpm run check` + `pnpm build` → zero errors → git push

## DB Migrations (Run directly — never ask user)

**Canonical runner — `pnpm db:query` (UTF-8-safe):**

```bash
pnpm db:query "SELECT ..."          # inline allowed for ASCII-ONLY SQL
pnpm db:query path/to/statement.sql # REQUIRED for any SQL containing Arabic
```

⚠️ **Arabic (any non-ASCII) MUST go through a UTF-8 .sql file — NEVER inline
on a command line.** Windows shells (PowerShell/cmd, some pipelines) transcode
through legacy code pages, silently replacing each Arabic char with a literal
`?` (or Ø/Ù mojibake) BEFORE it reaches the DB — nothing errors, the original
text is unrecoverable. This corrupted the seed rows of `pyra_leave_types`,
`pyra_evaluation_criteria`, and `pyra_work_schedules` (repaired 2026-07-03).
`scripts/db-query.ts` ENFORCES this: inline non-ASCII is rejected with
instructions. **After any manual write containing Arabic, re-read the affected
rows and confirm the glyphs render** (the script reminds you).

Corruption sweep (rerun after any suspicious manual write): check the
`*_ar`/`title`/`label` columns for `LIKE '%?%' OR col ~ '[À-ÿ�]'` — ASCII `?`
never legitimately appears in Arabic text (the Arabic question mark is `؟`).

Raw curl fallback (only when pnpm is unavailable; ASCII-only inline, Arabic
via `--data-binary @file.json` with a UTF-8 file):

```bash
curl -X POST "https://pyraworkspacedb.pyramedia.cloud/pg/query" \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"query": "ASCII-ONLY SQL HERE"}'
```

## Deployment
Coolify (Docker) auto-deploy on push to `main` · **pnpm** (NEVER npm)
Production URL: `https://workspace.pyramedia.cloud`

## Documentation (Read don't guess)
| Doc | What it covers |
|-----|---------------|
| `docs/SYSTEM-STRUCTURE.md` | Complete 94-page reference with all tables and integrations |
| `docs/FEATURE-IMPACT-MAP.md` | What connects to what — READ BEFORE any new feature |
| `docs/EMPLOYEE-SYSTEM.md` | HR modules (14 modules, attendance→payroll chain) |
| `docs/EMPLOYEE-DEDUCTIONS-HANDOFF.md` | Built deductions + productivity rules, data flow, migrations, APIs, production handoff |
| `docs/ARCHITECTURE.md` | System architecture, backup-rollback pattern |
| `docs/CLIENT-MANAGEMENT.md` | Client system, portal branding |
| `docs/MIGRATIONS.md` | Migration runbook, backup/record/drift workflow, n8n cron setup |
| `DATABASE-SCHEMA.md` | Full schema (~110 tables) |
| `docs/decisions/*.md` | **Locked-decision archive** — see the index below |
| `CRM-PROGRESS.md` / `.superpowers/sdd/progress.md` | Phase-by-phase build ledgers + v1.1 backlogs |

## Locked Decisions — Index

Settled decisions live in `docs/decisions/`, **not here** — they are history, and
loading ~4,100 lines of it into every session costs more than it returns. The
doctrine still stands: these were closed after audit → design → implement →
review and are **not re-litigated**.

**How to use this index:** before changing anything in a listed area, open the
linked section. If a decision covers what you are about to change, follow it —
or stop and ask. Do not "fix" something this index calls intentional.

### ⚠️ Live exceptions — open, not decisions
Standing compromises that are still active. Surfaced here because they are easy
to forget once buried in an archive.

| Exception | State |
|---|---|
| `smtp_allow_insecure = true` | **Still `true` in prod (verified 2026-07-26)** — SMTP cert validation is OFF, ~8 weeks after the `mail.pyramedia.info` cert expired. Renew the cert, then flip to `false`. [Details](docs/decisions/finance.md#quote-system-gap-5-locked-decisions-2026-06-19) |
| Gap #3 secret rotation | Stripe secret + webhook secret + SMTP password were DB-readable while the exposure was open. Rotation is still pending. [Details](docs/decisions/security.md#audit-gap-3-db-exposure-remediation-2026-06-19-p0-partially-closed) |
| Gap #3 Phase 2 / 3b | ~107 tables still grant `authenticated`; `pyraai-workspace` bucket still public. **Never `REVOKE` before deploying code that stops reading as `authenticated`.** |
| `QUALITY_DEDUCTION_APPROVAL_ENABLED = false` | Quality-tier deduction money is gated off pending the owner's choice of measurement window. Warnings show; approvals fail closed. |

### CRM — [`docs/decisions/crm.md`](docs/decisions/crm.md)
| Decision set | Governs |
|---|---|
| [CRM Module & PRD deviations](docs/decisions/crm.md#crm-module-locked-decisions-prd-deviations) | The 3 pipeline-kanban dnd deviations (`pointerWithin`, 3-tier card split, one `useDraggable` per lead) — **LOCKED, ask before touching** |
| [CRM Conventions (Phase 8+)](docs/decisions/crm.md#crm-conventions-phase-8) | AI-insight severity scheme + per-hook React Query cache table |
| [CRM Phase 9](docs/decisions/crm.md#crm-phase-9-locked-decisions) | Customer page: convert-to-customer, milestone `invoiced` = done, read-only notes tab |
| [CRM Health Score](docs/decisions/crm.md#crm-health-score-phase-9) | The 0–100 formula (recency 30 / payment 30 / contracts 20 / engagement 20) + colour bands |
| [CRM Phase 10](docs/decisions/crm.md#crm-phase-10-locked-decisions) | Mobile PWA: bottom-sheet stage picker, `h-11` touch targets, `/offline` fallback |
| [CRM Phase 11](docs/decisions/crm.md#crm-phase-11-locked-decisions) | Follow-up + idle-check crons — reminders go to the **agent's** WhatsApp, 7-day dedup |
| [CRM Phase 11 Refinement](docs/decisions/crm.md#crm-phase-11-refinement-locked-decisions) | `pyra_agent_whatsapp_settings` routing layer; two-step cron lookup; `is_active` defaults false |
| [CRM Phase 11.5](docs/decisions/crm.md#crm-phase-115-locked-decisions) | Link lead↔existing client — **plus the `action_type` vs `metadata.source` principle that governs every `logActivity()` call** |
| [CRM Phase 12](docs/decisions/crm.md#crm-phase-12-locked-decisions) | Old `/dashboard/sales/*` sunset: 5 routes redirect, 5 protected. **External URLs (email/SMS/WA) bypass middleware — always build canonical CRM paths** |
| [CRM Phase 13](docs/decisions/crm.md#crm-phase-13-locked-decisions) | Visual polish: `EmptyState` is full-page only; never ship "Phase X"/"قيد البناء" to users |
| [Phase 15.1](docs/decisions/crm.md#phase-151-locked-decisions) | Mentions, lead tasks, calendar projection. **`dubaiDayKey()` mandate** + deep-link highlight + URL-state patterns |
| [Phase 15.2](docs/decisions/crm.md#phase-152-locked-decisions) | Lead image + voice attachments: client Canvas resize, 5 MB / 10-per-lead caps, SVG rejected |
| [Lead Reassignment UI](docs/decisions/crm.md#crm-lead-reassignment-ui-locked-decisions-2026-06-19) | `leads.assign` gating, `useLeadCapableUsers`, `notifyBatch`; selection must not break the kanban |
| [CRM Audit Remediation](docs/decisions/crm.md#crm-audit-remediation-locked-decisions-2026-07-02) | Lead soft-archive; reopen keeps the client link; `is_converted IS NOT TRUE`; per-currency money |
| [Admin Lead-Data Edit](docs/decisions/crm.md#crm-admin-lead-data-edit-full-activity-logging-locked-2026-07-03) | `leads.edit_core` is admin-only; diff-only PATCH; every changed field writes a timeline row |
| [Pyra Pro Redesign](docs/decisions/crm.md#crm-pyra-pro-redesign-locked-decisions-2026-07-10) | Warm palette scoped via `.crm-theme`; **`font-mono` on Latin numerics ONLY — never Arabic** |
| [Calls: contact semantics + update enforcement](docs/decisions/crm.md#calls-contact-semantics-update-enforcement-locked-2026-07-29) | `isConnectedCall()` is the ONE contact predicate; `call_attempt` is effort, never a touch — **4 recency consumers must exclude it**; answered-only metrics; `updates_v2` channel; `--mandatory` rules + the `--set-mandatory false` escape hatch; call sync never stops while blocked |

### Finance — [`docs/decisions/finance.md`](docs/decisions/finance.md)
| Decision set | Governs |
|---|---|
| [Finance Remediation](docs/decisions/finance.md#finance-remediation-locked-decisions-2026-07-03) | **Derived counters, never increments**; multi-currency payments; VAT stays 0; the one daily finance cron; money-write field whitelists |
| [Quote System + Gap #5](docs/decisions/finance.md#quote-system-gap-5-locked-decisions-2026-06-19) | Quote scoping (created_by OR lead-owned OR client), `quotes.delete_own`, the server-side PDF pattern, SMTP config |
| [Public Quote Signing](docs/decisions/finance.md#public-quote-signing-locked-decisions-2026-07-27) | No bank details on the public PDF; the append-only trigger as a *partial* Gap #3 mitigation; signer gets an emailed copy; `QuoteDetailView` moved + translated; indistinguishable invalid-link response; DB errors must never render as an invalid link; mint is revoke-then-insert; `signed_offline_by` is always server-derived |

### HR & Payroll — [`docs/decisions/hr.md`](docs/decisions/hr.md)
| Decision set | Governs |
|---|---|
| [HR Department Improvement](docs/decisions/hr.md#hr-department-improvement-locked-decisions-2026-06-27) | `hr.view` is admin-only; `/api/hr/overview` is a single aggregator; gate-then-service-role |
| [Payroll Integrity Fixes](docs/decisions/hr.md#payroll-integrity-fixes-locked-decisions-2026-06-30) | **Fixed salary; the only automatic payroll deduction is unpaid leave.** Attendance is deliberately not wired into payroll — see deductions below |
| [Employee Documents Vault](docs/decisions/hr.md#employee-documents-vault-locked-decisions-2026-06-29) | `pyra-private` bucket + signed URLs, configurable doc types, two-tier expiry cron |
| [Employee Onboarding](docs/decisions/hr.md#employee-onboarding-locked-decisions-2026-06-30) | jsPDF + `arabic-reshaper` engine, the 3 generated PDFs, `createEmployeeUser`, `hr.manage` gate |
| [HR + Payroll Organization](docs/decisions/hr.md#hr-payroll-organization-locked-decisions-2026-07-01) | Per-employee `salary_currency`; single-currency payroll runs; leave columns are `type` + `days_count` |
| [HR/Payroll v1.1 Cleanup](docs/decisions/hr.md#hrpayroll-v11-cleanup-closure-2026-07-01) | What shipped — **and the stale backlog items explicitly not worth chasing** |
| [HR Gap-Remediation](docs/decisions/hr.md#hr-gap-remediation-locked-decisions-2026-07-02) | `notifyApprovers`; `pyra_leave_balances_v2` is the only balance source; **weekend = Sunday only** |
| [User Hard-Delete Guard](docs/decisions/hr.md#user-hard-delete-guard-locked-decisions-2026-07-15) | `EVIDENCE_TABLES` blocks hard delete, guard fails **closed**; add new HR tables to it |
| [Employee Offboarding](docs/decisions/hr.md#employee-offboarding-locked-decisions-2026-07-21) | Ban-only revocation, the exit ordering doctrine, mandatory `access-reconcile` cron, settlement is never auto-paid |

### Security — [`docs/decisions/security.md`](docs/decisions/security.md)
| Decision set | Governs |
|---|---|
| [Phase D (P2 polish)](docs/decisions/security.md#phase-d-locked-decisions-p2-security-polish) | `validateExtraPermissions`, per-account lockout, PII redaction order, backup encryption |
| [Phase 14.3 (audit + fixes)](docs/decisions/security.md#phase-143-locked-decisions-security-audit-fix-bundle) | `timingSafeEqual` for every secret compare, `.or()` injection escaping, `PASSWORD_MIN_LENGTH`, plain-text task descriptions |
| [Audit Gap #4](docs/decisions/security.md#audit-gap-4-sales_leadsmanage-misleading-name-documented-rename-deferred) | `sales_leads.manage` is misnamed but safe — rename deferred, don't "fix" it ad hoc |
| [Audit Gap #3](docs/decisions/security.md#audit-gap-3-db-exposure-remediation-2026-06-19-p0-partially-closed) | The P0 DB-exposure incident. **Still open: secret rotation + Phase 2/3b.** Read before any `REVOKE`/RLS change |

### Platform — [`docs/decisions/platform.md`](docs/decisions/platform.md)
| Decision set | Governs |
|---|---|
| [Phase 14.1 (observability)](docs/decisions/platform.md#phase-141-locked-decisions) | `logError()` is fire-and-forget + server-only; `apiServerError` back-compat; 5-layer PII redaction |
| [Phase 14.2 (migrations)](docs/decisions/platform.md#phase-142-locked-decisions) | Forward-only migrations, `pyra_schema_migrations`, apply→**verify**→record |
| [Phase 17 (documentation)](docs/decisions/platform.md#phase-17-locked-decisions-documentation-polish) | `lib/config/module-guide.ts` is the single in-app doc source; tip-depth standard |
| [Remote Production Tracking](docs/decisions/platform.md#remote-production-tracking-locked-decisions-2026-07-03) | On-time = first review submission; metrics derived from stage history, never counters; gated columns |
