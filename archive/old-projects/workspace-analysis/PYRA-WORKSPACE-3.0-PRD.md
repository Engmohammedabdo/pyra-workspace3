# 🏗️ Pyra Workspace 3.0 — Comprehensive Product Requirements Document (PRD)

> **Version:** 3.0
> **Date:** 2026-02-15
> **Author:** Pyramedia AI Architecture Team
> **Target:** Claude Code (AI Developer)
> **Status:** Ready for Implementation
> **Language:** Bilingual (English/Arabic)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current System Analysis](#2-current-system-analysis)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Frontend Design System](#4-frontend-design-system)
5. [UI Component Library](#5-ui-component-library)
6. [Page-by-Page Specifications](#6-page-by-page-specifications)
7. [Backend Architecture & API Design](#7-backend-architecture--api-design)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [File Storage & Management](#9-file-storage--management)
10. [Real-Time & Notifications](#10-real-time--notifications)
11. [Security Hardening](#11-security-hardening)
12. [Database Schema & Migration](#12-database-schema--migration)
13. [Module Migration Map](#13-module-migration-map)
14. [Quote/Invoice System (pyramedia-invoice)](#14-quoteinvoice-system-pyramedia-invoice)
15. [Client Portal System](#15-client-portal-system)
16. [Accessibility & Internationalization](#16-accessibility--internationalization)
17. [Testing Strategy](#17-testing-strategy)
18. [DevOps & Deployment](#18-devops--deployment)
19. [Migration Timeline & Phases](#19-migration-timeline--phases)
20. [Risk Assessment](#20-risk-assessment)
21. [Dependencies & Libraries](#21-dependencies--libraries)
22. [Acceptance Criteria](#22-acceptance-criteria)
23. [**Database-Level Architecture (NEW)**](#23-database-level-architecture) ← `PRD-database-architecture.md`

---

> **📂 PRD Files:**
> | File | Scope |
> |------|-------|
> | `PYRA-WORKSPACE-3.0-PRD.md` | Master PRD (this file) — 22 sections + appendices |
> | `PRD-database-architecture.md` | **Section 23** — Functions, Views, Triggers, FTS, pg_cron |
> | `PRD-backend-security.md` | Deep-dive: Supabase, API mapping, TypeScript types, RLS |
> | `PRD-client-portal.md` | Deep-dive: Portal auth, projects, approvals, comments |
> | `PRD-migration-specs.md` | Deep-dive: 15 modules, testing, CI/CD, timeline, risks |

---

## 1. Executive Summary

### 1.1 What Are We Building?
**Pyra Workspace 3.0** is a complete migration of the existing PHP-based Pyra Workspace file management and client portal system to a modern **Next.js 15** (App Router) + **TypeScript** + **Supabase** stack. The system serves as the core digital workspace for **Pyramedia** — managing files, teams, clients, projects, quotations, and approvals.

### 1.2 Why Migrate?
| Concern | PHP 8 (Current) | Next.js 15 (Target) |
|---------|-----------------|---------------------|
| **Performance** | Full page reloads, blocking PHP | RSC streaming, parallel data fetching |
| **DX** | Vanilla JS (~14,500 LOC), no types | TypeScript, hot reload, code splitting |
| **Security** | Manual CSRF/session mgmt | Supabase Auth + RLS + Middleware |
| **Real-time** | Polling (30s intervals) | Supabase Realtime (WebSocket) |
| **Mobile** | Responsive CSS only | PWA + native gestures + touch-first |
| **Scalability** | Single XAMPP server | Vercel Edge + Supabase global CDN |
| **Code Quality** | No testing, manual bundling | Vitest + Playwright + CI/CD |

### 1.3 Key Decision: Supabase Stays
The database **does not change**. All 22 existing Supabase PostgreSQL tables remain intact. The migration is **frontend + middleware only** — PHP is replaced by Next.js API Routes and Server Actions.

### 1.4 Migration Feasibility: **85%+**
- ✅ Database: Zero migration needed (already Supabase)
- ✅ Storage: Same Supabase Storage bucket
- ✅ 70+ API endpoints: Direct mapping to Next.js Route Handlers
- ✅ UI: Complete redesign with shadcn/ui + Magic UI
- ⚠️ PHP session management → Supabase Auth (moderate effort)
- ⚠️ Custom RBAC → Supabase RLS (requires careful policy writing)

### 1.5 Target Users
| User Type | Access | Key Features |
|-----------|--------|--------------|
| **Admin** | Full dashboard | File management, user CRUD, team CRUD, quotes, settings |
| **Employee** | Scoped dashboard | File access per permissions, reviews, uploads |
| **Client** | Portal only | View projects, approve files, sign quotes, comments |

### 1.6 Estimated Timeline
| Phase | Duration | Scope |
|-------|----------|-------|
| Phase 1: Foundation | 2 weeks | Auth, Layout, File Explorer |
| Phase 2: Core Modules | 2 weeks | Users, Teams, Permissions, Reviews |
| Phase 3: Client Portal | 2 weeks | Portal auth, projects, approvals, comments |
| Phase 4: Quotation System | 1 week | Quote builder, PDF generation, e-signature |
| Phase 5: Polish & Deploy | 1 week | Testing, PWA, i18n, deployment |
| **Total** | **8 weeks** | Full feature parity + enhancements |

---

## 2. Current System Analysis

### 2.1 Codebase Statistics
| Metric | Value |
|--------|-------|
| Total Lines of Code | ~14,493 |
| Primary Language | PHP 8.0+ |
| Frontend | Vanilla JavaScript (ES6+) |
| CSS | Custom CSS (~7,900 lines across 2 files) |
| Database | Supabase PostgreSQL (22 tables) |
| Storage | Supabase Object Storage |
| API Pattern | Single-file switch-case (`api.php` ~2,618 lines) |

### 2.2 File Inventory
```
Pyra-workspace2/
├── index.php              (285 lines)  — Admin SPA shell
├── api/api.php            (2,618 lines) — All admin API endpoints
├── includes/auth.php      (1,714 lines) — Auth, RBAC, helpers
├── js/app.js              (5,329 lines) — Admin frontend controller
├── css/style.css          (4,828 lines) — Admin styles
├── portal/
│   ├── index.php          (1,282 lines) — Client portal shell + API
│   ├── portal-app.js      (2,655 lines) — Portal frontend controller
│   └── portal-style.css   (3,079 lines) — Portal styles
├── database/
│   ├── schema.sql         — Core tables (14 tables)
│   ├── portal-schema.sql  — Portal tables (6 tables)
│   └── migration_quotes.sql — Quote tables (2 tables)
└── share.php              — Public share link handler
```

### 2.3 Database Tables (22 Total)
**Core Tables (14):**
1. `pyra_users` — User accounts (admin/employee)
2. `pyra_reviews` — File comments and approvals
3. `pyra_trash` — Soft-deleted files
4. `pyra_activity_log` — Audit trail
5. `pyra_notifications` — Internal notifications
6. `pyra_share_links` — Public file share tokens
7. `pyra_teams` — Team groups
8. `pyra_team_members` — Team membership
9. `pyra_file_permissions` — File-level access control
10. `pyra_file_versions` — File version history
11. `pyra_file_index` — Search index
12. `pyra_settings` — App configuration (K/V)
13. `pyra_sessions` — Active session tracking
14. `pyra_login_attempts` — Brute-force protection log

**Portal Tables (6):**
15. `pyra_clients` — Client accounts
16. `pyra_projects` — Client projects
17. `pyra_project_files` — Project ↔ File mappings
18. `pyra_file_approvals` — File approval workflow
19. `pyra_client_comments` — Client ↔ Team messaging
20. `pyra_client_notifications` — Client notifications

**Quote Tables (2):**
21. `pyra_quotes` — Quotations/invoices
22. `pyra_quote_items` — Quote line items

### 2.4 Feature Modules (14)
1. **File Manager** — Upload, browse, rename, delete, download, preview
2. **User Management** — CRUD users with role-based access
3. **Team Management** — Create teams, assign members, team permissions
4. **RBAC (Permissions)** — Path-based and per-folder permissions
5. **File Reviews** — Comments, approvals, threaded discussions
6. **Notifications** — Real-time alerts for file/review actions
7. **Activity Log** — Comprehensive audit trail
8. **File Versioning** — Automatic version snapshots, restore
9. **Trash / Recycle Bin** — Soft delete with auto-purge (30 days)
10. **Share Links** — Token-based public file sharing
11. **Search** — Deep file search with indexed content
12. **Settings** — App configuration, themes, branding
13. **Client Portal** — Separate portal for client access
14. **Quotation System** — Quote builder, PDF generation, e-signatures

---

## 3. High-Level Architecture

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Vercel Edge Network                  │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Next.js 15 (App Router)                │ │
│  │  ┌──────────┐  ┌────────────┐  ┌────────────────┐  │ │
│  │  │ Middleware│  │ Server     │  │ Client         │  │ │
│  │  │ (Auth,   │  │ Components │  │ Components     │  │ │
│  │  │  i18n,   │  │ (RSC)      │  │ (Interactive)  │  │ │
│  │  │  RLS)    │  │            │  │                │  │ │
│  │  └──────────┘  └────────────┘  └────────────────┘  │ │
│  │        ↓              ↓               ↓             │ │
│  │  ┌─────────────────────────────────────────────────┐│ │
│  │  │           API Route Handlers                    ││ │
│  │  │  /api/files  /api/users  /api/quotes  /api/...  ││ │
│  │  └─────────────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS
┌──────────────────────────┼──────────────────────────────┐
│                    Supabase Platform                      │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────┐ │
│  │PostgreSQL│  │  Storage   │  │   Auth   │  │Realtime│ │
│  │22 Tables │  │ (Buckets)  │  │(JWT/PKCE)│  │   WS   │ │
│  │   + RLS  │  │            │  │          │  │        │ │
│  └──────────┘  └───────────┘  └──────────┘  └────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Framework** | Next.js | 15.x | App Router, RSC, Server Actions |
| **Language** | TypeScript | 5.6+ | Type safety across entire codebase |
| **Styling** | Tailwind CSS | 4.x | Utility-first CSS with JIT |
| **Components** | shadcn/ui | Latest | Base component library (82K+ ⭐) |
| **Animations** | Magic UI | Latest | Premium animated components (18K+ ⭐) |
| **Animations** | Framer Motion | 12.x | Complex animation sequences |
| **Effects** | Aceternity UI | Latest | Background effects, spotlights |
| **State** | TanStack Query | 5.x | Server state management + caching |
| **Forms** | React Hook Form + Zod | 7.x / 4.x | Form management + validation |
| **Database** | Supabase | Latest | PostgreSQL + Auth + Storage + Realtime |
| **PDF** | jsPDF | 4.1+ | Pixel-perfect PDF generation |
| **Signatures** | react-signature-canvas | 1.1.x | E-signature capture |
| **Icons** | Lucide React | Latest | Consistent icon system |
| **Fonts** | DM Sans + JetBrains Mono | — | UI + monospace numbers |
| **Testing** | Vitest + Playwright | Latest | Unit + E2E testing |
| **Deployment** | Vercel | — | Edge deployment + CDN |

### 3.3 Project Structure

```
pyra-workspace-3/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx              — Admin layout (sidebar + topbar)
│   │   ├── page.tsx                — Dashboard home
│   │   ├── files/
│   │   │   ├── page.tsx            — File Explorer
│   │   │   └── [...path]/page.tsx  — Nested file browsing
│   │   ├── users/page.tsx          — User management
│   │   ├── teams/page.tsx          — Team management
│   │   ├── permissions/page.tsx    — Permission manager
│   │   ├── reviews/page.tsx        — Review center
│   │   ├── quotes/
│   │   │   ├── page.tsx            — Quotes list
│   │   │   ├── new/page.tsx        — Quote builder
│   │   │   └── [id]/page.tsx       — Quote detail/edit
│   │   ├── clients/page.tsx        — Client management
│   │   ├── projects/page.tsx       — Project management
│   │   ├── notifications/page.tsx
│   │   ├── activity/page.tsx
│   │   ├── trash/page.tsx
│   │   └── settings/page.tsx
│   ├── portal/
│   │   ├── layout.tsx              — Client portal layout
│   │   ├── login/page.tsx          — Client login
│   │   ├── page.tsx                — Client dashboard
│   │   ├── projects/
│   │   │   ├── page.tsx            — Client projects list
│   │   │   └── [id]/page.tsx       — Project detail
│   │   ├── quotes/
│   │   │   ├── page.tsx            — Client quotes list
│   │   │   └── [id]/page.tsx       — Quote detail + signature
│   │   ├── notifications/page.tsx
│   │   └── profile/page.tsx
│   ├── share/[token]/page.tsx      — Public share link handler
│   ├── api/
│   │   ├── auth/[...route]/route.ts
│   │   ├── files/route.ts
│   │   ├── files/upload/route.ts
│   │   ├── files/[...path]/route.ts
│   │   ├── users/route.ts
│   │   ├── teams/route.ts
│   │   ├── reviews/route.ts
│   │   ├── quotes/route.ts
│   │   ├── quotes/[id]/route.ts
│   │   ├── notifications/route.ts
│   │   ├── trash/route.ts
│   │   ├── settings/route.ts
│   │   ├── portal/auth/route.ts
│   │   ├── portal/projects/route.ts
│   │   ├── portal/quotes/route.ts
│   │   └── portal/quotes/[id]/sign/route.ts
│   ├── layout.tsx                  — Root layout (fonts, metadata)
│   └── globals.css
├── components/
│   ├── ui/                         — shadcn/ui primitives
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── dialog.tsx
│   │   ├── data-table.tsx
│   │   ├── command.tsx
│   │   └── ... (50+ components)
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Topbar.tsx
│   │   ├── Breadcrumb.tsx
│   │   └── MobileNav.tsx
│   ├── files/
│   │   ├── FileExplorer.tsx
│   │   ├── FileGrid.tsx
│   │   ├── FileList.tsx
│   │   ├── FilePreview.tsx
│   │   ├── FileUpload.tsx
│   │   └── FileContextMenu.tsx
│   ├── quotes/
│   │   ├── QuoteBuilder.tsx
│   │   ├── QuotePreview.tsx
│   │   ├── QuoteItemsTable.tsx
│   │   ├── QuotePdfGenerator.tsx
│   │   └── SignaturePad.tsx
│   ├── portal/
│   │   ├── PortalSidebar.tsx
│   │   ├── ProjectCard.tsx
│   │   ├── FileApproval.tsx
│   │   └── ClientSignature.tsx
│   ├── magicui/                    — Magic UI effects
│   │   ├── animated-beam.tsx
│   │   ├── globe.tsx
│   │   ├── dock.tsx
│   │   └── particles.tsx
│   └── shared/
│       ├── DataTable.tsx
│       ├── StatusBadge.tsx
│       ├── EmptyState.tsx
│       ├── LoadingSkeleton.tsx
│       └── ConfirmDialog.tsx
├── lib/
│   ├── supabase/
│   │   ├── server.ts               — Server-side Supabase client
│   │   ├── client.ts               — Browser Supabase client
│   │   └── middleware.ts            — Middleware Supabase client
│   ├── auth/
│   │   ├── guards.ts               — requireAuth, requireAdmin
│   │   └── permissions.ts          — RBAC logic
│   ├── pdf/
│   │   ├── generateQuotePdf.ts     — jsPDF quote generator
│   │   └── logoData.ts             — Base64 encoded logo
│   └── utils/
│       ├── path.ts                 — Path sanitization
│       ├── id.ts                   — ID generation helpers
│       └── format.ts               — Date, currency formatters
├── hooks/
│   ├── useFiles.ts
│   ├── useAuth.ts
│   ├── useRealtime.ts
│   ├── usePermissions.ts
│   └── useQuotes.ts
├── types/
│   ├── database.ts                 — All 22 table types
│   ├── api.ts                      — API request/response types
│   └── forms.ts                    — Form schema types
├── middleware.ts                    — Auth + locale + redirect
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### 3.4 Supabase Client Architecture

#### Server-Side Client Factory
```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch { /* Server Component — ignored */ }
        },
      },
    }
  );
}

// Admin client for privileged operations (bypasses RLS)
export function createServiceRoleClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
    }
  );
}
```

#### Client-Side Client Factory
```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

#### Middleware Client Factory
```typescript
// lib/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export function createMiddlewareSupabaseClient(
  request: NextRequest,
  response: NextResponse
) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );
}
```

---

## 4. Frontend Design System

### 4.1 Design Principles
1. **Brand First** — PYRAMEDIA X orange (#E87A2E) as accent, dark charcoal (#2D2D2D) as primary
2. **Arabic-First RTL** — Full RTL support with `dir="rtl"` and logical CSS properties
3. **Glass Morphism** — Translucent panels with backdrop-blur on dark backgrounds
4. **Micro-Animations** — Framer Motion for page transitions, Magic UI for ambient effects
5. **Accessibility** — WCAG 2.1 AA compliance, keyboard navigation, screen reader support

### 4.2 Color System

```css
/* Pyra Theme Tokens */
--pyra-orange: #E87A2E;
--pyra-orange-light: #FF9A4E;
--pyra-orange-dark: #C56520;
--pyra-dark: #2D2D2D;
--pyra-charcoal: #1A1A2E;
--pyra-gray: #666666;
--pyra-light-gray: #999999;
--pyra-border: #E2E8F0;
--pyra-bg: #FAFAFA;
--pyra-bg-dark: #0F0F1A;
--pyra-success: #22C55E;
--pyra-warning: #F59E0B;
--pyra-error: #EF4444;
--pyra-info: #3B82F6;
```

### 4.3 Typography

| Use | Font | Weight | Size |
|-----|------|--------|------|
| Headings (EN) | DM Sans | 600-700 | 18-32px |
| Headings (AR) | Noto Kufi Arabic | 600-700 | 18-32px |
| Body text | DM Sans / Noto Sans Arabic | 400-500 | 14-16px |
| Monospace (numbers, code) | JetBrains Mono | 400-500 | 12-14px |
| Captions | DM Sans | 400 | 11-12px |

### 4.4 Spacing & Layout Grid

- Base unit: `4px`
- Container max-width: `1440px`
- Sidebar width: `280px` (collapsed: `72px`)
- Content padding: `24px` (mobile: `16px`)
- Card border-radius: `12px`
- Input border-radius: `8px`

### 4.5 Dark Mode

Full dark mode support via `next-themes`:
- **Light**: White backgrounds, charcoal text, orange accents
- **Dark**: Deep navy (#0F0F1A) backgrounds, light text, orange accents preserved
- Stored in localStorage, respects system preference
- Transition: `transition-colors duration-200`

---

## 5. UI Component Library

### 5.1 Base Components (shadcn/ui)

All components from shadcn/ui with Pyra theme customization:

| Component | Use Case | Pyra Customization |
|-----------|----------|-------------------|
| `Button` | All actions | Orange primary, ghost for secondary |
| `Input` | Form fields | Rounded-lg, Arabic RTL support |
| `Select` | Dropdowns | Custom arrow, RTL-aware |
| `Dialog` | Modals | Backdrop blur, slide-up animation |
| `Sheet` | Side panels | Used for mobile nav + file preview |
| `Tabs` | Section switching | Orange underline indicator |
| `Table` | Data display | Sticky header, zebra rows |
| `Command` | Search palette | Ctrl+K command menu |
| `DropdownMenu` | Context menus | Right-click file actions |
| `Toast/Sonner` | Notifications | Top-center, Pyra branded |
| `Tooltip` | Hover hints | Dark bg, arrow pointer |
| `Badge` | Status labels | Color-coded per status |
| `Card` | Content containers | Glass effect variant |
| `Skeleton` | Loading states | Pulse animation |
| `Separator` | Visual dividers | Subtle gray line |
| `Switch` | Toggle settings | Orange when active |
| `Checkbox` | Multi-select | Orange check mark |
| `Avatar` | User photos | Fallback with initials |
| `Progress` | Upload progress | Orange fill |
| `ScrollArea` | Scrollable containers | Custom scrollbar |

### 5.2 Magic UI Components

| Component | Use Case |
|-----------|----------|
| `AnimatedBeam` | Data flow visualization on dashboard |
| `Globe` | Login page background (global reach) |
| `Dock` | macOS-style navigation dock |
| `Particles` | Ambient background effect |
| `BorderBeam` | Active card highlight |
| `MagicCard` | Dashboard stat cards with hover effect |
| `ShimmerButton` | Primary CTA buttons |
| `TextReveal` | Hero text animations |
| `NumberTicker` | Animated stat counters |
| `Marquee` | Scrolling file/project list |

### 5.3 Aceternity UI Effects

| Effect | Use Case |
|--------|----------|
| `SpotlightCard` | Feature highlight cards |
| `BackgroundBeams` | Portal login background |
| `MovingBorder` | Active state indicators |
| `TextGenerateEffect` | Welcome message animation |
| `HoverBorderGradient` | Interactive card borders |

### 5.4 Custom Pyra Components

| Component | Description |
|-----------|------------|
| `PyramediaLogo` | SVG/PNG logo with size variants (sm/md/lg) |
| `FileExplorer` | Grid/List file browser with drag-drop |
| `FilePreview` | Multi-type file preview (images, PDF, video, code) |
| `QuoteBuilder` | Full quotation builder (Section 14) |
| `SignaturePad` | Canvas-based signature capture (Section 14) |
| `StatusBadge` | Dynamic status indicator with colors |
| `RichTextEditor` | Markdown editor for notes/descriptions |
| `DatePickerAr` | Arabic date picker with Hijri support |
| `CurrencyInput` | AED/SAR formatted currency input |
| `UserAvatar` | Avatar with online status indicator |
| `PermissionTree` | Visual permission tree editor |
| `ActivityTimeline` | Chronological activity display |

---

## 6. Page-by-Page Specifications

### 6.1 Login Page (`/login`)
- **Layout**: Full screen, split design (form left, branding right)
- **Background**: Aceternity BackgroundBeams or Magic UI Globe
- **Form**: Email + Password + "Remember Me" + "Forgot Password"
- **Branding**: Pyramedia logo, tagline, version number
- **Security**: Rate limiting, CAPTCHA after 5 failed attempts
- **Animation**: Framer Motion entrance (slide-up form, fade-in background)

### 6.2 Dashboard (`/`)
- **Layout**: Sidebar + Topbar + Content area
- **Cards**:
  - Total files (NumberTicker animation)
  - Active projects (with trend indicator)
  - Pending approvals (urgent count)
  - Storage usage (Progress bar)
  - Recent activity (Timeline)
  - Quick actions (Dock)
- **Charts**: Recharts for upload trends, storage breakdown
- **Real-time**: Live notification counter, activity stream

### 6.3 File Explorer (`/files`)
- **Layout**: Breadcrumb trail + Toolbar + File grid/list
- **Views**: Grid (thumbnails) / List (detailed) / Kanban (by type)
- **Actions**: Upload (drag-drop), New Folder, Search, Sort, Filter
- **Preview**: Sheet panel with file preview, metadata, versions, reviews
- **Context Menu**: DropdownMenu with: Open, Download, Share, Rename, Move, Delete, History
- **Drag & Drop**: Native HTML5 drag for upload + react-dnd for move/organize
- **Keyboard**: Arrow keys navigation, Enter to open, Delete to trash, Ctrl+C/V for copy/paste

### 6.4 Quote Builder (`/quotes/new` or `/quotes/[id]`)
- **Full specification in Section 14**
- **Layout**: White paper design matching PDF output
- **Real-time**: Auto-save draft every 30 seconds
- **PDF**: jsPDF pixel-perfect generation

### 6.5 Client Portal (`/portal/*`)
- **Full specification in Section 15**
- **Layout**: Simplified sidebar (fewer items than admin)
- **Theme**: Matching Pyra branding, glass morphism cards

---

## 7. Backend Architecture & API Design

### 7.1 API Route Handlers — Complete Mapping

Total: **88 endpoints** (66 admin API + 22 portal API)

#### Group 1: Authentication (`/api/auth/*`)
| Current PHP | HTTP | New Next.js Route | Description |
|-------------|------|-------------------|-------------|
| `action=login` | POST | `/api/auth/login` | Admin/employee login |
| `action=logout` | POST | `/api/auth/logout` | Destroy session |
| `action=session` | GET | `/api/auth/session` | Check auth state |
| `action=getPublicSettings` | GET | `/api/auth/public-settings` | Public branding |
| `action=getSessions` | GET | `/api/auth/sessions` | Active sessions list |
| `action=terminateSession` | POST | `DELETE /api/auth/sessions/[id]` | Kill session |
| `action=terminateAllSessions` | POST | `DELETE /api/auth/sessions` | Kill all |
| `action=getLoginHistory` | GET | `/api/auth/login-history` | Login log |

#### Group 2: Files (`/api/files/*`)
| Current PHP | HTTP | New Next.js Route | Description |
|-------------|------|-------------------|-------------|
| `action=list` | GET | `/api/files?prefix=...` | List files in folder |
| `action=upload` | POST | `/api/files/upload` | Upload file(s) |
| `action=delete` | POST | `DELETE /api/files/[...path]` | Move to trash |
| `action=deleteBatch` | POST | `/api/files/delete-batch` | Batch trash |
| `action=rename` | POST | `PATCH /api/files/[...path]` | Rename/move |
| `action=content` | GET | `/api/files/[...path]/content` | Get content |
| `action=save` | POST | `PUT /api/files/[...path]/content` | Save content |
| `action=createFolder` | POST | `/api/files/folders` | New folder |
| `action=proxy` | GET | `/api/files/[...path]/proxy` | Proxy with MIME |
| `action=download` | GET | `/api/files/[...path]/download` | Download |
| `action=publicUrl` | GET | `/api/files/[...path]/public-url` | Public URL |
| `action=deepSearch` | GET | `/api/files/search?q=...` | Search files |
| `action=rebuildIndex` | POST | `/api/files/reindex` | Rebuild index |

#### Group 3: Versions (`/api/files/versions/*`)
| Current PHP | HTTP | New Next.js Route |
|-------------|------|-------------------|
| `action=getFileVersions` | GET | `/api/files/[...path]/versions` |
| `action=restoreVersion` | POST | `/api/files/versions/[id]/restore` |
| `action=deleteVersion` | POST | `DELETE /api/files/versions/[id]` |

#### Group 4: Share Links (`/api/shares/*`)
| Current PHP | HTTP | New Next.js Route |
|-------------|------|-------------------|
| `action=createShareLink` | POST | `/api/shares` |
| `action=getShareLinks` | GET | `/api/shares?path=...` |
| `action=deactivateShareLink` | POST | `PATCH /api/shares/[id]` |
| `action=shareAccess` | GET | `/api/shares/download/[token]` |

#### Group 5: Reviews (`/api/reviews/*`)
| Current PHP | HTTP | New Next.js Route |
|-------------|------|-------------------|
| `action=getReviews` | GET | `/api/reviews?path=...` |
| `action=addReview` | POST | `/api/reviews` |
| `action=resolveReview` | POST | `PATCH /api/reviews/[id]/resolve` |
| `action=deleteReview` | POST | `DELETE /api/reviews/[id]` |

#### Group 6: Users (`/api/users/*`)
| Current PHP | HTTP | New Next.js Route |
|-------------|------|-------------------|
| `action=getUsers` | GET | `/api/users` |
| `action=getUsersLite` | GET | `/api/users/lite` |
| `action=addUser` | POST | `/api/users` |
| `action=updateUser` | POST | `PATCH /api/users/[username]` |
| `action=deleteUser` | POST | `DELETE /api/users/[username]` |
| `action=changePassword` | POST | `/api/users/[username]/password` |

#### Group 7: Teams (`/api/teams/*`)
| Current PHP | HTTP | New Next.js Route |
|-------------|------|-------------------|
| `action=getTeams` | GET | `/api/teams` |
| `action=createTeam` | POST | `/api/teams` |
| `action=updateTeam` | POST | `PATCH /api/teams/[id]` |
| `action=deleteTeam` | POST | `DELETE /api/teams/[id]` |
| `action=addTeamMember` | POST | `/api/teams/[id]/members` |
| `action=removeTeamMember` | POST | `DELETE /api/teams/[id]/members/[username]` |

#### Group 8-17: Additional Endpoints
| Group | Route Pattern | Endpoints |
|-------|--------------|-----------|
| Permissions | `/api/permissions/*` | 4 endpoints |
| Notifications | `/api/notifications/*` | 4 endpoints |
| Activity | `/api/activity` | 1 endpoint |
| Trash | `/api/trash/*` | 5 endpoints |
| Dashboard | `/api/dashboard` | 1 endpoint |
| Favorites | `/api/favorites` | 3 endpoints |
| Settings | `/api/settings` | 2 endpoints |
| Quotes | `/api/quotes/*` | 8 endpoints |
| Clients | `/api/clients/*` | 4 endpoints |
| Projects | `/api/projects/*` | 7 endpoints |

#### Group 18: Portal API (`/api/portal/*`)
| Current PHP | HTTP | New Next.js Route |
|-------------|------|-------------------|
| `action=client_login` | POST | `/api/portal/auth/login` |
| `action=client_logout` | POST | `/api/portal/auth/logout` |
| `action=client_session` | GET | `/api/portal/auth/session` |
| `action=client_dashboard` | GET | `/api/portal/dashboard` |
| `action=client_projects` | GET | `/api/portal/projects` |
| `action=client_project_detail` | GET | `/api/portal/projects/[id]` |
| `action=client_file_preview` | GET | `/api/portal/files/[id]/preview` |
| `action=client_download` | GET | `/api/portal/files/[id]/download` |
| `action=client_approve_file` | POST | `/api/portal/files/[id]/approve` |
| `action=client_request_revision` | POST | `/api/portal/files/[id]/revision` |
| `action=client_quotes` | GET | `/api/portal/quotes` |
| `action=client_quote_detail` | GET | `/api/portal/quotes/[id]` |
| `action=client_sign_quote` | POST | `/api/portal/quotes/[id]/sign` |
| + 9 more | — | Notifications, profile, comments, password |

### 7.2 Server Actions vs API Routes

**Use Server Actions for:**
- Simple mutations (toggle favorite, resolve review, mark notification read)
- Form submissions (add review, update profile)
- Operations requiring `revalidatePath()`

**Use API Routes for:**
- Binary data (file upload/download)
- Streaming responses
- Complex multi-step operations
- Webhook endpoints
- Operations called from client-side hooks (TanStack Query)

### 7.3 Data Fetching Patterns

```typescript
// Server Components: Direct Supabase queries
export default async function FilesPage({ searchParams }) {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const { data: files } = await supabase.storage
    .from('pyraai-workspace')
    .list(path);
  return <FileExplorer initialFiles={files} />;
}

// Client Components: TanStack Query
export function useFiles(prefix: string) {
  return useQuery({
    queryKey: ['files', prefix],
    queryFn: () => fetch(`/api/files?prefix=${prefix}`).then(r => r.json()),
    staleTime: 30_000,
  });
}

// Optimistic Updates
export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path) => fetch('/api/favorites', { method: 'POST', body: JSON.stringify({ path }) }),
    onMutate: async ({ path }) => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] });
      // Optimistically update
    },
  });
}
```

---

## 8. Authentication & Authorization

### 8.1 Auth Migration: PHP Sessions → Supabase Auth

| Feature | Current (PHP) | Target (Supabase Auth) |
|---------|--------------|----------------------|
| Session storage | `$_SESSION` on server | JWT in httpOnly cookies |
| CSRF protection | Manual token in header | Built-in with Supabase SSR |
| Password hashing | `password_hash()` bcrypt | Supabase Auth `bcrypt` |
| Rate limiting | `pyra_login_attempts` + `usleep()` | Supabase + custom middleware |
| Multi-session | `pyra_sessions` table | Supabase Auth sessions |
| Role storage | `pyra_users.role` | Custom claims in JWT metadata |

### 8.2 Middleware Auth Flow

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createMiddlewareSupabaseClient(request, response);

  const { data: { user } } = await supabase.auth.getUser();

  // Protect dashboard routes
  if (request.nextUrl.pathname.startsWith('/dashboard') && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Protect portal routes
  if (request.nextUrl.pathname.startsWith('/portal') &&
      !request.nextUrl.pathname.startsWith('/portal/login')) {
    // Check client auth
    const { data: client } = await supabase
      .from('pyra_clients')
      .select('id')
      .eq('id', user?.user_metadata?.client_id)
      .single();

    if (!client) {
      return NextResponse.redirect(new URL('/portal/login', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/portal/:path*', '/api/:path*'],
};
```

### 8.3 Role-Based Access Control (RBAC)

```typescript
// lib/auth/guards.ts
export async function requireAuth() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pyraUser } = await supabase
    .from('pyra_users')
    .select('*')
    .eq('username', user.user_metadata.username)
    .single();

  return { user, pyraUser };
}

export async function requireAdmin() {
  const { pyraUser } = await requireAuth();
  if (pyraUser.role !== 'admin') {
    throw new Error('Admin access required');
  }
  return pyraUser;
}

export async function requirePermission(path: string, action: string) {
  const { pyraUser } = await requireAuth();
  const hasPermission = await checkPathPermission(pyraUser, path, action);
  if (!hasPermission) throw new Error('Permission denied');
  return pyraUser;
}
```

### 8.4 Supabase Row Level Security (RLS)

```sql
-- Example RLS policies for pyra_quotes
ALTER TABLE pyra_quotes ENABLE ROW LEVEL SECURITY;

-- Admin can see all quotes
CREATE POLICY "admin_all_quotes" ON pyra_quotes
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'admin'
  );

-- Client can see their own quotes (non-draft)
CREATE POLICY "client_own_quotes" ON pyra_quotes
  FOR SELECT USING (
    client_id = auth.jwt() ->> 'client_id'
    AND status != 'draft'
  );

-- Client can update signature on their quotes
CREATE POLICY "client_sign_quote" ON pyra_quotes
  FOR UPDATE USING (
    client_id = auth.jwt() ->> 'client_id'
    AND status IN ('sent', 'viewed')
  )
  WITH CHECK (
    signature_data IS NOT NULL
  );
```

---

## 9. File Storage & Management

### 9.1 Supabase Storage Configuration

```typescript
// Storage bucket: pyraai-workspace (already exists)
// Structure:
// pyraai-workspace/
// ├── {team_id}/
// │   ├── files/           — Main file storage
// │   ├── .trash/          — Soft-deleted files
// │   ├── .versions/       — File version history
// │   └── projects/        — Project-organized files
// └── avatars/             — User profile pictures
```

### 9.2 Upload Pipeline

```typescript
// app/api/files/upload/route.ts
export async function POST(request: NextRequest) {
  const session = await requireAuth();
  const formData = await request.formData();
  const prefix = sanitizePath(formData.get('prefix') as string);
  const files = formData.getAll('file') as File[];

  // Permission check
  if (!(await canWritePath(prefix, session.user))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  const results = [];

  for (const file of files) {
    const safeName = sanitizeFileName(file.name);
    const filePath = prefix ? `${prefix}/${safeName}` : safeName;

    // Create version backup if file exists
    await createVersionIfExists(supabase, filePath, session.user);

    // Upload
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await supabase.storage
      .from('pyraai-workspace')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
        cacheControl: '3600',
      });

    // Index for search
    await updateFileIndex(supabase, filePath, file);

    // Log activity
    await logActivity(supabase, 'upload', session.user, filePath);

    results.push({ success: !error, path: filePath });
  }

  return NextResponse.json({ success: true, results });
}
```

### 9.3 File Preview System

| File Type | Preview Method |
|-----------|---------------|
| Images | `<img>` with Supabase public URL |
| PDF | `<iframe>` or react-pdf |
| Video | `<video>` with HLS.js for streaming |
| Audio | `<audio>` with waveform (wavesurfer.js) |
| Code | Syntax-highlighted with Shiki |
| Text | Rendered in monospace div |
| Office | Google Docs Viewer embed |

---

## 10. Real-Time & Notifications

### 10.1 Supabase Realtime Integration

```typescript
// hooks/useRealtime.ts
import { useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export function useRealtimeNotifications(userId: string) {
  const supabase = createBrowserSupabaseClient();

  useEffect(() => {
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'pyra_notifications',
        filter: `recipient_username=eq.${userId}`,
      }, (payload) => {
        // Show toast notification
        toast(payload.new.title, {
          description: payload.new.message,
          action: { label: 'عرض', onClick: () => navigate(payload.new.target_path) },
        });
        // Update notification count
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);
}
```

### 10.2 Notification Types

| Type | Trigger | Recipients |
|------|---------|-----------|
| `upload` | File uploaded | Folder watchers |
| `comment` | Review added | File owner + reviewers |
| `reply` | Reply to comment | Original commenter |
| `approval` | File approved/rejected | File owner |
| `quote_sent` | Quote sent to client | Client |
| `quote_signed` | Quote signed | Admin/creator |
| `team` | Team membership change | Affected user |
| `permission` | Permission changed | Affected user |
| `mention` | @mentioned in comment | Mentioned user |

---

## 11. Security Hardening

### 11.1 Security Layers

| Layer | Implementation |
|-------|---------------|
| **Transport** | HTTPS only (Vercel enforced) |
| **Auth** | Supabase Auth with PKCE flow |
| **CSRF** | Built-in with Supabase SSR cookies |
| **XSS** | React auto-escaping + CSP headers |
| **SQL Injection** | Supabase parameterized queries |
| **Path Traversal** | `sanitizePath()` utility |
| **File Name** | `sanitizeFileName()` removes dangerous chars |
| **Rate Limiting** | Middleware + Supabase rate limits |
| **RLS** | Row Level Security on all tables |
| **CORS** | Next.js API route CORS configuration |
| **Brute Force** | Account lockout after 5 failed attempts |
| **Session** | httpOnly, Secure, SameSite=Strict cookies |

### 11.2 Content Security Policy

```typescript
// next.config.ts
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      `img-src 'self' data: blob: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`,
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL} wss://*.supabase.co`,
    ].join('; '),
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];
```

### 11.3 Path & File Sanitization

```typescript
// lib/utils/path.ts
export function sanitizePath(input: string): string {
  return input
    .replace(/\.\./g, '')           // Remove path traversal
    .replace(/^\/+/, '')            // Remove leading slashes
    .replace(/\/+/g, '/')           // Normalize multiple slashes
    .replace(/[<>:"|?*\x00-\x1f]/g, '') // Remove illegal chars
    .trim();
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.{2,}/g, '.')
    .substring(0, 255)
    .trim();
}
```

---

## 12. Database Schema & Migration

### 12.1 Migration Strategy: Zero Downtime

The key insight: **The database doesn't change.** All 22 Supabase PostgreSQL tables remain exactly as they are. The migration is purely:

1. PHP session management → Supabase Auth (new `auth.users` table)
2. PHP CSRF tokens → Supabase SSR cookie handling
3. PHP API endpoints → Next.js Route Handlers
4. PHP HTML rendering → React Server Components

### 12.2 New Tables Required

Only **one new table** is needed for the migration:

```sql
-- Map Supabase Auth users to existing pyra_users
CREATE TABLE pyra_auth_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    pyra_username TEXT NOT NULL REFERENCES pyra_users(username) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(auth_user_id),
    UNIQUE(pyra_username)
);
```

### 12.3 RLS Policies for All Tables

```sql
-- Enable RLS on all tables
ALTER TABLE pyra_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_trash ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_file_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_file_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_file_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_client_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_client_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_quote_items ENABLE ROW LEVEL SECURITY;

-- Admin full access on all tables
CREATE POLICY "admin_full_access" ON pyra_users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pyra_auth_mapping am
      JOIN pyra_users u ON u.username = am.pyra_username
      WHERE am.auth_user_id = auth.uid() AND u.role = 'admin'
    )
  );
-- ... (similar policies for each table)
```

### 12.4 TypeScript Type Definitions

```typescript
// types/database.ts — All 22 tables typed
export interface PyraUser {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'employee' | 'client';
  display_name: string;
  permissions: UserPermissions;
  created_at: string;
}

export interface PyraQuote {
  id: string;
  quote_number: string;
  team_id: string;
  client_id: string | null;
  project_name: string | null;
  status: 'draft' | 'sent' | 'viewed' | 'signed' | 'expired' | 'cancelled';
  estimate_date: string;
  expiry_date: string | null;
  currency: string; // 'AED'
  subtotal: number;
  tax_rate: number; // 5
  tax_amount: number;
  total: number;
  notes: string | null;
  terms_conditions: TermCondition[];
  bank_details: BankDetails;
  company_name: string | null;
  company_logo: string | null;
  client_name: string | null;
  client_email: string | null;
  client_company: string | null;
  client_phone: string | null;
  client_address: string | null;
  signature_data: string | null;
  signed_by: string | null;
  signed_at: string | null;
  signed_ip: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PyraQuoteItem {
  id: string;
  quote_id: string;
  sort_order: number;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  created_at: string;
}

// ... (all 22 table interfaces — see PRD-backend-security.md for complete list)
```

---

## 13. Module Migration Map

### 13.1 Module-by-Module Migration

| # | Module | PHP Files | Next.js Target | Complexity | Priority |
|---|--------|-----------|----------------|------------|----------|
| 1 | **Auth** | auth.php (1714 LOC) | middleware.ts + Supabase Auth | 🟡 Medium | P0 |
| 2 | **File Manager** | api.php + app.js | /files/* + FileExplorer | 🔴 High | P0 |
| 3 | **User MGMT** | api.php + app.js | /users/* + UserTable | 🟢 Low | P1 |
| 4 | **Team MGMT** | api.php + app.js | /teams/* + TeamEditor | 🟢 Low | P1 |
| 5 | **RBAC** | auth.php + api.php | /permissions + RLS | 🔴 High | P0 |
| 6 | **Reviews** | api.php + app.js | /reviews + ReviewPanel | 🟡 Medium | P1 |
| 7 | **Notifications** | api.php + app.js | Supabase Realtime + toast | 🟡 Medium | P1 |
| 8 | **Activity Log** | api.php + app.js | /activity + Timeline | 🟢 Low | P2 |
| 9 | **Versioning** | api.php + app.js | /files/versions + VersionPanel | 🟡 Medium | P1 |
| 10 | **Trash** | api.php + app.js | /trash + TrashBin | 🟢 Low | P2 |
| 11 | **Share Links** | share.php + api.php | /share/[token] + ShareDialog | 🟢 Low | P2 |
| 12 | **Search** | api.php + app.js | Command palette + Supabase FTS | 🟡 Medium | P1 |
| 13 | **Settings** | api.php + app.js | /settings + SettingsForm | 🟢 Low | P2 |
| 14 | **Dashboard** | api.php + app.js | / + DashboardCards | 🟡 Medium | P1 |
| 15 | **Client Portal** | portal/*.php/js | /portal/* + PortalLayout | 🔴 High | P1 |
| 16 | **Quotation** | api.php + app.js | /quotes/* + QuoteBuilder | 🟡 Medium | P1 |

### 13.2 Migration Order (Dependency-Based)

```
Phase 1: Foundation
  └── Auth → File Manager → RBAC

Phase 2: Core Features
  └── Users → Teams → Reviews → Notifications → Search → Dashboard

Phase 3: Extended Features
  └── Versioning → Trash → Share Links → Activity Log → Settings

Phase 4: Client-Facing
  └── Client Portal → Quotation System

Phase 5: Enhancement
  └── PWA → i18n → Testing → Deployment
```

---

## 14. Quote/Invoice System (pyramedia-invoice)

### 14.1 Reference Implementation

The **pyramedia-invoice** project (`pyramedia-invoice.zip`) provides a production-quality React + TypeScript quotation generator that serves as the **direct reference implementation** for the Pyra Workspace 3.0 Quote module. Key technologies:

| Component | Technology | Status |
|-----------|-----------|--------|
| UI Components | shadcn/ui (Button, Input, Textarea) | ✅ Ready to adopt |
| Animations | Framer Motion (`AnimatePresence`, `motion`) | ✅ Ready to adopt |
| PDF Engine | jsPDF 4.1 (pixel-perfect drawing) | ✅ Ready to adopt |
| Signatures | react-signature-canvas 1.1.0-alpha.2 | ✅ Ready to adopt |
| Validation | React Hook Form 7.x + Zod 4.x | ✅ Ready to adopt |
| Notifications | Sonner (toast) | ✅ Ready to adopt |
| Icons | Lucide React | ✅ Ready to adopt |
| Fonts | DM Sans + JetBrains Mono | ✅ Ready to adopt |

### 14.2 Quote Builder UI (Admin)

**Route:** `/dashboard/quotes/new` or `/dashboard/quotes/[id]`

**Layout:** White paper design (max-width 900px) centered on gray background, matching the final PDF output.

**Sections (matching reference design):**

1. **Company Header**
   - Logo (PYRAMEDIA X — loaded from Supabase Storage or CDN)
   - Company name: `PYRAMEDIA X`
   - Subtitle: `FOR AI SOLUTIONS`

2. **Client Info** (2-row, 3-column grid)
   - Row 1: Client (dropdown from `pyra_clients`), Email, Address
   - Row 2: Contact Person, Phone
   - Auto-fills when client selected from dropdown

3. **Quote Details** (4-column row)
   - Invoice No: Auto-generated (e.g., `QT-0001`)
   - Estimate Date: Today (auto)
   - Expiry Date: +30 days (editable)
   - Project Name: Text input

4. **Services Table** (dynamic rows)
   - Columns: #, Description, Qty, Rate (AED), Amount
   - Add row button (+ with Framer Motion animation)
   - Remove row button (trash icon, AnimatePresence exit)
   - Auto-calculate: Amount = Qty × Rate
   - Auto-calculate: Subtotal, VAT (5%), Total

5. **Notes** (textarea)
   - Placeholder: "Additional notes or payment instructions..."

6. **Signature Section** (if viewing signed quote)
   - Displayed signature image
   - "Signed by: {name}" + date

7. **Bank Details** (HARDCODED — not editable)
   ```
   Bank: Emirates NBD
   Account Name: Pyramedia Digital Marketing LLC
   Account No: 1012XXXXXXX
   IBAN: AE12 0260 0010 1234 5678 901
   ```

8. **Terms & Conditions** (HARDCODED — 3-column grid)
   ```
   Column 1: "Quotation valid for 30 days from the date of issue."
   Column 2: "50% advance payment required to commence work."
   Column 3: "Balance payment due upon project completion."
   ```

9. **Footer** (HARDCODED — dark background)
   ```
   PYRAMEDIA X — FOR AI SOLUTIONS
   Abu Dhabi, United Arab Emirates
   +971 XX XXX XXXX | info@pyramedia.ae
   www.pyramedia.ae
   ```

**Toolbar Actions:**
- Save Draft
- Save & Send (sends to client, creates notification)
- Generate PDF (jsPDF direct drawing)
- Close

### 14.3 PDF Generation Engine (jsPDF Direct Drawing)

**Critical Decision:** Use **jsPDF direct drawing** (NOT html2canvas). The reference implementation proves this produces pixel-perfect, professional PDFs.

```typescript
// lib/pdf/generateQuotePdf.ts
import jsPDF from 'jspdf';
import { LOGO_BASE64 } from './logoData';

export interface ServiceItem {
  description: string;
  qty: number;
  rate: number;
}

export interface QuoteData {
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  contactPerson: string;
  clientPhone: string;
  quoteNumber: string;
  estimateDate: string;
  expiryDate: string;
  projectName: string;
  services: ServiceItem[];
  notes: string;
  signatureDataUrl: string | null;
}

// Colors matching PYRAMEDIA X brand
const ORANGE = '#E87A2E';
const DARK = '#2D2D2D';
const GRAY = '#666666';
const LIGHT_GRAY = '#999999';
const BORDER = '#DDDDDD';
const BG_LIGHT = '#F8F8F8';

export function generateQuotePdf(data: QuoteData): void {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const marginLeft = 18;
  const marginRight = 18;
  const contentWidth = pageWidth - marginLeft - marginRight;

  let y = 15;

  // ===== LOGO =====
  doc.addImage(LOGO_BASE64, 'PNG', marginLeft, y, 45, 20);

  // ===== CLIENT INFO (3-column grid) =====
  const clientStartX = marginLeft + 52;
  // ... (precise pixel-perfect layout as in reference)

  // ===== ORANGE SEPARATOR =====
  doc.setDrawColor(ORANGE);
  doc.setLineWidth(0.6);
  doc.line(marginLeft, y, pageWidth - marginRight, y);

  // ===== SERVICES TABLE =====
  // Header row with orange background
  doc.setFillColor(ORANGE);
  doc.rect(marginLeft, y, contentWidth, 8, 'F');
  doc.setTextColor('#FFFFFF');
  doc.text('Service Description', marginLeft + 4, y + 5.5);
  // ... columns: Qty, Rate, Amount

  // ===== Data rows with borders =====
  data.services.forEach((item, i) => {
    const rowY = y + (i * 9);
    const amount = item.qty * item.rate;
    doc.setDrawColor(BORDER);
    doc.rect(marginLeft, rowY, contentWidth, 9);
    doc.text(item.description, marginLeft + 4, rowY + 6);
    // ... qty, rate, amount columns
  });

  // ===== TOTAL BOX =====
  // Orange bordered box: Subtotal, VAT 5%, TOTAL (bold)

  // ===== BANK DETAILS =====
  // Gray background box with bank info

  // ===== TERMS & CONDITIONS =====
  // 3-column layout

  // ===== DARK FOOTER =====
  doc.setFillColor(DARK);
  doc.rect(0, 277, 210, 20, 'F');
  doc.setTextColor('#FFFFFF');
  doc.text('PYRAMEDIA X — FOR AI SOLUTIONS', 105, 284, { align: 'center' });
  // ... contact details

  doc.save(`${data.quoteNumber}.pdf`);
}
```

### 14.4 Signature Pad Component

```typescript
// components/quotes/SignaturePad.tsx
'use client';

import { useRef, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { Eraser, PenTool } from 'lucide-react';

interface SignaturePadProps {
  onSignatureChange: (dataUrl: string | null) => void;
  label?: string;
}

export default function SignaturePad({
  onSignatureChange,
  label = 'Client Signature'
}: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas>(null);

  const handleEnd = useCallback(() => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      const dataUrl = sigRef.current.getTrimmedCanvas().toDataURL('image/png');
      onSignatureChange(dataUrl);
    }
  }, [onSignatureChange]);

  const handleClear = useCallback(() => {
    sigRef.current?.clear();
    onSignatureChange(null);
  }, [onSignatureChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium flex items-center gap-2">
          <PenTool className="w-4 h-4 text-pyra-orange" />
          {label}
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
          <Eraser className="w-3 h-3" />
          Clear
        </Button>
      </div>
      <div className="border-2 border-dashed rounded-lg bg-white overflow-hidden relative">
        <SignatureCanvas
          ref={sigRef}
          penColor="#2D2D2D"
          canvasProps={{
            className: 'w-full',
            style: { width: '100%', height: '120px' },
          }}
          onEnd={handleEnd}
        />
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground/40 pointer-events-none">
          Sign here
        </div>
      </div>
    </div>
  );
}
```

### 14.5 Quote Builder Component

```typescript
// components/quotes/QuoteBuilder.tsx
'use client';

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SignaturePad from './SignaturePad';
import { generateQuotePdf, type ServiceItem, type QuoteData } from '@/lib/pdf/generateQuotePdf';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { FileDown, Plus, Trash2, Save, Send } from 'lucide-react';

const emptyService: ServiceItem = { description: '', qty: 1, rate: 0 };

interface QuoteBuilderProps {
  quote?: PyraQuote;          // Existing quote for editing
  clients: PyraClient[];      // Client dropdown options
  onSave: (data: QuoteData, send?: boolean) => Promise<void>;
}

export default function QuoteBuilder({ quote, clients, onSave }: QuoteBuilderProps) {
  const [clientId, setClientId] = useState(quote?.client_id ?? '');
  const [clientName, setClientName] = useState(quote?.client_name ?? '');
  const [clientEmail, setClientEmail] = useState(quote?.client_email ?? '');
  const [clientAddress, setClientAddress] = useState(quote?.client_address ?? '');
  const [contactPerson, setContactPerson] = useState('');
  const [clientPhone, setClientPhone] = useState(quote?.client_phone ?? '');
  const [quoteNumber] = useState(quote?.quote_number ?? 'Auto-generated');
  const [estimateDate] = useState(quote?.estimate_date ?? new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState(quote?.expiry_date ?? '');
  const [projectName, setProjectName] = useState(quote?.project_name ?? '');
  const [services, setServices] = useState<ServiceItem[]>(
    quote?.items?.map(i => ({ description: i.description, qty: i.quantity, rate: i.rate }))
    ?? [{ ...emptyService }]
  );
  const [notes, setNotes] = useState(quote?.notes ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const subtotal = useMemo(() => services.reduce((sum, s) => sum + s.qty * s.rate, 0), [services]);
  const taxRate = 5; // VAT 5%
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const handleClientSelect = useCallback((id: string) => {
    const client = clients.find(c => c.id === id);
    if (client) {
      setClientId(id);
      setClientName(client.name);
      setClientEmail(client.email);
      setClientPhone(client.phone ?? '');
      setClientAddress(''); // From client record if available
    }
  }, [clients]);

  // ... service CRUD, save, send, PDF generation handlers

  return (
    <div className="max-w-[900px] mx-auto bg-white shadow-lg rounded-lg p-8">
      {/* Quote Builder UI matching Section 14.2 */}
    </div>
  );
}
```

### 14.6 Client Portal Quote View

**Route:** `/portal/quotes/[id]`

**Features:**
- Read-only quote document (white paper layout matching PDF)
- Status tracking: Sent → Viewed → Signed
- Auto-update status to "viewed" on first access
- Signature pad (if status is sent/viewed)
- Name input for signatory
- Submit signature button → updates status to "signed"
- Download PDF button
- Signature image display (if already signed)

### 14.7 Currency & Localization

- **Default currency:** AED (United Arab Emirates Dirham)
- **Default VAT:** 5%
- **Number formatting:** `new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2 })`
- **Date format:** `dd-mm-yyyy` (Middle East standard)
- **Quote number prefix:** `QT-` (configurable in settings)

---

## 15. Client Portal System

### 15.1 Portal Architecture

The Client Portal is a separate section of the Next.js app with its own layout, auth flow, and restricted access.

**Route Group:** `/portal/*`

**Auth:** Separate from admin — uses `pyra_clients` table with Supabase Auth

### 15.2 Portal Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | `/portal/login` | Client email + password |
| Dashboard | `/portal` | Welcome, projects, pending approvals, notifications |
| Projects | `/portal/projects` | Client's assigned projects |
| Project Detail | `/portal/projects/[id]` | Files, comments, approvals |
| Quotes | `/portal/quotes` | Client's quotations |
| Quote Detail | `/portal/quotes/[id]` | View quote + sign |
| Notifications | `/portal/notifications` | All client notifications |
| Profile | `/portal/profile` | Update name, email, password |

### 15.3 Portal Dashboard Cards

1. **Welcome Card** — Client name, company, last login
2. **Active Projects** — Count + recent 5 projects with status
3. **Pending Approvals** — Files awaiting client approval
4. **Recent Files** — Latest shared files
5. **Messages** — Unread comments from team
6. **Quotes** — Pending quotes requiring signature
7. **Notifications** — Recent alerts

### 15.4 File Approval Workflow

```
Admin uploads file → Assigns to project → Links to client
                                              ↓
Client sees file in portal → Views/Downloads → Takes action
                                              ↓
                              ┌─── Approve ───→ Status: Approved ✅
                              │                  → Notify admin
                              └─── Request Revision ──→ Status: Revision Requested 🔄
                                                        → Comment required
                                                        → Notify admin
```

### 15.5 Client-Team Communication

```typescript
// Threaded comments on projects
interface ClientComment {
  id: string;
  project_id: string;
  author_type: 'client' | 'team';
  author_name: string;
  text: string;
  parent_id: string | null; // For threading
  attachments: string[];
  is_read_by_client: boolean;
  is_read_by_team: boolean;
  created_at: string;
}
```

---

## 16. Accessibility & Internationalization

### 16.1 RTL Support

```typescript
// middleware.ts — Locale detection
const locale = request.cookies.get('locale')?.value ?? 'ar';
const dir = locale === 'ar' ? 'rtl' : 'ltr';

// app/layout.tsx
<html lang={locale} dir={dir}>
```

**CSS:** Use logical properties throughout:
```css
/* Instead of margin-left, use margin-inline-start */
.sidebar { margin-inline-start: 0; padding-inline: 1rem; }
```

### 16.2 i18n Strategy

- **Library:** `next-intl` or custom i18n with JSON dictionaries
- **Languages:** Arabic (primary), English (secondary)
- **Content:** All UI labels bilingual
- **Date/Number:** `Intl.DateTimeFormat` and `Intl.NumberFormat` with Arabic locale

### 16.3 Accessibility (WCAG 2.1 AA)

- Keyboard navigation on all interactive elements
- `aria-label` on icon-only buttons
- Focus visible outlines (orange ring)
- Screen reader announcements for dynamic content
- Color contrast ratio ≥ 4.5:1
- Skip navigation link
- Semantic HTML (nav, main, aside, article)

---

## 17. Testing Strategy

### 17.1 Testing Pyramid

| Layer | Tool | Coverage Target | Focus |
|-------|------|----------------|-------|
| Unit | Vitest | 80%+ | Utils, hooks, helpers |
| Component | Vitest + Testing Library | 70%+ | UI components |
| Integration | Vitest | 60%+ | API routes, server actions |
| E2E | Playwright | Critical paths | Login, file ops, quotes |

### 17.2 Key Test Scenarios

**Authentication:**
- ✅ Admin login → dashboard access
- ✅ Client login → portal access
- ✅ Invalid credentials → error message
- ✅ Rate limiting after 5 failures
- ✅ Session expiry → redirect to login

**File Manager:**
- ✅ Upload single file → appears in list
- ✅ Upload multiple files → all appear
- ✅ Create folder → navigable
- ✅ Rename file → updated in list
- ✅ Delete file → moves to trash
- ✅ Restore from trash → back in original location
- ✅ Permission denied → error shown

**Quote System:**
- ✅ Create quote → saves as draft
- ✅ Add service items → auto-calculate total
- ✅ Send to client → status changes, notification sent
- ✅ Client views → status updates to "viewed"
- ✅ Client signs → signature saved, status "signed"
- ✅ Generate PDF → downloads correctly formatted file
- ✅ Duplicate quote → new draft with next number

**Client Portal:**
- ✅ Login → dashboard loads with correct data
- ✅ View projects → only assigned projects visible
- ✅ Approve file → notification sent to admin
- ✅ Request revision → comment required, admin notified
- ✅ View quote → document renders correctly
- ✅ Sign quote → signature captured, status updated

### 17.3 E2E Test Example

```typescript
// tests/e2e/quotes.spec.ts
import { test, expect } from '@playwright/test';

test('full quote lifecycle', async ({ page }) => {
  // Login as admin
  await page.goto('/login');
  await page.fill('input[name="email"]', 'admin@pyramedia.ae');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // Create new quote
  await page.goto('/dashboard/quotes/new');
  await page.selectOption('[data-testid="client-select"]', 'client_1');
  await page.fill('[data-testid="project-name"]', 'Social Media Campaign');

  // Add service
  await page.fill('[data-testid="service-0-desc"]', 'Content Strategy');
  await page.fill('[data-testid="service-0-qty"]', '1');
  await page.fill('[data-testid="service-0-rate"]', '5000');

  // Save and send
  await page.click('[data-testid="save-send"]');
  await expect(page.locator('[data-testid="status-badge"]')).toHaveText('Sent');

  // Switch to client portal
  await page.goto('/portal/login');
  await page.fill('input[name="email"]', 'client@company.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // View quote
  await page.goto('/portal/quotes');
  await page.click('[data-testid="quote-card"]');
  await expect(page.locator('[data-testid="quote-total"]')).toContainText('5,250.00');

  // Sign
  const canvas = page.locator('[data-testid="signature-canvas"]');
  await canvas.click({ position: { x: 50, y: 50 } });
  await canvas.click({ position: { x: 150, y: 50 } });
  await page.fill('[data-testid="signer-name"]', 'Ahmed Al Khalidi');
  await page.click('[data-testid="submit-signature"]');

  await expect(page.locator('[data-testid="status-badge"]')).toHaveText('Signed');
});
```

---

## 18. DevOps & Deployment

### 18.1 Deployment Architecture

```
GitHub Repository
    ↓ (push to main)
Vercel (Auto Deploy)
    ├── Edge Functions (Middleware)
    ├── Serverless Functions (API Routes)
    └── Static Assets (CDN)
              ↓
         Supabase
    ├── PostgreSQL (Database)
    ├── Storage (Files)
    ├── Auth (Users)
    └── Realtime (WebSocket)
```

### 18.2 Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# App
NEXT_PUBLIC_APP_URL=https://workspace.pyramedia.ae
NEXT_PUBLIC_APP_NAME=Pyra Workspace

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@pyramedia.ae
SMTP_PASS=xxx

# Storage
NEXT_PUBLIC_STORAGE_BUCKET=pyraai-workspace
```

### 18.3 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install
      - run: pnpm run check        # TypeScript check
      - run: pnpm run test          # Vitest
      - run: pnpm run test:e2e      # Playwright

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

### 18.4 Monitoring

| Tool | Purpose |
|------|---------|
| Vercel Analytics | Web vitals, performance |
| Sentry | Error tracking + source maps |
| Supabase Dashboard | DB performance, storage usage |
| Uptime Robot | Availability monitoring |

---

## 19. Migration Timeline & Phases

### Phase 1: Foundation (Weeks 1-2)
**Goal:** App skeleton, auth, basic file operations

| Task | Days | Owner |
|------|------|-------|
| Next.js 15 project setup + Tailwind 4 + shadcn/ui | 1 | Dev |
| Supabase Auth integration (admin login) | 2 | Dev |
| Middleware (auth guards, locale, redirect) | 1 | Dev |
| Admin layout (sidebar + topbar + routing) | 2 | Dev |
| File Explorer (list, upload, download, delete) | 3 | Dev |
| Path-based permissions (RBAC) | 1 | Dev |

### Phase 2: Core Modules (Weeks 3-4)
**Goal:** User management, teams, reviews, notifications

| Task | Days | Owner |
|------|------|-------|
| User management CRUD | 2 | Dev |
| Team management CRUD | 2 | Dev |
| Permission editor (visual tree) | 2 | Dev |
| File reviews + threaded comments | 2 | Dev |
| Notification system (Supabase Realtime) | 2 | Dev |
| Dashboard with stats + charts | 1 | Dev |
| Search (Command palette + Supabase FTS) | 1 | Dev |

### Phase 3: Client Portal (Weeks 5-6)
**Goal:** Client auth, projects, file approvals, communication

| Task | Days | Owner |
|------|------|-------|
| Client auth (login, session, profile) | 2 | Dev |
| Portal layout + navigation | 1 | Dev |
| Client dashboard | 1 | Dev |
| Project list + detail | 2 | Dev |
| File preview + approval workflow | 2 | Dev |
| Client-team comments | 1 | Dev |
| Client notifications | 1 | Dev |

### Phase 4: Quotation System (Week 7)
**Goal:** Quote builder, PDF, signatures

| Task | Days | Owner |
|------|------|-------|
| Quote Builder UI (from pyramedia-invoice ref) | 2 | Dev |
| jsPDF PDF engine integration | 1 | Dev |
| Client quote view + signature pad | 1 | Dev |
| Quote lifecycle (draft → sent → signed) | 1 | Dev |

### Phase 5: Polish & Deploy (Week 8)
**Goal:** Testing, PWA, i18n, deployment

| Task | Days | Owner |
|------|------|-------|
| Vitest unit/integration tests | 2 | Dev |
| Playwright E2E tests | 1 | Dev |
| RTL + Arabic i18n | 1 | Dev |
| PWA configuration (manifest, SW) | 0.5 | Dev |
| Vercel deployment + DNS + SSL | 0.5 | Dev |
| Performance optimization (Core Web Vitals) | 1 | Dev |

---

## 20. Risk Assessment

| # | Risk | Impact | Probability | Mitigation |
|---|------|--------|-------------|------------|
| 1 | Supabase Auth migration breaks existing sessions | 🔴 High | 🟡 Medium | Parallel run: keep PHP active during transition |
| 2 | RLS policies too restrictive → feature breakage | 🟡 Medium | 🟡 Medium | Thorough testing with service role fallback |
| 3 | File upload size limits on Vercel (4.5MB body) | 🟡 Medium | 🟢 Low | Direct-to-Supabase upload (client-side) |
| 4 | PDF generation in serverless (memory limits) | 🟢 Low | 🟢 Low | Client-side jsPDF (runs in browser) |
| 5 | Real-time WebSocket disconnections | 🟢 Low | 🟡 Medium | Auto-reconnect + fallback polling |
| 6 | Arabic font rendering in PDFs | 🟡 Medium | 🟡 Medium | Embed Arabic fonts in jsPDF |
| 7 | Client portal security (data leakage) | 🔴 High | 🟢 Low | RLS + middleware + integration tests |
| 8 | Migration timeline overrun | 🟡 Medium | 🟡 Medium | Phase-based delivery, MVP first |
| 9 | Supabase rate limits in production | 🟡 Medium | 🟢 Low | Pro plan + connection pooling |
| 10 | Browser compatibility (Safari signature canvas) | 🟢 Low | 🟡 Medium | Touch event polyfills + testing |

---

## 21. Dependencies & Libraries

### 21.1 Production Dependencies

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@supabase/supabase-js": "^2.45.0",
    "@supabase/ssr": "^0.5.0",
    "@tanstack/react-query": "^5.60.0",
    "tailwindcss": "^4.0.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.0.0",
    "framer-motion": "^12.0.0",
    "react-hook-form": "^7.64.0",
    "@hookform/resolvers": "^5.0.0",
    "zod": "^4.0.0",
    "jspdf": "^4.1.0",
    "react-signature-canvas": "^1.1.0-alpha.2",
    "@types/react-signature-canvas": "^1.0.7",
    "lucide-react": "^0.450.0",
    "sonner": "^2.0.0",
    "next-themes": "^0.4.0",
    "recharts": "^2.15.0",
    "cmdk": "^1.0.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-select": "^2.2.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-tooltip": "^1.2.0",
    "@radix-ui/react-avatar": "^1.1.0",
    "@radix-ui/react-checkbox": "^1.3.0",
    "@radix-ui/react-switch": "^1.2.0",
    "@radix-ui/react-progress": "^1.1.0",
    "@radix-ui/react-scroll-area": "^1.2.0",
    "@radix-ui/react-separator": "^1.1.0",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-popover": "^1.1.0",
    "@radix-ui/react-slot": "^1.2.0",
    "vaul": "^1.1.0",
    "input-otp": "^1.4.0",
    "nanoid": "^5.0.0",
    "date-fns": "^3.0.0"
  }
}
```

### 21.2 Dev Dependencies

```json
{
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/node": "^22.0.0",
    "vitest": "^2.1.0",
    "@testing-library/react": "^16.0.0",
    "@playwright/test": "^1.48.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "prettier": "^3.6.0",
    "@tailwindcss/typography": "^0.5.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

### 21.3 GitHub Resources

| Resource | Stars | Purpose |
|----------|-------|---------|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | 82K+ ⭐ | Base component library |
| [Magic UI](https://github.com/magicuidesign/magicui) | 18K+ ⭐ | Premium animated components |
| [Aceternity UI](https://github.com/aceternity/aceternity-ui) | — | Background effects & spotlights |
| [Animata](https://github.com/codse/animata) | — | Additional animation components |
| [Launch UI](https://github.com/launch-ui/launch-ui) | — | Landing page components |
| [Taxonomy (shadcn)](https://github.com/shadcn-ui/taxonomy) | — | Reference Next.js architecture |

---

## 22. Acceptance Criteria

### 22.1 Functional Acceptance

- [ ] Admin can login and access all dashboard features
- [ ] File Explorer supports upload, download, rename, delete, preview
- [ ] File versions are tracked and restorable
- [ ] Trash with 30-day auto-purge
- [ ] Share links generate and expire correctly
- [ ] User CRUD with role-based permissions
- [ ] Team CRUD with member management
- [ ] File-level and folder-level permissions work
- [ ] Reviews (comments + approvals) are threaded
- [ ] Notifications arrive in real-time via WebSocket
- [ ] Activity log captures all operations
- [ ] Deep search finds files by name and content
- [ ] Settings page controls all configuration
- [ ] Client portal login and dashboard functional
- [ ] Client can view projects and files
- [ ] Client can approve or request revision on files
- [ ] Client-team commenting works bidirectionally
- [ ] Quote builder creates and saves quotes
- [ ] PDF generation matches reference design exactly
- [ ] Client can view and sign quotes in portal
- [ ] Signature is captured and saved correctly

### 22.2 Non-Functional Acceptance

- [ ] Lighthouse score ≥ 90 on all pages
- [ ] First Contentful Paint < 1.5s
- [ ] Time to Interactive < 3s
- [ ] Bundle size < 250KB (first load JS)
- [ ] RTL Arabic layout renders correctly
- [ ] Dark mode works on all pages
- [ ] Mobile responsive (320px - 1440px)
- [ ] All API routes return in < 500ms
- [ ] Zero TypeScript errors (`tsc --noEmit`)
- [ ] Unit test coverage ≥ 80%
- [ ] E2E tests pass for all critical flows
- [ ] WCAG 2.1 AA compliance

### 22.3 Security Acceptance

- [ ] All routes require authentication
- [ ] RLS policies prevent cross-user data access
- [ ] Rate limiting active on auth endpoints
- [ ] File uploads validated (type, size, name)
- [ ] No SQL injection vectors
- [ ] XSS prevented (CSP headers active)
- [ ] HTTPS enforced on all routes
- [ ] Session cookies are httpOnly + Secure + SameSite

---

## Appendix A: Configuration Defaults

| Setting | Default Value |
|---------|--------------|
| Currency | AED |
| VAT Rate | 5% |
| Quote Prefix | QT- |
| Quote Expiry | 30 days |
| Trash Auto-Purge | 30 days |
| Session Timeout | 24 hours |
| Max Upload Size | 100MB |
| Max File Name Length | 255 chars |
| Notification Polling Fallback | 30 seconds |
| Search Results Limit | 100 |

## Appendix B: Brand Assets

| Asset | Location |
|-------|----------|
| Logo (PNG) | Supabase Storage: `brand/pyramedia-logo.png` |
| Logo (Base64) | `lib/pdf/logoData.ts` |
| CDN Logo | `https://files.manuscdn.com/user_upload_by_module/session_file/310519663152029844/zZNcWDOWZIMStrnE.png` |
| Primary Color | `#E87A2E` (Pyramedia Orange) |
| Font: DM Sans | Google Fonts CDN |
| Font: JetBrains Mono | Google Fonts CDN |
| Font: Noto Kufi Arabic | Google Fonts CDN |

## Appendix C: Bank Details (Hardcoded)

```
Bank: Emirates NBD
Account Name: Pyramedia Digital Marketing LLC
Account No: 1012XXXXXXX
IBAN: AE12 0260 0010 1234 5678 901
```

## Appendix D: Terms & Conditions (Hardcoded)

```
1. Quotation valid for 30 days from the date of issue.
2. 50% advance payment required to commence work.
3. Balance payment due upon project completion.
```

---

## Appendix E: Detailed UI Wireframes

### E.1 Portal Dashboard Wireframe

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Portal Header                                                           │
│ ┌───────────────────────────────────────────────────────────────────┐   │
│ │ 🔶 PYRAMEDIA X               🔔 Notifications    👤 Client Name │   │
│ └───────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│ [TextGenerateEffect] "مرحباً، شركة الأفق" (Welcome, Al-Ofok Co.)       │
│                                                                         │
│ ┌──────────────┬──────────────┬──────────────┐                         │
│ │ [Card]       │ [Card]       │ [Card]       │                         │
│ │ 📁 3         │ 📋 2         │ ✅ 1         │                         │
│ │ مشاريع نشطة │ عروض معلقة   │ عروض موافقة  │                         │
│ │ Active Proj  │ Pending Quot │ Approved Quo │                         │
│ │ [NumberTick] │ [NumberTick] │ [NumberTick] │                         │
│ └──────────────┴──────────────┴──────────────┘                         │
│                                                                         │
│ ┌───────────────────────────────────────────────────────────────────┐   │
│ │ [Card] آخر التحديثات (Recent Updates)                             │   │
│ │ ┌─────────────────────────────────────────────────────────────┐   │   │
│ │ │ ● تم رفع 3 ملفات جديدة في مشروع "هوية بصرية"              │   │   │
│ │ │   منذ ساعتين (2 hours ago)                                 │   │   │
│ │ ├─────────────────────────────────────────────────────────────┤   │   │
│ │ │ ● عرض سعر QT-0142 بانتظار موافقتك                         │   │   │
│ │ │   منذ يوم (1 day ago)                    [عرض View →]      │   │   │
│ │ └─────────────────────────────────────────────────────────────┘   │   │
│ └───────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│ ┌───────────────────────────────────────────────────────────────────┐   │
│ │ [Card] مشاريعك (Your Projects)                    [عرض الكل →]  │   │
│ │ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐     │   │
│ │ │ 📁 هوية بصرية   │ │ 📁 فيديو إعلاني│ │ 📁 حملة تسويق  │     │   │
│ │ │ 12 ملف          │ │ 8 ملفات         │ │ 5 ملفات         │     │   │
│ │ │ 🟢 نشط Active   │ │ ✅ مكتمل Done  │ │ 🟡 قيد التنفيذ │     │   │
│ │ └─────────────────┘ └─────────────────┘ └─────────────────┘     │   │
│ └───────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### E.2 Portal Quote Detail + Signature Wireframe

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← رجوع (Back)                                          [⬇ PDF] [🖨]  │
│ ┌───────────────────────────────────────────────────────────────────┐   │
│ │ [Card - Quote Document]                                           │   │
│ │                    🔶 PYRAMEDIA X                                  │   │
│ │                    عرض سعر / Quotation                            │   │
│ │ رقم العرض: QT-0142          التاريخ: 15 فبراير 2026              │   │
│ │ صالح حتى: 15 مارس 2026                                          │   │
│ │                                                                   │   │
│ │ من: PYRAMEDIA X              إلى: شركة الأفق للتقنية             │   │
│ │                                                                   │   │
│ │ ┌───┬──────────────────┬─────┬────────┬───────────┐              │   │
│ │ │ # │ الوصف            │ كمية│ السعر  │ المجموع   │              │   │
│ │ ├───┼──────────────────┼─────┼────────┼───────────┤              │   │
│ │ │ 1 │ تصميم هوية بصرية│  1  │ 15,000│ 15,000 AED│              │   │
│ │ │ 2 │ تصوير فيديو     │  2  │  4,000│  8,000 AED│              │   │
│ │ │ 3 │ إدارة حسابات    │  1  │  3,000│  3,000 AED│              │   │
│ │ └───┴──────────────────┴─────┴────────┴───────────┘              │   │
│ │                         المجموع الفرعي: 26,000 AED               │   │
│ │                         ضريبة (5%):      1,300 AED               │   │
│ │                         الإجمالي:       27,300 AED               │   │
│ └───────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│ ┌───────────────────────────────────────────────────────────────────┐   │
│ │ [Card - E-Signature Section]                                      │   │
│ │ التوقيع الإلكتروني (E-Signature)                                 │   │
│ │ ┌─────────────────────────────────────────────────────────────┐   │   │
│ │ │             [Canvas - Signature Pad]                        │   │   │
│ │ │        وقّع هنا / Sign here                                │   │   │
│ │ │                     ~~~~~~~~                                │   │   │
│ │ └─────────────────────────────────────────────────────────────┘   │   │
│ │ [مسح Clear]                                                      │   │
│ │ ☐ أوافق على شروط وأحكام هذا العرض                               │   │
│ │ ┌─────────────────┐  ┌──────────────────┐                        │   │
│ │ │ ✅ موافقة        │  │ ❌ رفض            │                        │   │
│ │ └─────────────────┘  └──────────────────┘                        │   │
│ └───────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### E.3 Admin File Explorer Wireframe

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [Sidebar]  │  [Breadcrumb] الرئيسية > مشاريع > هوية بصرية              │
│            │  ┌──────────────────────────────────────────────────────┐  │
│ 🏠 الرئيسية│  │ [Toolbar]                                            │  │
│ 📁 الملفات │  │ [⬆ رفع] [📁 مجلد جديد] [🔍 بحث...]    [☰ قائمة|⊞] │  │
│ 👥 المستخدم│  └──────────────────────────────────────────────────────┘  │
│ 🏢 الفرق  │                                                           │
│ 📋 العروض │  ┌────┬──────────────────┬──────┬──────────┬──────────┐  │
│ 📊 النشاط │  │ ☐  │ الاسم            │ النوع│ الحجم    │ التاريخ  │  │
│ 🗑 المحذوفات│  ├────┼──────────────────┼──────┼──────────┼──────────┤  │
│ ⚙ الإعدادات│  │ ☐  │ 📁 social-media/ │ مجلد │ 320 MB   │ اليوم   │  │
│            │  │ ☐  │ 🖼 logo-final.ai │ AI   │ 24 MB    │ أمس     │  │
│            │  │ ☐  │ 📄 brand-guide.pdf│ PDF │ 8 MB     │ 12 فبر  │  │
│            │  │ ☐  │ 🖼 mockup-v3.psd │ PSD  │ 156 MB   │ 10 فبر  │  │
│            │  └────┴──────────────────┴──────┴──────────┴──────────┘  │
│            │                                                           │
│            │  عرض 4 من 4 عناصر                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix F: i18n Translation Structure

### F.1 Arabic Common Translations (ar/common.json)

```json
{
  "nav": {
    "dashboard": "الرئيسية",
    "files": "إدارة الملفات",
    "users": "المستخدمين",
    "teams": "الفرق",
    "quotes": "عروض الأسعار",
    "activity": "سجل النشاط",
    "trash": "سلة المحذوفات",
    "settings": "الإعدادات"
  },
  "actions": {
    "save": "حفظ",
    "cancel": "إلغاء",
    "delete": "حذف",
    "edit": "تعديل",
    "create": "إنشاء",
    "upload": "رفع",
    "download": "تنزيل",
    "search": "بحث",
    "close": "إغلاق",
    "confirm": "تأكيد",
    "back": "رجوع",
    "viewAll": "عرض الكل"
  },
  "status": {
    "active": "نشط",
    "inactive": "غير نشط",
    "pending": "معلق",
    "loading": "جاري التحميل...",
    "saving": "جاري الحفظ...",
    "success": "تم بنجاح",
    "error": "حدث خطأ"
  }
}
```

### F.2 Arabic Files Translations (ar/files.json)

```json
{
  "title": "إدارة الملفات",
  "toolbar": {
    "upload": "رفع ملف",
    "newFolder": "مجلد جديد",
    "searchPlaceholder": "بحث عن ملفات..."
  },
  "columns": {
    "name": "الاسم",
    "type": "النوع",
    "size": "الحجم",
    "date": "التاريخ"
  },
  "contextMenu": {
    "preview": "معاينة",
    "download": "تنزيل",
    "rename": "إعادة تسمية",
    "share": "مشاركة",
    "delete": "حذف"
  },
  "upload": {
    "dragDrop": "اسحب ملفات هنا أو اضغط للاختيار",
    "progress": "جاري الرفع... {percent}%",
    "success": "تم رفع {count} ملفات بنجاح"
  },
  "empty": {
    "title": "مجلد فارغ",
    "description": "اسحب ملفات هنا أو اضغط زر الرفع"
  }
}
```

### F.3 Arabic Quotes Translations (ar/quotes.json)

```json
{
  "title": "عروض الأسعار",
  "newQuote": "عرض سعر جديد",
  "fields": {
    "quoteNumber": "رقم العرض",
    "estimateDate": "تاريخ العرض",
    "expiryDate": "تاريخ الانتهاء",
    "projectName": "اسم المشروع",
    "client": "العميل",
    "email": "البريد الإلكتروني",
    "address": "العنوان",
    "phone": "الهاتف"
  },
  "table": {
    "description": "الوصف",
    "qty": "الكمية",
    "rate": "السعر",
    "amount": "المجموع",
    "addItem": "إضافة عنصر"
  },
  "totals": {
    "subtotal": "المجموع الفرعي",
    "vat": "ضريبة القيمة المضافة",
    "total": "الإجمالي"
  },
  "status": {
    "draft": "مسودة",
    "sent": "مرسل",
    "viewed": "تم العرض",
    "signed": "موقّع",
    "expired": "منتهي",
    "cancelled": "ملغي"
  },
  "actions": {
    "saveDraft": "حفظ كمسودة",
    "saveAndSend": "حفظ وإرسال",
    "generatePdf": "تحميل PDF",
    "duplicate": "نسخ العرض",
    "sign": "توقيع العرض"
  },
  "signature": {
    "title": "التوقيع الإلكتروني",
    "signHere": "وقّع هنا",
    "clear": "مسح",
    "agree": "أوافق على شروط وأحكام هذا العرض",
    "signedBy": "تم التوقيع بواسطة",
    "signedAt": "تاريخ التوقيع"
  }
}
```

---

## Appendix G: RTL/LTR CSS Logical Properties

| Physical (AVOID) | Logical (USE) | RTL Behavior | LTR Behavior |
|-------------------|---------------|--------------|--------------|
| `ml-*` | `ms-*` | margin-right | margin-left |
| `mr-*` | `me-*` | margin-left | margin-right |
| `pl-*` | `ps-*` | padding-right | padding-left |
| `pr-*` | `pe-*` | padding-left | padding-right |
| `left-*` | `start-*` | right | left |
| `right-*` | `end-*` | left | right |
| `text-left` | `text-start` | text-align: right | text-align: left |
| `text-right` | `text-end` | text-align: left | text-align: right |
| `border-l-*` | `border-s-*` | border-right | border-left |
| `rounded-l-*` | `rounded-s-*` | rounded-right | rounded-left |
| `float-left` | `float-start` | float: right | float: left |

---

## Appendix H: WCAG 2.1 AA Compliance Checklist

### Color Contrast Verification

| Element | Foreground | Background | Ratio | Pass? |
|---------|-----------|------------|-------|-------|
| Body text (dark) | `#FAFAFA` | `#09090B` | 19.4:1 | ✅ |
| Body text (light) | `#09090B` | `#FFFFFF` | 19.4:1 | ✅ |
| Primary orange (dark) | `#F97316` | `#09090B` | 4.5:1 | ✅ |
| Primary orange (light) | `#EA580C` | `#FFFFFF` | 4.7:1 | ✅ |
| Muted text (dark) | `#71717A` | `#09090B` | 4.6:1 | ✅ |
| Card text (dark) | `#FAFAFA` | `#18181B` | 16.8:1 | ✅ |
| Error text | `#FCA5A5` | `#09090B` | 9.3:1 | ✅ |

### Keyboard Navigation Shortcuts

| Shortcut | Action | Scope |
|----------|--------|-------|
| `Ctrl/Cmd + K` | Command palette (search) | Global |
| `Escape` | Close modal/sheet | When open |
| `Tab / Shift+Tab` | Focus navigation | Global |
| `Enter/Space` | Activate element | Global |
| `Arrow Keys` | Navigate lists/menus | Context |
| `F2` | Rename file | File Explorer |
| `Delete` | Move to trash | File Explorer |
| `Ctrl+A` | Select all files | File Explorer |

### Screen Reader ARIA Requirements

| Component | Required ARIA |
|-----------|--------------|
| Sidebar nav | `<nav aria-label="القائمة الرئيسية">` |
| Active nav item | `aria-current="page"` |
| File table | `role="grid"`, `aria-rowcount`, `aria-colcount` |
| Sort headers | `aria-sort="ascending\|descending\|none"` |
| Upload progress | `role="progressbar"`, `aria-valuenow/min/max` |
| Notification badge | `aria-label="N إشعارات غير مقروءة"` |
| Toast | `role="status"`, `aria-live="polite"` |
| Error alert | `role="alert"`, `aria-live="assertive"` |
| Modal dialog | `role="dialog"`, `aria-modal="true"` |
| Tabs | `role="tablist"`, `role="tab"`, `aria-selected` |
| Skip navigation | First body element: `<a href="#main" class="sr-only focus:not-sr-only">` |

### Reduced Motion Support

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

**End of PRD**

> 📋 This PRD was generated by the Pyra AI Architecture Team
> 🔧 Reference implementation: `pyramedia-invoice.zip` (React + TypeScript + shadcn/ui + jsPDF)
> 📦 Total scope: 22 database tables, 88 API endpoints, 14 modules, 8 weeks
> 🎯 Version: 3.0 | Date: 2026-02-15
