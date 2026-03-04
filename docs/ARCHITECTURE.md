# System Architecture

> Technical architecture overview for Pyra Workspace 3.0

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Vercel (Edge)                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   Next.js 15 (App Router)              │  │
│  │  ┌─────────────────┐    ┌──────────────────────────┐  │  │
│  │  │ Admin Dashboard  │    │    Client Portal          │  │  │
│  │  │ /dashboard/*     │    │    /portal/*              │  │  │
│  │  │ (SSR + Client)   │    │    (SSR + Client)         │  │  │
│  │  └────────┬─────────┘    └──────────┬───────────────┘  │  │
│  │           │                          │                   │  │
│  │  ┌────────▼──────────────────────────▼───────────────┐  │  │
│  │  │              API Routes (/api/*)                    │  │  │
│  │  │  /api/dashboard/*    /api/portal/*    /api/files/*  │  │  │
│  │  └────────────────────────┬───────────────────────────┘  │  │
│  └───────────────────────────┼───────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Supabase (Self-   │
                    │   Hosted)           │
                    │  ┌───────────────┐  │
                    │  │  PostgreSQL   │  │
                    │  │  29 tables    │  │
                    │  │  RLS enabled  │  │
                    │  └───────────────┘  │
                    │  ┌───────────────┐  │
                    │  │  Storage      │  │
                    │  │  (S3-compat)  │  │
                    │  └───────────────┘  │
                    │  ┌───────────────┐  │
                    │  │  Auth         │  │
                    │  │  (JWT/RBAC)   │  │
                    │  └───────────────┘  │
                    │  ┌───────────────┐  │
                    │  │  Realtime     │  │
                    │  │  (WebSocket)  │  │
                    │  └───────────────┘  │
                    └─────────────────────┘
```

---

## Two Interfaces

### Admin Dashboard (`/dashboard`)

- **Auth**: Supabase Auth (JWT) with RBAC permissions
- **Access**: Internal team members (admins, employees)
- **Pages**: 20+ pages across 6 navigation sections
- **Permissions**: Role-based (`module.action` format, e.g., `files.view`, `invoices.create`)

### Client Portal (`/portal`)

- **Auth**: Cookie-based sessions (separate from Supabase Auth)
- **Access**: External clients
- **Pages**: 8 main pages + auth pages
- **Branding**: Dynamic per-client theming via `portal` Tailwind color
- **Scope**: Clients only see their own data (IDOR protection)

---

## Key Systems

### Authentication

| System | Mechanism | Used By |
|--------|-----------|---------|
| Supabase Auth | JWT tokens, `auth.users` table | Admin Dashboard |
| Portal Sessions | `httpOnly` cookies, `pyra_clients` table | Client Portal |
| RBAC | `pyra_roles` + `hasPermission()` | Admin API routes |

### File Management

- **Storage**: Supabase Storage (S3-compatible)
- **Index**: `pyra_file_index` table for search and metadata
- **Features**: Upload, preview, drag-drop, versioning, sharing, trash
- **Security**: File type whitelist, path traversal prevention, MIME validation

### PDF Generation

- **Engine**: jsPDF with custom Arabic font support
- **Fonts**: Amiri-Regular.ttf + Amiri-Bold.ttf (loaded and cached)
- **Output**: Invoices, quotes, contracts with RTL Arabic text
- **Config**: `lib/pdf/` directory

### Email System

- **Transport**: SMTP via `nodemailer`
- **Templates**: HTML with Arabic RTL, orange branding
- **Notifications**: Quote sent, invoice sent, portal welcome, password reset

### Realtime

- **Primary**: Supabase Realtime (WebSocket subscriptions)
- **Fallback**: HTTP polling for environments without WebSocket support
- **Used for**: Notifications, file changes, project updates

### Portal Branding

See [docs/PORTAL-BRANDING.md](./PORTAL-BRANDING.md) for the full branding system documentation.

---

## Component Architecture

```
components/
├── ui/                     # Shared primitives (shadcn/ui + custom)
│   ├── button, card, dialog, badge, skeleton, etc.
│   ├── empty-state.tsx     # Unified empty state component
│   └── page-guide.tsx      # Auto-detecting module guide popover
├── layout/                 # Shared layout components
│   ├── sidebar.tsx         # Admin dashboard sidebar (6 sections)
│   ├── topbar.tsx          # Admin topbar (search + PageGuide)
│   ├── page-transition.tsx # framer-motion page animation
│   └── breadcrumb.tsx      # Auto breadcrumb from URL
├── portal/                 # Portal-specific components
│   ├── portal-sidebar.tsx      # Dynamic branding sidebar
│   ├── portal-topbar.tsx       # Dynamic branding topbar
│   ├── portal-mobile-nav.tsx   # Mobile responsive nav
│   ├── BrandingProvider.tsx    # Branding context + CSS vars
│   ├── PortalBrandingWrapper.tsx # Branding data fetcher
│   ├── portal-command-search.tsx # Portal Ctrl+K search
│   ├── portal-file-preview.tsx   # File preview modal
│   └── mention-textarea.tsx      # @mention comment input
├── clients/                # Client management components
│   ├── ClientNotesTab.tsx  # Notes CRUD
│   └── BrandingEditor.tsx  # Admin branding customization
├── quotes/                 # Quote builder + signature
├── files/                  # File explorer components
├── projects/               # Project management
├── finance/                # Finance charts + reports
└── providers/              # React context providers
```

---

## Module Guide System

Every dashboard page has contextual help via the module guide system:

1. **Config**: `lib/config/module-guide.ts` — centralized guide data
2. **Component**: `components/ui/page-guide.tsx` — auto-detects page from URL
3. **Topbar**: Renders `<PageGuide />` globally in admin topbar
4. **Guide page**: `/dashboard/guide` — searchable directory of all modules

---

## API Pattern

```typescript
// Admin endpoint
export async function GET(req: NextRequest) {
  const { supabase, user } = await requireApiPermission(req, 'module.view');
  // ... business logic
  return apiSuccess(data);
}

// Portal endpoint
export async function GET(req: NextRequest) {
  const { supabase, clientId } = await requirePortalAuth(req);
  // ... scoped to client
  return apiSuccess(data);
}
```

### Response Format

```typescript
// Success
apiSuccess(data, 200)  // { success: true, data: ... }

// Error
apiError('Message', 400)  // { success: false, error: 'Message' }
```

---

## Database

- **29 tables** in `public` schema with `pyra_` prefix
- **1 view**: `v_project_summary`
- **RLS**: Enabled on all tables
- **ID format**: Prefixed IDs (e.g., `c_`, `p_`, `q_`, `inv_`, `cno_`, `ct_`)
- **Full schema**: [`DATABASE-SCHEMA.md`](../DATABASE-SCHEMA.md)

---

## Styling System

| Layer | Technology | Scope |
|-------|-----------|-------|
| Base | Tailwind CSS 3.4 | All |
| Components | shadcn/ui (Radix UI) | All |
| Theme | CSS variables (hsl) via `globals.css` | All |
| Portal Branding | `portal` Tailwind color (CSS variable) | Portal only |
| Animations | framer-motion | Page transitions |
| Charts | Recharts (dark mode via CSS overrides) | Dashboard |
| RTL | Arabic-first with `ms-`/`me-`/`ps-`/`pe-` | All |

---

## Security Measures

| Protection | Implementation |
|-----------|---------------|
| CSRF | Origin header validation |
| Rate Limiting | IP-based with configurable thresholds |
| Path Traversal | Sanitization + validation |
| SQL Injection | Parameterized queries (Supabase SDK) |
| XSS | React auto-escaping + CSP headers |
| IDOR | Session-scoped queries on portal |
| File Upload | MIME + extension whitelist |
| HSTS | Security headers in middleware |
