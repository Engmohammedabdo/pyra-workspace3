# Pyra Workspace

ERP + CRM for Pyramedia X (UAE). Next.js 15 App Router + Supabase + Tailwind + shadcn/ui.
Arabic RTL UI. Orange brand (`orange-500`/`orange-600`).

## Commands

```bash
pnpm dev          # Dev server (turbopack)
pnpm build        # Production build — MUST pass before push
pnpm lint         # Lint
pnpm run check    # TypeScript (tsc --noEmit) — MUST pass before push
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
app/dashboard/hr/         → HR Overview page (admin-only, requirePermission('hr.view'))
hooks/                    → 42+ React Query hooks (data fetching + mutations)
hooks/api-helpers.ts      → fetchAPI() + mutateAPI() — shared fetch wrappers
hooks/useMyWork.ts        → Inbox aggregator hook (30s staleTime, refetch on focus)
hooks/useHROverview.ts    → HR Overview hook (60s staleTime, refetchOnWindowFocus)
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
components/attendance/    → Attendance sub-components (AttendanceCalendar, AttendanceSummaryCards, TodayClockCard, AdminAttendanceDialog)
components/payroll/       → Payroll sub-components (PayrollRunsTable, PayrollRunRow, EmployeePaymentsTab, CreatePayrollDialog, AddPaymentDialog)
lib/hr/overview-helpers.ts → computeCelebrations() + deriveAlerts() — pure helpers unit-tested in __tests__/hr-overview-helpers.test.ts
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

```bash
curl -X POST "https://pyraworkspacedb.pyramedia.cloud/pg/query" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"query": "YOUR SQL HERE"}'
```

## Deployment
Coolify (Docker) auto-deploy on push to `main` · **pnpm** (NEVER npm)
Production URL: `https://workspace.pyramedia.cloud`

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
`docs/PHASE7-CHUNK4-HANDOFF.md` (which can be archived now that Phase 7
is closed; this section preserves the conclusions).

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

## Phase 14.1 — Locked Decisions

These are **intentional, documented design choices** locked during
Phase 14.1 closure (Observability). **Do NOT re-litigate.** Phase 14.1
is post-CRM-rebuild infrastructure work — self-contained error log
layer replaces external Sentry (no DSN, no third-party service, no
egress). All server-side errors funnel through `logError()` into
`pyra_error_logs`; admin viewer at `/dashboard/admin/error-logs`
provides triage + resolve workflow.

### 1. Self-contained observability (no Sentry)

User-revised mid-session decision: skip Sentry entirely, build the
observability layer in-house using Supabase as the backing store.
**Rationale:** external service dependency + DSN management is
complexity Abdou doesn't want. The workspace already has Supabase;
reuse it.

The trade-off accepted: no third-party error aggregation /
deduplication / alert routing in v1. Admin viewer is the only triage
surface. v1.1 may add severity grouping + dedup if volume grows.

### 2. `logError()` contract — fire-and-forget, never throws

`lib/observability/log-error.ts` exports `logError({ severity?, error,
request?, user?, metadata? }): void`. The function:

- Returns `void` synchronously (not a Promise) so callers can use it
  inside cron loops without await
- IIFE-detaches the actual Supabase write — outer try/catch is the
  absolute backstop
- Mirrors to `console.error/warn/info` so Coolify logs always show
  errors even when the DB write fails
- 5-layer PII redaction applied BEFORE insert (see Phase 14.1
  decision 4 below)
- Never recursively calls itself — insert failures use raw
  `console.error` (avoid infinite-loop risk if the logger itself is
  the broken path)

**Cron-safe invariant:** cron per-row try blocks rely on `logError`
never propagating errors. Documented at file top of the cron routes.

### 3. `apiServerError(message?, err?, request?)` backwards-compat

The 722 existing callers (audit count at Phase 14.1 Commit 2 time)
pass 0 or 1 argument. The new optional `err` + `request` params let
callers opt into observability without touching the rest of the
codebase:

```ts
// Pre-Phase-14.1 (still works unchanged):
catch (err) {
  console.error(...);
  return apiServerError();
}

// Phase 14.1 high-risk routes (8 callers explicitly upgraded):
catch (err) {
  logError({ error: err, request, user: { id, role }, metadata: {...} });
  console.error(...);
  return apiServerError();
}

// Other routes can opt in incrementally:
catch (err) {
  return apiServerError('custom message', err, request);
}
```

**Why not `user` in `apiServerError`?** Adding a 4th param would
require every catch to pass auth context — 722 site touches. Routes
that need user context call `logError` explicitly (where `auth` is
already in scope).

### 4. Five-layer PII redaction

Applied in order at insert time inside `logError`:

1. **Noise drops** — message matches `/^Unauthorized$/i`, `/^CSRF
   token mismatch$/i`, or `/^Forbidden$/i` → row NOT inserted at all
   (security noise, not real errors)
2. **Email regex** — `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g`
   → `[EMAIL]`
3. **Phone regex** — `/(?<![a-zA-Z0-9])\+?\d{7,15}(?![a-zA-Z0-9])/g`
   → `[PHONE]` (lookbehind/ahead prevents catching IDs/tokens that
   happen to contain long digit runs)
4. **Sensitive key fragments** — metadata keys containing `phone`,
   `email`, `password`, `token`, `secret`, `apikey`, `api_key` →
   entire VALUE replaced with `[REDACTED]`
5. **Sensitive header allowlist** — headers named `authorization`,
   `x-api-key`, `apikey`, `stripe-signature`, `cookie` → value
   replaced with `[REDACTED]` before going into
   `metadata.request_headers`

**Admin viewer does NOT de-redact.** Rows render AS-STORED — no
"expand original" feature, no fetch to a "raw" endpoint, no
client-side state that reverts the redacted strings.

### 5. Beacon endpoint for Client Component error boundaries

Both `app/dashboard/error.tsx` and `app/portal/(main)/error.tsx`
are Client Components (`'use client'`). They CANNOT call `logError()`
directly because `createServiceRoleClient()` reads
`SUPABASE_SERVICE_ROLE_KEY` which is server-only.

**Solution:** POST `/api/observability/log-client-error`. The route
auth-gates the request (dashboard Supabase Auth session OR portal
cookie session → either accepted; anonymous → 401), then funnels
the payload through `logError()` server-side. PII redaction +
5-layer pipeline inherited verbatim.

**Middleware exemption required:** the middleware Supabase-Auth
block (line 136 of `middleware.ts`) needed `!pathname.startsWith
('/api/observability')` so portal cookie sessions reach the beacon's
own auth gate. The route's own auth check is the canonical gate;
CSRF protection still covers all POST/PATCH/PUT/DELETE.

### 6. Append-mostly DB shape (no trigger, no `updated_at`)

`pyra_error_logs` has NO `updated_at` column and NO trigger. The
only update path is admin marking a row resolved (writes
`resolved`, `resolved_at`, `resolved_by`, `resolved_notes`
explicitly). Append-mostly design — preserves audit integrity, no
hidden mutation paths.

### 7. RBAC permission naming: `error_logs.{view,manage}`

NOT `admin.error_logs.{view,manage}` (which the user's spec
literally said). Q2(a) lock at Phase 14.1 Commit 3 closure:
permissions follow the codebase convention (`module.action`),
matching `sessions.view`, `activity.view`, `reports.view`. Admin-only
semantic is enforced by role assignment, not by name prefix.

### 8. Sheet detail view (Phase 10 pattern reused)

The admin viewer's row-detail panel uses `<SheetContent side="right">`
— visual LEFT in RTL (matching Phase 10 lead-sidebar mobile pattern +
Phase 14.1 admin observability). The Sheet primitive at
`components/ui/sheet.tsx` is the workspace standard for all
slide-out / bottom-sheet UX.

### Implementation invariants (locked, do NOT regress)

- **`logError` is server-only.** Client Component error boundaries
  POST through `/api/observability/log-client-error` — they CANNOT
  import `logError` directly.
- **`apiServerError` signature must remain backwards-compatible.**
  Adding required params (or changing param order) breaks 722
  callers in one stroke.
- **Defense in depth: 4 gates before any anonymous row reaches
  `pyra_error_logs`.** CSRF (middleware) → Supabase Auth
  (middleware) → route-level `requireApiPermission` → DB CHECK
  constraints. Verified post-deploy with 0 anonymous rows after
  multiple probe rounds.
- **`error_logs.manage` is required for PATCH** — `error_logs.view`
  is NOT sufficient. Different permission strings, separately
  checked.
- **Detail panel renders metadata verbatim** — no de-redaction path,
  no "expand original" button.
- **The Sheet `side="right"` is canonical RTL pattern.** Don't swap
  to `side="left"` — that breaks the visual layout in dir=rtl.

### Phase 14.1 v1.1 backlog

See `CRM-PROGRESS.md` → "Phase 14.1 v1.1 items" — TTL prune cron,
severity grouping/dedup, `apiServerError` user-context plumbing,
broader `mutateAPI` audit, magic-byte file validation.

## Phase 17 — Locked Decisions (Documentation Polish)

These are **intentional, documented design choices** locked during
Phase 17 closure (scoped Documentation Polish). **Do NOT re-litigate.**
Phase 17 covers 2 substantive commits + 1 closure: user guides for
critical CRM paths + admin guides for the admin surface. Full API
docs + onboarding tooltips were explicitly scoped OUT (Q17-3 (b) =
critical paths only).

### 1. Single source of truth for in-app docs = `lib/config/module-guide.ts`

All user-facing + admin-facing documentation lives in the
`MODULE_GUIDES` map, exposed via two surfaces:
- `<PageGuide>` popover from `components/ui/page-guide.tsx` — appears
  in the topbar on every dashboard page, auto-detects the route, and
  shows the matching entry's description + goal + tips
- `/dashboard/guide` page — searchable directory of ALL entries
  grouped by section

**Rule:** DO NOT create parallel in-app doc surfaces (separate `/docs`
pages, markdown files surfaced as React components, onboarding modals
that duplicate guide content). They drift from the implementation
within weeks. Future deep-dive docs live in `docs/*.md` (developer
reference) and are LINKED-TO from module-guide entries when relevant
(e.g. backup-procedure entry references `docs/MIGRATIONS.md §10`).

### 2. Tip depth standard = 6-10 actionable items per entry

Phase 17 calibration: the previous ~3-4 tips per entry was too thin
for critical paths. New tips MUST be:
- **Sentence-length workflow walkthroughs**, not labels
  - ❌ "إضافة مهمة"
  - ✅ "إنشاء سريع: اضغط '+ إضافة مهمة' (h-11 touch target) → اكتب العنوان → اختر موعد + أولوية → 'إضافة'"
- **Include concrete UI-element references** ("اضغط الـ ⋮ (3 نقاط)"
  / "افتح Sheet" / "scroll مع flash برتقالي لمدة ثانيتين")
- **Call out related Phase locks where relevant** — e.g. the
  `error-logs` guide mentions Phase D-3 retention; the
  `extra_permissions` warning in the `/dashboard/users` guide
  mentions Phase D-1 whitelist rule

This ensures the in-app docs stay in sync with the code's behavioural
contracts as they evolve.

### 3. Pseudo-entries are valid for cross-cutting admin reference

Phase 17 introduced two pseudo-entries:
- `/dashboard/admin/backup-procedure`
- `/dashboard/admin/security-checklist`

These are NOT real routes. Their `href` points to the nearest existing
admin landing page (`/dashboard/admin/error-logs` in this case). They
serve as **searchable reference content** inside the guide system for
cross-cutting topics that don't fit any specific UI surface but
benefit from in-app discoverability.

**Use sparingly.** Only for content that:
- Doesn't fit a specific page (e.g. operational procedures, security
  references)
- Has admin-only audience (so showing it in `<PageGuide>` on every
  page would be noise)
- Benefits from being searchable in the guide directory

DO NOT create pseudo-entries for user-facing topics — those should
land on the real route they relate to.

### 4. Tip language: Arabic narrative with English technical terms inline

Mirror the codebase's "Arabic UI + English code" convention:
- Arabic for the narrative flow ("استخدم", "اضغط", "افتح", "كل")
- English for code / UI elements / API terms (`extra_permissions`,
  `WhatsApp Instance`, `is_done_column`, `escapePostgrestValue`,
  `timingSafeEqual`)
- Mixed in the same sentence is fine and idiomatic for the
  codebase: "اضغط '+ إضافة مهمة' (h-11 touch target)"

### 5. Deferred scope is EXPLICIT, not implicit

Phase 17 explicitly scoped OUT (Q17-3 (b)):
- Full API documentation (`docs/API.md`)
- Onboarding tooltips / welcome tour

Both have v1.1 backlog entries in `CRM-PROGRESS.md` describing the
expected shape. The closure docs are explicit so future sessions
don't re-discover this scope without context.

### Phase 17 v1.1 backlog

See `CRM-PROGRESS.md` → "### Phase 17 v1.1 items" for the full list.
Highlights: API docs (English, `docs/API.md`-style), onboarding tour,
doc-as-code linting, module-guide entry generator (`pnpm guide:new`),
keyboard-shortcuts overlay, English-tips localization.

---

## Phase D — Locked Decisions (P2 Security Polish)

These are **intentional, documented design choices** locked during
Phase D closure. **Do NOT re-litigate.** Phase D shipped 9 of 10
P2-backlog items from `docs/SECURITY-AUDIT-2025-01.md` across 4
substantive commits + 1 closure. The remaining P2 (Redis rate-limiter
migration) is infra-heavy and stays in v1.1 backlog.

### 1. `validateExtraPermissions` is the DRY entry point for per-user grants

Phase D-1 lock (audit P2 #1). All sites that accept an
`extra_permissions` payload from an admin request body MUST import
`validateExtraPermissions()` from `lib/auth/rbac.ts` — NEVER re-implement
inline.

```ts
import { validateExtraPermissions } from '@/lib/auth/rbac';

const result = validateExtraPermissions(body.extra_permissions);
if (!result.ok) return apiValidationError(result.error);
updateData.extra_permissions = result.value;
```

The helper:
- Whitelists against `ALLOWED_EXTRA_PERMISSIONS = new Set(Object.values(PERMISSIONS))` — exact-match only
- Explicitly rejects wildcards (`*` and `module.*`) — wildcards MUST go
  via `pyra_roles.permissions` for audit clarity (silent per-user
  super-admin grants are an admin foot-gun)
- Returns `{ ok: true, value: [] }` for null/undefined so PATCH partial
  updates don't clobber existing extra_permissions when the field is
  absent from the request body
- Arabic error messages with the rejected permission included for
  debugging

### 2. `escapePostgrestValue(escapeLike(...))` is THE pattern for `.or()` user input

Phase 14.3 closed legacy sales-leads sites (3 routes); Phase D-1 closed
the WhatsApp conv site. Any future `.or()` / `.filter()` call that
incorporates user input MUST use this canonical pattern:

```ts
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';

if (search) {
  const safe = escapePostgrestValue(`%${escapeLike(search)}%`);
  query = query.or(`field_a.ilike.${safe},field_b.ilike.${safe}`);
}
```

**Regression smell:** any custom regex strip like
`.replace(/[,...]/, '')` — these always miss at least one PostgREST
filter delimiter (typically `.`) and reopen the injection. Grep for
`\.replace\(\/\[.*\]\/g?,/` in `.or()`-containing files as a code
review focus.

### 3. Per-account lockout MUST follow the IP-rate-limit chain on every auth endpoint

Phase D-2 lock (audit P2 #9). Two-tier defense:
1. IP-keyed limit (existing `loginLimiter` / `adminLoginLimiter` —
   defends against single-IP brute-force)
2. Email-keyed lockout (`accountLockoutLimiter` 10/24h — defends against
   distributed brute-force via proxy rotation)

```ts
// 1. IP gate
const limited = checkRateLimit(adminLoginLimiter, request);
if (limited) return limited;

// 2. Email gate (normalized lowercase!)
const lockoutKey = email.trim().toLowerCase();
const lockoutCheck = accountLockoutLimiter.check(lockoutKey);
if (lockoutCheck.limited) return error429;

// 3. Actual auth
const { data, error } = await supabase.auth.signInWithPassword({...});
if (error) return error401;

// 4. RESET on success (CRITICAL — legitimate user typos don't get
//    24h lockout)
accountLockoutLimiter.reset(lockoutKey);
```

**Rule:** any future auth surface (OAuth callback, alternative 2FA
enrollment, etc.) MUST apply the same 2-tier gate. The reset-on-success
step is mandatory.

### 4. PII redaction pipeline ordering is FIXED (audit P2 #4)

Phase D-3 locked the sequence in `lib/observability/log-error.ts`:

```ts
function redactString(input: string): string {
  let s = input.replace(EMAIL_RE, '[EMAIL]');        // (1) email first
  s = normalizeArabicDigits(s);                       // (2) Arabic → ASCII
  s = collapsePhoneFormatting(s);                     // (3) strip spaces/hyphens/parens
  s = s.replace(PHONE_RE, '[PHONE]');                 // (4) phone regex last
  return s;
}
```

Order rationale: emails never contain Arabic digits, so step 1 runs
clean of any normalization side-effects. Steps 2-3 prepare the input
for step 4's regex matcher. Reordering risks redaction misses or
false-positives.

Side effect: Arabic-Indic digits in the output become ASCII. Acceptable
since this is internal audit-log content, not user-facing display. The
`collapsePhoneFormatting` regex includes an **IPv4 guard** — if a
matched run contains ONLY dots (no space/hyphen/paren), it's left
unchanged. This distinguishes `192.168.1.1` from `(056) 579-9505`.

### 5. External-auth uses constant-time iteration with NO early break

Phase D-4 lock (audit P2 #10). The Phase 14.3 #5 lock established
`timingSafeEqual` as the codebase standard for ANY secret comparison.
Phase D-4 applied it to API-key hash lookup with one additional
discipline:

```ts
// fetch all active + non-expired keys (LIMIT 1000)
const { data: rows } = await supabase.from('pyra_api_keys')
  .select(...).eq('is_active', true)
  .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
  .limit(1000);

// Iterate ALL rows; no early break
let matched = null;
for (const row of rows) {
  const rowBuf = Buffer.from(row.key_hash, 'hex');
  if (rowBuf.length === keyHashBuf.length &&
      crypto.timingSafeEqual(rowBuf, keyHashBuf)) {
    matched = row;
    // NO break — keep scanning to neutralize position-timing attack
  }
}
```

**Rule:** any future constant-time lookup over multiple candidates
MUST follow the no-early-break pattern. An attacker timing response
latency could otherwise infer which position matched even with
`timingSafeEqual` on the bytes.

LOCK 4 cap: `LIMIT 1000` on the SELECT. `pyra_api_keys` currently has
<10 rows in production. If you hit this limit, the table has grown
beyond design assumptions — revisit with a bloom-filter pre-filter or
Redis-backed lookup.

### 6. Backup encryption is OPT-IN via env var (audit P2 #6)

Phase D-4 lock. `scripts/db-backup.sh` checks for
`BACKUP_ENCRYPTION_PASSPHRASE` in `.env.local`:
- Set → GPG symmetric AES256 encryption, output `.sql.gz.gpg`
- Unset → legacy `.sql.gz` with stderr warning (backwards compat)
- Set but `gpg` not installed → abort cleanly with install instructions
  (NO silent fallback — that would defeat the purpose)

**Passphrase discipline (mandatory):**
- Passphrase is sent to gpg via **file descriptor 3** with here-string
  `3<<<"$PASS"` — out-of-band of stdin/stdout
- Never appears in `ps aux` / shell history / process listings
- During encryption: `gpg --passphrase-fd 3 3<<<"$PASS"` writes to stdout,
  redirected to `"$OUT"` via `> "$OUT"` (NOT `--output`) so gpg failures
  propagate through `set -o pipefail`
- During restore: `gpg --passphrase-fd 3 --output - "$FILE" 3<<<"$PASS"`
  reads the ciphertext file via positional arg, NOT via stdin — avoids
  the fd-0 collision that `< FILE <<<PASS` would cause (gpg would
  consume the passphrase as ciphertext and silently fail decryption)

v1.1 may flip to default-on once passphrase rotation tooling exists.

### 7. Cron endpoints follow the Phase 11 pattern verbatim

Phase D-3 lock. Any new cron endpoint MUST mirror
`/api/cron/follow-up-reminders` exactly:

```ts
export async function POST(request: NextRequest) {
  try {
    // 1. Auth via x-api-key header → pyra_api_keys
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);

    // 2. Permission check accepting wildcard
    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.<name>') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.<name>', 403);
    }

    // 3. Service-role client (RLS bypass intentional for cron)
    const supabase = createServiceRoleClient();
    // ... cron logic ...

    return apiSuccess({ ... });
  } catch (err) {
    logError({ error: err, request, metadata: { action: '...' } });
    console.error('[cron/<name>] threw:', err);
    return apiServerError();
  }
}
```

DO NOT invent a separate cron auth surface. n8n workflow setup
documented in `docs/MIGRATIONS.md` §15 Operations.

### 8. Rate-limiter messages auto-format units via `formatRetryArabic`

Phase D-2 Reviewer-MEDIUM fix. The shared `checkRateLimit()` helper in
`lib/utils/rate-limit.ts` calls `formatRetryArabic(retryMs)` to produce
human-friendly Arabic units:
- `< 60s` → `"N ثانية"`
- `< 60min` → `"N دقيقة"`
- else → `"N ساعة"`

`Retry-After` HTTP header stays in seconds per RFC 7231 (downstream
client tooling compliance).

**Rule:** new limiter callers benefit automatically — DO NOT hand-format
retry messages. Inconsistent unit choice across callers is a UX
regression smell.

### Phase D v1.1 backlog

See `CRM-PROGRESS.md` → "## Phase D — P2 Security Polish" → P2 findings
list for the actionable list. Highlights:
- Redis-backed rate limiter (only when horizontal scaling required)
- Offsite backup to S3 (encryption now in place reduces blast radius)
- Default-on backup encryption + passphrase rotation tooling

---

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

## Phase 14.2 — Locked Decisions

These are **intentional, documented design choices** locked during
Phase 14.2 closure (DB Migrations Strategy). **Do NOT re-litigate.**
Phase 14.2 is post-CRM-rebuild infrastructure work — establishes the
canonical version-tracking table + drift detection + pre-migration
backup workflow that all future migrations rely on.

### 1. Forward-only migrations (no auto-down)

The Pyra migration system does NOT run down-scripts automatically.
Reverting requires either (a) a new forward migration that reverses
the effect OR (b) restoring from a `pnpm db:backup pre-NNN` snapshot.
Industry trend (Rails 7+, Prisma) is the same — auto-down is too
dangerous when data is involved.

The `-- DOWN` block in `supabase/migrations/_template.sql` is
informational only. Inline rollback hints are double-commented (`-- --`)
so they cannot be accidentally executed by copy-paste into pg/query.

### 2. `pyra_schema_migrations` as canonical version tracker

Single source of truth: `(version, applied_at, applied_by, checksum,
notes)`. Migration 017 establishes the table + backfills rows for
001-016 retroactively with `applied_by='bootstrap'`.

**Append-mostly schema** — no `updated_at`, no trigger. The only
mutation path is `pnpm db:record --force` (explicit re-record after a
legitimate file change). Preserves audit integrity.

**Checksum is LF-normalized SHA-256** — `content.replace(/\r\n/g, '\n')`
before hashing. Both `db-record-migration.ts` and `db-check-drift.ts`
use identical normalization. Windows CRLF and Linux LF produce the same
hash; drift detection has no false positives from line-ending changes.

### 3. Apply-then-verify-then-record workflow

**`pyra_schema_migrations` is a historical record, not a confirmation
of success.** Recording a row without verifying creates fake success
entries that drift detection trusts.

Mandatory sequence (per `docs/MIGRATIONS.md` §6 + §7):
1. Apply the migration via `curl /pg/query`
2. **Manually verify** the changed schema (query columns, indexes,
   CHECK constraints, backfill row counts)
3. ONLY THEN run `pnpm db:record <version> --by=<u> --notes="…"`

Skipping step 2 is a docs violation, not a tooling block — but the
runbook calls it out explicitly. v1.1 may add a `--require-verify`
flag that prompts the dev before recording.

### 4. Backup-before-migrate workflow

`pnpm db:backup pre-NNN` before every Risk tier 2 migration (touches
existing data). Recommended for tier 1 too — cost is trivial (32 MB DB
→ ~5 MB compressed snapshot).

Backups land in `backups/` (gitignored). Restore via `gunzip -c
backups/{file}.sql.gz | psql "$SUPABASE_DB_URL"`. Offsite storage is
deferred to v1.1 (S3 via Coolify's object-storage integration); v1 is
local-only by design — Abdou's call when offsite becomes worth the
maintenance.

`pg_dump --schema=public --no-owner --no-acl --exclude-table-data=
pyra_error_logs --exclude-table-data=pyra_activity_log | gzip`. Audit
tables retain schema but drop row data (regenerable, would bloat the
dump on long-lived prod).

### 5. Three pnpm tooling commands

```bash
pnpm db:backup [<label>]                                    # pre-migration snapshot
pnpm db:record <version> [--by=<u>] [--notes="…"] [--force] # record after manual verify
pnpm db:check-drift                                          # 3-category triage
```

Scripts invoked via `npx tsx` (TypeScript) and `bash` (Bash) — `tsx`
isn't a project devDep, `bash` is invoked explicitly because PNPM on
Windows routes through cmd.exe which can't execute `.sh` files directly.

### 6. Service-role key from `.env.local` ONLY

Both `db-record-migration.ts` and `db-check-drift.ts` read
`SUPABASE_SERVICE_ROLE_KEY` exclusively via `readFileSync('.env.local',
'utf8')` + regex extract. **Reading from `process.env` or CLI args is
explicitly forbidden** — shell history exposure risk.

`db-backup.sh` follows the same pattern for `SUPABASE_DB_URL` (Bash
quote-stripping via `sed -e 's/^["\x27]\(.*\)["\x27]$/\1/'`).

**Intentional asymmetry:** `db-record-migration.ts` accepts
`ABDOU_USERNAME` env fallback for the `--by` field. Documented inline
— a username is non-sensitive; standard shell-env pattern (like `$USER`
or `$LOGNAME`) is fine here. The service-role key is the only secret
treated as file-only.

### 7. Label sanitization (`db-backup.sh`)

Regex `^[a-zA-Z0-9._-]+$` + extra `..` check (belt-and-braces against
path traversal). Anchored full-string match, hyphen at end of character
class (literal, not range). Rejects spaces, `$`, `` ` ``, `;`, `|`,
`&`, `/`, parens, quotes, etc. — any shell metacharacter or filesystem
traversal.

The label appears in exactly 2 places after validation: the `..` check
(read-only comparison) and the filename construction
`backups/${TS}_${LABEL}.sql.gz`. Never interpolated into a command
string. No shell-injection surface.

### 8. `001_employee_system_bootstrap.sql` for fresh-DB setup

Pre-existing `scripts/migration-employee-system.sql` was renamed via
`git mv` (preserves 85% similarity in history) + had a bootstrap
header prepended. Fills the 001 number gap that existed since project
inception. Production DB has it applied via pre-Pyra deployment;
`applied_by='bootstrap'` records it retroactively.

**Fresh DB setup order:** 001 → 002 → … → highest existing migration,
each via `curl /pg/query`. Then loop-record via `for migration in
supabase/migrations/0*.sql; do pnpm db:record ...`. v1.1 may add a
`pnpm db:bootstrap` wrapper.

### 9. Staging environment deferred to v1.1

**Triggers** (documented in `docs/MIGRATIONS.md` §1):
- A destructive migration enters scope (DROP COLUMN with live data
  dependency, irreversible column-type change)
- A second developer joins the codebase

Until then: 32 MB DB + 1-dev workflow + high idempotency hygiene
makes staging cost > value. The backup script provides the rollback
insurance that staging would have provided.

### 10. Concurrent migration assumption

v1 trusts the single-developer workflow. No `pg_advisory_lock` on
`pnpm db:record`. Two devs applying simultaneously = race condition.

v1.1 adds the advisory lock when a second developer joins. Documented
in `docs/MIGRATIONS.md` §12 with the upgrade snippet.

### 11. Order enforcement is advisory

`pyra_schema_migrations` does NOT reject out-of-order INSERTs.
Numbers are advisory; the system trusts the developer to apply in
order. **Why not enforce?** A `BEFORE INSERT` trigger that checks
`version - 1 exists` would block retroactive recording (the Phase 14.2
backfill of 001-016 would fail) and break the bootstrap flow.

v1.1 adds an order-gap warning to `pnpm db:check-drift`: if version
020 exists but 019 doesn't, the script prints a warning (but doesn't
fail). Documented in `docs/MIGRATIONS.md` §13.

### Implementation invariants (locked, do NOT regress)

- **LF-normalization is byte-for-byte identical** between
  `db-record-migration.ts` (line 129) and `db-check-drift.ts` (line 64).
  Both use `raw.replace(/\r\n/g, '\n')` before `createHash('sha256')`.
  Drift between the two breaks all drift detection.
- **The service-role key is never logged.** No `console.log` of the
  key in any error path of any script.
- **Migration 017 does NOT self-record.** The `pnpm db:record
  017_pyra_schema_migrations` step happens manually post-apply — keeps
  migration SQL focused on schema and exercises the canonical tooling.
- **The 001 bootstrap is INTENTIONALLY different content from the
  original `scripts/migration-employee-system.sql`** — the rename
  added a 22-line header banner. The 85% similarity score from `git
  mv` reflects this. The new SHA-256 (`3fd2864d…`) is the canonical
  baseline; the pre-rename checksum is NOT in `pyra_schema_migrations`.

### Phase 14.2 v1.1 backlog

See `CRM-PROGRESS.md` → "Phase 14.2 v1.1 items" — staging environment,
`pnpm db:apply` wrapper, `pnpm db:bootstrap` for fresh DB, advisory
lock for concurrent migration safety, order-gap warnings in
`db-check-drift`, offsite backup to S3, pg_dump availability pre-flight
check, optional pre-commit drift hook.

## Phase 14.3 — Locked Decisions (Security Audit + Fix Bundle)

Phase 14.3 was a read-only security audit (commit `945fd2e`) followed
by a tight 3-fix bundle of the audit's highest-priority + lowest-
effort findings. **3 of 8 P1 findings shipped this session.** The full
audit + implementation status delta lives at
`docs/SECURITY-AUDIT-2025-01.md`.

### 1. Audit doc is a point-in-time record + delta layer

`docs/SECURITY-AUDIT-2025-01.md` was written as the closure artifact
of the read-only audit (Codebase HEAD `676d2ab`). The findings
themselves are NEVER edited — they remain a historical snapshot.
Post-audit implementation progress is tracked via an **"Implementation
Status" delta table at the top** of the same doc, referencing commit
SHAs for fixed items + deferral rationale for the rest.

Future security audits should follow the same pattern: name the file
`docs/SECURITY-AUDIT-YYYY-NN.md` (next would be `2025-02`), preserve
the original findings verbatim, layer implementation status on top.
Audit history is its own form of value — rewriting it loses context.

### 2. `crypto.timingSafeEqual` is the standard for secret comparison

Phase 14.3 fix #1 (commit `4eaaa70`) — WhatsApp webhook secret
comparison was switched from plain `!==` to `timingSafeEqual` from
`node:crypto`. **All future secret/key/token comparisons in the
codebase MUST use `timingSafeEqual`**, NOT `===`/`!==`. Plain JS
equality is variable-time and leaks the comparison position via
network timing.

**Length-guard is mandatory before `timingSafeEqual`** — it throws
`RangeError` on unequal-length buffers, and that throw itself becomes
a timing oracle differentiating the length-mismatch path from the
equal-length-mismatch path. The canonical pattern:

```ts
const aBuf = Buffer.from(provided, 'utf8');
const bBuf = Buffer.from(expected, 'utf8');
if (
  !expected ||                          // empty-secret guard
  aBuf.length !== bBuf.length ||        // length-guard BEFORE timingSafeEqual
  !timingSafeEqual(aBuf, bBuf)
) {
  return unauthorized();
}
```

Length leakage is acceptable: guessing a JWT's length is trivial;
guessing its bytes is what we prevent. Already-applied in
`app/api/dashboard/sales/whatsapp/webhook/route.ts:51-74`.

### 3. PostgREST `.or()` user input MUST be escaped

Phase 14.3 fix #2 (commit `7abad17`) — legacy sales-leads search input
flowed raw into `.or()` filter strings, letting authenticated agents
inject `assigned_to.neq.self` to bypass the agent-scope clause.
**ALL `.or()` calls that include user input MUST use the canonical
escape pattern** documented in `lib/utils/path.ts`:

```ts
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';

if (search) {
  const safe = escapePostgrestValue(`%${escapeLike(search)}%`);
  query = query.or(`name.ilike.${safe},phone.ilike.${safe},...`);
}
```

`escapeLike` escapes `%`, `_`, `\` (LIKE wildcards).
`escapePostgrestValue` wraps the result in double-quotes + escapes
any pre-existing quotes — preventing the attacker from closing the
quoted literal early. PostgREST treats the entire quoted token as a
single literal ilike pattern; commas and dots inside are NOT parsed
as filter syntax.

Single-column `.eq()`/`.in()`/`.gte()` calls are safe (parameter
binding is automatic). The injection vector is ONLY `.or()` /
`.filter()` / `.match()` which take filter strings.

Pre-fix audit: 21 `.or()` calls in the codebase. 4 had raw injection
(fixed in commit `7abad17`). 1 more had partial sanitization (WA
conversations route — P2 in audit, deferred to v1.1).

### 4. `PASSWORD_MIN_LENGTH` is the single source of truth

Phase 14.3 fix #3 (commit `125104e`) — password length minimums were
inconsistent across 17 surfaces (6/8/12 chars depending on UI).
Now centralized in `lib/constants/auth.ts`:

```ts
export const PASSWORD_MIN_LENGTH = 8;
```

**ALL password validation MUST import this constant**, both server-
side (API route validation) AND client-side (form input `minLength`
attrs + JS submit-gate length checks + toast/setError messages via
template-literal interpolation `${PASSWORD_MIN_LENGTH}`).

**Documented exceptions** (intentional hardcoded values):
- `lib/config/module-guide.ts` — module-guide tip text is plain data
  config without runtime templating; hardcoded "8 أحرف" is acceptable
  because the file is reviewed when constants change.
- `docs/IMPLEMENTATION-EMPLOYEE-SYSTEM.md` + `docs/SECURITY-AUDIT-
  2025-01.md` — historical documentation, intentionally NOT
  edited when constants change.

If `PASSWORD_MIN_LENGTH` is raised in the future (e.g. → 12), the
3 documented exceptions are the ONLY surfaces requiring manual
text update — every other site auto-tracks via the import.

**Value choice rationale (8 chars):** NIST SP 800-63B minimum, balance
of security + UX for the small Pyramedia team, matches the existing
dashboard profile pw-change → least churn. Abdou confirmed during
Phase 14.3 fix-bundle session.

### 5. Local shadow constants are forbidden

Reviewer surfaced two cases during the Phase 14.3 fix #3 sweep:
- `components/crm/customer/customer-convert-modal.tsx` declared its
  OWN `const PASSWORD_MIN_LENGTH = 6;`
- `app/api/crm/leads/[id]/convert-to-customer/route.ts` declared
  `const PORTAL_PASSWORD_MIN_LENGTH = 6;`

Both were removed and replaced with the canonical import.

**General rule:** any shared invariant (password length, file size
caps, rate limits, timeout values, max retries) MUST be imported
from `lib/constants/`. Inline literals AND local re-declarations both
violate the single-source-of-truth principle and cause drift over
time. If a literal is unique to one file (e.g. a one-off magic
number), prefer a top-of-file `const NAME = N;` comment-explained
declaration — but never duplicate a name that exists in
`lib/constants/`.

### 6. Task descriptions are plain text — no markdown rendering

Phase 14.3 second-wave Fix B (commit `fa30e3a`) — the boards task
sheet at `components/boards/task-sheet.tsx` previously rendered
task descriptions via `dangerouslySetInnerHTML` + 5 regex passes
to convert markdown to HTML. That path was XSS-vulnerable: text
NOT matched by the regexes was preserved verbatim, so payloads
like `**foo**<img src=x onerror=alert(1)>` executed.

**Locked decision (Abdou):** Pyramedia doesn't need markdown in
task descriptions. Plain-text rendering only. Existing descriptions
with markdown syntax become literal characters — the `**bold**`
shows as 5 literal asterisks.

The view-mode rendering pattern is:
```tsx
<div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
  {task.description}
</div>
```
React auto-escapes; `whitespace-pre-wrap` preserves line breaks;
`break-words` wraps long URLs (which are no longer linkified);
`leading-relaxed` provides comfortable line-height for plain text.

The textarea placeholder + hint were updated to reflect the new
behavior so users don't try to use markdown syntax that no longer
works.

**Generalized principle:** any user-input field rendered to other
users (task descriptions, comments, notes, messages) should default
to plain-text via `{value}` in JSX. If markdown becomes a real
business need, ship it via a vetted library (`react-markdown` with
`remark-gfm` + `rehype-sanitize`) — NEVER via regex-based HTML
generation. The Phase 14.1 observability layer's PII redaction +
auto-escape via React JSX text nodes is the canonical safe path.

### 7. Supabase JS filter-builder semantics — reassignment is load-bearing

Phase 14.3 second-wave Fix A (commit `0825f54`) — Reviewer surfaced
this pre-existing bug at `app/api/dashboard/sales/leads/route.ts`.
The `countQuery` was declared `const countQuery = supabase.from(...)
.select(..., { count: 'exact', head: true });` then chained with
`countQuery.eq(...)` without reassignment.

**Critical: Supabase JS filter methods (`.eq`, `.in`, `.gte`,
`.or`, `.match`, etc.) return a NEW PostgrestFilterBuilder rather
than mutating in place.** Without reassignment, every filter is
silently discarded.

The canonical pattern (already correct in most places):
```ts
let query = supabase.from('table').select('*');
if (filter1) query = query.eq('col1', value1);
if (filter2) query = query.eq('col2', value2);
```
NOT:
```ts
const query = supabase.from('table').select('*');
if (filter1) query.eq('col1', value1);  // ← SILENTLY DISCARDED
```

**Impact when wrong:** count queries return unscoped totals →
non-admin users see global counts in pagination. Verified
production bug pre-Fix-A: total leads = 29; sayed had 27, elharm
had 2 — pre-fix both agents saw `total=29` in their pagination
totals.

**Recurring review focus:** any new filter chain on Supabase
queries must use `let` + reassignment. Pattern is now grep-able:
`const \w+Query = supabase` followed by `\1\.\w+\(` without `\1 =`
is a code-smell.

### Phase 14.3 v1.1 backlog

See `CRM-PROGRESS.md` → "Phase 14.3 v1.1 items" — 3 remaining P1s
(2FA encrypt, 2FA enforce, GDPR export + erasure deferred with
explicit business rationale; 1 rate-limit deferral) + 10 P2s +
1 unknown (Coolify Postgres backup encryption — needs Abdou
verification). 5 of 8 audit P1s + 1 Reviewer-bonus bug fix shipped
across the two fix-bundle sessions (2026-05-15 + 2026-05-16).

## HR Department Improvement — Locked Decisions (2026-06-27)

These are **intentional, documented design choices** locked during the HR
Department Improvement bundle closure (30 commits merged to `main`).
**Do NOT re-litigate.** Future sessions touching the HR Overview, attendance,
or payroll surfaces should defer to the decisions recorded here.

### 1. `hr.view` is admin-only — NOT in BASE_EMPLOYEE

`PERMISSIONS.HR_VIEW = 'hr.view'` and `PERMISSIONS.HR_MANAGE = 'hr.manage'`
are declared in `lib/auth/rbac.ts` under a dedicated `'hr'` `PERMISSION_MODULES`
group. Neither is added to `BASE_EMPLOYEE` — the HR Overview is an admin-only
aggregate dashboard showing ALL employees' headcount, payroll, and leave data.
Admin gets it implicitly via `'*'`. `hr.manage` is reserved for future write
operations (no routes use it in v1).

**Rule:** any future HR admin write endpoint MUST gate on `hr.manage`, NOT on
`payroll.manage` or `attendance.manage` (which are narrower per-module gates).

### 2. `/api/hr/overview` = single aggregator, gate THEN service-role

`GET /api/hr/overview` follows the gate-then-service-role pattern established
for sensitive tables by audit Gap #3:

1. `requireApiPermission('hr.view')` — 401/403 if not admin
2. ONLY THEN `createServiceRoleClient()` — because `payroll_runs`,
   `payroll_items`, `employee_payments`, and `attendance` tables had
   `authenticated` revoked in Phase 2 Tier-2 (Gap #3)

**Single-aggregator invariant:** the endpoint is one round trip returning all
7 sections (headcount, attendance_today, leave, payroll, evaluations, alerts,
celebrations). DO NOT fragment into per-widget endpoints — at this team size the
aggregator is faster and simpler to maintain. The same pattern mirrors
`/api/my-work` for employees.

### 3. Migration 020 — `date_of_birth` is additive and nullable

`supabase/migrations/020_pyra_users_date_of_birth.sql` adds:

```sql
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS date_of_birth date NULL;
```

Idempotent (`IF NOT EXISTS`). `PyraUser.date_of_birth?: string | null`
(YYYY-MM-DD). Celebrations in the HR Overview combine:
- **Birthdays** — from `date_of_birth` (current month match, day/month only)
- **Anniversaries** — from `hire_date` (current month match + years computed)

Both computed by `computeCelebrations()` in `lib/hr/overview-helpers.ts` (pure
helper, no DB access). The `date_of_birth` field is wired into `/api/users`
POST + PATCH and the users create/edit form.

### 4. Attendance was already React-Query-compliant — consolidated, not rewritten

Initial research over-stated the attendance client as using "raw fetch + useState."
It was already RQ-compliant with inline `useQuery`/`useMutation`. The bundle's
work was **consolidation** onto a shared `hooks/useAttendance.ts`:

- Exports: `useAttendanceRecords`, `useAttendanceSummary`, `useClockIn`,
  `useClockOut`, `useUpsertAttendance` + typed `AttendanceRecord`/`AttendanceSummary`
- Removed a `setWorkSchedule`-inside-`queryFn` side effect (mutations in queryFns
  are a React Query anti-pattern — they fire on every background refetch)
- Status constants centralized in `lib/constants/statuses.ts`:
  `ATTENDANCE_STATUS`, `ATTENDANCE_STATUS_LABELS`, `ATTENDANCE_STATUS_STYLES`

**Component split:** attendance client (537 → 197 lines) into
`components/attendance/` sub-components (`AttendanceCalendar`,
`AttendanceSummaryCards`, `TodayClockCard`).

### 5. Admin attendance edit wires the previously-DEAD `canManage` flag

The attendance client had a `canManage` boolean (gated on `attendance.manage`)
that controlled conditional rendering — but the admin edit UI was never built.
This bundle ships:

- `POST /api/dashboard/attendance/admin` — `attendance.manage` gate + service
  role + upsert on `(username, date)` + recomputes `total_hours` + `logActivity`
  + DB errors via `logError`
- `components/attendance/AdminAttendanceDialog.tsx` — wired to `canManage`,
  now the flag actually gates real functionality

The endpoint follows the same gate-then-service-role pattern as `/api/hr/overview`
because attendance tables are service-role-only (Gap #3 Phase 2 Tier-2).

### 6. Payroll migrated OFF `useState`/`useEffect` — fixed a double-`.data` unwrap bug

The payroll client previously used manual `useState`/`useEffect`/`fetch()` for
data loading. The bundle migrated it to React Query via `hooks/usePayroll.ts`:

- Exports: `usePayrollRuns`, `usePayrollRun`, `useMyPayslips`, `useCreatePayroll`,
  `useCalculatePayroll`, `useUpdatePayroll`
- `hooks/useEmployeePayments.ts`: `useEmployeePayments`, `useCreateEmployeePayment`,
  `useUpdateEmployeePayment`

**Bug fixed:** the old manual-fetch path did `.data.data` on the response —
`fetchAPI()` already unwraps `{ data }` (CLAUDE.md mandate), so reading `.data`
again produced `undefined`. The migration surfaced and fixed this silently-broken
double-unwrap.

Additional payroll improvements: `formatCurrency` from `lib/utils/format` (was
inline); a11y (toggle button `aria-expanded`/`aria-controls`, detail region in
DOM via `hidden`, `scope=col` headers).

**Component split:** payroll client (848 → 80 lines) into `components/payroll/`
sub-components (`PayrollRunsTable`, `PayrollRunRow`, `EmployeePaymentsTab`,
`CreatePayrollDialog`, `AddPaymentDialog`).

### 7. A11y hardening across attendance and payroll

Both attendance and payroll received targeted a11y improvements (not cosmetic):
- **Attendance:** keyboard grid (`role=gridcell`, `aria-label`, `tabIndex`,
  `focus-visible ring`); nav `aria-label`s + `rtl:rotate-180` for directional
  icons; `aria-live` on clock-in/out result; status legend.
- **Payroll:** toggle button `aria-expanded`/`aria-controls`; detail region kept
  in DOM via `hidden` (not conditional render) so `aria-controls` target always
  exists; `scope=col` on table headers.

These invariants must be preserved in future edits to the attendance/payroll
clients.

### Implementation invariants (locked, do NOT regress)

- **`hr.view` is admin-only.** Do NOT add it to `BASE_EMPLOYEE` or `ROLE_EXTRAS`
  for any role — the HR Overview surfaces all-employee aggregate data that must
  never leak to individual employees or sales agents.
- **Gate-then-service-role is mandatory for `/api/hr/overview` and
  `/api/dashboard/attendance/admin`.** Never call `createServerSupabaseClient()`
  (session client) after the permission check — those tables have `authenticated`
  revoked (Gap #3).
- **HR Overview stays a single aggregator endpoint.** Do NOT split into per-widget
  endpoints. Extend the existing endpoint response when new data is needed.
- **Attendance and payroll clients consume the shared hooks.** No inline `queryFn`
  side-effects (mutations inside queryFns), no `useState`-as-cache, no
  double-`.data` unwrap (recall: `fetchAPI()` already unwraps `{ data }`).
- **`date_of_birth` is nullable/optional everywhere.** Celebrations degrade
  gracefully when the field is NULL — the celebrations array simply omits those
  users. Never throw on NULL `date_of_birth`.
- **`computeCelebrations` + `deriveAlerts` are pure functions** in
  `lib/hr/overview-helpers.ts`. They have no DB access and no side effects —
  keep them pure so the unit tests in `__tests__/hr-overview-helpers.test.ts`
  remain valid.
- **Component split target: <300 lines per client file** (per CLAUDE.md mandate).
  Attendance and payroll now meet this target; do not re-inline sub-components.

### HR bundle v1.1 backlog

- `users-client` `date_of_birth` field: `onChange` uses object-spread (not
  functional `setFormData`); uses `<Label>` not `<FormLabel>` unlike `hire_date`.
- `hooks/usePayroll.ts` `useMyPayslips` returns `unknown` shape AND is currently
  unused (the my-payslips page was not migrated in this bundle) — wire onto the
  hook or drop and add when the page is migrated.
- `attendance-client.tsx`: merge duplicate import + `import type` from
  `@/hooks/useAttendance`; drop dead `"|| ''"` status fallbacks; still has its
  own `getTodayUAE()` (could reuse `dubaiDayKey` from `lib/utils/format`).
- `AdminAttendanceDialog` `DialogFooter` `flex-row-reverse` cosmetic alignment.
- `formatTime`/`formatHours` duplicated across the 3 attendance sub-components;
  `MONTH_NAMES_AR` duplicated in 4 places (incl. the overview route `MONTHS_AR`)
  — extract to a shared `lib/constants/` entry.
- `CreatePayrollDialog` month/year not reset on close (pre-existing).
- `components/payroll/PayrollRunsTable` imports `PayrollRunRow` via relative `'./'`
  vs the project's `'@/'` path-alias convention.
- Payslip download still uses imperative `fetchAPI` double-unwrap pattern (pre-
  existing; the only remaining non-hook fetch in the payroll surface).
- `useUsers()`-based pickers (`AdminAttendanceDialog`, `AddPaymentDialog`) depend
  on `users.view` — a future HR-manager granted only `attendance.manage` /
  `payroll.manage` via `extra_permissions` would see an empty dropdown. Consider
  `/api/users/lite` (role+status only, narrower scope).
- HR Overview "pending approvals" KPI surfaces `leave.pending` only (no combined
  all-approvals count yet — leave + expense + timesheet).

## Documentation (Read don't guess)
| Doc | What it covers |
|-----|---------------|
| `docs/SYSTEM-STRUCTURE.md` | Complete 94-page reference with all tables and integrations |
| `docs/FEATURE-IMPACT-MAP.md` | What connects to what — READ BEFORE any new feature |
| `docs/EMPLOYEE-SYSTEM.md` | HR modules (14 modules, attendance→payroll chain) |
| `docs/ARCHITECTURE.md` | System architecture, backup-rollback pattern |
| `docs/CLIENT-MANAGEMENT.md` | Client system, portal branding |
| `DATABASE-SCHEMA.md` | Full schema (~110 tables) |

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

## Quote System + Gap #5 — Locked Decisions (2026-06-19)

Closure of the quote-system fix arc (Groups 1–3) — the "Bahaa broken-loop"
saga: sales agents could create quotes but not **see / send / delete** them,
plus the broken-snapshot all-NULL PDF bug. **Do NOT re-litigate.** Full
chronological arc + verifications in `CRM-PROGRESS.md`.

### 1. Quote scoping = created_by OR lead-owned OR clientIds (Gap #5a)

`GET /api/quotes` (list) and `GET /api/quotes/[id]` (single) scope non-admins
with a **three-way OR**: a quote is visible if the user **created it**
(`created_by`), OR it's on a **lead they own** (`lead_id ∈ their leads`, via
`canAccessLead`), OR it's for a **client in their ERP scope** (`clientIds`).
Replaces the old `client_id IN clientIds`-only filter, which returned `[]` for
team-less CRM agents (no teams → empty `clientIds`) — that was the create→view
break. Empty arrays are OMITTED from the `.or()` (PostgREST `in.()` is invalid);
all values quoted via `escapePostgrestValue` (usernames contain dots). The
Lead-Detail Deals tab quotes card (`useLeadQuotes` → `/api/quotes?lead_id=`)
rides the same scoped endpoint (Gap #5b, closes issue #7).

**KNOWN v1.1 ISSUE (do not assume team scoping works):** `clientIds` comes from
`pyra_projects.client_id` (`c_` namespace) but `pyra_quotes.client_id` is the
`cl_` namespace — they rarely match, so the clientIds clause is **latently
inert** for everyone. `created_by` + lead-owned are the real workhorses; the
clientIds clause is kept (with `String()` coercion) for when the namespace
mismatch is fixed.

### 2. `quotes.delete_own` + three-way delete + NULL client_id fix (Group 2)

New permission `quotes.delete_own` (delete OWN quotes only) — granted to
`sales_agent`. `DELETE /api/quotes/[id]` authenticates first (`getApiAuth`,
NOT `requireApiPermission('quotes.delete')` which would 403 agents), then
branches:
- has `quotes.delete` (full) → admin bypass OR Gap #5a three-way scope
- else has `quotes.delete_own` → must be `created_by === me`
- else → 403

**Issue #4 fix:** the old `!clientIds.includes(client_id)` check forced
forbidden for lead-only quotes (`client_id = NULL`) **even for the creator**.
The three-way / creator-only model fixes it — NULL client_id is irrelevant to
own-scope deletion. Verified end-to-end: kassem (agent, delete_own only) deleted
his own NULL-client_id quote QT-0027 (activity-log proven).

### 3. Save-and-send gate + honest send-UX = flip-and-warn (Groups 2–3)

- **Gate:** "حفظ وإرسال" (QuoteBuilder) + the per-row "إرسال" are hidden when
  the user lacks `quotes.edit` (the `/send` endpoint requires it). Agents see
  only "حفظ كمسودة" — kills the save-then-fail-send partial-state double-create.
- **Honest UX (flip-and-warn):** `/api/quotes/[id]/send` AWAITs the email and
  returns `{ ...quote, email: { sent, reason?: 'no_email'|'not_delivered', to? } }`.
  The quote **always flips to `sent`** regardless of email outcome (admin's
  action stands; they can re-send); the UI shows the truth via 3 toasts:
  delivered → success `"تم إرسال العرض بالبريد إلى {to}"`; no_email / not_delivered
  → warning. `sendQuoteSentEmail()` (awaitable) returns the boolean; the
  fire-and-forget `notifyQuoteSentToClient` is retained but signposted as
  "do NOT use on the send path".

### 4. DataTable portaled-click fix is root-level (`components/ui/data-table.tsx`)

Radix `DropdownMenu`/`Dialog` content is **portaled to `document.body`**, but
its React synthetic `onClick` bubbles through the React **component** tree to the
`<tr>` `onClick` — so clicking a row's ⋮ menu item fired row navigation. The
`<tr>` guard now also bails on `target.closest('[data-radix-popper-content-wrapper]')`,
`[role="menu"]`, `[role="dialog"]`, `[role="alertdialog"]`. Strictly corrective
(no case wants a portaled-menu click to navigate the row); fixes the same latent
glitch on **quotes + invoices + projects** lists. Any new `DataTable` + row-menu
page inherits the fix.

### 5. Server-side PDF generation pattern (Group 3) — LOCKED

- **`lib/pdf/pdf-assets-server.ts` (server-only)** reads Amiri fonts + the
  default logo from the filesystem (`node:fs`) and the server INJECTS them into
  `generateQuotePDF`/`generateInvoicePDF` via `{ fonts, defaultLogo }`. WHY:
  `registerArabicFont`'s browser path uses `fetch('/fonts/..')` — a **relative
  URL that THROWS in Node** ("Failed to parse URL"), which silently broke ALL
  server-side Arabic (incl. the pre-existing WhatsApp `send-pdf`). Keep all `fs`
  usage in this module — it must only be imported by **server route handlers**
  (no `'use client'` file may import it, or the client build breaks).
- **`quote-pdf.ts` / `invoice-pdf.ts` are NOT `'use client'`** — they're
  isomorphic utilities (plain async fns). A `'use client'` directive makes the
  server's `await import()` resolve to a **client-reference proxy** → server
  generation silently fails. Browser callers still bundle them via their own
  `'use client'` boundary.
- **`registerArabicFont(doc, preloaded?)`** throws loudly if called server-side
  without `preloaded` fonts (instead of silently producing a fontless PDF).
- **`addImage` format is detected** from the data URI (`data:image/png` → 'PNG',
  else 'JPEG') so the PNG default logo embeds correctly.
- **Pattern to reuse for any server PDF:** select full `*_FIELDS` + items →
  `loadServerPdfFonts()` + `loadServerDefaultLogo()` → `await import()` the
  generator → `Buffer.from(await blob.arrayBuffer())` → attach. PDF failure is
  **isolated** (logError + link-only fallback) and never blocks the send or the
  status flip.
- **Gmail 25 MB cap:** Node can't resize images (no canvas), so the embedded
  logo is raw. Default logo (904×398 → ~1.5 MB PDF) is safe; a **very-high-res
  entity logo could bloat the PDF past 25 MB** (v1.1 — needs server-side resize).
- **Quote emails ATTACH the PDF** (lead recipients have no portal login); body
  leads with "العرض مرفق بهذا البريد (PDF)", portal link is secondary.

### 6. SMTP config + `smtp_allow_insecure` TEMPORARY compromise

SMTP creds live in `pyra_settings` (DB only, NEVER in code — repo is public):
`smtp_host/port/user/pass/from/from_name` (sender shows **"Pyramedia X"**).
`mailer.ts` reads DB-first (env fallback), `secure: port===465`.

⚠️ **`smtp_allow_insecure=true` is a DOCUMENTED, TEMPORARY compromise.** The
`mail.pyramedia.info` Let's Encrypt cert **expired 2026-06-03** (auto-renew
broke); prod's `rejectUnauthorized:true` refused it. The flag (DB-toggleable,
**secure-by-default**, part of the transporter cache key so it takes effect with
no redeploy) disables cert validation for the SMTP transport ONLY (still
TLS-encrypted). **REVERT to `false` (or delete the key) once the cert is
renewed** — then re-run the connect+cert+auth pre-flight. Until then, server-side
SMTP cert validation is OFF.

### 7. Granting a permission to EXISTING users needs the DB role updated, not just `ROLE_EXTRAS`

`buildUserPermissions` = `BASE_EMPLOYEE ∪ (dbRolePermissions ?? ROLE_EXTRAS[role]) ∪ extras`.
Users whose `pyra_users.role_id` points to a `pyra_roles` row resolve from
**`dbRolePermissions`** — so adding a perm to `ROLE_EXTRAS.sales_agent` in code
is **INERT** for them. Group 2 hit this: `quotes.delete_own` only worked after
the "Sales" DB role's `permissions` array (`text[]`) was also updated
(`array_append`, idempotent). **When granting a new role permission, update BOTH
the code `ROLE_EXTRAS` (canonical/fresh-setup) AND the live DB role row** —
verify with a DB read.

### Quote-system v1.1 backlog

- `c_` vs `cl_` client-id namespace mismatch → team-based quote scoping latently
  inert for all (clientIds clause never matches). Fix the namespace, then the
  clause works.
- Dead hooks: `useQuotes`/`useQuote`/`useCreateQuote` in `hooks/useQuotes.ts`
  point at `/api/dashboard/quotes` (404, doesn't exist) and are imported by
  nothing. Remove or repoint to `/api/quotes`.
- Entity-logo bloat: Node can't resize → a very-high-res entity logo could push
  the email PDF past Gmail's 25 MB. Add server-side resize (sharp) or a
  pre-sized asset.
- Remaining original quote issues: #8 (a dedicated `quotes.send` perm vs reusing
  `quotes.edit`), #9 (edit-page read-only gating for agents), #10 (deeper
  sent-status UX — delivery receipts / retry).
- Read-only quote view for agents (the Deals-tab card covers visibility for now;
  no standalone agent-facing quote detail).

## Audit Gap #4 — `sales_leads.manage` misleading name (documented, rename deferred)

**Decision (2026-06-19, Option B):** document, do NOT rename now. `sales_leads.manage`
gates 9 routes across 7 files + 3 `rbac.ts` definitions + the live "Sales" DB role.
Despite the `.manage` suffix it does **NOT** grant manage-all — every gated route
ALSO enforces own-lead scope (`canAccessLead` / own-lead filter) and the leads LIST
endpoint scopes by `sales_leads.view` + own-lead filter, so agents only ever touch
their OWN leads. It's **P2 hygiene (no security hole), just a badly-named permission.**

A bare rename carries a real **403 risk**: permissions resolve from the DB role, so a
code/DB mismatch window during deploy would lock the 3 agents out of all 9 routes. The
proper fix is a 3-step zero-downtime migration (accept both → flip gates → drop old),
bundled with the **broader `sales.*` rename** already deferred in Phase 12 decision #4.

**v1.1 backlog:** rename `sales_leads.manage` → `sales_leads.update` as part of the
sales.* rename pass, via the zero-downtime alias migration. Clarifying comment lives at
the `SALES_LEADS_MANAGE` definition in `lib/auth/rbac.ts`.

## Audit Gap #3 — DB exposure remediation (2026-06-19) — P0, partially closed

**The incident (P0, proven live-exploitable):** 115/125 `pyra_*` tables had RLS
OFF and the `anon` + `authenticated` Postgres roles held **full DML grants** on
all 125. The `anon` key is public (client bundle + public repo). Net:
**anyone on the internet could read/write the entire DB via PostgREST**, bypassing
every app-layer permission/scope check. Proven: `GET /rest/v1/pyra_clients` with
only the anon key returned `HTTP 200 + data`. Worst exposure: `pyra_settings`
held the **live Stripe secret key**, Stripe webhook secret, and SMTP password.

**Git history: CLEAN** — verified no real secret was ever committed (`.env`/
`.env.local` never tracked; only `.env.example` placeholders; `__tests__/env.test.ts`
JWTs are dummies, hash ≠ real keys). The ONLY exposure vector was the DB hole.

### ✅ Phase 0 — DONE & verified (closed the internet hole)
`REVOKE ALL PRIVILEGES ON ALL TABLES/SEQUENCES IN SCHEMA public FROM anon;` +
`ALTER DEFAULT PRIVILEGES ... REVOKE ... FROM anon;`. Verified: anon probe →
`HTTP 401 permission denied` (was 200); `authenticated` retained (app's auth path
+ dashboard realtime depend on it); service_role untouched; kassem login confirmed
working. **Safe because** no code path reads tables as `anon` (portal/external/
Stripe/share-token = service role; dashboard = authenticated post-sign-in). Only
casualty: portal realtime notif pop (anon `postgres_changes` on
`pyra_client_notifications`) degrades to refresh/poll — itself part of the hole.

### ✅ Phase 1 — DONE & verified (locked the secrets table)
`pyra_settings` had its 2 authenticated readers switched to service role
(`app/api/settings/route.ts` GET+PATCH, `app/api/dashboard/route.ts` max_storage
read — commit `443ffd2`, deployed first), THEN
`REVOKE ALL PRIVILEGES ON TABLE public.pyra_settings FROM authenticated;`. Now
**service-role-only** (anon + authenticated both gone). Verified: only
`postgres`/`service_role`/`supabase_admin` retain grants; service read works (34
rows); anon REST → 401. The other 25 `pyra_settings` readers were already service
role.

### ⏳ DEFERRED — precautionary secret rotation (low priority, do when free)
These were briefly DB-readable while the hole was open (Stripe/everything since
inception; the SMTP pass I added ~30 min). **Stripe dashboard logs are CLEAN** (no
unfamiliar charges/refunds/payouts) and Stripe is rarely used → low priority, but
rotate as precaution. Rotation needs manual dashboard/mail-server work (Abdou):
- **`stripe_secret_key`** (LIVE `sk_live_`): roll in Stripe → Developers → API
  keys → paste new key → update `pyra_settings.stripe_secret_key` (service-role
  `pg/query` or admin Settings UI). App picks it up **next request** (no redeploy
  — `lib/stripe.ts` auto-rebuilds on key change).
- **`stripe_webhook_secret`**: roll in Stripe → update. Live next request.
- **`smtp_pass`**: change on mail server → update. ⚠️ **needs a redeploy** to take
  effect — `mailer.ts` caches the transporter keyed on `host:port:user:allowInsecure`
  (NOT pass). **v1.1 fix (1 line): add the pass to that cache key** so future pass
  changes auto-pick-up; fold in when next touching `mailer.ts` (cert renewal).
- `stripe_publishable_key` — public by design, no rotation.

### 📋 PENDING — Phase 2 (least-privilege) + Phase 3 (storage), structural
- **Phase 2 Tier-1 + Tier-2 — ✅ DONE:** revoked `authenticated` on **18 sensitive
  tables** now service-role-only — Tier-1 (12, zero-migration): api_keys, cards,
  payments, contracts, credit_notes, purchase_orders, suppliers, evaluations,
  subscriptions, recurring_invoices, revenue_targets, business_entities; Tier-2 (6,
  after switching their session-client readers to service role): payroll_runs,
  payroll_items, employee_payments, error_logs, sessions, login_attempts. Plus a
  real **payroll authz leak fixed** — `GET /payroll` + `/payroll/[id]` now require
  `payroll.manage` (were `payroll.view` = every employee → all salaries); employees
  keep their own payslip via `my-payslips`/`payslip` (self-scoped).
- **Phase 2 FULL — 📋 deferred v1.1 (MEDIUM):** the remaining `authenticated` grants
  on the other ~107 tables. Locking them needs migrating ~87 pure + ~40 mixed
  session-client (`createServerSupabaseClient().from()`) routes to service role +
  handling the auth-path `pyra_users`/`pyra_roles` reads + dashboard realtime
  tables (need authenticated SELECT). **~90–120 file migration → staged.** Only the
  ~7 logged-in internal users can over-read via PostgREST (NOT internet-wide).
- **Phase 3a — ✅ DONE:** lead attachments (client PII) moved to a new **PRIVATE**
  bucket `pyra-private` + served via 1h **signed URLs** (`createSignedUrl`, viewer
  refetches on expiry). 0 existing rows → clean cutover, zero blast radius.
- **Phase 3b — 📋 deferred v1.1 (MEDIUM):** make `pyraai-workspace` itself private
  (248 file-manager project/client docs auto-secured — the file manager already
  signs) + migrate display-asset stored URLs (avatars/branding/entity-logos: store
  path + sign-on-read, or a dedicated public assets bucket) + WhatsApp media
  long-TTL signed URL + **fix the `send-pdf` route targeting the non-existent
  `files` bucket** (likely already broken). Paths are unguessable nanoids, so the
  remaining exposure is MEDIUM, not enumerable.

**Invariant for all remaining phases:** any `REVOKE`/RLS change on `authenticated`
must be preceded by deploying the code that stops reading those tables as
`authenticated` — never revoke against live code that still depends on the grant.
