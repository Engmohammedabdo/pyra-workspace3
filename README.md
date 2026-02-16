# Pyra Workspace 3.0

**Pyramedia's Digital Workspace** — File management, client portal, project tracking, quotations, and team collaboration platform.

Built with **Next.js 15** (App Router) + **TypeScript** + **Supabase** (self-hosted) + **shadcn/ui**.

> Migrated from PHP 8 / vanilla JS to a modern full-stack TypeScript architecture.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL via Supabase (self-hosted) |
| Storage | Supabase Storage |
| Auth | Supabase Auth + cookie-based portal sessions |
| UI | shadcn/ui + Radix UI + Tailwind CSS 3.4 |
| State | TanStack React Query v5 |
| Realtime | Supabase Realtime (WebSocket) + polling fallback |
| Charts | Recharts |
| PDF | jsPDF |
| Package Manager | pnpm |

---

## Features

### Admin Dashboard (`/dashboard`)
- **File Explorer** — Grid/list views, upload, drag-drop, preview panel, sort/filter, bulk operations, keyboard shortcuts, context menu
- **User Management** — CRUD with role-based access (admin/employee), path-based permissions
- **Client Management** — CRUD with status toggle, linked project/quote checks
- **Project Management** — CRUD with team scoping, file assignment, approval workflow
- **Team Management** — CRUD with member add/remove
- **Quotations** — Full quote builder, auto-numbering (QT-XXXX), VAT calculation, PDF generation, status flow (draft > sent > viewed > signed)
- **Notifications** — Realtime bell with unread badge, notification list, mark read
- **Activity Log** — Filterable audit trail of all system actions
- **Trash** — Soft delete with 30-day auto-purge, restore capability
- **Reviews** — File review system grouped by path
- **Permissions** — Path-based permission management per user
- **Settings** — Company, quotes, bank, storage configuration
- **Command Palette** — Ctrl+K global search across all pages

### Client Portal (`/portal`)
- **Dashboard** — Welcome card, stats, recent projects/notifications
- **Projects** — Project list with status tabs, detail view with files + comments
- **Files** — All files across projects with approve/request-revision workflow
- **Quotes** — View quotes, electronic signature via canvas
- **Notifications** — Notification list with read/unread filters
- **Profile** — Personal info editor, password change

### Security
- CSRF protection (Origin header validation)
- Rate limiting on sensitive endpoints
- Path traversal prevention
- LIKE wildcard escaping
- File type whitelist (MIME + extension)
- HSTS + security headers
- IDOR protection on portal routes
- Error boundaries with Arabic UI

---

## Project Structure

```
app/
  api/                    # 40+ API route handlers
    files/                # File CRUD, search, folders, batch delete
    users/                # User CRUD, password management
    clients/              # Client CRUD
    projects/             # Project CRUD, file assignment
    approvals/            # Submit, approve/reject
    quotes/               # Quote CRUD, duplicate, send
    notifications/        # List, mark read
    teams/                # Team CRUD, members
    shares/               # Share links, public download
    trash/                # Restore, permanent delete
    portal/               # Client portal endpoints (12 routes)
    dashboard/            # Stats API
    activity/             # Audit log
    settings/             # Config get/update
  dashboard/              # Admin pages (12 pages)
  portal/                 # Client portal pages (7 pages)
components/
  ui/                     # shadcn/ui components (20+)
  layout/                 # Sidebar, topbar, notification bell, command palette
  files/                  # File explorer, grid, list, preview, context menu, drop zone
  quotes/                 # QuoteBuilder, SignaturePad
  portal/                 # Portal sidebar, topbar, mobile nav
hooks/                    # React hooks (files, notifications, realtime, debounce)
lib/
  api/                    # Auth helpers, response helpers
  auth/                   # Guards, middleware utilities
  portal/                 # Portal session management
  supabase/               # Supabase client factories (server, client, middleware, service role)
  utils/                  # Path sanitization, rate limiting, ID generation
  pdf/                    # PDF generation engine
```

---

## Database

26 PostgreSQL tables with `pyra_` prefix + 1 view (`v_project_summary`).

Key tables: `pyra_users`, `pyra_clients`, `pyra_projects`, `pyra_project_files`, `pyra_teams`, `pyra_quotes`, `pyra_quote_items`, `pyra_notifications`, `pyra_file_index`, `pyra_trash`, `pyra_activity_log`, `pyra_settings`.

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
| 5 | Admin Dashboard Pages (12 pages) | Done |
| 6 | Quotes & Contracts (PDF, signatures, status flow) | Done |
| 7 | Realtime & Notifications (WebSocket + polling) | Done |
| 8 | Advanced File Features (preview, context menu, drag-drop) | Done |
| 9 | Docker & Deployment | Pending |

Full build log: [`PROGRESS.md`](./PROGRESS.md)

---

## API Overview

| Group | Routes | Description |
|-------|--------|-------------|
| `/api/files` | 6 | File CRUD, search, folders, batch delete |
| `/api/users` | 4 | User CRUD, password change |
| `/api/clients` | 2 | Client CRUD |
| `/api/projects` | 3 | Project CRUD, file assignment |
| `/api/approvals` | 2 | Submit, approve/reject |
| `/api/quotes` | 7 | Quote CRUD, duplicate, send |
| `/api/notifications` | 3 | List, mark read, mark all read |
| `/api/teams` | 3 | Team CRUD, member management |
| `/api/shares` | 3 | Create share links, public download |
| `/api/trash` | 2 | Restore, permanent delete |
| `/api/portal/*` | 12 | Client portal endpoints |
| `/api/dashboard` | 1 | Role-based stats |
| `/api/activity` | 1 | Filtered audit log |
| `/api/settings` | 1 | Config get/update |
| `/api/health` | 1 | Health check |

---

## RTL Support

The entire UI is RTL-first (Arabic), with automatic LTR detection for English content. All layouts, navigation, and components are designed for right-to-left reading direction.

---

## License

Private project. All rights reserved by Pyramedia.
