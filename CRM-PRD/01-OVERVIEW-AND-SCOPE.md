# 01 — Overview & Scope

## Product Vision

Replace the existing "زي الزفت" Sales Module inside `pyra-workspace3` with a **HubSpot-inspired, Lead-centric CRM** that treats every customer relationship as a long-term account — not a per-deal record. The CRM lives inside the existing workspace, shares its auth, RBAC, and database, and integrates naturally with existing Contracts, Invoices, Projects, and WhatsApp infrastructure.

This is **NOT a separate application**. It is a **first-class module** of `pyra-workspace3`.

---

## Core Architectural Model

### Lead = Customer Account (long-term)

The single most important architectural decision: **a Lead is a long-lived record representing a customer relationship**, NOT a per-deal opportunity record.

```
Traditional CRM:                Pyramedia CRM:
─────────────────               ─────────────────
Lead → Deal 1 (closed) → done   Lead = Customer (long-lived)
Lead → Deal 2 (closed) → done           ├── Contract 1 (Web)      [completed]
Lead → Deal 3 (closed) → done           ├── Contract 2 (Social)   [active retainer]
                                        └── Contract 3 (Video)    [in progress]
```

**Implications for code:**
- `pyra_sales_leads.id` is the central identifier across the customer lifetime.
- `pyra_contracts.lead_id` (NEW FK) links each contract to its parent lead.
- `pyra_invoices.lead_id` (NEW FK, OPTIONAL — can derive via contract) for fast filtering.
- `pyra_lead_activities` accumulates events across the entire relationship — pre-conversion AND post-conversion.
- A Lead's `stage_id` represents the **current** state. After "Closed Won", the lead remains in stage `closed_won` permanently while Contracts move independently.

### Pipeline Stages (v1)

Six stages, configurable via `pyra_sales_pipeline_stages`:

| Order | name | name_ar | Color | Notes |
|-------|------|---------|-------|-------|
| 1 | `new_inquiry` | استفسار جديد | sky | First contact, not qualified |
| 2 | `discovery_call` | مكالمة استكشافية | indigo | Qualified, gathering needs |
| 3 | `proposal_sent` | تم إرسال العرض | amber | Proposal/quote sent |
| 4 | `negotiation` | تفاوض | orange | Active negotiation |
| 5 | `contract_signed` | تم توقيع العقد | emerald | Pending Manager approval |
| 6 | `closed_won` | فوز بالصفقة | gold | Customer is active |
| 7 | `closed_lost` | خسارة | stone | Did not convert |

**Note**: Stage 5 (`contract_signed`) is a **transit stage** — leads parked here are awaiting Manager approval before becoming `closed_won`. See § Approval Workflow below.

### Conversion: Lead → Active Customer

When a Lead reaches `closed_won`:
1. The Lead remains in `pyra_sales_leads` permanently (`is_converted = true`, `converted_at = now()`).
2. **Optionally** (manual decision per `01-OVERVIEW...` § Portal Access): a `pyra_clients` row is created and linked via `pyra_sales_leads.client_id`. This grants portal access.
3. New deals/services for the same customer are added as **new `pyra_contracts` rows linked to the same `lead_id`** — NOT as new Leads.

### Closed Won Approval Workflow

A sales agent cannot move a deal to `closed_won` directly. Required flow:

```
sales_agent: drag card from Negotiation → Contract Signed
  ↓
System: requires either contract OR invoice attached (else block move)
  ↓
notify(): sends to manager via pyra_notifications
  ↓
Manager (Abdou): reviews on /dashboard/crm/approvals
  ↓
Manager: approves OR rejects (with reason)
  ↓
On approve: stage moves to `closed_won`, lead.converted_at = now()
On reject: stage moves back to `negotiation`, reason added to lead_activities
```

**Permission gate**: `leads.approve` (admin OR direct manager via `canApproveFor()`).

---

## Audiences (the 4 audiences from existing CLAUDE.md)

| Audience | Sees | Does NOT see |
|----------|------|--------------|
| **Admin** | Everything in CRM (all leads, all approvals, all reports). Default = Abdou. | N/A |
| **Sales Manager** | Same as Admin for CRM scope (in v1, Manager === Admin since Abdou is solo). | Other modules they don't have permission for. |
| **Sales Agent** (e.g., Sayed) | Only own leads (`assigned_to = my_username`). Pipeline filtered. WhatsApp filtered. | Other agents' leads. Approvals dashboard. Manager-level reports. |
| **Client** (Portal) | Their own contracts, invoices, projects, files (existing portal). **No CRM access.** | Pipeline. Other clients. Internal notes. |

**Out of audience scope for v1**: Marketing personas, anonymous lead capture from website forms, public-facing chatbot conversations.

---

## Scope: What's IN v1

### Pages
- `/dashboard/crm` (or `/dashboard/sales` — TBD, see Open Questions Q-001)
  - **Pipeline View** (Kanban, primary)
  - **Customers List** (all leads filterable)
  - **Lead Detail** (the unified lifetime view)
  - **Active Customer Detail** (post-Closed-Won, contracts-focused tab set)
- `/dashboard/crm/approvals` (Manager only)
- `/dashboard/crm/dashboard` — sales-specific overview (KPIs, AI insights, deals at risk, team performance)
- Mobile views: same routes, responsive (PWA — no native app needed)

### Capabilities
- Create Lead (manual + suggested-from-WhatsApp)
- Drag-drop stage movement (with permission gates and approval triggers)
- Activity Timeline (auto-logged WhatsApp, stage changes, file attachments + manual notes, calls, meetings)
- Follow-up scheduling with WhatsApp+in-app reminder
- Contract → Lead linking (extend `pyra_contracts` with `lead_id`)
- Sales-rep-scoped views (Sayed sees own only)
- Manager Approvals queue with one-click approve/reject + attachment requirement
- KPI dashboard (Pipeline value, Closed Won, Conversion rate, Avg deal, MRR from retainers)
- AI Insights banner (rule-based v1: "deals stuck N days", "approvals pending", "follow-ups overdue")
- Deals-at-risk widget (no activity ≥ 7 days)
- Add Lead modal (smart defaults, WhatsApp import suggestion)

### Notifications (via existing `notify()` helper)
New notification types to add to `NotificationType` union in `lib/notifications/notify.ts`:
- `lead_assigned` (already exists per existing schema — verify in `02-DATABASE...`)
- `lead_stage_changed`
- `lead_closed_won_pending_approval`
- `lead_closed_won_approved`
- `lead_closed_won_rejected`
- `follow_up_due` (already exists)
- `lead_idle_warning` (deals at risk — daily digest)

### WhatsApp Integration (uses existing Evolution API client)
- Auto-link incoming WhatsApp messages to Lead via phone number match.
- Auto-create activity entry of type `whatsapp_inbound` / `whatsapp_outbound`.
- WhatsApp Reminder for follow-ups: dispatched via existing `lib/evolution/client.ts` 30 min before scheduled time.
- "Send Quote" / "Send Invoice" / "Schedule Follow-up" quick actions from chat (these already exist per `pyra_whatsapp_*` tables).

---

## Scope: What's OUT (v2 or beyond)

Explicit non-goals so Claude Code doesn't accidentally build them:

- ❌ Email integration (open/click tracking, sequences) — defer to v2
- ❌ Public web forms / lead capture pages — Pyramedia's leads come from WhatsApp + referrals, not website
- ❌ Auto-routing rules (round-robin) — only one sales agent currently (Sayed)
- ❌ Multi-currency UX — assume AED (system-wide cash basis already in AED). Multi-currency exists in DB but no extra UI
- ❌ Sales SaaS features (will not be sold to other agencies — internal use only)
- ❌ Marketing automation hub
- ❌ Lead scoring beyond simple priority (low/medium/high/VIP)
- ❌ Sales sequences / cadences automation
- ❌ Call recording integration
- ❌ Calendar integration (Google/Outlook sync) — manual meeting entries only in v1
- ❌ Custom field builder UI — fixed schema in v1; if Abdou needs custom fields, hard-code them
- ❌ Advanced reports builder — fixed dashboard widgets in v1

---

## Success Metrics (post-launch)

- All Sayed's leads visible to him on Day 1 (zero data loss)
- Abdou approves 1+ Closed Won within first week using the new flow
- 0 calls of `INSERT INTO pyra_notifications` outside `notify()` helper
- 0 raw `fetch()` calls in components (verified via existing eslint rule)
- `pnpm build` clean
- One full lead lifecycle (New Inquiry → Closed Won) completes correctly E2E

---

## Owner Profile (for context)

- **Abdou**: Sales Manager + Founder. Single person currently doing all approvals and most management work.
- **Sayed**: Solo sales agent. Mobile-heavy (in the field).
- **Future state**: Abdou plans to hire more sales agents. The system should support this without rework (manager hierarchy via `manager_username` already exists in `pyra_users`).

---

## Critical Constraint Reminders

1. **Brand**: Black + Orange (#F97316) + Gold (#D4A017) + White
2. **RTL Arabic-first** with Tajawal for body, Plus Jakarta Sans for numbers
3. **Existing tech stack only** — no new frameworks, no new auth, no new DB
4. **Production data is sacred** — no schema drops, no DELETEs without approval
5. **Single source of truth** — Lead is the central entity, not Contract or Invoice or Client
