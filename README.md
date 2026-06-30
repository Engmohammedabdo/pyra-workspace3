# Pyra Workspace 3.0

**Pyramedia X — Enterprise Digital Workspace** — A full-stack ERP platform covering file management, client portal, project tracking, CRM, invoicing, HR, payroll, finance reporting, and team collaboration — with white-label portal branding.

Built with **Next.js 15** (App Router) + **TypeScript** + **Supabase** (self-hosted) + **shadcn/ui**.

> Migrated from PHP 8 / vanilla JS to a modern full-stack TypeScript architecture.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL via Supabase (self-hosted) |
| Storage | Supabase Storage (S3-compatible) |
| Auth | Supabase Auth (admin) + cookie-based sessions (portal) |
| UI | shadcn/ui + Radix UI + Tailwind CSS 3.4 |
| State | TanStack React Query v5 |
| Realtime | Supabase Realtime (WebSocket) + polling fallback |
| Charts | Recharts |
| Animations | framer-motion |
| PDF | jsPDF + Amiri font (Arabic RTL support) |
| Payments | Stripe (checkout + webhooks) |
| Email | Nodemailer SMTP (Arabic HTML templates) |
| Kanban | @dnd-kit (drag-and-drop) |
| Package Manager | pnpm |
| WhatsApp | Evolution API v2 (multi-instance per agent) |
| Deployment | Coolify (Docker) — auto-deploy on push to main |

---

## System Overview

```
                    ┌──────────────────────────────────┐
                    │        Coolify (Docker)          │
                    │  ┌────────────┐  ┌────────────┐  │
                    │  │  Dashboard  │  │   Portal   │  │
                    │  │  98+ pages  │  │  22 pages  │  │
                    │  └──────┬──────┘  └─────┬──────┘  │
                    │         └───────┬───────┘         │
                    │        320+ API Routes            │
                    └─────────────┬──────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                     │
     ┌────────▼────────┐  ┌──────▼──────┐  ┌──────────▼──────────┐
     │   Supabase DB   │  │   Storage   │  │   External APIs     │
     │  110+ tables    │  │  S3-compat  │  │  Stripe · SMTP ·    │
     │  RLS enabled    │  │             │  │  Evolution API ·     │
     └─────────────────┘  └─────────────┘  │  n8n · Telegram Bot  │
                                           └─────────────────────┘
```

---

## Features

### 1. Admin Dashboard (`/dashboard`) — 95+ pages

#### My Work Inbox (Home Page)
- **Unified inbox** — On login, employees land on a single "My Work" surface that aggregates everything waiting on them, replacing the old generic stat-card dashboard
- **Five sections** (each renders only when non-empty):
  - **مهامي** — overdue / today / this-week tasks across all boards
  - **مستني موافقتك** — leave + expense + timesheet from direct reports (manager view)
  - **محادثات جديدة** — WhatsApp conversations assigned to me with unread
  - **عملائي** — leads assigned to me sorted by oldest contact
  - **متابعات اليوم** — sales follow-ups due in next 24h
- **Single API call** (`/api/my-work`) returns all sections in one round trip
- **Deep links** — every row routes to the source entity (task in board, lead detail, conversation thread)
- **Admin coexistence** — analytics dashboard (KpiGrid, charts) still renders below the inbox; inbox is purely additive

#### Manager Approvals (`/dashboard/approvals`)
- **Three tabs** — leave / expense / timesheet pending requests from direct reports
- **Inline actions** — approve / reject buttons with required-note dialog on rejection
- **Admin override** — admins see all pending requests across the org; managers see only their direct reports (`pyra_users.manager_username` chain)
- **Sidebar badge** — `team_approvals` counter shows total pending across all 3 types

#### File Management
- **File Explorer** — Grid/list views, upload, drag-drop, preview panel, sort/filter, bulk operations, keyboard shortcuts, context menu
- **Favorites** — Bookmark files and folders
- **File Versions** — Version history with rollback
- **File Reviews** — Review comments grouped by path
- **Share Links** — Public share links with expiry, password protection, access limits
- **Trash** — Soft delete with 30-day auto-purge, restore capability

#### Client Management (CRM)
- **Client Profiles** — Full detail pages with tabs (overview, projects, invoices, quotes, notes, activity, branding)
- **Client Notes** — Pin-able relationship notes (meetings, decisions, follow-ups)
- **Client Tags** — Classification tags with color coding (VIP, Priority, etc.)
- **Activity Tracking** — Complete client interaction history
- **CSV/PDF Export** — Client data export

#### Project Management
- **Projects** — CRUD with client and team scoping, file assignment, approval workflow
- **Project Budget** — Budget amount and budgeted hours tracking with utilization metrics
- **Org Chart** — Organizational hierarchy visualization

#### Sales & CRM
- **Sales Dashboard** — KPIs, WhatsApp analytics, pipeline overview
- **Sales Pipeline** — Kanban-style lead management with custom stages
- **Leads** — Lead tracking with scoring, source attribution, conversion, WhatsApp tab
- **Follow-ups** — Scheduled follow-up reminders with assignment
- **WhatsApp Integration** — Full WhatsApp Web replacement:
  - Multi-instance management (one per agent via Evolution API v2)
  - Real-time chat inbox with 650+ conversation sync
  - Voice recording, drag-drop file upload, clipboard paste
  - Contact sidebar with lead/client linking
  - Agent scoping (non-admins see only their assigned conversations)
  - Auto-assignment of new conversations to instance owner
  - Quick actions bar: send quotes, create leads, schedule follow-ups from chat
  - @lid format support for new WhatsApp Linked IDs
- **Sales Reports** — Pipeline analytics and conversion tracking
- **Quote Approvals** — Internal approval workflow for quotes

#### Invoicing & Billing
- **Business Entities** — Multi-license support (select trade license per invoice/quote). Entity name, logo, and license number appear in PDF documents automatically
- **Invoices** — Full invoice builder, auto-numbering, status flow (draft → sent → paid → overdue), PDF generation, display client name override (trade license name), entity selection
- **Payments** — Manual recording + Stripe checkout integration with webhook handling
- **Recurring Invoices** — Auto-generation of recurring invoices from contracts
- **Credit Notes** — Credit note issuance with line items, applies as negative payment (reduces revenue), works on fully paid invoices (refund scenario), updates contract totals
- **Stripe Integration** — Payment links, checkout sessions, webhook processing (payment, refund, dispute)
- **Dunning** — Automated overdue payment reminders
- **Auto-Overdue** — Invoices past due date auto-marked as overdue on dashboard load

#### Quotations
- **Quote Builder** — Full quote builder with auto-numbering (QT-XXXX), VAT calculation, entity selection, manual client info (no dropdown required)
- **PDF Generation** — Arabic RTL PDF with entity-specific logo and company name
- **Electronic Signatures** — Canvas-based digital signatures with IP logging
- **Email Sending** — Direct quote email to clients

#### Finance Module
- **Expenses** — Expense tracking with categories, VAT, receipts, approval workflow
- **Expense Categories** — Custom categories with Arabic names, icons, and colors
- **Subscriptions** — Recurring subscription management with approval/rejection workflow (editable amount on approval, rejection with reason, auto-expense creation)
- **Contracts** — Contract management with milestones + retainer billing, manual invoice generation from contract, auto-billed amounts tracking
- **Purchase Orders** — PO creation, approval, and auto-expense on receipt
- **Suppliers** — Vendor management with bank details and payment terms
- **Payment Cards** — Company card management
- **Revenue Targets** — Monthly/quarterly/yearly revenue goals
- **Finance Alerts** — Smart alerts for overdue invoices, budget overruns, expiring subscriptions

#### Finance Reports (Cash-Basis Accounting)
- **P&L (Profit & Loss)** — Monthly/quarterly with expense breakdown (salaries, operational, subscriptions). Revenue by actual payment date, not invoice issue date
- **VAT Report** — Collected vs paid VAT with monthly breakdown. VAT collected calculated from actual payments
- **Client Profitability** — Revenue (from payments), expenses, and margin per client
- **Project Profitability** — Revenue (from payments) vs costs (direct expenses + labor) per project with budget utilization
- **Client Statement** — Per-client account statement with aging
- **Cashflow** — Cash in/out analysis with refund tracking
- **Aging Report** — Invoice aging by days past due date (standard accounting)
- **Revenue Reports** — Revenue analytics with charts

#### HR & Payroll
- **Attendance** — Clock-in/out with geolocation + IP tracking
- **Leave Management** — Request/approve leave with balance tracking, custom leave types (paid/unpaid)
- **Payroll** — Multi-period payroll with auto-calculation:
  - Base salary + task payments + overtime + bonuses + commissions
  - Auto-deduction for unpaid leave (daily rate = salary ÷ 22 working days)
  - Auto-creation of expense records on payroll approval
  - Commission payments from invoice payments (manual + Stripe)
  - Payment creation dialog — register commissions, task payments, bonuses directly
  - Support for 4 employee types: monthly salary, hourly, per-task, commission
- **Salary History** — Automatic tracking of salary/hourly rate changes
- **Evaluations** — Performance reviews with criteria scoring and bonus recommendations
- **Timesheets** — Period-based time tracking with project linking, billable hours support
- **Employee Payments** — Advances, bonuses, deductions, commission tracking with "أتعاب مستقلين" expense category
- **Work Schedules** — Shift definitions and assignments
- **Overtime** — Overtime request and approval workflow
- **Directory** — Employee profiles + org chart visualization
- **Announcements** — Company-wide announcements with priority and targeting
- **My Payments (كشف حسابي)** — Unified self-service page showing payroll items + all employee payments (commissions, tasks, bonuses) — works for ALL employee types including freelancers

#### Unified Task Pipeline
- **Kanban Boards** — Full kanban with drag-and-drop, labels, checklists, comments, attachments
- **4 View Modes** — Kanban (default) | List (sortable table) | Calendar (monthly grid) | Pipeline (sequential stages)
- **Board Templates** — 6 built-in templates + custom admin-configurable templates
- **Board Settings** — Admin panel for configuring view mode, pipeline toggle, auto-advance, column settings
- **Board Members** — Per-board access control (viewer/editor/admin roles), integrated into scope system
- **Board Starring** — Favorite boards, starred boards sorted first
- **Task Numbering** — Auto-increment `#N` per board, shown on cards and task sheet
- **Task Duplication** — Copy task with all relations (labels, checklist, assignees)
- **Cross-Board Move/Copy** — Move tasks between boards with label cleanup
- **Due Date Badges** — Color-coded: green (>3d), yellow (1-3d), orange (today), red (overdue)
- **Task Sorting** — Sort within columns by newest/oldest/priority/due date/title
- **Markdown Description** — Bold, italic, lists, links with live preview
- **Trello-Style Task Sheet** — Full-featured card modal with sidebar actions, comments, attachments, activity log
- **Stage Gates** — Configurable approval gates on columns (requires_approval, approval_role)
- **Task Advance API** — Sequential stage advancement with completion percentage tracking
- **Approve/Reject Flow** — Admin approves or rejects task advancement with notes and notifications
- **Task File System** — File attachments per task with review/approve/reject workflow
- **Stage History** — Full audit trail of task stage transitions with timing data
- **Task Types** — Configurable task types per board (design, script, edit, etc.)
- **Auto-advance** — Automatic task movement to next stage on completion
- **Default Assignees** — Auto-assign users when tasks enter specific stages
- **My Tasks** — Enhanced personal dashboard with pipeline progress bars, completion %, stage context
- **Scope-Protected APIs** — All task GET/PATCH/DELETE endpoints enforce board-access scope check
- **Content Pipeline** — Legacy content production workflow (being replaced by unified pipeline)

#### Knowledge Base
- **Articles** — Searchable knowledge base with categories
- **Help Center** — Client-facing help articles

#### System Administration
- **User Management** — CRUD with role-based access, user detail page with financial statement, projects, and employment info tabs
- **Roles & Permissions** — RBAC with `module.action` format (79+ permissions across 34+ modules)
- **Teams** — Team management with member add/remove
- **Settings** — Company info, quotes, bank details, storage, commission rates, board settings
- **Integrations** — Automation rules, webhooks, API keys
- **Activity Log** — Filterable audit trail (40+ action types)
- **Login History** — Security monitoring
- **Sessions** — Active session management
- **Module Guide** — Contextual help on every page with searchable guide directory
- **Command Palette** — Ctrl+K global search across all pages

#### External API (n8n / Telegram Bot)
- **Expense Recording** — Register expenses via Telegram bot through n8n
- **Subscription Management** — Manage subscriptions via external API
- **Supplier Auto-Matching** — Auto-match vendor name to existing suppliers

---

### 2. Client Portal (`/portal`) — 21 pages

- **Dashboard** — Welcome card, stats overview, recent activity, quick actions
- **Projects** — Project list with status tabs, detail view with files + comments + pipeline progress tab
- **Files** — All files across projects with preview, approve/request-revision workflow
- **Quotes** — View quotes, electronic signature via canvas
- **Invoices** — Invoice list, detail view, Stripe payment integration
- **Contracts** — Contract list and details
- **Recurring Invoices** — View recurring invoice schedules
- **Account Statement** — Full payment history and balance
- **Scripts** — Script viewing and commenting
- **Help Center** — Searchable help articles
- **Notifications** — Push notifications with read/unread filters
- **Profile** — Personal info editor, password change
- **Dynamic Branding** — Per-client white-label theming (colors, logo, favicon)

---

### 3. Security

- **CSRF Protection** — Origin header validation
- **Rate Limiting** — On sensitive endpoints (login, password reset)
- **Path Traversal Prevention** — Sanitized file paths
- **LIKE Wildcard Escaping** — SQL injection prevention
- **File Type Whitelist** — MIME + extension validation
- **HSTS + Security Headers** — Strict transport security
- **IDOR Protection** — Portal routes scoped to authenticated client
- **Error Boundaries** — Arabic UI error pages
- **RBAC Permission System** — 79 granular permissions across 34 modules
- **Session Management** — Cookie-based with SHA-256 hashed tokens
- **Two-layer Authorization** — On every approval mutation: (1) permission gate (`leave.approve`), (2) scope gate (`canApproveFor()` — admin OR direct manager). Permission alone is never sufficient.
- **Centralized Permission Builder** — `buildUserPermissions()` is the single source of truth used by API auth, page guards, and login. It always merges `BASE_EMPLOYEE ∪ DB role permissions ∪ extra_permissions` so a custom DB role can never silently strip HR self-service from an employee.
- **WhatsApp Message Scope Guard** — `canAccessWhatsAppMessage()` checks that the caller owns the conversation a message belongs to. Required on every message-level mutation (forward, react, save-to-files, media proxy).
- **Permission Naming Convention** — `*.view` (own), `*.create` (own), `*.approve` (others' — manager action), `*.manage` (admin-only). `*.manage` is NEVER in `BASE_EMPLOYEE`.

---

## Currency & Exchange Rates

The system operates primarily in AED (UAE Dirham) with fixed exchange rates:

| Currency | Rate to AED | Source |
|----------|-------------|--------|
| AED | 1.00 | — |
| USD | 3.76 | UAE Central Bank peg (fixed) |
| EUR | 4.12 | Approximate |
| SAR | 1.0027 | Near-fixed (SAR pegged to USD) |
| GBP | 4.75 | Approximate |

All financial reports aggregate amounts in AED using these rates.

---

## HR-Finance Integration

The system unifies HR and Finance with these key integrations:

| Integration | Description |
|-------------|-------------|
| **Payroll → Expenses** | When payroll is approved, expense records are auto-created per employee (category: Salaries) |
| **Unpaid Leave → Deductions** | Unpaid leave auto-deducted from payroll (daily rate = salary ÷ 22 working days) |
| **Commissions** | Auto-calculated on invoice payments (manual + Stripe) based on employee commission rates |
| **PO → Expenses** | Purchase orders auto-create expenses when status changes to "received" |
| **Subscriptions → Expenses** | Approval-based renewal with editable amount, auto-expense on approve, cancel on reject |
| **Credit Notes → Payments** | Credit note creates negative payment record, recalculates invoice amounts and contract totals |
| **Invoice → Project** | Direct `project_id` linking for accurate project profitability |
| **Contract → Billing** | Auto-update `amount_billed` when invoices are created against contracts |
| **Evaluation → Bonus** | Performance rating-based bonus recommendations (≥4.5 → 15%, ≥4.0 → 10%) |
| **Salary History** | Automatic tracking when salary or hourly rate changes |
| **P&L Breakdown** | Expense breakdown by category: salaries, operational, subscriptions |

---

## Database

110+ PostgreSQL tables with `pyra_` prefix in the public schema.

### Key Table Groups

| Group | Tables | Description |
|-------|--------|-------------|
| Core | `pyra_users`, `pyra_sessions`, `pyra_auth_mapping`, `pyra_roles`, `pyra_settings` | Users, auth, roles, config |
| Clients | `pyra_clients`, `pyra_client_notes`, `pyra_client_tags`, `pyra_client_branding` | CRM and portal |
| Files | `pyra_file_index`, `pyra_file_versions`, `pyra_project_files`, `pyra_favorites`, `pyra_trash` | File management |
| Projects | `pyra_projects`, `pyra_teams`, `pyra_team_members` | Project and team management |
| Tasks | `pyra_boards`, `pyra_board_columns`, `pyra_tasks`, `pyra_task_assignees`, `pyra_task_labels`, `pyra_task_checklist`, `pyra_task_comments`, `pyra_task_attachments`, `pyra_task_activity`, `pyra_task_stage_history`, `pyra_board_task_types`, `pyra_board_templates`, `pyra_board_stars`, `pyra_board_members` | Unified Task Pipeline |
| Finance | `pyra_invoices`, `pyra_invoice_items`, `pyra_payments`, `pyra_expenses`, `pyra_expense_categories`, `pyra_subscriptions`, `pyra_contracts`, `pyra_contract_milestones`, `pyra_cards`, `pyra_recurring_invoices`, `pyra_revenue_targets`, `pyra_stripe_payments`, `pyra_business_entities` | Billing, finance, and multi-license |
| Procurement | `pyra_suppliers`, `pyra_purchase_orders`, `pyra_purchase_order_items`, `pyra_credit_notes`, `pyra_credit_note_items` | Vendors and purchase orders |
| Quotes | `pyra_quotes`, `pyra_quote_items` | Quotations |
| HR | `pyra_attendance`, `pyra_leave_requests`, `pyra_leave_types`, `pyra_leave_balances_v2`, `pyra_work_schedules`, `pyra_timesheets`, `pyra_timesheet_periods` | Attendance and leave |
| Payroll | `pyra_payroll_runs`, `pyra_payroll_items`, `pyra_employee_payments`, `pyra_salary_history` | Payroll and compensation |
| Evaluations | `pyra_evaluation_periods`, `pyra_evaluation_criteria`, `pyra_evaluations`, `pyra_evaluation_scores`, `pyra_kpi_targets` | Performance management |
| Sales CRM | `pyra_sales_leads`, `pyra_sales_labels`, `pyra_pipeline_stages`, `pyra_sales_follow_ups`, `pyra_lead_activities`, `pyra_whatsapp_instances`, `pyra_whatsapp_messages`, `pyra_whatsapp_conversations`, `pyra_whatsapp_assignments` | Sales pipeline + WhatsApp |
| Automation | `pyra_automation_rules`, `pyra_automation_log`, `pyra_webhooks`, `pyra_webhook_deliveries`, `pyra_api_keys` | Workflows and integrations |
| Content | `pyra_content_pipeline`, `pyra_pipeline_stages`, `pyra_kb_articles`, `pyra_kb_categories`, `pyra_script_reviews` | Content and knowledge |
| System | `pyra_activity_log`, `pyra_notifications`, `pyra_client_notifications`, `pyra_login_attempts`, `pyra_announcements` | Audit and notifications. `pyra_notifications` carries `target_path` (deep link), `entity_type` + `entity_id` (for grouping), and `recipient_username` (NOT `username`). All inserts go through `lib/notifications/notify.ts` to enforce shape. |

Full schema documentation: [`DATABASE-SCHEMA.md`](./DATABASE-SCHEMA.md)

---

## Project Structure

```
app/
  api/                        # 290+ API route handlers
    dashboard/                # Admin APIs (payroll, evaluations, attendance, sales, etc.)
    portal/                   # Client portal APIs (auth, files, invoices, etc.)
    finance/                  # Finance APIs (expenses, reports, subscriptions, contracts)
    invoices/                 # Invoice CRUD, payments
    quotes/                   # Quote CRUD, duplicate, send
    files/                    # File CRUD, search, folders, batch delete
    clients/                  # Client CRUD, notes, tags, branding, activity
    users/                    # User CRUD, password management
    projects/                 # Project CRUD, file assignment
    external/                 # External API (n8n, Telegram bot)
    stripe/                   # Stripe webhooks
    ...                       # 30+ more route groups
  dashboard/                  # Admin pages (94 pages)
    finance/                  # 20+ finance pages (expenses, invoices, reports, etc.)
    sales/                    # 10+ sales CRM pages
    ...                       # HR, projects, files, settings, etc.
  portal/                     # Client portal pages (21 pages)
    (auth)/                   # Login, forgot/reset password
    (main)/                   # Dashboard, projects, invoices, quotes, etc.
  share/                      # Public share download page

components/
  ui/                         # shadcn/ui components (30+) + custom (empty-state, page-guide)
  layout/                     # Sidebar, topbar, breadcrumb, page-transition
  portal/                     # Portal sidebar, topbar, mobile nav, branding
  clients/                    # Client notes, branding editor
  files/                      # File explorer, grid, list, preview, context menu, drop zone
  sales/                      # WhatsApp chat, conversation list, message bubble, contact sidebar, assign dialog
  quotes/                     # QuoteBuilder, SignaturePad
  finance/                    # Finance charts, revenue reports
  projects/                   # Project components
  dashboard/                  # Dashboard widgets
  reports/                    # Report components, ExportButton
  auth/                       # Auth components
  providers/                  # Context providers (theme, auth)

hooks/                        # React hooks (files, notifications, realtime, debounce, permissions)

lib/
  api/                        # Auth helpers, response helpers
  auth/                       # Guards, RBAC, middleware utilities
  config/                     # Module guide config
  portal/                     # Portal session management, branding types
  supabase/                   # Supabase client factories (server, client, middleware, service role)
  utils/                      # Path sanitization, rate limiting, ID generation, formatting, currency
  pdf/                        # PDF generators (Arabic support via Amiri font)
  email/                      # SMTP mailer, notification templates
  finance/                    # Finance alerts engine
  automation/                 # Workflow automation
  webhooks/                   # Webhook dispatcher
  evolution/                  # Evolution API v2 client (WhatsApp)

types/
  database.ts                 # TypeScript interfaces for all database tables

docs/                         # Technical documentation
```

---

## API Overview

| Group | Routes | Description |
|-------|--------|-------------|
| `/api/dashboard/*` | 91 | Admin dashboard endpoints (payroll, evaluations, attendance, sales, purchases, etc.) |
| `/api/portal/*` | 47 | Client portal endpoints (auth, files, invoices, contracts, statement) |
| `/api/finance/*` | 28 | Finance (expenses, reports, subscriptions, contracts, suppliers) |
| `/api/files/*` | 19 | File CRUD, search, folders, batch operations |
| `/api/clients/*` | 13 | Client CRUD, notes, tags, branding, activity |
| `/api/invoices/*` | 7 | Invoice CRUD, payments, send |
| `/api/external/*` | 7 | External API for n8n/Telegram bot (expenses, subscriptions) |
| `/api/reports/*` | 7 | Revenue, client, project, team, storage reports |
| `/api/webhooks/*` | 7 | Webhook management and deliveries |
| `/api/projects/*` | 5 | Project CRUD, file assignment |
| `/api/auth/*` | 5 | Login, logout, session management |
| `/api/automations/*` | 5 | Automation rules, execution, triggers |
| `/api/quotes/*` | 4 | Quote CRUD, duplicate, send |
| `/api/users/*` | 4 | User CRUD, password change |
| `/api/leave/*` | 4 | Leave requests and approvals |
| `/api/kb/*` | 4 | Knowledge base articles and categories |
| `/api/shares/*` | 4 | Share links, public download |
| `/api/boards/*` | 18 | Unified Task Pipeline (boards, tasks, advance, approve, attachments, templates, members, star) |
| `/api/tasks/*` | 6 | Task CRUD, move, duplicate (scope-protected) |
| `/api/teams/*` | 3 | Team CRUD, member management |
| `/api/notifications/*` | 3 | List, mark read, mark all (cross-user POST is admin-only) |
| `/api/my-work` | 1 | Unified employee inbox aggregator (tasks + approvals + conversations + leads + follow-ups) |
| `/api/approvals/*` | 1 | Manager approvals dashboard data (`/team` — direct-report scope, admin sees all) |
| `/api/settings/*` | 4 | Config get/update, business entities management |
| `/api/stripe/*` | 2 | Stripe checkout, webhooks |
| `/api/timesheet/*` | 2 | Timesheet CRUD |
| `/api/roles/*` | 2 | Role management |
| `/api/dashboard/sales/*` | 15 | WhatsApp chat, instances, assignments, sync, webhook |
| **Total** | **320+** | |

---

## Documentation

| Document | Path | Description |
|----------|------|-------------|
| Architecture | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System architecture, component structure, API patterns |
| Database Schema | [`DATABASE-SCHEMA.md`](./DATABASE-SCHEMA.md) | Full database schema (100 tables) |
| Development Guide | [`CLAUDE.md`](./CLAUDE.md) | Coding conventions, mandatory checklists, Orchestra development process |
| Feature Impact Map | [`docs/FEATURE-IMPACT-MAP.md`](./docs/FEATURE-IMPACT-MAP.md) | Feature connections and 4-audience impact analysis |
| System Structure | [`docs/SYSTEM-STRUCTURE.md`](./docs/SYSTEM-STRUCTURE.md) | Complete system reference (all pages, tables, integrations) |
| Employee System | [`docs/EMPLOYEE-SYSTEM.md`](./docs/EMPLOYEE-SYSTEM.md) | HR system documentation (14 modules) |
| Employee PRD | [`docs/PRD-EMPLOYEE-SYSTEM.md`](./docs/PRD-EMPLOYEE-SYSTEM.md) | Employee system requirements |
| Employee Implementation | [`docs/IMPLEMENTATION-EMPLOYEE-SYSTEM.md`](./docs/IMPLEMENTATION-EMPLOYEE-SYSTEM.md) | Implementation details |
| Client Management | [`docs/CLIENT-MANAGEMENT.md`](./docs/CLIENT-MANAGEMENT.md) | Client CRM system (notes, tags, activity, branding) |
| Portal Branding | [`docs/PORTAL-BRANDING.md`](./docs/PORTAL-BRANDING.md) | Dynamic portal branding system |
| Portal Gaps | [`docs/PORTAL-GAPS.md`](./docs/PORTAL-GAPS.md) | Portal features roadmap |
| External API | [`docs/n8n-api-examples.json`](./docs/n8n-api-examples.json) | n8n/Telegram bot API examples |

---

## RBAC Permissions

The system uses granular `module.action` permissions, built by the central
`buildUserPermissions()` helper in `lib/auth/rbac.ts`:

```
final = BASE_EMPLOYEE ∪ (DB role.permissions ?? legacy mapping) ∪ extra_permissions
```

**Action naming convention:**
- `*.view` — read OWN data (self-service)
- `*.create` — create OWN records (e.g. submit leave, log timesheet)
- `*.approve` — approve OTHERS' records (manager / HR action — gated by `canApproveFor()` for per-employee scope)
- `*.manage` — admin-level CRUD on ANY record (NEVER in `BASE_EMPLOYEE`)

`BASE_EMPLOYEE` (every internal user inherits these — HR self-service only):
`dashboard.view`, `notifications.view`, `directory.view`, `announcements.view`,
`timesheet.view`, `timesheet.create`, `leave.view`, `leave.create`,
`attendance.view`, `attendance.create`, `payroll.view`, `evaluations.view`,
`overtime.view`.



| Module | Permissions |
|--------|------------|
| Files | `files.view`, `files.upload`, `files.delete`, `files.manage` |
| Projects | `projects.view`, `projects.create`, `projects.manage` |
| Clients | `clients.view`, `clients.create`, `clients.manage` |
| Invoices | `invoices.view`, `invoices.create`, `invoices.manage` |
| Quotes | `quotes.view`, `quotes.create`, `quotes.manage` |
| Finance | `finance.view`, `finance.manage` |
| Payroll | `payroll.view`, `payroll.manage` |
| Attendance | `attendance.view`, `attendance.manage` |
| Leave | `leave.view`, `leave.manage` |
| Evaluations | `evaluations.view`, `evaluations.manage` |
| Timesheet | `timesheet.view`, `timesheet.manage` |
| Overtime | `overtime.view`, `overtime.manage` |
| Work Schedules | `work_schedules.view`, `work_schedules.manage` |
| Boards | `boards.view`, `boards.manage` |
| Tasks | `tasks.view`, `tasks.create`, `tasks.manage` |
| Content Pipeline | `content_pipeline.view`, `content_pipeline.manage` |
| Sales WhatsApp | `sales_whatsapp.view`, `sales_whatsapp.send` |
| Sales Pipeline | `sales_pipeline.view`, `sales_pipeline.manage` |
| Directory | `directory.view`, `directory.manage` |
| Announcements | `announcements.view`, `announcements.manage` |
| Leave Types | `leave_types.view`, `leave_types.manage` |
| Users | `users.view`, `users.create`, `users.manage` |
| Roles | `roles.view`, `roles.manage` |
| Settings | `settings.view`, `settings.manage` |
| Reports | `reports.view` |

---

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm
- Supabase instance (self-hosted or cloud)

### Installation

```bash
# Clone the repository
git clone https://github.com/Engmohammedabdo/pyra-workspace3.git
cd pyra-workspace3

# Install dependencies
pnpm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase URL, keys, and other config
```

### Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
NEXT_PUBLIC_STORAGE_BUCKET=pyraai-workspace

# Stripe
STRIPE_SECRET_KEY=<your-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<your-webhook-secret>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<your-publishable-key>

# Email (SMTP)
SMTP_HOST=<your-smtp-host>
SMTP_PORT=587
SMTP_USER=<your-smtp-user>
SMTP_PASS=<your-smtp-password>
SMTP_FROM=noreply@yourdomain.com

# Evolution API (WhatsApp)
EVOLUTION_API_URL=https://your-evolution-api.com
EVOLUTION_API_KEY=your-evolution-api-key
```

### Development

```bash
pnpm dev          # Start dev server with Turbopack
pnpm build        # Production build
pnpm start        # Start production server (port 3000)
pnpm tsc --noEmit # TypeScript type checking
pnpm lint         # ESLint
```

---

## Build Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Project Foundation (Next.js 15 + Auth + File Explorer) | Done |
| 2 | API Endpoints (40+ routes) | Done |
| 3 | Client Portal Login System | Done |
| 3.1 | Security Fixes (rate limiting, token security) | Done |
| 4 | Client Portal Features (11 routes, 7 pages) | Done |
| 4.1 | Security Fixes + Broken Pages | Done |
| 4.2 | High Priority Security (IDOR, passwords, permissions) | Done |
| 4.3 | Medium Priority (CSRF, LIKE escaping, error boundaries) | Done |
| 5 | Admin Dashboard Pages (20+ pages) | Done |
| 6 | Quotes & Contracts (PDF, signatures, status flow) | Done |
| 7 | Realtime & Notifications (WebSocket + polling) | Done |
| 8 | Advanced File Features (preview, context menu, drag-drop) | Done |
| 9 | Finance Module (invoices, expenses, subscriptions, reports) | Done |
| 10 | Client Management Overhaul (detail pages, notes, tags, branding) | Done |
| 11 | Dynamic Portal Branding (white-label theming system) | Done |
| 12 | Employee & HR System (14 modules, 15 tables) | Done |
| 13 | ERP Expansion (evaluations, payroll, work schedules, overtime) | Done |
| 14 | Sales CRM (pipeline, leads, WhatsApp, follow-ups) | Done |
| 15 | Finance v2 (credit notes, POs, suppliers, contracts) | Done |
| 16 | HR-Finance Integration (payroll→expenses, commissions, P&L) | Done |
| 17 | Sales CRM v2 — WhatsApp Web Replacement (7 phases) | Done |
| 18 | Unified Task Pipeline (9 phases — Pipeline View, Stage Gates, Approval, File System) | Done |
| 19 | Invoice/Quote PDF Template System + Display Client Name | Done |
| 20 | Docker & Deployment (Coolify) | Done |
| 21 | Board System v2 — 9 features (numbering, duplicate, stars, sort, calendar, members, move, markdown, due badges) | Done |
| 22 | Unified Employee Payments — "كشف حسابي" for all employee types + User Detail Page | Done |
| 23 | Logic Bug Audit — 8 fixes (2 critical, 4 high, 2 medium) | Done |
| 24 | Business Entities — Multi-license support for invoices/quotes with entity-specific PDF (logo, name, license no) | Done |
| 25 | Finance Audit — 7 accounting fixes: credit note negative payments, cash-basis reports (P&L, VAT, profitability), aging by due_date, auto-overdue, subscription approval/rejection dialogs | Done |

---

## RTL Support

The entire UI is RTL-first (Arabic), with automatic LTR detection for English content. All layouts, navigation, and components are designed for right-to-left reading direction. Tailwind logical properties (`ms-`, `me-`, `ps-`, `pe-`) are used throughout.

---

## License

Private project. All rights reserved by Pyramedia X.
