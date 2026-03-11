# Pyra Workspace - Development Guide

## Project Overview
Next.js workspace management app for a UAE-based AI solutions company (Pyramedia X).
Two interfaces: Admin Dashboard + Client Portal.

## Tech Stack
- **Framework**: Next.js (App Router)
- **Database & Auth**: Supabase
- **Styling**: Tailwind CSS + shadcn/ui
- **Animations**: framer-motion
- **Charts**: Recharts
- **Dark Mode**: next-themes
- **Icons**: lucide-react
- **PDF Generation**: jsPDF + Amiri font (Arabic support)
- **Payments**: Stripe

## Project Structure

### App Routes
```
app/
├── dashboard/          # Admin dashboard (protected)
│   ├── layout.tsx      # Dashboard layout with sidebar
│   └── [feature]/      # Feature pages (invoices, quotes, projects, etc.)
├── portal/             # Client portal (separate auth)
│   ├── (auth)/         # Portal login/auth pages
│   └── (main)/         # Portal main pages with layout
│       ├── layout.tsx  # Portal layout with sidebar
│       └── [feature]/  # Feature pages (files, projects, quotes, etc.)
└── api/                # API routes
    ├── dashboard/      # Admin API endpoints
    └── portal/         # Portal API endpoints
```

### Components Organization
```
components/
├── ui/                 # Shared UI primitives (shadcn/ui + custom)
│   ├── button.tsx, card.tsx, dialog.tsx, etc.
│   ├── empty-state.tsx # Custom unified empty state
│   └── page-guide.tsx  # Module guide popover (auto-detects from URL)
├── layout/             # Shared layout components
│   ├── sidebar.tsx     # Dashboard sidebar
│   ├── topbar.tsx      # Dashboard topbar (includes PageGuide)
│   ├── page-transition.tsx  # Shared page animation
│   └── ...
├── portal/             # Portal-specific components
│   ├── portal-sidebar.tsx
│   ├── portal-topbar.tsx
│   └── ...
├── dashboard/          # Dashboard-specific widgets
├── finance/            # Finance charts
├── files/              # File management components
├── projects/           # Project components
├── quotes/             # Quote builder + signature
├── clients/            # Client management
├── auth/               # Auth components
├── providers/          # Context providers
└── reports/            # Report components
```

### Libraries
```
lib/
├── api/          # API helpers (auth, response)
├── auth/         # Auth guards, permissions
├── config/       # Centralized configs (module-guide.ts, etc.)
├── supabase/     # Supabase client, server, middleware
├── pdf/          # PDF generators (Arabic support via Amiri font)
├── email/        # Mailer, notifications
├── utils/        # Utility functions (format, cn, currency, etc.)
├── automation/   # Workflow automation engine
├── portal/       # Portal auth, branding
├── finance/      # Finance alerts
└── webhooks/     # Webhook dispatcher
```

---

## MANDATORY: New Feature Checklist

> **CRITICAL RULE**: When adding ANY new dashboard page, feature, or module, you MUST complete ALL items in this checklist. No exceptions. This ensures consistency across the entire application.

### Checklist: Adding a New Dashboard Page/Module

Complete every step below. If a step is not applicable, explicitly note why.

#### 1. Module Guide (REQUIRED)
Every dashboard page MUST have a module guide entry:
- [ ] **Add guide to `lib/config/module-guide.ts`** in `MODULE_GUIDES` object:
  ```ts
  '/dashboard/new-page': {
    href: '/dashboard/new-page',
    description: 'وصف قصير بالعربية (سطر واحد)',
    descriptionEn: 'Short English description',
    goal: 'شرح الهدف من الصفحة (1-2 جملة)',
    tips: [
      'نصيحة 1',
      'نصيحة 2',
      'نصيحة 3',
    ],
    keywords: ['keyword1', 'keyword2', 'كلمة عربية'],
  },
  ```
- [ ] **Add href to SECTIONS in `app/dashboard/guide/page.tsx`** under the correct section's `hrefs` array
- The `PageGuide` tooltip in topbar works automatically via URL detection — no per-page code needed

#### 2. Sidebar Navigation (REQUIRED for navigable pages)
- [ ] **Add nav item to `components/layout/sidebar.tsx`** in the correct `navGroups` section:
  ```ts
  { href: '/dashboard/new-page', label: 'الاسم', labelEn: 'Name', icon: IconName, permission: 'module.view' },
  ```
- [ ] **Import the icon** from `lucide-react` at the top of sidebar.tsx

#### 3. Empty States (REQUIRED)
- [ ] **Use `EmptyState` component** from `@/components/ui/empty-state` for any "no data" states
- [ ] Never create inline empty states — always use the shared component

#### 4. UI/UX Standards (REQUIRED)
- [ ] **Arabic RTL**: All UI text in Arabic, use `ms-`/`me-`/`ps-`/`pe-` instead of `ml-`/`mr-`/`pl-`/`pr-`
- [ ] **Dark mode**: Test both light and dark themes — use CSS variables, not hardcoded colors
- [ ] **Orange brand color**: Primary actions use `orange-500`/`orange-600`
- [ ] **Loading skeletons**: Use `Skeleton` from `@/components/ui/skeleton` during data loading
- [ ] **Toast notifications**: Use `toast` from `sonner` for success/error messages
- [ ] **Shared components**: Use shadcn/ui components as base (Card, Button, Dialog, Badge, etc.)

#### 5. Portal Parity (CONDITIONAL)
- [ ] If the feature is client-facing, apply matching changes to `app/portal/` as well
- [ ] Use shared components from `components/ui/` for consistency

#### 6. API Endpoint (CONDITIONAL)
- [ ] Place in `/api/dashboard/[resource]/route.ts` for admin endpoints
- [ ] Place in `/api/portal/[resource]/route.ts` for client-facing endpoints
- [ ] Use `requireApiPermission()` or `requireApiAuth()` from `@/lib/api/auth`
- [ ] Use `apiSuccess()` and `apiError()` from `@/lib/api/response`
- [ ] Log activity via `logActivity()` for audit trail

#### 7. Database Changes (CONDITIONAL)
- [ ] Update `DATABASE-SCHEMA.md` with new tables/columns
- [ ] Include migration SQL in the schema doc
- [ ] Add RLS policies if applicable

#### 8. Pre-Commit Verification (REQUIRED)
- [ ] Run `npx tsc --noEmit` — zero TypeScript errors
- [ ] Run `npx next build` — build succeeds
- [ ] Commit per phase/feature with descriptive message

---

### Checklist: Modifying an Existing Feature

When enhancing or modifying any existing feature:
- [ ] Check if the feature exists in BOTH dashboard and portal — apply changes to both
- [ ] Check if the module guide tips need updating (`lib/config/module-guide.ts`)
- [ ] Test empty states still render correctly
- [ ] Test dark mode appearance
- [ ] Run TypeScript check + build

---

## Development Rules

### 1. UI/UX Consistency (MANDATORY)
All UI/UX improvements MUST be applied to BOTH:
- Admin Dashboard (`app/dashboard/`)
- Client Portal (`app/portal/`)

When adding any visual feature, component, or design improvement:
- Check all matching pages across the entire project
- Use shared components from `components/ui/` whenever possible
- Keep visual consistency between dashboard and portal

### 2. Component Placement
- **Shared by both dashboard & portal** → `components/ui/` or `components/layout/`
- **Dashboard-only** → `components/dashboard/` or feature folder
- **Portal-only** → `components/portal/`
- **Feature-specific** → `components/[feature]/`

### 3. Coding Conventions
- Language in code: English
- Language in UI: Arabic (RTL layout)
- Use `'use client'` directive for interactive components
- Use shadcn/ui components as base
- Use lucide-react for icons
- Use `cn()` from `@/lib/utils/cn` for class merging
- Use `formatDate()`, `formatCurrency()`, `formatRelativeDate()` from `@/lib/utils/format`
- Use `toast` from `sonner` for notifications
- Use `EmptyState` component for empty states (never inline)
- Use `PageTransition` wrapper in layouts for page animations

### 4. Styling
- Tailwind CSS with RTL support (use `ms-`, `me-`, `ps-`, `pe-` instead of `ml-`, `mr-`, `pl-`, `pr-`)
- Orange as primary brand color (`orange-500`, `orange-600`)
- Dark mode support via CSS variables (hsl format)
- Recharts dark mode handled via global CSS in `globals.css`

### 5. API Pattern
```
/api/portal/[resource]   → Portal endpoints (client-facing, scoped)
/api/dashboard/[resource] → Admin endpoints (full access)
```

### 6. File Naming
- Pages: `page.tsx` (Next.js convention)
- Client wrappers: `[feature]-client.tsx` (for server/client split)
- Components: PascalCase for components, kebab-case for utilities
- API routes: `route.ts`

---

## Key Systems Reference

### Module Guide System
The module guide provides contextual help on every dashboard page:
- **Config**: `lib/config/module-guide.ts` — all guide data (descriptions, goals, tips, keywords)
- **Component**: `components/ui/page-guide.tsx` — popover tooltip (auto-detects current page from URL)
- **Topbar integration**: `components/layout/topbar.tsx` — renders `<PageGuide />` globally
- **Guide directory**: `app/dashboard/guide/page.tsx` — full searchable guide page with sections
- **How it works**: PageGuide reads the URL pathname, looks up matching guide from `MODULE_GUIDES`, and shows the popover. No per-page integration needed — just add the config entry.

### Activity Logging
- API: `POST /api/activity` with `{ action, target_type, target_id, target_path, details }`
- Helper: `logActivity()` from `@/lib/utils/activity`
- Actions: upload, download, rename, move, delete, restore, copy, share, version, etc.

### Email Notifications
- Config: `lib/email/mailer.ts` — SMTP transport + HTML templates
- Notify helpers: `lib/email/notify.ts` — high-level notification functions
- Templates are Arabic RTL with orange branding

### RBAC Permissions
- Config: `lib/auth/rbac.ts` — `hasPermission()`, `requireApiPermission()`
- Roles defined in Supabase `pyra_roles` table
- Format: `module.action` (e.g., `files.view`, `invoices.create`)

---

## Common Patterns

### Empty States
```tsx
import { EmptyState } from '@/components/ui/empty-state';
<EmptyState
  icon={IconComponent}
  title="عنوان"
  description="وصف"
  actionLabel="زر (اختياري)"
  onAction={() => {}}
/>
```

### Page Transitions
Already configured in both dashboard and portal layouts via `PageTransition` wrapper.

### Dark Mode
- Theme provider in `components/providers/theme-provider.tsx`
- CSS variables in `globals.css`
- Recharts overrides in `globals.css` (global, covers both interfaces)

---

## HR & Employee System

### Overview
Full ERP-style HR system integrated into the dashboard with 14 modules:
- **Attendance**: Clock-in/out with geolocation + IP tracking
- **Leave Management**: Request/approve leave with balance tracking
- **Payroll**: Multi-period payroll with auto-calculation (basic + overtime + deductions)
- **Evaluations**: Performance reviews with criteria scoring
- **Timesheets**: Period-based time tracking with project linking
- **Directory**: Employee profiles + org chart visualization
- **Announcements**: Company-wide announcements with priority & targeting
- **Work Schedules**: Shift definitions and assignments
- **Overtime**: Overtime request and approval workflow
- **Employee Payments**: Advances, bonuses, deductions tracking
- **Content Pipeline**: Content production workflow management

### HR API Routes
```
/api/dashboard/attendance/          → Clock-in (POST)
/api/dashboard/attendance/clock-out → Clock-out (POST)
/api/dashboard/payroll/             → CRUD payroll periods
/api/dashboard/payroll/[id]/calculate → Auto-calculate payroll
/api/dashboard/evaluations/         → CRUD evaluations
/api/dashboard/evaluations/periods/ → Evaluation periods
/api/dashboard/evaluations/[id]/scores → Save evaluation scores
/api/dashboard/timesheet-periods/   → Timesheet period management
/api/dashboard/work-schedules/      → Work schedule definitions
/api/dashboard/employee-payments/   → Employee payment records
/api/leave/                         → Leave requests (shared)
/api/timesheet/                     → Timesheet entries (shared)
```

### HR Activity Logging
All HR write operations log to `pyra_activity_log` with action types:
`attendance_clock_in`, `attendance_clock_out`, `payroll_created`, `payroll_calculated`,
`payroll_status_changed`, `evaluation_created`, `evaluation_updated`, `evaluation_scores_saved`,
`evaluation_period_created`, `evaluation_period_updated`, `timesheet_period_created`,
`timesheet_period_updated`, `timesheet_entry_created`, `timesheet_entry_updated`,
`timesheet_entry_deleted`, `work_schedule_created`, `employee_payment_created`,
`employee_payment_updated`, `leave_request_created`, `leave_request_updated`

### HR RBAC Permissions
```
attendance.view / attendance.manage
leave.view / leave.manage
payroll.view / payroll.manage
evaluations.view / evaluations.manage
timesheet.view / timesheet.manage
overtime.view / overtime.manage
work_schedules.view / work_schedules.manage
leave_types.view / leave_types.manage
employee_payments.view / employee_payments.manage
content_pipeline.view / content_pipeline.manage
directory.view / directory.manage
announcements.view / announcements.manage
```

### Non-Atomic Operation Pattern
Supabase JS client doesn't support transactions. Use backup-rollback pattern:
```ts
// 1. Backup existing data
const { data: backup } = await supabase.from('table').select('*').eq('parent_id', id);
// 2. Delete old data
await supabase.from('table').delete().eq('parent_id', id);
// 3. Insert new data
const { error } = await supabase.from('table').insert(newRows);
// 4. Rollback on failure
if (error && backup?.length) {
  await supabase.from('table').insert(backup);
  return apiServerError(error.message);
}
```

### HR TypeScript Types
Defined in `types/database.ts`:
- `PyraLeaveRequest` — Leave request with status workflow
- `PyraTimesheet` — Timesheet entry with overtime support
- `PyraAnnouncement` — Announcements with priority & targeting
- `PyraLeaveBalance` — Annual leave balance tracking

---

## Portal Gaps (Pending Implementation)

> **Full details**: `docs/PORTAL-GAPS.md`

### Missing Portal Pages (Priority)
1. **Contracts** — `pyra_contracts` has `client_id` but no portal page (client can't view contracts)
2. **Client Statement** — Admin has `/finance/client-statement/[id]` but client has no payment history
3. **Recurring Invoices** — `pyra_recurring_invoices` has `client_id` but no portal view

### Missing Client Detail Tabs
Current: Overview, Projects, Invoices, Quotes, Notes, Activity, Branding (7 tabs)
Missing: Contracts, Payments, Files, Recurring Invoices, Scripts (5 tabs)

### Portal Enhancements
- Invoice detail: add payment history + remaining balance
- Project detail: add contract link if project has linked contract
- Portal dashboard: add financial summary card

---

## Documentation Index

| Document | Path | Description |
|----------|------|-------------|
| Architecture | `docs/ARCHITECTURE.md` | System architecture overview |
| Client Management | `docs/CLIENT-MANAGEMENT.md` | Client system documentation |
| Employee System | `docs/EMPLOYEE-SYSTEM.md` | HR system documentation |
| Employee PRD | `docs/PRD-EMPLOYEE-SYSTEM.md` | Employee system requirements |
| Employee Implementation | `docs/IMPLEMENTATION-EMPLOYEE-SYSTEM.md` | Implementation details |
| Portal Branding | `docs/PORTAL-BRANDING.md` | Portal branding system |
| Portal Gaps | `docs/PORTAL-GAPS.md` | Missing portal features & plan |
| Database Schema | `DATABASE-SCHEMA.md` | Full database schema (84 tables) |
| RBAC Migration | `database/rbac-migration.sql` | Role permissions SQL |

---

## Deployment
- Vercel (auto-deploy on push to main)
- Package manager: **pnpm** (NOT npm)
- Commit and push after completing features/fixes
