# PyramediaX Accountant — Full Project Handoff

## 🎯 What Is This?
A **bilingual (Arabic RTL / English LTR) Financial Management Dashboard** for PyramediaX — a marketing + AI agency in Dubai. Built with Next.js 14, Supabase, and Tailwind CSS.

**GitHub Repo:** `https://github.com/Engmohammedabdo/pyramedix-accountent`

## 📂 Start Here — Read These Files FIRST
1. **`PRD.md`** — Full product requirements
2. **`EXECUTION-PLAN.md`** — 7-phase plan with checklists

## ✅ What's Already Done
- **Phase 1 (Database):** ✅ — 5 new tables, 6 views, 2 RPC functions on Supabase
- **Phase 2 (Project Setup):** ✅ — Full skeleton (9 pages, 16 UI components, layout, i18n, types)
- **Phase 3 (Dashboard Layout):** ✅ — Sidebar, topbar, stat cards, chart wrappers
- **Project builds successfully** with `pnpm build`

## 🔴 Start from Phase 4

### Phase 4: CRUD Pages (connect to real Supabase data)
Pages exist but show **mock data**. Wire them to real DB:
- **Clients** — List from `pyra_clients`, financial summary per client
- **Contracts** — CRUD `pyra_contracts`, billing types (Retainer/Milestone/Upfront+Delivery)
- **Transactions** — Income (`pyra_payments`) + Expenses (`pyra_expenses`), filters
- **Subscriptions** — CRUD `pyra_subscriptions`, link to card, renewal alerts
- **Cards** — CRUD `pyra_cards` (bank cards)

### Phase 5: Invoice Upload + OCR
- Drag & drop → Supabase Storage → n8n webhook → Gemini Vision OCR → review & save

### Phase 6: Telegram Bot + Notifications
- Bot for invoice photos, n8n notifications (payment due, subscription renewal)

### Phase 7: Polish + Deploy
- Full translations, RTL/LTR testing, responsive, deploy on Coolify

## 🗄️ Database

**Supabase:** `pyraworkspacedb.pyramedia.cloud`

**Existing tables (DO NOT MODIFY):** `pyra_clients`, `pyra_projects`, `pyra_invoices`, `pyra_payments`, `pyra_quotes`

**New tables (already created):**
- `pyra_cards` — bank cards
- `pyra_expense_categories` — dynamic categories
- `pyra_expenses` — expenses linked to categories/cards
- `pyra_subscriptions` — recurring subscriptions
- `pyra_contracts` — contracts with auto-calculated `remaining_amount`

**Views:** `v_financial_overview`, `v_monthly_revenue`, `v_expense_breakdown`, `v_upcoming_subscriptions`, `v_overdue_payments`, `v_client_financial_summary`

**RPC:** `get_revenue_by_period(start, end)`, `get_expense_by_period(start, end)`

## ⚠️ Critical Rules
1. **DO NOT modify existing tables** — only use new `pyra_*` tables
2. **Arabic = default language** (RTL)
3. **CRUD through Supabase client** (`@/lib/supabase`)
4. **Currency: AED default**, multi-currency support
5. **Keep existing file structure** — don't reorganize

## Tech Stack
Next.js 14 (App Router) + Tailwind + Shadcn UI + Supabase + next-intl + Recharts + Lucide + react-dropzone

---

**Clone the repo, read PRD.md + EXECUTION-PLAN.md, then start Phase 4 — one page at a time.**
