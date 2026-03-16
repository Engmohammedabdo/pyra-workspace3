# Client Portal — Missing Features & Gaps Report

> **Generated**: 2026-03-06
> **Status**: Pending Implementation
> **Priority**: High — These gaps affect client experience and data accessibility

---

## Executive Summary

The client portal currently has **8 pages** (Projects, Files, Quotes, Invoices, Scripts, Help, Notifications, Profile). After a full system audit, we identified **3 categories of gaps**:

1. **Features with `client_id` in DB but no portal page** — Data exists, clients can't see it
2. **Missing tabs in Client Detail page** — Admin can't see full client picture
3. **Missing portal functionality** — Features that should exist for client self-service

---

## 1. Missing Portal Pages (Client-Facing)

### 1.1 Contracts Page ⭐ Critical

- **Current State**: Contracts (`pyra_contracts`) have `client_id` field. Admin can view at `/dashboard/finance/contracts/`. No portal access.
- **Impact**: Clients cannot view their signed contracts, milestones, or deliverable schedules
- **Required**:
  - [ ] `app/portal/(main)/contracts/page.tsx` — List client contracts
  - [ ] `app/portal/(main)/contracts/[id]/page.tsx` — Contract detail (milestones, progress, linked invoices)
  - [ ] `app/api/portal/contracts/route.ts` — GET contracts scoped to client
  - [ ] `app/api/portal/contracts/[id]/route.ts` — GET single contract detail
  - [ ] Add "العقود" to portal sidebar navigation
- **Data Available**: `pyra_contracts` (client_id, project_id, amount, status, milestones)
- **Scope**: Read-only. Client views contract details and milestone progress.

### 1.2 Client Statement / Payment History ⭐ Critical

- **Current State**: Admin has `/dashboard/finance/client-statement/[clientId]` page. Clients pay via Stripe but have no payment history view.
- **Impact**: Clients cannot see their balance, payment history, or outstanding amounts
- **Required**:
  - [ ] `app/portal/(main)/statement/page.tsx` — Client financial statement
  - [ ] `app/api/portal/statement/route.ts` — GET aggregated financial data (invoices, payments, balance)
  - [ ] Add "كشف الحساب" to portal sidebar navigation
- **Data Available**: `pyra_invoices` (totals, status), `pyra_payments` (amounts, dates), `pyra_stripe_payments`
- **Scope**: Read-only. Shows: total invoiced, total paid, outstanding balance, payment timeline.

### 1.3 Recurring Invoices Page 🟡 Medium

- **Current State**: Recurring invoices (`pyra_recurring_invoices`) have `client_id`. Admin manages at `/dashboard/finance/recurring/`. No portal view.
- **Impact**: Clients don't know their billing schedule or upcoming auto-generated invoices
- **Required**:
  - [ ] `app/portal/(main)/recurring/page.tsx` — List recurring invoice schedules
  - [ ] `app/api/portal/recurring/route.ts` — GET recurring invoices scoped to client
  - [ ] Add "الفواتير المتكررة" to portal sidebar or as sub-tab under Invoices
- **Data Available**: `pyra_recurring_invoices` (client_id, frequency, next_date, amount, status)
- **Scope**: Read-only. Client sees schedule, frequency, next billing date.

---

## 2. Missing Tabs in Client Detail Page (Admin-Facing)

**Current tabs** (7): Overview, Projects, Invoices, Quotes, Notes, Activity, Branding

### 2.1 Contracts Tab ⭐ Critical

- **Current State**: Contracts are linked via `client_id` but don't appear in client detail page
- **Required**:
  - [ ] Add "العقود" tab to `app/dashboard/clients/[id]/client-detail-client.tsx`
  - [ ] Fetch from `/api/finance/contracts?client_id={id}`
  - [ ] Show: contract name, status, amount, milestones progress, linked project
- **Why**: Admin needs full picture of client relationship. Contracts are key.

### 2.2 Recurring Invoices Tab 🟡 Medium

- **Current State**: Recurring invoices linked via `client_id` but not visible in client profile
- **Required**:
  - [ ] Add "فواتير متكررة" tab to client detail page
  - [ ] Fetch from `/api/finance/recurring-invoices?client_id={id}`
  - [ ] Show: frequency, next date, amount, auto-send status
- **Why**: Admin should see client's billing schedule from their profile.

### 2.3 Files Tab 🟡 Medium

- **Current State**: Client files are scattered across projects. No unified file view in client profile.
- **Required**:
  - [ ] Add "الملفات" tab to client detail page
  - [ ] Aggregate files from all client's projects via `pyra_project_files`
  - [ ] Show: file name, project, status (pending/approved/revision), upload date
- **Why**: Quick overview of all deliverables across all client projects.

### 2.4 Scripts Tab 🟢 Low

- **Current State**: Script reviews exist for client projects but not shown in client detail
- **Required**:
  - [ ] Add "السكريبتات" tab to client detail page
  - [ ] Fetch script reviews linked to client's projects
  - [ ] Show: script name, review status, comments count
- **Why**: Nice-to-have for content production workflow visibility.

### 2.5 Payments Tab 🟡 Medium

- **Current State**: Payments are embedded within individual invoices. No consolidated payment history.
- **Required**:
  - [ ] Add "المدفوعات" tab to client detail page
  - [ ] Fetch from `pyra_payments` + `pyra_stripe_payments` for client
  - [ ] Show: payment date, amount, method (Stripe/manual), linked invoice
- **Why**: Financial overview without navigating individual invoices.

---

## 3. Portal Enhancements (Existing Pages)

### 3.1 Invoice Page — Add Payment History 🟡 Medium

- **Current State**: Portal invoice detail shows invoice info + Stripe pay button. No payment history.
- **Required**:
  - [ ] Show list of past payments on invoice detail page
  - [ ] Show remaining balance if partial payments exist
  - [ ] Fetch from `pyra_payments` where `invoice_id` matches

### 3.2 Project Page — Add Contract Link 🟢 Low

- **Current State**: Portal project detail shows files, comments, members. No contract reference.
- **Required**:
  - [ ] If project has linked contract (`pyra_contracts.project_id`), show contract summary card
  - [ ] Link to contract detail page (after 1.1 is implemented)

### 3.3 Portal Dashboard — Add Financial Summary 🟡 Medium

- **Current State**: Portal home shows stats (active projects, pending approvals, files). No financial info.
- **Required**:
  - [ ] Add financial summary card: total invoiced, total paid, outstanding balance
  - [ ] Add upcoming invoices section (next recurring invoice date)
  - [ ] Fetch from existing `/api/portal/statement` (after 1.2 is implemented)

---

## 4. Implementation Priority

### Phase 1 — Critical (Client Trust & Transparency)
| # | Task | Type | Effort |
|---|------|------|--------|
| 1 | Contracts portal page + API | New Portal Page | High |
| 2 | Client Statement portal page + API | New Portal Page | Medium |
| 3 | Contracts tab in client detail | New Tab | Low |

### Phase 2 — Medium (Complete Client Profile)
| # | Task | Type | Effort |
|---|------|------|--------|
| 4 | Recurring Invoices portal page | New Portal Page | Medium |
| 5 | Payments tab in client detail | New Tab | Low |
| 6 | Files tab in client detail | New Tab | Low |
| 7 | Recurring Invoices tab in client detail | New Tab | Low |
| 8 | Payment history on portal invoice detail | Enhancement | Low |
| 9 | Financial summary on portal dashboard | Enhancement | Low |

### Phase 3 — Low (Nice-to-Have)
| # | Task | Type | Effort |
|---|------|------|--------|
| 10 | Scripts tab in client detail | New Tab | Low |
| 11 | Contract link on portal project detail | Enhancement | Low |

---

## 5. Technical Notes

### Portal Data Scoping
All new portal APIs must use `buildClientProjectScope(clientId, company)` from `lib/portal/auth.ts` to ensure clients only see their own data.

### Portal Sidebar Update
New pages require adding nav items to `components/portal/portal-sidebar.tsx`:
```typescript
{ href: '/portal/contracts', label: 'العقود', icon: FileSignature },
{ href: '/portal/statement', label: 'كشف الحساب', icon: Wallet },
```

### Client Detail Tabs
New tabs require modification to `app/dashboard/clients/[id]/client-detail-client.tsx` (lazy-loaded tab pattern already established).

### Checklist Reminder
For each new page, follow the mandatory checklist in `CLAUDE.md`:
- Module guide entry (dashboard pages only)
- Empty states via `EmptyState` component
- RTL + Dark mode compliance
- TypeScript check + build verification

---

## 6. Current Portal vs Expected Portal

```
Current Portal (8 pages):        Expected Portal (11 pages):
├── Projects ✅                   ├── Projects ✅
├── Files ✅                      ├── Files ✅
├── Quotes ✅                     ├── Quotes ✅
├── Invoices ✅                   ├── Invoices ✅ (+ payment history)
├── Scripts ✅                    ├── Scripts ✅
├── Help Center ✅                ├── Contracts ⭐ NEW
├── Notifications ✅              ├── Statement ⭐ NEW
├── Profile ✅                    ├── Recurring Invoices 🆕 NEW
                                  ├── Help Center ✅
                                  ├── Notifications ✅
                                  └── Profile ✅

Current Client Detail (7 tabs):  Expected Client Detail (12 tabs):
├── Overview ✅                   ├── Overview ✅
├── Projects ✅                   ├── Projects ✅
├── Invoices ✅                   ├── Invoices ✅
├── Quotes ✅                     ├── Quotes ✅
├── Notes ✅                      ├── Contracts ⭐ NEW
├── Activity ✅                   ├── Payments 🆕 NEW
├── Branding ✅                   ├── Files 🆕 NEW
                                  ├── Recurring 🆕 NEW
                                  ├── Scripts 🆕 NEW
                                  ├── Notes ✅
                                  ├── Activity ✅
                                  └── Branding ✅
```
