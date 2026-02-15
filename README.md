# Pyra Workspace 3.0

**Full-stack workspace & project management platform** built with Next.js 15, Supabase, and Tailwind CSS. Arabic-first RTL interface with dual auth systems for admin employees and client portal users.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS 3.4 + shadcn/ui + Radix UI |
| Database | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| State | TanStack React Query |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Animation | Framer Motion |
| Icons | Lucide React |
| PDF | jsPDF |

## Features

### Admin Panel (`/dashboard`)
- **File Explorer** — Grid/list views, drag-drop upload, preview panel (image/PDF/video/audio/code), context menu, sort/filter, keyboard shortcuts
- **User Management** — CRUD, role-based access (admin/employee), password management
- **Client Management** — CRUD with linked project/file tracking
- **Project Management** — CRUD with file assignment
- **Teams** — Create teams, manage members
- **Approvals** — Submit files for approval, approve/reject workflow
- **Reviews** — Create review annotations, resolve/delete
- **Notifications** — Real-time notification system with mark read/unread, bell dropdown with live updates
- **Command Palette** — Ctrl+K global search across all dashboard pages
- **Share Links** — Generate public download links with expiry
- **Trash** — Soft delete with restore and permanent delete
- **Activity Log** — Filtered audit log of all system actions
- **Settings** — System-wide configuration management
- **Quotes** — Full quote builder with PDF generation, client auto-fill, service items, VAT calculation

### Client Portal (`/portal`)
- **Separate Auth System** — Cookie-based sessions using `pyra_clients` table (not Supabase Auth)
- **Login/Logout** — Arabic RTL branded login with Pyramedia branding
- **Password Reset** — Token-based forgot/reset password flow
- **Dashboard** — Welcome card, stats grid, recent projects, recent notifications
- **Projects** — View assigned projects with filter tabs, file approval workflow, comments
- **Files** — Browse shared files with approve/revision/download actions
- **Quotes** — View quotes, electronic signature with canvas pad
- **Notifications** — Client-specific notifications with read/unread filters
- **Profile** — Manage client profile + password change

## Project Structure

```
pyra-workspace-3/
├── app/
│   ├── (auth)/login/           # Admin login page
│   ├── dashboard/              # Admin panel pages (13 sections)
│   ├── portal/
│   │   ├── (auth)/             # Client login, forgot/reset password
│   │   └── (main)/             # Authenticated portal pages
│   └── api/
│       ├── auth/               # Admin auth (Supabase Auth)
│       ├── portal/auth/        # Client auth (cookie-based)
│       ├── files/              # File CRUD + upload/download
│       ├── users/              # User CRUD + password
│       ├── clients/            # Client CRUD
│       ├── projects/           # Project CRUD + file assignment
│       ├── approvals/          # Approval workflow
│       ├── comments/           # File comments
│       ├── notifications/      # Notification management
│       ├── reviews/            # Review annotations
│       ├── teams/              # Team + member management
│       ├── shares/             # Public share links
│       ├── trash/              # Soft delete management
│       ├── activity/           # Audit log
│       ├── dashboard/          # Role-based stats
│       └── settings/           # System config
├── components/
│   ├── ui/                     # 20 shadcn/ui components
│   ├── layout/                 # Admin sidebar, topbar, breadcrumb, mobile nav, notification bell, command palette
│   ├── portal/                 # Portal sidebar, topbar, mobile nav
│   └── files/                  # File explorer components
├── lib/
│   ├── supabase/               # Server, client, middleware Supabase clients
│   ├── api/                    # Shared API helpers (auth, response)
│   ├── auth/                   # Admin auth guards + permissions
│   ├── portal/                 # Portal session management
│   └── utils/                  # cn, format, id, path utilities
├── hooks/                      # React hooks (useFiles, useNotifications, useRealtime)
├── types/                      # TypeScript interfaces (30 types, 22 tables)
└── middleware.ts                # Route protection (dual auth)
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm (recommended) or npm
- Supabase project with 22 tables configured

### Installation

```bash
# Clone
git clone https://github.com/Engmohammedabdo/pyra-workspace3.git
cd pyra-workspace3

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Development
pnpm dev

# Type check
pnpm check

# Production build
pnpm build
pnpm start
```

### Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Pyra Workspace
NEXT_PUBLIC_STORAGE_BUCKET=pyraai-workspace
NEXT_STANDALONE=false
```

## API Overview

**94 routes** across 17 resource groups. All responses follow a consistent format:

```json
{
  "data": { ... },
  "error": null,
  "meta": null
}
```

| Group | Routes | Auth |
|-------|--------|------|
| Files | 6 | Admin (Supabase) |
| Users | 4 | Admin (Supabase) |
| Clients | 2 | Admin (Supabase) |
| Projects | 3 | Admin (Supabase) |
| Approvals | 2 | Admin (Supabase) |
| Comments | 2 | Admin (Supabase) |
| Notifications | 3 | Admin (Supabase) |
| Reviews | 2 | Admin (Supabase) |
| Teams | 3 | Admin (Supabase) |
| Shares | 3 | Admin (Supabase) |
| Trash | 2 | Admin (Supabase) |
| Activity | 1 | Admin (Supabase) |
| Dashboard | 1 | Admin (Supabase) |
| Settings | 1 | Admin (Supabase) |
| Quotes | 4 | Admin (Supabase) |
| Portal Auth | 5 | Client (Cookie) |
| Portal Quotes | 3 | Client (Cookie) |

## Security

Two rounds of security hardening applied across all API routes:

**Critical Fixes (Phase 4.1)**
- Session fixation prevention (regenerate session on login)
- Privilege escalation blocked (role changes require admin)
- Session invalidation on password change
- Scrypt hashing for share link passwords
- Quote number race condition (atomic counter)
- Rate limiting on all auth endpoints (login, forgot-password, reset-password, password change)

**High Priority Fixes (Phase 4.2)**
- IDOR prevention — portal queries scoped by `client_id` FK (not company string)
- 12-character minimum passwords across all auth flows
- Employee project access scoped by team membership
- Atomic file upload + index with storage rollback on failure
- Quote state machine (enforced valid status transitions)
- File upload whitelist (MIME types + extension blocklist)
- Stable Realtime subscriptions (useRef callback pattern)

## Deployment

Designed for self-hosted Docker deployment with `output: 'standalone'`:

```bash
# Set NEXT_STANDALONE=true for production
NEXT_STANDALONE=true pnpm build
```

> On Windows development, set `NEXT_STANDALONE=false` in `.env.local` to avoid symlink issues.

## Build Progress

See [PROGRESS.md](./PROGRESS.md) for detailed phase-by-phase build tracking.

| Phase | Status |
|-------|--------|
| 1. Project Foundation | ✅ Complete |
| 2. API Endpoints | ✅ Complete |
| 3. Client Portal Login | ✅ Complete |
| 4. Client Portal Features | ✅ Complete |
| 5. Admin Dashboard Pages | ✅ Complete |
| 6. Quotes & Contracts | ✅ Complete |
| 7. Realtime & Notifications | ✅ Complete |
| 8. Advanced File Features | ✅ Complete |
| Security Audit (Critical) | ✅ Complete |
| Security Audit (High) | ✅ Complete |
| 9. Docker & Deployment | ⏳ Pending |

## License

Private — PYRAMEDIA X FOR AI SOLUTIONS
