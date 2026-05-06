# 03 — API Endpoints & Permissions

> Read `00-README.md` and `02-DATABASE-AND-MIGRATION.md` first. Every API route here assumes the schema from §02 is in place.

---

## Architecture Reminders (from existing CLAUDE.md)

All API routes in this PRD MUST use:

```typescript
// Auth gate
import { requireApiPermission, requireApiAuth } from '@/lib/api/auth';

// Response helpers
import { apiSuccess, apiError } from '@/lib/api/response';

// Activity audit
import { logActivity } from '@/lib/api/activity';

// Notifications (NEVER raw INSERT)
import { notify, notifyMany } from '@/lib/notifications/notify';

// Status constants
import { LEAD_ACTIVITY_TYPES, LEAD_STATUS_LABELS } from '@/lib/constants/statuses';

// Scope checks
import { canAccessLead, getLeadScopeFilter } from '@/lib/auth/lead-scope';
import { canApproveFor } from '@/lib/auth/team-scope';
```

**Naming convention** (strict):
- File path: `app/api/crm/<resource>/route.ts` for collection
- File path: `app/api/crm/<resource>/[id]/route.ts` for single
- Sub-actions: `app/api/crm/<resource>/[id]/<action>/route.ts`

**HTTP methods**:
- `GET` for list/read (idempotent)
- `POST` for create + actions (move, approve, reject)
- `PATCH` for partial update
- `DELETE` for soft-delete (hard delete forbidden — sets `is_archived` if needed)

---

## New RBAC Permissions

Add to `lib/auth/rbac.ts`:

```typescript
// CRM Permissions (new in v1)
export const CRM_PERMISSIONS = [
  // Leads
  'leads.view',         // see own leads (BASE for sales_agent)
  'leads.create',       // create new lead
  'leads.update',       // edit own lead fields (excluding stage past contract_signed)
  'leads.assign',       // change assigned_to (manager + admin only)
  'leads.delete',       // archive a lead (manager + admin)
  'leads.move_stage',   // drag/drop between stages (own leads, except closed_won)
  'leads.approve',      // approve closed_won (MANAGER ONLY via canApproveFor)
  'leads.manage',       // admin override — sees all leads everywhere

  // Activities
  'lead_activities.view',
  'lead_activities.create',  // add note, log call, schedule meeting

  // Follow-ups
  'follow_ups.view',
  'follow_ups.create',
  'follow_ups.complete',
  'follow_ups.manage',  // admin only

  // CRM Reports
  'crm_reports.view',
  'crm_reports.team_view',  // see team-level (manager + admin)
] as const;
```

**Update `BASE_EMPLOYEE`** (still HR self-service only — no CRM permissions):

No change. CRM is opt-in via role.

**Update `ROLE_EXTRAS` for `sales_agent`**:

```typescript
ROLE_EXTRAS.sales_agent = [
  ...ROLE_EXTRAS.sales_agent || [],
  'leads.view',
  'leads.create',
  'leads.update',
  'leads.move_stage',
  'lead_activities.view',
  'lead_activities.create',
  'follow_ups.view',
  'follow_ups.create',
  'follow_ups.complete',
  'crm_reports.view',
  // NOT: leads.assign, leads.approve, leads.delete, leads.manage,
  //      crm_reports.team_view, follow_ups.manage
];
```

**New role suggestion (v1.1, NOT v1): `sales_manager`**

Pre-create the role in `pyra_roles` table for future use, but Abdou keeps `admin` for v1.

---

## Notification Types

Add to `NotificationType` union in `lib/notifications/notify.ts`:

```typescript
export type NotificationType =
  | ... // existing types from current code
  | 'lead_assigned'                      // exists already — verify
  | 'lead_transferred'                   // exists already — verify
  | 'lead_stage_changed'                 // NEW
  | 'lead_closed_won_pending_approval'   // NEW (to manager)
  | 'lead_closed_won_approved'           // NEW (to sales agent)
  | 'lead_closed_won_rejected'           // NEW (to sales agent)
  | 'lead_idle_warning'                  // NEW (daily digest)
  | 'follow_up_due'                      // exists already — verify
  | 'follow_up_overdue';                 // NEW
```

**Add to `NOTIFICATION_LABELS_AR`** (UI labels):

```typescript
{
  lead_stage_changed: 'انتقلت مرحلة الـ Lead',
  lead_closed_won_pending_approval: 'صفقة بانتظار اعتمادك',
  lead_closed_won_approved: 'تم اعتماد إغلاق الصفقة',
  lead_closed_won_rejected: 'تم رفض إغلاق الصفقة',
  lead_idle_warning: 'صفقات راكدة في خطر',
  follow_up_overdue: 'متابعة متأخرة',
}
```

---

## Endpoint Catalog

### Leads

#### `GET /api/crm/leads`
List leads (scoped). Supports filters via querystring.

**Permission**: `leads.view`
**Scope**: filtered to own leads if not admin (uses `getLeadScopeFilter`)

**Query params**:
- `stage_id` — filter by stage
- `assigned_to` — filter by owner (admin only — agents can't override own filter)
- `priority` — `low`, `medium`, `high`, `vip`
- `lead_type` — `b2b` or `b2c`
- `source` — pipeline source
- `is_converted` — `true` / `false`
- `search` — full-text on name + company + phone
- `limit`, `offset` — pagination
- `sort` — default `last_contact_at_desc`

**Response shape**:
```typescript
{
  ok: true,
  data: {
    leads: Array<Lead & { activity_count: number, last_activity_type?: string }>,
    total: number,
    has_more: boolean,
  }
}
```

**Acceptance**:
- [ ] Sayed (sales_agent) only sees rows where `assigned_to = 'sayed'`
- [ ] Abdou (admin) sees all rows
- [ ] Pagination works (default `limit=50`)
- [ ] Search matches partial name/phone

#### `POST /api/crm/leads`
Create a new lead.

**Permission**: `leads.create`

**Request body**:
```typescript
{
  name: string;                    // required
  phone: string;                   // required
  email?: string;
  company?: string;
  lead_type: 'b2b' | 'b2c';
  industry?: string;
  source: string;                  // 'whatsapp_direct' | 'referral' | 'events' | 'instagram_dm' | 'cold_outreach'
  deal_type?: string;              // see schema
  expected_value?: number;
  expected_value_currency?: string; // default 'AED'
  billing_cycle?: 'one_time' | 'monthly' | 'quarterly' | 'annual';
  contact_person?: string;
  contact_role?: string;
  notes?: string;
  priority?: 'low' | 'medium' | 'high' | 'vip';
  assigned_to?: string;            // defaults to creator if missing
  stage_id?: string;               // defaults to 'stg_new_inquiry'
  next_follow_up?: string;         // ISO datetime
  follow_up_title?: string;        // if provided, creates a follow_up entry
}
```

**Side effects**:
1. INSERT into `pyra_sales_leads`.
2. INSERT into `pyra_lead_activities`: type=`lead_created`, metadata={ source, created_by }.
3. If `next_follow_up` + `follow_up_title` provided → INSERT into `pyra_sales_follow_ups`.
4. If `assigned_to !== creator` → `notify({ to: assigned_to, type: 'lead_assigned', ... })`.
5. `logActivity({ action: 'lead.create', target: lead.id })`.

**Response**: `{ ok: true, data: { lead } }`

**Acceptance**:
- [ ] Required fields enforced (400 if missing name/phone)
- [ ] Phone format validated (UAE/international, lenient)
- [ ] Phone duplicate check: warn but don't block (Q-API-001)
- [ ] Activity entry created
- [ ] Notification fires if assigned to someone else

#### `GET /api/crm/leads/[id]`
Single lead with full detail.

**Permission**: `leads.view` + `canAccessLead()`

**Response**:
```typescript
{
  ok: true,
  data: {
    lead: Lead,
    contact_persons: ContactPerson[], // future v2
    contracts: Contract[],            // from pyra_contracts WHERE lead_id = ?
    invoices: Invoice[],              // from pyra_invoices via contracts
    payments_summary: { total_paid, currency },
    activity_count: number,
    follow_ups_pending: number,
    files_count: number,
  }
}
```

#### `PATCH /api/crm/leads/[id]`
Update fields. Some fields require elevated permissions.

**Permission**: `leads.update` + `canAccessLead()`. For `assigned_to` change → also `leads.assign`.

**Restricted fields** (require `leads.manage` or `leads.assign`):
- `assigned_to` (transfer)
- `stage_id` if target is `closed_won` (use approval flow instead)

**Body**: any subset of editable fields.

**Side effects**:
- For each changed field of "interest" (assigned_to, priority, expected_value, deal_type) → log `field_updated` activity.
- If `assigned_to` changes → `notify(to: new_owner, type: 'lead_transferred')`.

#### `POST /api/crm/leads/[id]/move-stage`

Drag-drop or button-click stage change.

**Permission**: `leads.move_stage` + `canAccessLead()`

**Body**:
```typescript
{
  to_stage_id: string;
  attachment?: { type: 'contract' | 'invoice', id: string }; // required if to_stage = stg_contract_signed
  lost_reason?: string; // required if to_stage = stg_closed_lost
}
```

**Logic flow**:
```
if to_stage == 'stg_closed_won':
  → reject with 422 — cannot directly move to closed_won, use /request-close-win

if to_stage == 'stg_contract_signed':
  → validate `attachment` provided (contract OR invoice)
  → if missing: return 422 "must attach contract or invoice"
  → update lead.stage_id = stg_contract_signed
  → activity: closed_won_pending (metadata: requested_by, contract_id|invoice_id)
  → find manager (canApproveFor inverse → who is my manager)
  → notify(manager, 'lead_closed_won_pending_approval', link to /dashboard/crm/approvals)

if to_stage == 'stg_closed_lost':
  → validate `lost_reason` provided
  → update lead.stage_id, lost_reason
  → activity: stage_change

else (any other stage):
  → simple update
  → activity: stage_change
```

**Acceptance**:
- [ ] Sales agent CANNOT directly move to `stg_closed_won` (returns 422)
- [ ] Moving to `stg_contract_signed` without attachment fails
- [ ] Moving to `stg_closed_lost` without reason fails
- [ ] Activity row created with from/to stage
- [ ] Notification fires correctly

#### `POST /api/crm/leads/[id]/approve-close-win`

**Permission**: `leads.approve` + `canApproveFor(approver, lead.assigned_to)`

**Body**:
```typescript
{
  decision: 'approve' | 'reject',
  reason?: string,  // required if reject
}
```

**Logic**:
```
permission gate: hasPermission('leads.approve') → 403 if not
scope gate: canApproveFor(approver, lead.assigned_to) → 403 if not
state check: lead.stage_id must == 'stg_contract_signed' → 422 if not

if approve:
  → lead.stage_id = 'stg_closed_won'
  → lead.is_converted = true
  → lead.converted_at = NOW()
  → lead.win_probability = 100
  → activity: closed_won_approved
  → notify(lead.assigned_to, 'lead_closed_won_approved')

if reject:
  → require reason
  → lead.stage_id = 'stg_negotiation'
  → activity: closed_won_rejected (metadata: reason, rejected_by)
  → notify(lead.assigned_to, 'lead_closed_won_rejected', message: reason)
```

**Acceptance**:
- [ ] Sales agent (Sayed) CANNOT call this endpoint (403)
- [ ] Manager (Abdou) CAN call it
- [ ] Approval requires the lead to be in `contract_signed` (else 422)
- [ ] On approve, `is_converted` and `converted_at` set
- [ ] On reject, lead returns to negotiation
- [ ] Notification fires to original sales agent

#### `POST /api/crm/leads/[id]/convert-to-customer`

**Permission**: `leads.manage` (admin only, manual decision)
**State check**: lead must be `stg_closed_won` and `is_converted = true`

Creates a `pyra_clients` row from the lead and grants portal access (optional decision).

**Body**:
```typescript
{
  create_portal_access: boolean,
  email: string,         // required (for portal login)
  primary_contact_name?: string,
}
```

**Side effects**:
1. INSERT pyra_clients (with new ID, auto-generated). Fields populated from lead.
2. UPDATE lead.client_id = new client ID.
3. If `create_portal_access`: send portal welcome email (use existing template).
4. activity: `field_updated` with metadata { client_id_set: true }

**Acceptance**:
- [ ] Idempotent: if lead already has client_id, return existing (don't double-create)
- [ ] Portal email sent only if `create_portal_access = true`
- [ ] Existing client logic untouched

---

### Lead Activities

#### `GET /api/crm/leads/[id]/activities`
List activity timeline.

**Permission**: `lead_activities.view` + `canAccessLead()`

**Query params**:
- `type` — filter (e.g., `note`, `whatsapp_inbound`, `stage_change`)
- `limit`, `offset`

#### `POST /api/crm/leads/[id]/activities`
Add a manual activity.

**Permission**: `lead_activities.create` + `canAccessLead()`

**Body**:
```typescript
{
  activity_type: 'note' | 'call_logged' | 'meeting_scheduled' | 'email_sent';
  content: string;
  metadata?: Record<string, any>;  // see canonical types in §02
  pinned?: boolean;  // for notes
}
```

**Acceptance**:
- [ ] Only manual types accepted (no creating `whatsapp_inbound` etc. by hand)
- [ ] Pinned notes appear first in timeline

---

### Follow-ups

#### `GET /api/crm/follow-ups`
List follow-ups (scoped).

**Permission**: `follow_ups.view`
**Scope**: own follow-ups (where `assigned_to = me`) unless admin

**Query**:
- `status` — `pending` (default) | `completed` | `overdue` | `cancelled`
- `due_before` / `due_after`
- `lead_id`
- `limit`

#### `POST /api/crm/follow-ups`

**Permission**: `follow_ups.create`

**Body**:
```typescript
{
  lead_id: string;
  title: string;
  due_at: string;
  reminder_at?: string;     // default: due_at - 30 minutes
  notes?: string;
  assigned_to?: string;     // default: self
  send_whatsapp_reminder?: boolean;  // default: true
}
```

**Side effects**:
- INSERT into `pyra_sales_follow_ups`
- INSERT activity `follow_up_created`
- If `assigned_to != self`: notify

#### `POST /api/crm/follow-ups/[id]/complete`
Mark complete.

**Permission**: `follow_ups.complete` + ownership check

**Body**: `{ outcome_note?: string }`

#### Cron job: WhatsApp reminders

**Endpoint**: `POST /api/cron/follow-up-reminders` (called by external scheduler — see existing automation patterns)

**Auth**: API key (existing `pyra_api_keys` mechanism)

**Logic**:
```
SELECT * FROM pyra_sales_follow_ups
WHERE status = 'pending'
  AND reminder_at <= NOW()
  AND whatsapp_reminder_sent = false;

For each row:
  → fetch lead phone
  → fetch assigned_to user phone
  → send WhatsApp via lib/evolution/client.ts (to the agent's WhatsApp instance)
  → set whatsapp_reminder_sent = true
  → notify(assigned_to, 'follow_up_due', link to /dashboard/crm/leads/{lead_id})
```

#### Cron job: Idle warning (deals at risk)

**Endpoint**: `POST /api/cron/lead-idle-check`
**Frequency**: daily at 09:00 UAE

**Logic**:
```
SELECT lead.id, lead.assigned_to, lead.expected_value
FROM pyra_sales_leads lead
LEFT JOIN LATERAL (
  SELECT MAX(created_at) AS last_activity
  FROM pyra_lead_activities
  WHERE lead_id = lead.id
) a ON true
WHERE lead.is_converted = false
  AND lead.stage_id NOT IN ('stg_closed_won','stg_closed_lost')
  AND (a.last_activity IS NULL OR a.last_activity < NOW() - INTERVAL '7 days');

For each agent (group by assigned_to):
  → notify(agent, 'lead_idle_warning', message: 'X deals stuck for 7+ days', link: /dashboard/crm/dashboard)
  → INSERT activity 'idle_warning' on each lead
```

---

### Pipeline Stages (admin only)

#### `GET /api/crm/pipeline-stages`
List active stages.

**Permission**: `leads.view` (no special permission — needed for UI dropdowns)

#### `PATCH /api/crm/pipeline-stages/[id]`
Update stage label/color (NO renaming `name` field — only Arabic label and color).

**Permission**: `leads.manage`

---

### CRM Reports / Dashboard

#### `GET /api/crm/dashboard/kpis`

**Permission**: `crm_reports.view`

**Query params**: `period` (`this_month`, `last_30d`, `quarter`)

**Response**:
```typescript
{
  ok: true,
  data: {
    pipeline_value: { total_aed: number, count: number, trend_pct: number };
    closed_won: { total_aed: number, count: number, vs_target_pct: number };
    conversion_rate: { current_pct: number, vs_prior_pct: number };
    avg_deal_size: { aed: number, trend: 'up' | 'down' | 'flat' };
    monthly_recurring_revenue: number;
    forecast_close_value: number;
  }
}
```

Computed from `pyra_sales_leads`, `pyra_payments`, `pyra_contracts` per the cash-basis accounting rule (existing pattern).

#### `GET /api/crm/dashboard/funnel`

Returns count + sum per stage.

#### `GET /api/crm/dashboard/deals-at-risk`

Returns leads with no activity in N days (default 7).

**Scope**: scoped if not admin.

#### `GET /api/crm/dashboard/team-performance`

**Permission**: `crm_reports.team_view` (manager + admin only)

Per-agent breakdown.

#### `GET /api/crm/dashboard/recent-activity`

Activity feed (top 20 events).

**Scope**: scoped to own leads' activities if not admin.

#### `GET /api/crm/dashboard/ai-insights`

Rule-based insights (v1; defer ML to v2).

**Logic** (server-side):
```
insights = []

// Rule 1: idle deals
idle_count = count of leads (mine if not admin) with no activity ≥ 7d
if idle_count >= 3:
  push { type: 'idle_warning', severity: 'high', count, value, message_ar }

// Rule 2: pending approvals
if I'm a manager and pending closed_won_pending_approval > 0:
  push { type: 'approvals_pending', ... }

// Rule 3: overdue follow-ups
overdue_count = count of pending follow-ups with due_at < today
if overdue_count > 0:
  push { type: 'overdue_followups', ... }

return top 3 insights, sorted by severity
```

---

## Approvals Endpoints

#### `GET /api/crm/approvals/pending`

**Permission**: `leads.approve`
**Scope**: only leads where `canApproveFor(me, lead.assigned_to)`

Returns leads in `stg_contract_signed` awaiting approval.

#### `POST /api/crm/approvals/[lead_id]/approve`
Convenience wrapper. Calls `/leads/[id]/approve-close-win` with `decision='approve'`.

#### `POST /api/crm/approvals/[lead_id]/reject`
Calls `/leads/[id]/approve-close-win` with `decision='reject'`.

---

## Existing Endpoints to Modify

### `pyra_contracts` endpoints (`app/api/finance/contracts/...`)

When creating a contract, allow optional `lead_id` parameter. Set `pyra_contracts.lead_id`.

When listing contracts on the Active Customer page (in the new CRM), filter `WHERE lead_id = ?`.

**No breaking change** to existing contract endpoints — `lead_id` is optional and nullable.

### WhatsApp message handler (`app/api/dashboard/sales/whatsapp/...`)

When a new WhatsApp message arrives:
1. Match the phone number to a lead (`pyra_sales_leads.phone`).
2. If matched: INSERT activity `whatsapp_inbound` (or `outbound`) with metadata `{ message_id, message_text, ... }`.
3. If not matched: existing behavior (create unassigned conversation).

This change must be **additive** — existing WhatsApp logic preserved.

---

## API Acceptance Test Suite (manual or `__tests__/`)

After build, manually verify:

| # | Action | Expected |
|---|--------|----------|
| 1 | Sayed `GET /api/crm/leads` | sees only own leads |
| 2 | Sayed `GET /api/crm/leads/[abdou_lead_id]` | 403 |
| 3 | Sayed `POST .../move-stage` to `stg_closed_won` | 422 |
| 4 | Sayed moves to `stg_contract_signed` w/o attachment | 422 |
| 5 | Sayed moves to `stg_contract_signed` with `attachment={contract_id}` | 200 + notify Abdou |
| 6 | Abdou `POST /api/crm/approvals/[id]/approve` | 200, lead→closed_won |
| 7 | Sayed `POST /api/crm/approvals/[id]/approve` | 403 |
| 8 | Activity log shows correct entries for full flow | Yes |
| 9 | Notification arrives to Abdou's bell with correct deep link | Yes |
| 10 | After Closed Won, contracts created with `lead_id` filter correctly | Yes |

---

## Common Pitfalls (avoid these)

1. **Direct INSERT into `pyra_notifications`** → forbidden, always use `notify()`.
2. **Using `*.manage` for sales_agent** → leaks data via list endpoints. Sales agents get `*.view`/`*.create` only.
3. **Forgetting `canAccessLead()` after permission gate** → an agent with `leads.view` could see ALL leads. Two-layer check is required.
4. **Hardcoding stage names** → use IDs (`'stg_negotiation'`) not labels (`'Negotiation'`).
5. **Missing `logActivity()` on writes** → audit trail breaks. Required on every POST/PATCH/DELETE.
