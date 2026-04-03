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

### Using Existing Hooks (41 hooks available)
```tsx
// Dashboard hooks (hooks/use*.ts)
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

### Adding a New Hook
1. Create `hooks/useNewResource.ts` following the pattern in `hooks/useClients.ts`
2. Use `fetchAPI` for queries, `mutateAPI` for mutations
3. Export typed hook with query params
4. Include cache invalidation on mutations

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
app/portal/               → Clients (Cookie Auth, separate from dashboard)
app/api/dashboard/        → Admin API endpoints
app/api/portal/           → Client API endpoints (scoped to client data)
app/api/external/         → External API (n8n, Telegram Bot — API key auth)
app/api/boards/           → Board CRUD, columns, tasks, labels, members, star
app/api/tasks/            → Task CRUD, move, duplicate
app/api/finance/contracts → Contract management + invoice generation
hooks/                    → 41 React Query hooks (data fetching + mutations)
hooks/api-helpers.ts      → fetchAPI() + mutateAPI() — shared fetch wrappers
components/ui/            → Shared primitives (both dashboard + portal)
components/layout/        → Dashboard layout (sidebar, topbar)
components/portal/        → Portal layout
components/boards/        → Board components (toolbar, task-sheet, calendar, list, settings)
components/sales/chat/    → WhatsApp chat (conversation list, chat window, contact sidebar)
components/files/         → Unified file-preview (shared between dashboard + portal)
lib/auth/rbac.ts          → 79+ permissions across 34+ modules
lib/auth/scope.ts         → Dynamic scoping (team → project → board → member chain)
lib/evolution/client.ts   → Evolution API v2 client (WhatsApp)
lib/config/module-guide.ts → Guide data for every page
types/database.ts         → All TypeScript types
```

### Page Structure Pattern
```
app/dashboard/[module]/page.tsx            → Server component (layout, metadata)
app/dashboard/[module]/[module]-client.tsx → Client component ('use client', hooks, UI)
```
Large pages are split into focused sub-components to keep files <300 lines.

### Default Roles & What They See
| Role | Sidebar Groups | Key Pages |
|------|---------------|-----------|
| `admin` | ALL (9 groups) | Everything — full control |
| `employee` | عام + موارد بشرية | my-tasks, timesheet, attendance, leave, my-payslips, directory, announcements, profile |
| `sales_agent` | عام + مبيعات + أعمال (partial) | sales/*, leads, WhatsApp chat, quotes (view+create), clients.view, follow-ups |

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
Board → Columns → Tasks → Assignees + Labels + Checklist + Comments
     → Calendar View + List View + Pipeline View
     → Board Members (per-board access) → Scope System
WhatsApp → Conversations → Messages → Lead matching
        → Agent Scoping → Assignments → Contact Sidebar
        → Quick Actions (send quote/invoice, create lead, notes, follow-ups)
Contract (retainer) → Generate Invoice → Billing History
Contract (milestone) → Complete Milestone → Generate Invoice
```

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
- API response → `apiSuccess()`/`apiError()` from `@/lib/api/response` + `logActivity()` for writes
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
- [ ] **Activity logging** → `logActivity()` for all write operations
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

## Documentation (Read don't guess)
| Doc | What it covers |
|-----|---------------|
| `docs/SYSTEM-STRUCTURE.md` | Complete 94-page reference with all tables and integrations |
| `docs/FEATURE-IMPACT-MAP.md` | What connects to what — READ BEFORE any new feature |
| `docs/EMPLOYEE-SYSTEM.md` | HR modules (14 modules, attendance→payroll chain) |
| `docs/ARCHITECTURE.md` | System architecture, backup-rollback pattern |
| `docs/CLIENT-MANAGEMENT.md` | Client system, portal branding |
| `DATABASE-SCHEMA.md` | Full schema (~110 tables) |
