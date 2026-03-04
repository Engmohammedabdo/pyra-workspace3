# Pyra Workspace 3.0

**Pyramedia's Digital Workspace** — File management, client portal, project tracking, quotations, invoicing, and team collaboration platform with white-label portal branding.

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
| Payments | Stripe |
| Package Manager | pnpm |

---

## Features

### Admin Dashboard (`/dashboard`)
- **File Explorer** — Grid/list views, upload, drag-drop, preview panel, sort/filter, bulk operations, keyboard shortcuts, context menu
- **User Management** — CRUD with role-based access (admin/employee), path-based permissions
- **Client Management** — Full CRM: detail pages, notes, tags, activity tracking, branding editor, CSV/PDF export ([docs](./docs/CLIENT-MANAGEMENT.md))
- **Project Management** — CRUD with team scoping, file assignment, approval workflow
- **Team Management** — CRUD with member add/remove
- **Invoicing** — Invoice builder, auto-numbering, status flow (draft > sent > paid > overdue), PDF generation
- **Quotations** — Full quote builder, auto-numbering (QT-XXXX), VAT calculation, PDF generation, electronic signatures
- **Contracts** — Contract management with client linking
- **Expenses & Subscriptions** — Expense tracking and recurring subscription management
- **Finance Reports** — Revenue, clients, projects, team, and storage analytics with charts
- **Smart Alerts** — Expandable alert cards for overdue invoices, expiring quotes, stalled projects
- **Notifications** — Realtime bell with unread badge, notification list, mark read
- **Activity Log** — Filterable audit trail of all system actions (40+ action types)
- **Trash** — Soft delete with 30-day auto-purge, restore capability
- **Reviews** — File review system grouped by path
- **Script Reviews** — Script content review workflow
- **Sessions** — Active session management
- **Permissions & Roles** — RBAC with `module.action` format
- **Settings** — Company, quotes, bank, storage configuration
- **Module Guide** — Contextual help on every page with searchable guide directory
- **Command Palette** — Ctrl+K global search across all pages

### Client Portal (`/portal`)
- **Dashboard** — Welcome card, stats overview, recent activity, quick actions
- **Projects** — Project list with status tabs, detail view with files + comments
- **Files** — All files across projects with preview, approve/request-revision workflow
- **Quotes** — View quotes, electronic signature via canvas
- **Invoices** — Invoice list, detail view, Stripe payment integration
- **Scripts** — Script viewing and commenting
- **Help Center** — Searchable help articles
- **Notifications** — Push notifications, notification list with read/unread filters
- **Profile** — Personal info editor, password change
- **Dynamic Branding** — Per-client white-label theming (colors, logo, favicon) ([docs](./docs/PORTAL-BRANDING.md))

### Security
- CSRF protection (Origin header validation)
- Rate limiting on sensitive endpoints
- Path traversal prevention
- LIKE wildcard escaping
- File type whitelist (MIME + extension)
- HSTS + security headers
- IDOR protection on portal routes
- Error boundaries with Arabic UI
- RBAC permission system

---

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System architecture, component structure, API patterns |
| [`docs/PORTAL-BRANDING.md`](./docs/PORTAL-BRANDING.md) | Dynamic portal branding system (CSS vars, Tailwind integration) |
| [`docs/CLIENT-MANAGEMENT.md`](./docs/CLIENT-MANAGEMENT.md) | Client CRM system (notes, tags, activity, branding) |
| [`DATABASE-SCHEMA.md`](./DATABASE-SCHEMA.md) | Full database schema (29 tables) |
| [`CLAUDE.md`](./CLAUDE.md) | Development guide, coding conventions, mandatory checklists |

---

## Project Structure

```
app/
  api/                    # 60+ API route handlers
    files/                # File CRUD, search, folders, batch delete
    users/                # User CRUD, password management
    clients/              # Client CRUD, notes, tags, branding, activity
    projects/             # Project CRUD, file assignment
    approvals/            # Submit, approve/reject
    quotes/               # Quote CRUD, duplicate, send
    invoices/             # Invoice CRUD, payments
    notifications/        # List, mark read
    teams/                # Team CRUD, members
    shares/               # Share links, public download
    trash/                # Restore, permanent delete
    portal/               # Client portal endpoints (15+ routes)
    dashboard/            # Stats API
    activity/             # Audit log
    settings/             # Config get/update
  dashboard/              # Admin pages (20+ pages)
  portal/                 # Client portal pages (10+ pages)
  share/                  # Public share download page
components/
  ui/                     # shadcn/ui components (25+) + custom (empty-state, page-guide)
  layout/                 # Sidebar, topbar, breadcrumb, page-transition
  portal/                 # Portal sidebar, topbar, mobile nav, branding, file preview
  clients/                # Client notes, branding editor
  files/                  # File explorer, grid, list, preview, context menu, drop zone
  quotes/                 # QuoteBuilder, SignaturePad
  finance/                # Finance charts, revenue reports
  projects/               # Project components
  dashboard/              # Dashboard widgets
  reports/                # Report components
  auth/                   # Auth components
  providers/              # Context providers (theme, auth)
hooks/                    # React hooks (files, notifications, realtime, debounce, permissions)
lib/
  api/                    # Auth helpers, response helpers
  auth/                   # Guards, RBAC, middleware utilities
  config/                 # Module guide config
  portal/                 # Portal session management, branding types
  supabase/               # Supabase client factories (server, client, middleware, service role)
  utils/                  # Path sanitization, rate limiting, ID generation, formatting
  pdf/                    # PDF generators (Arabic support via Amiri font)
  email/                  # SMTP mailer, notification templates
  finance/                # Finance alerts engine
  automation/             # Workflow automation
  webhooks/               # Webhook dispatcher
docs/                     # Technical documentation
```

---

## Database

29 PostgreSQL tables with `pyra_` prefix + 1 view (`v_project_summary`).

Key tables: `pyra_users`, `pyra_clients`, `pyra_client_notes`, `pyra_client_tags`, `pyra_client_branding`, `pyra_projects`, `pyra_project_files`, `pyra_teams`, `pyra_quotes`, `pyra_quote_items`, `pyra_invoices`, `pyra_invoice_items`, `pyra_notifications`, `pyra_file_index`, `pyra_trash`, `pyra_activity_log`, `pyra_settings`.

Full schema documentation: [`DATABASE-SCHEMA.md`](./DATABASE-SCHEMA.md)

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
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
NEXT_PUBLIC_STORAGE_BUCKET=pyraai-workspace
```

### Development

```bash
pnpm dev          # Start dev server with Turbopack
pnpm build        # Production build
pnpm start        # Start production server (port 3000)
pnpm check        # TypeScript type checking
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
| 12 | Docker & Deployment | Pending |

---

## API Overview

| Group | Routes | Description |
|-------|--------|-------------|
| `/api/files` | 6 | File CRUD, search, folders, batch delete |
| `/api/users` | 4 | User CRUD, password change |
| `/api/clients` | 17 | Client CRUD, notes, tags, branding, activity |
| `/api/projects` | 3 | Project CRUD, file assignment |
| `/api/approvals` | 2 | Submit, approve/reject |
| `/api/quotes` | 7 | Quote CRUD, duplicate, send |
| `/api/invoices` | 5 | Invoice CRUD, payments |
| `/api/notifications` | 3 | List, mark read, mark all read |
| `/api/teams` | 3 | Team CRUD, member management |
| `/api/shares` | 3 | Create share links, public download |
| `/api/trash` | 2 | Restore, permanent delete |
| `/api/portal/*` | 15 | Client portal endpoints |
| `/api/dashboard` | 1 | Role-based stats |
| `/api/activity` | 1 | Filtered audit log |
| `/api/settings` | 1 | Config get/update |
| `/api/health` | 1 | Health check |

---

## RTL Support

The entire UI is RTL-first (Arabic), with automatic LTR detection for English content. All layouts, navigation, and components are designed for right-to-left reading direction. Tailwind logical properties (`ms-`, `me-`, `ps-`, `pe-`) are used throughout.

---

## License

Private project. All rights reserved by Pyramedia.
