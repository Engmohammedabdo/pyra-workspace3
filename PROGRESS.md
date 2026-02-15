# Pyra Workspace 3.0 — Build Progress

## Phase 1: Project Foundation ✅
**Status:** Complete | **Commit:** `1a884eb`

- [x] Next.js 15 + TypeScript strict + Tailwind 3.4 + shadcn/ui
- [x] Supabase SSR clients (server/client/middleware)
- [x] 23 type interfaces (database.ts) for all 22 tables
- [x] Auth system (middleware, guards, login page)
- [x] Admin layout (collapsible sidebar, topbar, breadcrumb, mobile nav)
- [x] Basic File Explorer (grid/list views, upload, create folder, search)
- [x] 18 shadcn/ui components
- [x] Health check API: GET /api/health
- [x] Build verification: 0 TS errors, 23 routes

## Phase 2: API Endpoints ✅
**Status:** Complete | **Commit:** `1a884eb`

- [x] Files API (6 routes): list, upload, download, rename/move, delete, batch delete, search, folders
- [x] Users API (4 routes): CRUD, password change, lite list
- [x] Clients API (2 routes): CRUD with linked record checks
- [x] Projects API (3 routes): CRUD, file assignment
- [x] Approvals API (2 routes): submit, approve/reject
- [x] Comments API (2 routes): create, delete, mark read
- [x] Notifications API (3 routes): list, mark read, mark all read
- [x] Reviews API (2 routes): create, resolve, delete
- [x] Teams API (3 routes): CRUD, member management
- [x] Shares API (3 routes): create links, public download
- [x] Trash API (2 routes): restore, permanent delete, auto-purge
- [x] Activity API (1 route): filtered audit log
- [x] Dashboard API (1 route): role-based stats
- [x] Settings API (1 route): get/update config
- [x] Shared: lib/api/response.ts, lib/api/auth.ts
- [x] Build verification: 0 TS errors, 41 routes

## Phase 3: Client Portal Login System ✅
**Status:** Complete | **Commit:** `b47d727`

- [x] /portal/login — Client login page (Arabic RTL, Pyramedia branding, responsive)
- [x] /portal/forgot-password — Forgot password page with email form
- [x] /portal/reset-password — Reset password page with token validation
- [x] /portal/(auth)/layout — Centered auth layout for portal auth pages
- [x] /portal/(main)/layout — Authenticated portal layout (sidebar + topbar)
- [x] Portal sidebar (components/portal/portal-sidebar.tsx)
- [x] Portal topbar (components/portal/portal-topbar.tsx)
- [x] Portal mobile nav (components/portal/portal-mobile-nav.tsx)
- [x] Cookie-based session management (lib/portal/auth.ts)
- [x] POST /api/portal/auth/login — Client login (Supabase Auth + custom session)
- [x] POST /api/portal/auth/logout — Destroy session + clear cookie
- [x] GET /api/portal/auth/session — Validate current session
- [x] POST /api/portal/auth/forgot-password — Generate reset token
- [x] POST /api/portal/auth/reset-password — Process password reset
- [x] Middleware updated for portal routes (cookie-based auth separation)
- [x] 6 placeholder pages: projects, files, quotes, notifications, profile, portal home
- [x] Build verification: 0 TS errors, 70 routes

## Phase 3.1: Security Fixes ✅
**Status:** Complete | **Commit:** `06cc635`

- [x] Removed console.log leaking reset tokens
- [x] nanoid(4) → nanoid(32) for token generation
- [x] Rate limiting: login (5/IP/15min), forgot-password (3/email/hr), reset-password (5/IP/15min)
- [x] Arabic locale for formatDate() and formatRelativeDate()

## Phase 4: Client Portal Features ✅
**Status:** Complete | **Commit:** `a89e823`

### Portal API Endpoints (11 new routes)
- [x] GET /api/portal/dashboard — Client dashboard stats + recent data
- [x] GET /api/portal/projects — List client's projects (filter, search)
- [x] GET /api/portal/projects/[id] — Project detail + files + comments
- [x] POST /api/portal/projects/[id]/comments — Create project comment
- [x] POST /api/portal/files/[id]/approve — Approve a file
- [x] POST /api/portal/files/[id]/revision — Request revision on file
- [x] GET /api/portal/files/[id]/download — Download file via signed URL
- [x] GET /api/portal/notifications — List notifications (+ PATCH mark all read)
- [x] PATCH /api/portal/notifications/[id] — Mark single notification read
- [x] GET /api/portal/profile — Get client profile (+ PATCH update)
- [x] POST /api/portal/profile/password — Change password

### Portal Pages (7 pages)
- [x] /portal — Dashboard: welcome card, stats grid, recent projects, recent notifications
- [x] /portal/projects — Project list with filter tabs (all/active/review/completed), search
- [x] /portal/projects/[id] — Project detail with files tab + comments tab
- [x] /portal/files — All files across projects with approval workflow (approve/revision/download)
- [x] /portal/notifications — Notification list with read/unread filters, mark all read
- [x] /portal/profile — Personal info editor + password change form
- [x] /portal/quotes — Updated placeholder (Phase 6)
- [x] Build verification: 0 TS errors, 81 routes

## Phase 4.1: Security Fixes + Broken Pages ✅
**Status:** Complete | **Commit:** `ba5ec7e`

### 🔴 Critical Fixes
- [x] SECURITY: Removed `company` from PATCH /api/portal/profile (data isolation bypass)
- [x] Dashboard API restructured to match page expectations (stats nested, camelCase)
- [x] Created dedicated GET /api/portal/files endpoint (files page was empty)
- [x] Password change uses throwaway Supabase client (session state leak fixed)

### 🟠 Security Hardening
- [x] Rate limiting on password change (5 attempts / 15 min per client)
- [x] LIKE wildcard escaping on project search + file search
- [x] Comment max length validation (5000 chars) on revision + project comments
- [x] Password length validation: min 8, max 128 chars (was min 6)
- [x] Session invalidation after password change (other sessions destroyed)
- [x] Path traversal check on file download (`..`, `\0`, backslash)

### 🟡 Code Quality
- [x] Exported CLIENT_SAFE_FIELDS from lib/portal/auth.ts (shared across routes)
- [x] Replaced all select('*') with explicit column lists across 8 API files
- [x] Company field disabled (read-only) on portal profile page
- [x] Files page rewritten to use dedicated /api/portal/files endpoint
- [x] Build verification: 0 TS errors, 82 routes

## Phase 5: Admin Dashboard Pages ✅
**Status:** Complete | **Commit:** `a1486c7`

### Dashboard Pages (12 pages rewritten from placeholders)
- [x] /dashboard — Real stats cards (files, users, clients, projects, notifications, storage) + recent activity timeline
- [x] /dashboard/users — Full CRUD table with create/edit/delete/password-change dialogs, search & role filter
- [x] /dashboard/clients — Full CRUD table with create/edit/delete dialogs, active status toggle, search
- [x] /dashboard/projects — Full CRUD table with create/edit/delete dialogs, client select, status filter & search
- [x] /dashboard/teams — CRUD table with create/edit/delete dialogs + member management (add/remove users)
- [x] /dashboard/notifications — Notification list with unread count, read/unread filter, mark all read
- [x] /dashboard/activity — Activity timeline with action type filter, pagination (20/page)
- [x] /dashboard/trash — Trash table with restore & permanent delete (with confirmation dialog)
- [x] /dashboard/settings — Grouped settings form (Company, Quotes, Bank, Storage) with save all
- [x] /dashboard/reviews — Reviews grouped by file path, toggle resolve, delete with confirmation, path search
- [x] /dashboard/permissions — Permission table built from user data, add/remove path-based permissions
- [x] /dashboard/quotes — List page with status filter & search (create deferred to Phase 6)

### Sidebar Updates
- [x] Added Clients, Projects, Reviews nav items to sidebar
- [x] Added Briefcase, MessageSquare icons

### Build Verification
- [x] 0 TypeScript errors (tsc --noEmit)
- [x] next build: 82 routes, all successful

## Phase 6: Quotes & Contracts ✅
**Status:** Complete | **Commit:** `f75c915`

### Admin Quotes API (4 route files, 8 endpoints)
- [x] GET /api/quotes — List quotes with status filter, search, pagination
- [x] POST /api/quotes — Create quote with items, auto-generate quote number (QT-XXXX)
- [x] GET /api/quotes/[id] — Get quote detail with items
- [x] PATCH /api/quotes/[id] — Update quote fields and items (recalculates totals)
- [x] DELETE /api/quotes/[id] — Delete quote (cascade deletes items)
- [x] POST /api/quotes/[id]/duplicate — Duplicate quote with new number, reset to draft
- [x] POST /api/quotes/[id]/send — Mark as sent, create client notification

### Portal Quotes API (3 route files, 3 endpoints)
- [x] GET /api/portal/quotes — List client's quotes (non-draft only)
- [x] GET /api/portal/quotes/[id] — Quote detail, auto-marks as 'viewed' on first access
- [x] POST /api/portal/quotes/[id]/sign — Sign quote with signature canvas data

### Admin Pages (3 pages)
- [x] /dashboard/quotes — Full list with status filter, search, dropdown actions (edit, duplicate, send, delete)
- [x] /dashboard/quotes/new — QuoteBuilder component for creating new quotes
- [x] /dashboard/quotes/[id] — QuoteBuilder component for editing existing quotes

### Portal Page (1 page, fully functional)
- [x] /portal/quotes — Quote list + detail view + electronic signature (SignaturePad)

### Components
- [x] components/quotes/QuoteBuilder.tsx — Full quote builder with client select, service items table, auto-calculations, save/send/PDF toolbar
- [x] components/quotes/SignaturePad.tsx — react-signature-canvas wrapper for electronic signatures

### PDF Generation
- [x] lib/pdf/generateQuotePdf.ts — jsPDF direct drawing engine (A4, branded layout, orange theme)

### Business Logic
- [x] Auto-generated quote numbers (QT-0001, QT-0002, ...) with configurable prefix from settings
- [x] VAT rate from settings (default 5%), bank details from settings
- [x] Client auto-fill on select (name, email, phone, company)
- [x] Service items: dynamic rows, quantity × rate = amount, subtotal + VAT = total
- [x] Status flow: draft → sent → viewed → signed
- [x] Quote duplication with new number and draft status
- [x] PDF download with branded layout (company header, services table, totals, bank details, terms, footer)
- [x] Client portal: view quotes, auto-mark as viewed, sign with canvas signature

### Build Verification
- [x] 0 TypeScript errors (tsc --noEmit)
- [x] next build: 94 routes, all successful

## Phase 7: Realtime & Notifications ✅
**Status:** Complete | **Commit:** `1d4ba8d`

### Supabase Realtime Integration
- [x] hooks/useRealtime.ts — `useRealtime()` subscribes to postgres_changes INSERT on pyra_notifications (filtered by recipient_username)
- [x] hooks/useRealtime.ts — `useRealtimeActivity()` subscribes to INSERT on pyra_activity_log for live activity feed

### Notification Hooks (Polling Fallback)
- [x] hooks/useNotifications.ts — `useNotifications()` fetches /api/notifications, polls every 30s, returns notifications + unreadCount + markRead + markAllRead
- [x] hooks/useNotifications.ts — `usePortalNotifications()` fetches /api/portal/notifications?unread_only=true, polls every 30s, returns unreadCount

### NotificationBell Component
- [x] components/layout/NotificationBell.tsx — Bell icon with dynamic unread count badge (9+ cap)
- [x] Popover dropdown showing last 10 notifications with title, message, source, relative time
- [x] Click notification → mark as read + navigate to target_path
- [x] "Mark all as read" button in header
- [x] "View all notifications" link to /dashboard/notifications
- [x] Combined Realtime + polling for robust delivery

### Command Palette (Ctrl+K Search)
- [x] components/layout/CommandPalette.tsx — Global search dialog using cmdk
- [x] Keyboard shortcut: Ctrl+K / Cmd+K to toggle
- [x] 14 navigation items with Arabic labels + English/Arabic keywords
- [x] Fuzzy search across page names and keywords
- [x] SearchTrigger component with keyboard shortcut indicator (Ctrl K)

### Topbar Integration
- [x] components/layout/topbar.tsx — Replaced placeholder bell with NotificationBell (realtime + popover dropdown)
- [x] components/layout/topbar.tsx — Replaced placeholder search with CommandPalette + SearchTrigger
- [x] components/portal/portal-topbar.tsx — Replaced hardcoded orange dot with dynamic unread badge from usePortalNotifications()

### New shadcn/ui Components
- [x] components/ui/popover.tsx — Radix Popover (for notification dropdown)
- [x] components/ui/command.tsx — cmdk Command components (for search palette)

### Build Verification
- [x] 0 TypeScript errors (tsc --noEmit)
- [x] next build: 94 routes, all successful

## Phase 8: Advanced File Features ✅
**Status:** Complete | **Commit:** `e51f3ec`

### File Preview Panel
- [x] components/files/file-preview.tsx — Sheet-based side panel preview
- [x] Image preview (inline img with max-height)
- [x] Video preview (HTML5 video player with controls)
- [x] Audio preview (HTML5 audio player with file icon)
- [x] PDF preview (iframe embed)
- [x] Text/Code preview (fetch + monospace pre block, 50K char limit)
- [x] Generic fallback with file type indicator
- [x] Metadata footer (type, size, path, last modified)
- [x] Download + Open in new tab buttons
- [x] Double-click file → opens preview (instead of just toast)

### File Context Menu
- [x] components/files/file-context-menu.tsx — DropdownMenu with actions per file
- [x] Actions: Preview, Download, Rename, Copy Path, Delete
- [x] Rename dialog with text input + confirm
- [x] Delete confirmation dialog (soft delete to trash)
- [x] FileActionButton (three-dot menu) on hover in grid/list views

### Drag & Drop Upload
- [x] components/files/file-drop-zone.tsx — Visual drag-drop zone overlay
- [x] Drag enter/leave tracking with counter (handles nested elements)
- [x] Animated upload icon with bounce effect
- [x] Arabic text: "أفلت الملفات هنا للرفع"
- [x] Wraps entire file explorer area

### Sort & Filter Controls
- [x] Sort by: Name, Size, Date, Type — with ascending/descending toggle
- [x] Type filter: All, Images, Video, Audio, Documents, Archives, Code
- [x] Sort/Filter dropdowns integrated into toolbar
- [x] Active filter indicator (highlighted filter icon)
- [x] Folders always sorted first regardless of sort field

### Bulk Operations
- [x] Ctrl+A selects all files
- [x] Delete key deletes selected files
- [x] Bulk delete button in toolbar when files are selected
- [x] Selection count display in toolbar and file count row

### Keyboard Shortcuts
- [x] Ctrl+A — Select all files
- [x] Delete — Delete selected files
- [x] Escape — Deselect all / close preview
- [x] Space — Preview selected file
- [x] Enter — Open folder / preview file (in list view)
- [x] Ctrl/Cmd+Click — Multi-select

### Updated Components
- [x] file-explorer.tsx — Rewritten with sort/filter state, preview integration, keyboard handler, drop zone wrapper
- [x] file-toolbar.tsx — Added sort dropdown, type filter dropdown, bulk delete button
- [x] file-grid.tsx — Added FileActionButton (three-dot menu) per item
- [x] file-list.tsx — Added actions column with FileActionButton

### Build Verification
- [x] 0 TypeScript errors (tsc --noEmit)
- [x] next build: 94 routes, all successful

## Phase 4.2: Security Fixes (HIGH Priority) ✅
**Status:** Complete | **Commit:** `214d2a6`

### H1: Fix IDOR — Scope portal queries by client_id
- [x] All portal endpoints now use `client_id` FK instead of `client_company` string
- [x] Compound `.or()` filter: prefer `client_id`, fallback to `client_company` for legacy projects
- [x] 9 portal API files updated: projects, files (approve/download/revision), comments, dashboard
- [x] `ownsProject` ownership check added to all single-resource portal routes

### H2: Raise minimum password length to 12 characters
- [x] Backend: 5 API routes updated (users, clients, portal password, portal reset-password)
- [x] Frontend: 3 pages updated (users page, portal profile, portal reset-password)
- [x] Consistent 12–128 character range across all password flows

### H3: Employee permission checks on projects
- [x] GET /api/projects — Employees see only projects from teams they belong to (via `pyra_team_members`)
- [x] GET /api/projects/[id] — Team membership check before allowing single project access
- [x] Admins retain full access to all projects

### H4: Atomic file operations (upload + index)
- [x] Storage upload rollback on index upsert failure
- [x] `uploadedPaths.push()` moved after successful index insert
- [x] Error recorded and file cleaned up from storage on failure

### H5: Quote state transition protection
- [x] `VALID_TRANSITIONS` map: draft→sent, sent→draft/viewed, viewed→draft/signed, signed→(terminal), expired→draft
- [x] PATCH /api/quotes/[id] validates status transitions before applying
- [x] POST /api/quotes/[id]/send restricted to draft quotes only
- [x] POST /api/portal/quotes/[id]/sign restricted to sent/viewed quotes only

### H6: Stabilize useRealtime hook callbacks
- [x] `useRef` pattern for callbacks — avoids re-subscription on every render
- [x] `useRealtime()` depends only on `[username]`, not callback identity
- [x] `useRealtimeActivity()` depends on `[]` — subscribes once

### H7: File type whitelist for uploads
- [x] `ALLOWED_MIME_TYPES` set: documents, images, video, audio, archives, design, fonts
- [x] `BLOCKED_EXTENSIONS` set: .exe, .bat, .cmd, .ps1, .sh, .dll, .msi, .scr, etc.
- [x] `isAllowedFileType()` function with dual defense (extension blocklist + MIME whitelist)
- [x] Validation runs before any storage upload

### Build Verification
- [x] 0 TypeScript errors (tsc --noEmit)
- [x] next build: 64 static pages, all successful

## Phase 4.3: Medium Priority Improvements ✅
**Status:** Complete | **Commit:** _(pending)_

### M1: Escape LIKE wildcards in search queries
- [x] Created shared `escapeLike()` utility in `lib/utils/path.ts` (escapes `%`, `_`, `\`)
- [x] Fixed 5 VULNERABLE endpoints that had no escaping: files/search, activity, users, clients, projects
- [x] Consolidated 3 endpoints with inconsistent inline escaping: quotes, portal/projects, portal/files
- [x] All 8 ilike/or search routes now use `escapeLike()` uniformly

### M2: Improve path traversal validation
- [x] Enhanced `sanitizePath()` — null byte/backslash upfront rejection, loop-based `..` removal
- [x] Created `isPathSafe()` centralized path safety validator
- [x] Applied to `portal/files/[id]/download` (replaced 5-line inline check)
- [x] Applied to `shares/download/[token]` (added missing check before storage download)

### M3: CSRF + Security headers
- [x] Added Origin header validation in `middleware.ts` for all state-changing API requests (POST/PATCH/PUT/DELETE)
- [x] Added `X-XSS-Protection: 1; mode=block` header in `next.config.ts`
- [x] Added `Strict-Transport-Security` (HSTS) with 2-year max-age, includeSubDomains, preload
- [x] Added `Permissions-Policy: camera=(), microphone=(), geolocation=()`

### M4: Error Boundaries + debounce
- [x] `components/error-boundary.tsx` — React class ErrorBoundary with Arabic error UI and retry button
- [x] `components/error-boundary-wrapper.tsx` — Client-side wrapper for server component layouts
- [x] `hooks/useDebounce.ts` — Generic debounce hook (configurable delay, default 300ms)
- [x] Wrapped `/dashboard` layout children in ErrorBoundaryWrapper
- [x] Wrapped `/portal/(main)` layout children in ErrorBoundaryWrapper

### M5: Unify Supabase client patterns
- [x] `app/api/projects/route.ts` POST — switched from `createServerSupabaseClient()` to `createServiceRoleClient()` for admin write operations
- [x] `app/api/users/route.ts` POST — unified all write operations (duplicate check, insert, auth mapping, activity log) to use `serviceClient` consistently
- [x] Pattern: GET uses `createServerSupabaseClient()` (respects RLS), POST/PATCH/DELETE use `createServiceRoleClient()` for admin writes

### M6: Reduce `any` types
- [x] Exported `QuoteData` interface from `components/quotes/QuoteBuilder.tsx`
- [x] `app/dashboard/quotes/[id]/page.tsx` — replaced `Record<string, unknown>` + `as any` with proper `QuoteData` type
- [x] Removed `eslint-disable-next-line @typescript-eslint/no-explicit-any` comment

### Build Verification
- [x] 0 TypeScript errors (tsc --noEmit)
- [x] next build: 64 static pages, all successful

## Phase 9: Docker & Deployment ⏳
