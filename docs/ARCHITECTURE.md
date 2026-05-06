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
| RBAC | `pyra_roles` + `buildUserPermissions()` + `hasPermission()` | Admin API routes |
| Auth Mapping | `pyra_auth_mapping` (Supabase Auth ID ↔ pyra username) | Internal — auto-healed by `resolveAuthUserId()` for legacy users |

### Authorization (CRM/ERP Standard)

Authorization happens at three layers, in strict order:

**1. Identity** — `getApiAuth()` (API) / `requireAuth()` (page) loads the user and resolves their final permission set via `buildUserPermissions()`:

```
final = BASE_EMPLOYEE ∪ (DB role.permissions ?? legacy mapping) ∪ extra_permissions
```

Special cases short-circuit: `role === 'admin'` or DB role contains `'*'` → returns `['*']`. `role === 'client'` → minimal portal permissions.

**2. Action category** — permission gate via `hasPermission(perms, 'X.Y')`:
- `*.view` (read own) / `*.create` (create own) — in `BASE_EMPLOYEE`
- `*.approve` (approve others — manager/HR action) — granted via role or `extra_permissions`
- `*.manage` (admin-level CRUD on any record) — NEVER in `BASE_EMPLOYEE`

**3. Per-entity scope** — gates that compare the actor against the resource:

| Helper | File | Used For |
|---|---|---|
| `canApproveFor(supabase, approver, role, employee)` | `lib/auth/team-scope.ts` | Leave / expense / timesheet approval mutations. Admin override + direct-manager check (`pyra_users.manager_username`). |
| `canAccessWhatsAppMessage(supabase, user, isAdmin, msgId)` | `lib/auth/whatsapp-scope.ts` | Every WhatsApp message-level mutation (forward, react, save-to-files, media proxy). Verifies the agent owns the conversation that holds the message. |
| `resolveUserScope(auth)` | `lib/auth/scope.ts` | Project/team-scoped finance and file access. Returns `{ isAdmin, clientIds, projectIds, teamIds }`. |

**Mandatory pattern** for approval mutations:
```ts
// 1. Permission gate
if (!hasPermission(rolePerms, 'leave.approve')) return apiError('غير مصرح', 403);
// 2. Scope gate
const allowed = await canApproveFor(supabase, auth.pyraUser.username, auth.pyraUser.role, existing.username);
if (!allowed) return apiError('يمكنك فقط اعتماد طلبات موظفينك المباشرين', 403);
```

Either alone is insufficient. The permission gates the action *category*; the scope gate enforces *which employees* the actor can act on.

### Notifications System

`pyra_notifications` is the single internal-notifications table. **All inserts must go through `lib/notifications/notify.ts`**:

```ts
import { notify, notifyMany } from '@/lib/notifications/notify';

await notify(supabase, {
  to: 'ahmed.s',
  type: 'task_assigned',  // see NotificationType union for full list
  title: 'تم تعيينك في مهمة',
  message: `قام ${actor.display_name} بتعيينك`,
  link: `/dashboard/boards/${boardId}?task=${taskId}`,
  entity: { type: 'task', id: taskId },
  from: { username: actor.username, displayName: actor.display_name },
});
```

The helper enforces correct column names (`recipient_username` not `username`; `target_path` not `link`), auto-skips self-notifications (actor == recipient), and is fire-and-forget (errors logged, never thrown).

Why centralized: 30+ scattered raw `INSERT` sites previously used wrong column names and silently failed (notifications never reached the recipient). The helper plus a unique-by-design `NotificationType` union prevents recurrence.

### My Work Inbox & Manager Approvals

Two surfaces unify the employee experience:

**`/dashboard` (My Work)** — Home page is now a 5-section inbox aggregator:
- Tasks (overdue / today / this-week)
- Approvals waiting on me (leave + expense + timesheet from direct reports)
- WhatsApp conversations assigned to me with unread
- Sales leads assigned to me, sorted by oldest contact
- Follow-ups due in next 24h

Single API call to `/api/my-work` returns all sections. Polls every 60s + refetches on window focus. Each section renders only when non-empty. Admin sees their assigned items + admin-overrides on the approvals section.

**`/dashboard/approvals` (Manager Approvals)** — Three tabs (leave / expense / timesheet) with inline approve/reject actions. Reject opens a dialog requiring a note (sent back to the employee). Data scope:
- Admin: all pending requests org-wide
- Manager: only items where the requester's `manager_username` matches the current user

Sidebar badge `team_approvals` (in `/api/dashboard/sidebar-badges`) shows total pending across all 3 types.

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
