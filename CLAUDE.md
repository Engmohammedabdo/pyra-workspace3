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
│   └── empty-state.tsx # Custom unified empty state
├── layout/             # Shared layout components
│   ├── sidebar.tsx     # Dashboard sidebar
│   ├── topbar.tsx      # Dashboard topbar
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
├── supabase/     # Supabase client, server, middleware
├── pdf/          # PDF generators (Arabic support via Amiri font)
├── email/        # Mailer, notifications
├── utils/        # Utility functions (format, cn, currency, etc.)
├── automation/   # Workflow automation engine
├── portal/       # Portal auth, branding
├── finance/      # Finance alerts
└── webhooks/     # Webhook dispatcher
```

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

## Deployment
- Vercel (auto-deploy on push to main)
- Commit and push after completing features/fixes
