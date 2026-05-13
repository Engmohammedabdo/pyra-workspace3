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

## Documentation (Read don't guess)
| Doc | What it covers |
|-----|---------------|
| `docs/SYSTEM-STRUCTURE.md` | Complete 94-page reference with all tables and integrations |
| `docs/FEATURE-IMPACT-MAP.md` | What connects to what — READ BEFORE any new feature |
| `docs/EMPLOYEE-SYSTEM.md` | HR modules (14 modules, attendance→payroll chain) |
| `docs/ARCHITECTURE.md` | System architecture, backup-rollback pattern |
| `docs/CLIENT-MANAGEMENT.md` | Client system, portal branding |
| `DATABASE-SCHEMA.md` | Full schema (~110 tables) |
