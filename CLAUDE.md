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
hooks/                    → 42+ React Query hooks (data fetching + mutations)
hooks/api-helpers.ts      → fetchAPI() + mutateAPI() — shared fetch wrappers
hooks/useMyWork.ts        → Inbox aggregator hook (30s staleTime, refetch on focus)
components/ui/            → Shared primitives (both dashboard + portal)
components/layout/        → Dashboard layout (sidebar, topbar)
components/portal/        → Portal layout
components/boards/        → Board components (toolbar, task-sheet, calendar, list, settings)
components/sales/chat/    → WhatsApp chat (conversation list, chat window, contact sidebar)
components/files/         → Unified file-preview (shared between dashboard + portal)
components/dashboard/MyWorkInbox.tsx → 5-section inbox card
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

## Documentation (Read don't guess)
| Doc | What it covers |
|-----|---------------|
| `docs/SYSTEM-STRUCTURE.md` | Complete 94-page reference with all tables and integrations |
| `docs/FEATURE-IMPACT-MAP.md` | What connects to what — READ BEFORE any new feature |
| `docs/EMPLOYEE-SYSTEM.md` | HR modules (14 modules, attendance→payroll chain) |
| `docs/ARCHITECTURE.md` | System architecture, backup-rollback pattern |
| `docs/CLIENT-MANAGEMENT.md` | Client system, portal branding |
| `DATABASE-SCHEMA.md` | Full schema (~110 tables) |
