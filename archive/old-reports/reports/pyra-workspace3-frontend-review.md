# Pyra Workspace 3.0 — Frontend & UI/UX Review

**Repo:** https://github.com/Engmohammedabdo/pyra-workspace3  
**Stack:** Next.js 15.3 (Turbopack) · React 19 · Tailwind 3.4 · shadcn/ui · TanStack Query 5 · Supabase  
**Reviewed:** 2026-02-15  

---

## 1. RTL Support — 8/10 ✅

**What's done well:**
- `<html lang="ar" dir="rtl">` set globally in root layout ✅
- Logical CSS properties used throughout custom components: `start-0`, `end-3`, `ms-auto`, `me-2`, `ps-9`, `pe-3`, `border-e` ✅
- Toaster configured with `dir="rtl"` ✅
- Mobile Sheet opens from `side="right"` (correct for RTL) ✅
- Breadcrumb ChevronLeft handles RTL rotation: `rtl:rotate-0 ltr:rotate-180` ✅
- Tooltip opens `side="left"` in collapsed sidebar (correct for RTL — appears toward content) ✅

**Issues:**
- 🔴 **Login page decorative circles** use physical `left-10`, `right-10`, `left-1/2` — should use `start-10`, `end-10`, `start-1/2` (line 60-62 of login page)
- 🔴 **shadcn/ui Dialog component** uses hardcoded `left-[50%]`, `slide-out-to-left-1/2`, `slide-in-from-left-1/2` — these are from shadcn defaults and need RTL patches
- 🟡 **Dropdown, Select, Tooltip** components use `slide-in-from-left/right` animations that may appear reversed in RTL
- 🟡 `text-left` used on email/password inputs — intentional for LTR input fields (acceptable)

**Recommendation:** Audit all shadcn/ui primitives for physical positioning. Create an RTL-aware Dialog variant.

---

## 2. Responsive Design — 8/10 ✅

**What's done well:**
- Desktop sidebar: `hidden lg:flex` with `w-[280px]` / `w-[72px]` collapsed ✅
- Mobile: Sheet-based nav triggered `lg:hidden` ✅
- Main content: `lg:ps-[280px]` offset for sidebar ✅
- File grid: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6` — excellent responsive grid ✅
- Dashboard stats: `sm:grid-cols-2 lg:grid-cols-4` ✅
- Breadcrumb: `hidden sm:flex` (hidden on mobile) ✅
- Topbar padding: `px-4 lg:px-6` ✅

**Issues:**
- 🔴 **Sidebar collapse not synced with layout**: when sidebar collapses to 72px, `lg:ps-[280px]` on the main content doesn't adjust — content will have a 208px gap
- 🟡 **File list table** uses fixed `grid-cols-[1fr_120px_160px]` — the 120px + 160px columns don't collapse on small screens, causing horizontal scroll
- 🟡 **Search input** is fixed `w-[200px]` — could use responsive width
- 🟡 No `container` query or responsive adjustments in topbar toolbar area

**Recommendation:** Lift sidebar collapsed state to layout level (React context or URL param) so `lg:ps-*` can respond. Add responsive hiding for file list secondary columns on mobile.

---

## 3. Component Quality — 9/10 ✅✅

**What's done well:**
- shadcn/ui components properly installed: Button, Card, Dialog, DropdownMenu, Select, Tabs, Tooltip, Avatar, Badge, Checkbox, Input, Label, Progress, ScrollArea, Separator, Sheet, Skeleton, Switch ✅
- CVA (class-variance-authority) used correctly for Button variants ✅
- Radix UI primitives as base (`@radix-ui/react-*`) ✅
- Custom components well-structured: `FileExplorer` orchestrates `FileToolbar`, `FileBreadcrumbs`, `FileGrid`, `FileList` ✅
- Clean separation: `components/ui/` (primitives), `components/layout/` (structural), `components/files/` (feature), `components/providers/` (context) ✅
- `cn()` utility properly combining `clsx` + `tailwind-merge` ✅
- Proper TypeScript interfaces for all props ✅

**Issues:**
- 🟡 **FileToolbar** uses raw `<button>` and `<input>` instead of shadcn's `<Button>` and `<Input>` — inconsistent with the rest of the app
- 🟡 **Duplicate nav items array** in `sidebar.tsx` and `mobile-nav.tsx` — should be extracted to shared config

**Recommendation:** Minor cleanup — use shared nav config and shadcn primitives consistently.

---

## 4. Accessibility — 5/10 ⚠️

**What's done well:**
- Breadcrumb has `aria-label="التنقل"` ✅
- MobileNav menu button has `<span className="sr-only">القائمة</span>` ✅
- SheetTitle provided (even if `sr-only`) for accessibility ✅
- File list items have `role="button"` and `tabIndex={0}` with `onKeyDown` Enter handler ✅
- Login form inputs have `<Label htmlFor>` associations ✅
- Buttons have `title` attributes for tooltips ✅

**Issues:**
- 🔴 **FileGrid items** are `<button>` elements but navigation is on `onDoubleClick` — **double-click is not keyboard accessible** and not discoverable
- 🔴 **No focus-visible styles** on custom elements (file toolbar buttons, file items, breadcrumb links)
- 🔴 **No ARIA labels** on file grid items, file icons, or most interactive elements
- 🔴 **Search input** has no associated `<label>` — only placeholder text
- 🔴 **View mode toggle buttons** have no `aria-pressed` or `aria-label` beyond `title`
- 🟡 **No skip-to-content link** for keyboard users
- 🟡 **No live regions** (`aria-live`) for dynamic content updates (file count, upload status)
- 🟡 **Color-only active states** (orange dot indicator) — needs secondary indicator for color-blind users
- 🟡 **Theme toggle** has no `aria-label` describing current state

**Recommendation:** This needs significant work. Add `aria-label` to all interactive elements, implement focus management, add skip-nav, and make file navigation single-click accessible.

---

## 5. Performance — 7/10 ✅

**What's done well:**
- Next.js 15 with Turbopack (fast dev builds) ✅
- `next/font/google` with `display: 'swap'` for fonts — no FOIT ✅
- Dashboard page and layout are **Server Components** — no unnecessary client JS ✅
- Placeholder pages are all Server Components (no `'use client'`) ✅
- `staleTime: 30_000` prevents excessive refetching ✅
- `prefers-reduced-motion` media query in CSS ✅
- Only 14 client components total — good restraint ✅

**Issues:**
- 🔴 **Three Google Fonts loaded** (DM Sans, JetBrains Mono, Noto Kufi Arabic) — JetBrains Mono may be unnecessary if only used for `font-mono` on dashboard numbers
- 🟡 **No `next/image`** used anywhere — the file grid could benefit from optimized image previews
- 🟡 **`framer-motion`** (52KB gzipped) in dependencies but not visibly used in any component — dead dependency
- 🟡 **`recharts`** (145KB gzipped) loaded but dashboard stats are static placeholders — should be lazy loaded
- 🟡 **`jspdf`** and **`react-signature-canvas`** imported but quotes page is placeholder — dead weight if not tree-shaken
- 🟡 **No dynamic imports** (`next/dynamic`) for heavy components
- 🟡 `refetchOnWindowFocus: false` in QueryProvider but `refetchOnWindowFocus: true` in `useFiles` — inconsistent

**Recommendation:** Audit unused dependencies (framer-motion, recharts, jspdf). Use `next/dynamic` for heavy features. Add image optimization when file previews are built.

---

## 6. Theming — 9/10 ✅✅

**What's done well:**
- **Orange #F97316** (`--primary: 24 95% 53%`) consistently used as primary across light AND dark modes ✅
- Full HSL CSS variable system for both themes ✅
- Sidebar-specific color tokens (`--sidebar-background`, `--sidebar-primary`, etc.) ✅
- `pyra` color palette in Tailwind config: `pyra-orange`, `pyra-orange-light`, `pyra-orange-dark` ✅
- Dark mode properly configured: `darkMode: ['class']` + `next-themes` with `ThemeProvider` ✅
- Toggle button in topbar with Sun/Moon animation ✅
- Active nav items: `bg-orange-500/10 text-orange-600 dark:text-orange-400` — dark mode variant ✅
- Custom scrollbar styled ✅
- Ring color matches primary: `--ring: 24 95% 53%` ✅

**Issues:**
- 🟡 Some places use `bg-orange-500` directly instead of `bg-primary` — breaks if brand color changes (sidebar logo, login gradient, active dots)
- 🟡 `defaultTheme="light"` — consider respecting system preference by default

**Recommendation:** Replace remaining hardcoded `orange-500/600` with `primary` token for full theme consistency.

---

## 7. State Management — 8/10 ✅

**What's done well:**
- TanStack Query v5 properly set up with `QueryClientProvider` ✅
- `useFiles`, `useCreateFolder`, `useUploadFiles`, `useDeleteFiles`, `useFileUrl` — well-structured custom hooks ✅
- **Optimistic invalidation**: `queryClient.invalidateQueries` on mutations ✅
- Proper `queryKey` pattern: `['files', path]` for cache scoping ✅
- `staleTime: 30_000` to reduce unnecessary refetches ✅
- Upload progress: `isPending` used for loading states ✅
- Error handling: `onError` callbacks with Arabic toast messages ✅
- Success feedback: `onSuccess` callbacks with toast notifications ✅

**Issues:**
- 🟡 **No global error boundary** — unhandled query errors will crash the app
- 🟡 **No retry configuration** — default TanStack retries 3x which may be too aggressive for storage operations
- 🟡 **Empty state only in file views** — no error state UI (what happens when Supabase is down?)
- 🟡 **`refetchOnWindowFocus`** conflict between global (`false`) and local (`true`) settings
- 🟡 **No optimistic updates** for folder creation — could show folder immediately before server confirms

**Recommendation:** Add error boundary, error state UI, and align refetch policies.

---

## 8. File Explorer UX — 7/10 ✅

**What's done well:**
- ✅ **Grid view**: Beautiful card-style layout with icons, names, sizes
- ✅ **List view**: Table-style with Name, Size, Last Modified columns
- ✅ **View toggle**: Grid/List switch in toolbar with active state
- ✅ **Breadcrumbs**: Home → folder → subfolder with clickable navigation
- ✅ **Search**: Real-time client-side filtering with result count
- ✅ **Multi-select**: Ctrl/Cmd+Click for multiple selection with visual indicators
- ✅ **Create folder**: Inline input with Enter/Escape keyboard shortcuts
- ✅ **Upload**: Multi-file upload with loading state
- ✅ **Refresh**: Manual refresh button with spin animation
- ✅ **Empty state**: Friendly illustration with guidance text
- ✅ **Loading skeleton**: Appropriate skeletons for both grid and list views
- ✅ **Folders first**: Sorting with folders on top, Arabic locale-aware sorting

**Issues:**
- 🔴 **No drag & drop** upload — must click upload button
- 🔴 **No file preview** — clicking a file just shows a toast, no preview modal
- 🔴 **No context menu** (right-click) — `onContextMenu` prop exists but isn't connected
- 🔴 **No file actions** — no rename, delete, move, copy, download, share buttons
- 🟡 **Double-click to navigate** — not obvious to users, no single-click option
- 🟡 **No sort options** — can't sort by name, size, date in list view
- 🟡 **No drag & drop reordering/moving** between folders
- 🟡 **File count label** doesn't distinguish folders from files ("12 عنصر")

**Recommendation:** This is Phase 1 foundation — solid for an MVP. Priority additions: file preview, context menu actions, drag & drop upload, and sortable columns.

---

## 9. Arabic UI Text — 7/10 ✅

**What's done well:**
- All sidebar navigation labels in Arabic ✅
- All file explorer UI text in Arabic (buttons, placeholders, empty states, toast messages) ✅
- Login form fully Arabic ✅
- User role labels: `مسؤول` / `موظف` ✅
- Error messages translated to Arabic ✅
- Breadcrumb route labels all Arabic ✅
- Date formatting uses `date-fns` (though locale not set to Arabic in `formatRelativeDate`) ✅

**Issues:**
- 🔴 **All placeholder pages** show bilingual titles: `"المستخدمون — Users"`, `"النشاط — Activity"` etc. — should be Arabic-only for production
- 🔴 **Brand text** "PYRAMEDIA X" and "FOR AI SOLUTIONS" are English — acceptable as brand name but consider Arabic tagline
- 🔴 **`formatRelativeDate`** doesn't pass Arabic locale: `formatDistanceToNow(date, { addSuffix: true })` — will output "2 hours ago" instead of "منذ ساعتين"
- 🔴 **`formatCurrency`** uses `'en-AE'` locale — numbers/currency will be in English format
- 🟡 **File size labels** (KB, MB, GB) are in English — should use Arabic equivalents or at least keep consistent
- 🟡 **Sidebar `labelEn`** property exists but unused — dead data
- 🟡 **Login placeholder** `admin@pyramedia.ae` is English (acceptable for email)
- 🟡 **Metadata description** is English: `"PYRAMEDIA X Digital Workspace — File Management & Client Portal"`

**Recommendation:** Fix `date-fns` locale to Arabic, remove English suffixes from placeholder page titles, and update meta description.

---

## 10. Layout Quality — 9/10 ✅✅

**What's done well:**
- **Sidebar**: Clean, professional with logo, nav items, collapse toggle, proper active states with orange accent ✅
- **Topbar**: Sticky with backdrop blur, search/notifications/theme/user menu — polished ✅
- **Breadcrumb**: Clean chevron-separated navigation with proper RTL handling ✅
- **Mobile nav**: Sheet overlay with same nav structure ✅
- **Dashboard**: 4-column stat cards with icons — professional layout ✅
- **File explorer**: Well-organized toolbar → breadcrumbs → content flow ✅
- **Login page**: Split layout with branding gradient + form — modern and clean ✅
- **Consistent spacing**: `space-y-6` for page sections, `gap-4` for grids ✅
- **Typography**: Font stack with DM Sans + Noto Kufi Arabic — good bilingual coverage ✅
- **Scrollbar**: Custom styled, subtle ✅

**Issues:**
- 🟡 **Sidebar collapse gap** — main content `ps-[280px]` doesn't respond to collapse (as noted in #2)
- 🟡 **No user avatar image** — only initials fallback, no upload mechanism
- 🟡 **Topbar search** is placeholder only (button with no action)

**Recommendation:** Fix sidebar-content sync. Otherwise, the visual design is professional and cohesive.

---

## Summary Scorecard

| # | Area | Score | Status |
|---|------|-------|--------|
| 1 | RTL Support | 8/10 | ✅ Good — shadcn defaults need RTL patches |
| 2 | Responsive Design | 8/10 | ✅ Good — sidebar collapse sync needed |
| 3 | Component Quality | 9/10 | ✅✅ Excellent — clean architecture |
| 4 | Accessibility | 5/10 | ⚠️ Needs Work — minimal ARIA, no focus management |
| 5 | Performance | 7/10 | ✅ Good — unused deps, no image optimization |
| 6 | Theming | 9/10 | ✅✅ Excellent — consistent orange branding |
| 7 | State Management | 8/10 | ✅ Good — needs error boundary |
| 8 | File Explorer UX | 7/10 | ✅ Good MVP — needs actions & drag-drop |
| 9 | Arabic UI Text | 7/10 | ✅ Good — date locale + placeholder pages need fix |
| 10 | Layout Quality | 9/10 | ✅✅ Excellent — professional, cohesive |
| | **Overall** | **7.7/10** | **Solid foundation, ship-ready for Phase 1** |

---

## Top 5 Priority Fixes

1. **🔴 Accessibility overhaul** — ARIA labels, focus management, skip-nav, keyboard navigation
2. **🔴 Arabic date locale** — Add `{ locale: ar }` to all `date-fns` calls  
3. **🔴 Sidebar collapse sync** — Share collapsed state with layout via Context
4. **🔴 shadcn RTL patches** — Fix Dialog, Dropdown physical positioning
5. **🟡 Remove unused dependencies** — framer-motion, recharts, jspdf (or lazy-load them)

---

*Report generated from source code analysis of all 67 files across components/, app/, hooks/, lib/, and types/.*
