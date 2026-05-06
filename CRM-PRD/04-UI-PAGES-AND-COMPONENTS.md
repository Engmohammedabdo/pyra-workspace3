# 04 — UI Pages & Components

> Read `00-README.md`, `02-DATABASE...`, `03-API...` first. Visual reference: see the 4 HTML mockups delivered with this PRD (`pyramedia-crm.html`, `pyramedia-dashboard.html`, `pyramedia-customer.html`, `pyramedia-mobile.html`).

---

## Page Routes

All pages live under `app/dashboard/crm/...`. The existing `/dashboard/sales/*` routes are deprecated but kept (with 301 redirects) for one release cycle.

| Route | File | Audience | Purpose |
|-------|------|----------|---------|
| `/dashboard/crm` | `app/dashboard/crm/page.tsx` | All CRM users | Sales Dashboard (KPIs, insights, deals at risk, team perf) |
| `/dashboard/crm/pipeline` | `app/dashboard/crm/pipeline/page.tsx` | All CRM users | Kanban Pipeline view |
| `/dashboard/crm/leads` | `app/dashboard/crm/leads/page.tsx` | All CRM users | List view (filterable table) |
| `/dashboard/crm/leads/[id]` | `app/dashboard/crm/leads/[id]/page.tsx` | All CRM users (scoped) | Lead Detail (timeline + tabs) |
| `/dashboard/crm/customers` | `app/dashboard/crm/customers/page.tsx` | All CRM users | List of converted leads (closed_won) |
| `/dashboard/crm/customers/[id]` | `app/dashboard/crm/customers/[id]/page.tsx` | All CRM users (scoped) | **Active Customer Detail** (contracts, projects, payments tabs) |
| `/dashboard/crm/approvals` | `app/dashboard/crm/approvals/page.tsx` | Manager + Admin only | Closed Won approval queue |
| `/dashboard/crm/follow-ups` | `app/dashboard/crm/follow-ups/page.tsx` | All CRM users (scoped) | Follow-ups list (calendar + list view) |
| `/dashboard/crm/reports` | `app/dashboard/crm/reports/page.tsx` | Manager + Admin | Detailed reports (deferred to v1.1) |

**Note on customers vs leads route**: A "customer" is a lead with `is_converted = true` AND `stage_id = 'stg_closed_won'`. They share the same underlying record but the UI shells differ (customer page emphasizes contracts/projects/invoices; lead page emphasizes pipeline activity).

**Cross-link**: Clicking a customer from `/customers/[id]` should be the **same record** as that lead's `/leads/[id]` — but with a different shell. Implement as **two views of the same data**, not two separate detail pages with duplicate logic. Recommended: a shared `<LeadCustomerDetail>` component that toggles tab sets based on `is_converted`.

---

## Sidebar Updates

Add a **CRM section** to `components/layout/sidebar.tsx`:

```tsx
{
  label: 'CRM',
  permission: 'leads.view',
  items: [
    { label: 'صندوق شغلي', href: '/dashboard', icon: 'LayoutDashboard' }, // existing
    { label: 'لوحة المبيعات', href: '/dashboard/crm', icon: 'BarChart3' },
    { label: 'خط المبيعات', href: '/dashboard/crm/pipeline', icon: 'GitBranch' },
    { label: 'العملاء', href: '/dashboard/crm/customers', icon: 'Users' },
    { label: 'الواتساب', href: '/dashboard/sales/whatsapp', icon: 'MessageCircle' }, // existing
    { label: 'المتابعات', href: '/dashboard/crm/follow-ups', icon: 'BellRing', badgeCount: { source: 'follow_ups_pending' } },
    { label: 'اعتمادات تنتظرك', href: '/dashboard/crm/approvals', icon: 'CheckCircle2', permission: 'leads.approve', badgeCount: { source: 'approvals_pending' } },
    { label: 'التقارير', href: '/dashboard/crm/reports', icon: 'PieChart', permission: 'crm_reports.team_view' },
  ]
}
```

The sidebar should hide items the user lacks permission for (existing pattern).

---

## React Query Hooks

Create `hooks/useCRM*.ts` files following the existing pattern (`hooks/useClients.ts` is the template).

### Required hooks

```typescript
// hooks/useLeads.ts
useLeads(params?)              // list with filters (staleTime 30_000)
useLead(id?)                   // single (enabled gate)
useCreateLead()                // mutation
useUpdateLead()                // mutation
useMoveLeadStage()             // mutation (special — calls /move-stage endpoint)
useArchiveLead()               // mutation

// hooks/useLeadActivities.ts
useLeadActivities(leadId?, params?)
useCreateLeadActivity()

// hooks/useFollowUps.ts
useFollowUps(params?)
useCreateFollowUp()
useCompleteFollowUp()

// hooks/usePipelineStages.ts
usePipelineStages()            // staleTime 5min — rarely changes

// hooks/useCRMDashboard.ts
useCRMKPIs(period)
useCRMFunnel(period)
useDealsAtRisk()
useTeamPerformance()
useCRMRecentActivity()
useCRMInsights()

// hooks/useApprovals.ts
usePendingApprovals()
useApproveCloseLeadWin()
useRejectCloseLeadWin()
```

### Hook patterns (must follow these)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from '@/hooks/api-helpers';
import type { Lead } from '@/types/database';

// List
export function useLeads(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<{ leads: Lead[]; total: number; has_more: boolean }>({
    queryKey: ['crm', 'leads', params],
    queryFn: () => fetchAPI(`/api/crm/leads${qs}`),
    staleTime: 30_000,
  });
}

// Single
export function useLead(id: string | undefined) {
  return useQuery<{ lead: Lead; contracts: any[]; /* ... */ }>({
    queryKey: ['crm', 'leads', id],
    queryFn: () => fetchAPI(`/api/crm/leads/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// Mutation with cache invalidation
export function useMoveLeadStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; to_stage_id: string; attachment?: { type: string; id: string }; lost_reason?: string }) =>
      mutateAPI(`/api/crm/leads/${input.id}/move-stage`, 'POST', input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['crm', 'leads'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', variables.id] });
      qc.invalidateQueries({ queryKey: ['crm', 'dashboard'] });
    },
  });
}
```

**Update `hooks/useMyWork.ts` (the existing inbox aggregator)** to include CRM sections:
- `leads_assigned_to_me` (count)
- `follow_ups_due_today` (count)
- `crm_approvals_pending` (count, manager+admin only)

---

## Component Architecture

### Pipeline Page (`/dashboard/crm/pipeline`)

```
app/dashboard/crm/pipeline/page.tsx       (Server component — layout/metadata)
app/dashboard/crm/pipeline/pipeline-client.tsx  (Client component — main UI)

Components used:
  components/crm/pipeline/
    pipeline-board.tsx        // The Kanban container with horizontal scroll
    pipeline-column.tsx       // Single stage column with header + drop zone
    pipeline-card.tsx         // Single lead card (draggable)
    pipeline-filter-bar.tsx   // Top filter row (owner, source, date, stats)
    pipeline-empty.tsx        // Empty state for a column

  components/crm/lead/
    lead-stage-pill.tsx       // Reusable stage badge with color
    lead-priority-badge.tsx   // VIP/star indicator
    lead-source-icon.tsx      // WhatsApp/Instagram/Referral icons

  components/ui/  (shadcn — existing, reuse)
```

**Drag-and-drop**: use `@dnd-kit` (already in repo per CLAUDE.md tech stack).

**Click handler on card**: navigate to `/dashboard/crm/leads/[id]` (don't open modal in v1 — full page navigation is simpler and Next.js handles the back button correctly).

**Sales agent UX**: when filtering, agents only see own leads. The "owner" filter is hidden for them (since it'd be a one-option dropdown — useless).

### Lead Detail Page (`/dashboard/crm/leads/[id]`)

```
app/dashboard/crm/leads/[id]/page.tsx
app/dashboard/crm/leads/[id]/lead-detail-client.tsx

Components:
  components/crm/lead-detail/
    lead-header.tsx           // Avatar + name + stage + quick actions
    lead-stat-cards.tsx       // 4-card stat strip (value, days in pipeline, last activity, win prob)
    lead-tabs.tsx             // Overview / Activities / Deals / Files / Notes
    lead-overview-tab.tsx     // Active deals + recent activity
    lead-activity-tab.tsx     // Full timeline with filters
    lead-deals-tab.tsx        // Contracts list (post-conversion)
    lead-files-tab.tsx        // Files (proposals, contracts, invoices)
    lead-notes-tab.tsx        // Pinned notes + all notes
    lead-sidebar.tsx          // Right sidebar: contact, follow-up, tags, custom fields

  components/crm/activity/
    activity-timeline.tsx     // Renders the timeline with day dividers
    activity-item.tsx         // Single timeline entry (variants per type)
    activity-composer.tsx     // Add note/log call/schedule meeting widget
    activity-filter-bar.tsx   // Filter chips
```

**Tabs**: store active tab in URL query param `?tab=overview` for shareable links.

### Active Customer Page (`/dashboard/crm/customers/[id]`)

This is a **second shell** of the same Lead record, switched on `is_converted = true`.

```
app/dashboard/crm/customers/[id]/page.tsx
app/dashboard/crm/customers/[id]/customer-detail-client.tsx

Components (mostly new):
  components/crm/customer/
    customer-header.tsx       // Cover banner + logo + name + Closed Won badge + actions
    customer-stat-strip.tsx   // 5 cards: LTV, MRR, Contracts, Projects, Health Score
    customer-health-ring.tsx  // SVG ring for health score
    customer-tabs.tsx         // Overview / Contracts / Projects / Invoices / Activity / Files / Notes
    customer-overview-tab.tsx
    customer-contracts-tab.tsx  // ★ The killer tab — see below
    customer-projects-tab.tsx   // Deferred — empty state in v1, links to /dashboard/projects?client_id=...
    customer-invoices-tab.tsx   // Deferred — empty state, link to /dashboard/finance/invoices?client_id=...
    customer-activity-tab.tsx   // Reuses lead's activity-timeline
    customer-portal-toggle.tsx  // Switch in sidebar to enable/disable portal
    customer-contact-list.tsx   // Manage multiple contact persons (v1 = just primary)

  components/crm/contracts/
    contract-card.tsx         // One contract block (status, value, milestones, billing history)
    contract-billing-history.tsx  // Inline mini-grid showing each month's invoice status
    contract-milestones.tsx   // For project-type contracts
```

#### Customer-Contracts Tab (the proof point of "one customer, multiple deals")

This is the most important tab. Pull from `pyra_contracts WHERE lead_id = ?`.

**Layout**:
```
[ Header: "3 عقود · إجمالي 145K + متجدد شهرياً" ] [ + عقد جديد ]

Active retainer (emphasized green border)
  ├── Title + status pill
  ├── 4 stats: monthly value, total paid, remaining months, next renewal date
  ├── Billing history mini-grid (each month as colored chip)
  └── Actions: View PDF, New Invoice, Pause

In-progress project contract
  ├── Title + status pill
  ├── 4 stats: value, paid, remaining, milestones (X of N)
  ├── Milestones checklist
  └── Actions: View Project, View Contract

Completed contract (greyed out)
  ├── Title + completed badge
  └── 4 stats: value, paid in full, duration, rating
```

**Each card pulls from**:
- `pyra_contracts` → contract details
- `pyra_invoices WHERE contract_id = ?` → billing history
- `pyra_payments WHERE invoice_id IN (...)` → payment status
- `pyra_contract_milestones WHERE contract_id = ?` → milestones

Use existing hooks where available (`useContracts`, etc.) — don't duplicate.

### Sales Dashboard Page (`/dashboard/crm`)

```
app/dashboard/crm/page.tsx
app/dashboard/crm/dashboard-client.tsx

Components:
  components/crm/dashboard/
    dashboard-greeting.tsx     // "Good morning, Abdou 👋"
    dashboard-ai-insight.tsx   // The gold-themed banner
    dashboard-kpi-cards.tsx    // 4-card grid (pipeline, closed won, conv rate, avg deal)
    dashboard-funnel.tsx       // Funnel viz with stage bars
    dashboard-deals-at-risk.tsx
    dashboard-action-cards.tsx // 3 cards: approvals, follow-ups, whatsapp
    dashboard-team-performance.tsx
    dashboard-activity-feed.tsx
    dashboard-data-sources.tsx // The transparency footer
```

**AI Insights logic** (client-side render of server-side rule output):

```typescript
function AIInsightBanner() {
  const { data: insights } = useCRMInsights();
  const top = insights?.[0];
  if (!top) return null;
  return <InsightBanner insight={top} />;
}
```

### Approvals Page (`/dashboard/crm/approvals`)

Manager-only page with the queue.

```
components/crm/approvals/
  approval-queue.tsx           // List of pending approvals
  approval-card.tsx            // Single approval item (lead summary + attachments + buttons)
  approval-detail-modal.tsx    // Click for full detail before deciding
```

### Add Lead Modal (global)

Available from any CRM page via the `+ Lead جديد` button in the top bar.

```
components/crm/add-lead-modal/
  add-lead-modal.tsx           // The dialog shell
  add-lead-form.tsx            // The form
  whatsapp-import-banner.tsx   // The "import from WhatsApp" smart suggestion
  service-type-selector.tsx    // The 4x2 grid of service buttons
  follow-up-quick-picker.tsx   // The "tomorrow / 3 days / 1 week" buttons
```

**Form behavior**:
- Submit creates lead via `useCreateLead()`.
- On success: invalidate `['crm','leads']`, close modal, navigate to `/dashboard/crm/leads/[new_id]`.
- On error: show toast, keep form open.
- "Save and add another" button: submit + reset form, don't close.

---

## Mobile (PWA)

The desktop pages must be responsive. Use Tailwind breakpoints:
- `< 768px` (mobile): single column, sticky header, bottom tab bar, FAB for WhatsApp.
- `768–1024px` (tablet): two columns where appropriate.
- `> 1024px` (desktop): full layouts.

### Mobile-specific components

```
components/crm/mobile/
  mobile-bottom-nav.tsx        // Bottom tab bar (Home / Pipeline / Customers / WhatsApp / More)
  mobile-fab-whatsapp.tsx      // Floating WhatsApp button
  pipeline-mobile-view.tsx     // Stage tabs at top, vertical card list (NOT horizontal scroll)
  lead-detail-mobile-view.tsx  // Hero header (full-bleed dark), then stats + actions + tabs
```

**Key UX**:
- Pipeline on mobile: horizontal stage tabs at top (sticky), vertical scrollable list of cards.
- Bottom nav appears on all mobile pages.
- WhatsApp action takes precedence (large green button on every lead card).

### PWA Setup

Add `manifest.json` to `/public/`:

```json
{
  "name": "Pyramedia CRM",
  "short_name": "Pyramedia",
  "start_url": "/dashboard/crm",
  "display": "standalone",
  "background_color": "#F5F5F4",
  "theme_color": "#0A0A0A",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Reference in `app/layout.tsx`:
```tsx
<link rel="manifest" href="/manifest.json" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Pyramedia" />
```

**Service worker**: defer to v1.1. Native install prompt works without SW.

---

## Design Tokens (apply consistently)

Match the visual mockups (`pyramedia-*.html`):

```typescript
// extend tailwind.config.ts
colors: {
  ink: '#0A0A0A',
  charcoal: '#1A1A1A',
  orange: { 500: '#F97316', 600: '#EA580C', /* etc. */ },
  gold:   { 400: '#D4A017', 500: '#B7791F', /* etc. */ },
}

fontFamily: {
  sans: ['Tajawal', 'system-ui', 'sans-serif'],
  display: ['"Plus Jakarta Sans"', 'sans-serif'],
}
```

**Use `font-sans` for Arabic body, `font-display` for prominent numbers and English headings.**

**Numbers should always be `.num` styled** (font-feature: tabular-nums) for alignment.

---

## RTL Reminders

- Use `ms-`/`me-`/`ps-`/`pe-` (NEVER `ml-`/`mr-`/`pl-`/`pr-`).
- Use `start-`/`end-` (NEVER `left-`/`right-`).
- Icons that have direction (arrows, chevrons) need RTL flipping or use direction-neutral options.
- Tables: column order is right-to-left for Arabic content.

---

## Loading & Empty States

- Use existing `<EmptyState>` from `components/ui/empty-state.tsx` (do NOT inline empty messages).
- Use `<Skeleton>` from `components/ui/skeleton.tsx` while data loads (do NOT show blank screens).
- Toast notifications: `import { toast } from 'sonner'`. NEVER `alert()`.

---

## Acceptance Criteria (UI)

- [ ] All pages render without console errors
- [ ] Dark mode toggling works (existing `dark:*` pattern)
- [ ] All interactive elements have hover/focus states
- [ ] Mobile breakpoint: pipeline scrolls vertically, not horizontally
- [ ] Sidebar items hide when permission missing
- [ ] Empty states show for: empty pipeline column, no leads, no follow-ups
- [ ] Loading skeletons appear during fetch
- [ ] Click on a Pipeline card navigates to lead detail
- [ ] Add Lead modal opens from any CRM page
- [ ] Approval queue is hidden for non-managers
- [ ] All Arabic text correctly RTL
- [ ] Numbers use tabular nums

---

## Defer to v2 (don't build in v1)

- Custom field builder UI
- Lead score calculator UI
- Email sequence builder
- Calendar embed for meetings
- Live chat widget
- Reports builder UI
- Drag-drop column reordering
- Lead scoring rules editor
