# Phase 5: Admin Dashboard — Full Admin UI Build

> **You have CREATIVE FREEDOM in this phase.**
> Research the best libraries, explore modern UI patterns, find inspiration.
> Make this dashboard beautiful, fast, and impressive.
> The goal: when Mohammed opens this dashboard, he should say "WOW."

---

## 🎯 Mission

Build ALL admin-side dashboard pages. Every placeholder page becomes a fully functional, production-ready UI. You have 56 API routes already built — now build the frontend that uses them.

## 🧠 Creative Freedom Guidelines

You are **encouraged** to:
- **Research and install new UI libraries** — Magic UI, Aceternity UI, number tickers, animated charts, glassmorphism effects, anything that makes it premium
- **Use modern patterns** — Server Components where possible, streaming with Suspense, optimistic updates
- **Add micro-interactions** — hover effects, smooth transitions, staggered animations, skeleton loaders
- **Explore unique layouts** — command palette (⌘K), draggable elements, context menus, split views
- **Find the best data table library** — @tanstack/react-table, or similar with sorting/filtering/pagination built-in
- **Add rich text for comments** — if you find a good lightweight editor (tiptap, @uiw/react-md-editor)
- **Use Recharts or similar** for dashboard analytics
- **Consider virtual scrolling** for large file lists (@tanstack/react-virtual)

You are **NOT allowed** to:
- Change existing API route signatures (request/response shapes)
- Modify the database schema
- Break the portal pages (app/portal/) — don't touch them
- Remove existing working components
- Use `any` type in TypeScript

## 📐 Brand & Design

- **Primary Orange:** `#F97316` (already in Tailwind config)
- **Font:** Arabic-first (already configured)
- **Direction:** RTL for Arabic UI (already in layout)
- **Theme:** Light + Dark mode support (next-themes already installed)
- **Style:** Modern SaaS dashboard — think Linear, Vercel Dashboard, Midday.ai
- **Glassmorphism cards** for stat cards, subtle gradients, smooth shadows

## 📦 Current State

**What exists:**
- 56 API routes (all working) — files, users, teams, reviews, notifications, activity, trash, shares, settings, dashboard, clients, projects, quotes, approvals, comments
- Dashboard layout with Sidebar + Topbar (working)
- File Explorer component (basic grid/list views, working)
- shadcn/ui components: Card, Badge, Button, Input, Label, Dialog, Dropdown, Select, Tabs, Sheet, ScrollArea, Avatar, Checkbox, Switch, Tooltip, Separator, Progress, Skeleton
- TanStack Query provider configured
- Theme provider (next-themes) configured

**What's placeholder (8-line stubs):**
ALL of these pages need to be built from scratch:

### Priority 1: Core Admin Pages
1. **Dashboard** (`/dashboard`) — Stats cards with real data from `/api/dashboard`, charts (upload trends, storage breakdown), recent activity stream, quick actions dock
2. **Users** (`/dashboard/users`) — User table (CRUD), permission builder (tree view), role management
3. **Teams** (`/dashboard/teams`) — Team cards, member management, team permissions
4. **Settings** (`/dashboard/settings`) — App config, quote settings, security settings, storage settings

### Priority 2: File Manager Enhancement
5. **File Manager** (`/dashboard/files`) — Enhance existing: add context menu (right-click), drag-drop upload zone with progress, file preview panel (side sheet), batch operations bar, version history panel, share link dialog, review/comment panel

### Priority 3: Review & Collaboration
6. **Reviews** (`/dashboard/reviews`) — All reviews across files, filter by status/user, threaded view
7. **Notifications** (`/dashboard/notifications`) — Full notification list, filters (type, read/unread), mark all read
8. **Activity** (`/dashboard/activity`) — Timeline view, filters (action type, user, date range), CSV export

### Priority 4: Management Pages  
9. **Clients** (`/dashboard/clients`) — Client table (CRUD), company assignment, portal access management
10. **Projects** (`/dashboard/projects`) — Project list, file assignment, approval tracking, client comments
11. **Trash** (`/dashboard/trash`) — Trashed items table, restore, permanent delete, bulk purge, auto-purge countdown
12. **Permissions** (`/dashboard/permissions`) — File-level permissions, effective permission viewer

### Priority 5: Quotes (can be placeholder-plus for now)
13. **Quotes** (`/dashboard/quotes`) — Quote list with status filters. If time allows: full quote builder with line items, PDF preview, send via email

## 🔌 API Endpoints Available

Use these endpoints. They're all built and working:

```
# Dashboard
GET /api/dashboard — stats + recent activity

# Files (enhanced)
GET /api/files?prefix=... — list files with RBAC filtering
POST /api/files — upload file(s)
DELETE /api/files/[...path] — delete file (move to trash)
PATCH /api/files/[...path] — rename
POST /api/files/folders — create folder
GET /api/files/search?q=... — deep search
DELETE /api/files/delete-batch — batch delete
GET /api/files/download/[...path] — signed download URL

# Users
GET /api/users — list all users
GET /api/users/lite — usernames + display names
POST /api/users — create user
PATCH /api/users/[username] — update user
DELETE /api/users/[username] — delete user
PATCH /api/users/[username]/password — change password

# Teams
GET /api/teams — list teams
POST /api/teams — create team
PATCH /api/teams/[id] — update team
DELETE /api/teams/[id] — delete team
POST /api/teams/[id]/members — add member
DELETE /api/teams/[id]/members — remove member

# Reviews
GET /api/reviews?path=... — reviews for file
POST /api/reviews — create review/comment
PATCH /api/reviews/[id] — resolve/update
DELETE /api/reviews/[id] — delete

# Notifications
GET /api/notifications — paginated list
PATCH /api/notifications/[id] — mark read
PATCH /api/notifications/read-all — mark all read

# Activity
GET /api/activity — paginated activity log

# Trash
GET /api/trash — list trashed items
POST /api/trash/[id] — restore
DELETE /api/trash/[id] — permanent delete

# Shares
GET /api/shares?path=... — shares for file
POST /api/shares — create share link
PATCH /api/shares/[id] — deactivate

# Settings
GET /api/settings — all settings
PATCH /api/settings — update settings

# Clients
GET /api/clients — list clients
POST /api/clients — create client
PATCH /api/clients/[id] — update
DELETE /api/clients/[id] — delete

# Projects
GET /api/projects — list projects
POST /api/projects — create
PATCH /api/projects/[id] — update
DELETE /api/projects/[id] — delete
POST /api/projects/[id]/files — add file to project
DELETE /api/projects/[id]/files — remove file

# Approvals
GET /api/approvals — list approvals
PATCH /api/approvals/[id] — update status

# Comments (admin view)
GET /api/comments?project_id=... — get comments
POST /api/comments — team reply
```

## 🏗️ Architecture Guidelines

### State Management
- Use **TanStack Query** for all server state (already configured)
- Define query keys in a central `lib/query-keys.ts`
- Use **Zustand** for UI state only if needed (sidebar collapse, selections, view mode)
- Use **optimistic updates** for actions like mark-read, resolve, approve

### Component Pattern
```
app/dashboard/[module]/
├── page.tsx              ← Server Component (auth check, initial data)
├── _components/
│   ├── module-table.tsx  ← Client Component (data table + actions)
│   ├── module-dialog.tsx ← Client Component (create/edit modal)
│   └── module-filters.tsx← Client Component (filter bar)
```

### Data Table Pattern
- Pick the best table library (research!) — @tanstack/react-table is solid
- Every table needs: sorting, filtering, pagination, column visibility toggle
- Row actions: edit, delete, view (dropdown menu)
- Bulk selection + bulk actions where appropriate
- Loading skeleton matching table layout

### Realtime (Bonus)
- If feasible, add Supabase Realtime subscription for notifications
- Live notification bell badge in topbar
- Toast on new notification

## ✅ Deliverables

When complete:
1. All 13 admin pages fully functional (no more "قريباً" placeholders)
2. Dashboard with real stats from API + animated charts
3. Data tables with sort/filter/paginate on Users, Teams, Clients, Projects, Activity, Trash
4. File manager enhanced with context menu + preview + share + review panels
5. Command palette (⌘K / Ctrl+K) for global search
6. Notification bell with live count + dropdown
7. `pnpm build` — 0 TypeScript errors
8. Git commit + push to origin/main
9. Report: files changed, insertions, route count, new packages installed

## 🎨 Inspiration

Research these for design patterns:
- **Linear** — clean dashboard, command palette, smooth animations
- **Vercel Dashboard** — stat cards, deployment list, activity feed
- **Midday.ai** — financial dashboard, glassmorphism, beautiful charts
- **Notion** — file browser, sidebar, breadcrumbs
- **Figma** — context menus, collaboration indicators

Make Mohammed proud. 🦊⚡
