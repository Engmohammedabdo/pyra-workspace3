# Feature Impact Map

> Claude MUST read this file before building any new feature or modifying an existing one.
> For every feature, check ALL 4 audiences and ALL connected systems.

---

## The 4-Audience Rule

Every feature in this system is seen by up to 4 different audiences.
**Before coding, fill this table for your feature:**

| Audience | Sees it? | What they see/do | Where |
|----------|----------|-------------------|-------|
| **Admin** | ? | Full control, settings, management | `/dashboard/...` |
| **Employee** | ? | Self-service view (my-* pattern) | `/dashboard/...` (RBAC filtered) |
| **Sales Agent** | ? | Sales-related view | `/dashboard/...` (RBAC filtered) |
| **Client** | ? | Their own data only | `/portal/...` |

---

## Feature Impact Matrix

### Business Features

| Feature | Admin | Employee | Sales | Client (Portal) | Admin Controls | Connects To |
|---------|-------|----------|-------|-----------------|---------------|-------------|
| Projects | CRUD + assign | View assigned (my-tasks) | View client projects | ✅ View + comment + files | — | clients, files, invoices, contracts, boards, timesheets |
| Clients | CRUD + all tabs | ❌ | View own clients | — (they ARE the client) | — | projects, invoices, quotes, contracts, portal branding |
| Quotes | CRUD + send | ❌ | Create + view own | ✅ View + sign | Approval workflow | clients, invoices (convert), sales approvals |
| Invoices | CRUD + payments | ❌ | View client invoices | ✅ View + Stripe pay | — | clients, projects, payments, recurring, credit notes, statement |
| Contracts | CRUD + milestones + retainer billing | ❌ | ❌ | ✅ View + milestones | — | clients, projects, invoices (milestone + retainer generate), recurring billing |
| Boards/Tasks | CRUD + all views (kanban/list/calendar/pipeline) | ✅ View assigned (my-tasks) + board member access | ❌ | ✅ Read-only (if board_client_portal_visible) | Board settings, templates, columns, labels | projects, users (assignees), teams (board members), scope system |
| Files | Full access | View shared files | View client files | ✅ View + download + approve | — | projects, clients (visibility), versions, shares |
| Script Reviews | Manage | ❌ | ❌ | ✅ Review + reply | — | clients, projects, files |
| Knowledge Base | CRUD articles | ✅ Read articles | ✅ Read articles | ✅ Help page | Categories management | — |

### Sales CRM

| Feature | Admin | Employee | Sales | Client (Portal) | Admin Controls | Connects To |
|---------|-------|----------|-------|-----------------|---------------|-------------|
| Sales Overview | ✅ All stats | ❌ | ✅ Own stats | ❌ | — | leads, pipeline |
| Leads | CRUD + assign | ❌ | ✅ CRUD own leads | ❌ | Pipeline settings | activities, quotes, convert to client |
| WhatsApp Chat | View all + assign | ❌ | ✅ Own instance + assigned conversations | ❌ | Instance management, webhook, auto-sync | leads (auto-match), quotes (send from chat), invoices, follow-ups, notes, contact sidebar |
| Quote Approvals | Approve/reject | ❌ | ✅ Submit for approval | ❌ | — | quotes, leads |
| Follow-ups | View all | ❌ | ✅ Own follow-ups | ❌ | — | leads |
| Sales Reports | ✅ All agents | ❌ | ✅ Own performance | ❌ | — | leads, activities |
| Sales Settings | ✅ Configure | ❌ | ❌ | ❌ | ✅ Pipeline stages, labels | — |

### HR & Employee

| Feature | Admin | Manager (has direct reports) | Employee | Sales | Client (Portal) | Admin Controls | Connects To |
|---------|-------|------------------------------|----------|-------|-----------------|---------------|-------------|
| **My Work Inbox** | ✅ Own + admin overrides | ✅ Own + team approvals section | ✅ Own | ✅ Own | ❌ | — | tasks, leave, expense, timesheet, conversations, leads, follow-ups |
| **Manager Approvals** (`/dashboard/approvals`) | ✅ All pending org-wide | ✅ Direct reports only (`canApproveFor()`) | ❌ (empty state) | ❌ | ❌ | manager_username on users | leave, expense, timesheet, manager hierarchy |
| Attendance | View all + summary | View own + (theory) team | ✅ Own clock-in/out | ✅ Own clock-in/out | ❌ | Summary dashboard | users, geolocation |
| Leave | Approve + manage | ✅ Approve direct reports | ✅ Request own | ✅ Request own | ❌ | Leave types + settings | balances, calendar, payroll |
| Timesheet | View all + approve any | ✅ Approve direct reports | ✅ Log own hours | ❌ | ❌ | Period management | projects, payroll |
| Expenses (approve flow) | Approve any | ✅ Approve direct reports | ✅ Submit own | ✅ Submit own | ❌ | Approval setting | finance, projects |
| Payroll | Run + approve + add payments (commission/task/bonus) | ❌ (sees my-payslips) | ❌ (sees my-payslips) | ❌ | ❌ | Full payroll management + payment dialog | attendance, overtime, expenses, employee_payments, user detail page |
| My Payslips | — | ✅ View own payslips | ✅ View own payslips | ✅ View own payslips | ❌ | — | payroll runs |
| Evaluations | Create + score | ✅ View own evaluation | ✅ View own evaluation | ✅ View own evaluation | ❌ | Periods + criteria settings | users |
| Directory | ✅ All info | ✅ Contact info | ✅ Contact info | ✅ Contact info | ❌ | — | users, teams |
| Announcements | Create + target | ✅ Read | ✅ Read | ✅ Read | ❌ | Priority + targeting | users (audience) |
| My Tasks | View all tasks | ✅ Own tasks only | ✅ Own tasks only | ❌ | ❌ | — | boards, assignees |
| Content Pipeline | Manage all | ❌ | ❌ | ❌ | ❌ | — | projects, stages |

### Finance

| Feature | Admin | Employee | Sales | Client (Portal) | Admin Controls | Connects To |
|---------|-------|----------|-------|-----------------|---------------|-------------|
| Finance Dashboard | ✅ Full overview | ❌ | ❌ | ❌ | — | invoices, expenses, subscriptions |
| Expenses | CRUD + approve | ❌ | ❌ | ❌ | Categories | suppliers, projects |
| Suppliers | CRUD | ❌ | ❌ | ❌ | — | expenses, purchase orders |
| Purchase Orders | CRUD | ❌ | ❌ | ❌ | — | suppliers |
| Subscriptions | CRUD | ❌ | ❌ | ❌ | — | cards, renewal alerts |
| Recurring Invoices | CRUD | ❌ | ❌ | ✅ View schedules | — | clients, invoices |
| Credit Notes | CRUD + apply | ❌ | ❌ | ❌ | — | invoices |
| Client Statement | View any client | ❌ | ❌ | ✅ Own statement | — | invoices, payments |
| Revenue Targets | Set + track | ❌ | ❌ | ❌ | — | invoices |
| Finance Reports | All reports | ❌ | ❌ | ❌ | — | all finance data |

### System

| Feature | Admin | Employee | Sales | Client (Portal) | Admin Controls |
|---------|-------|----------|-------|-----------------|---------------|
| Users | CRUD + detail page (financial/projects/info) | ❌ | ❌ | ❌ | ✅ |
| Teams | CRUD | ❌ | ❌ | ❌ | ✅ |
| Roles/Permissions | CRUD | ❌ | ❌ | ❌ | ✅ |
| Settings | Full config | ❌ | ❌ | ❌ | ✅ |
| Automations | CRUD rules | ❌ | ❌ | ❌ | ✅ |
| Integrations | Webhooks + API keys | ❌ | ❌ | ❌ | ✅ |
| Activity Log | View all | ❌ | ❌ | ❌ | — |
| Reports | All reports | ❌ | ❌ | ❌ | — |

---

## Decision Rules

### When building ANY new feature:
```
1. WHO uses it? → Fill the 4-audience table above
2. Does the client need to SEE this? → Portal page + portal API
3. Does the employee have a self-service view? → my-* pattern
4. Does sales need a filtered view? → Check RBAC scoping
5. Does admin need to CONFIGURE this? → Settings page
6. What existing features does this connect to? → Trace the chain
7. UNSURE? → Ask the user. Don't guess.
```

### When adding a NEW module:
```
1. Dashboard page + layout
2. Sidebar entry → correct navGroup + permission
3. Module guide → lib/config/module-guide.ts + guide page SECTIONS
4. API route(s) → /api/dashboard/[module]/
5. RBAC permissions → module.view + module.manage
6. If client-facing → Portal page + /api/portal/[module]/
7. If employee self-service → my-[module] page or filtered view
8. If sales-related → Check sales sidebar group
9. If configurable → Admin settings page
10. Activity logging for all writes
11. Email notifications if applicable
```

### Common Missed Connections

| When you build... | Don't forget... |
|-------------------|-----------------|
| Client-facing feature | Portal page + portal API + admin management |
| Employee feature | Self-service view (my-* pattern) vs admin management view |
| Sales feature | Admin oversight + settings + reports |
| Approval workflow | Manager-scope guard via `canApproveFor()` + permission gate (e.g. `leave.approve`) — both required |
| Notification trigger | Use `notify()` from `lib/notifications/notify.ts` — NEVER raw INSERT |
| WhatsApp message mutation | `canAccessWhatsAppMessage()` guard before any side effect |
| New auth entry point | Route through `buildUserPermissions()` — don't reinvent the merge |
| New employee permission | Add to `BASE_EMPLOYEE` only if it's `*.view` or `*.create` (own data); `*.approve`/`*.manage` go elsewhere |

---

## Authorization Architecture (CRM/ERP Standard)

```
                              ┌──────────────────────────┐
                              │  buildUserPermissions()  │  ← single source of truth
                              │   (lib/auth/rbac.ts)     │
                              │                          │
                              │  BASE_EMPLOYEE           │
                              │     ∪                    │
                              │  DB role.permissions     │
                              │     ∪                    │
                              │  extra_permissions       │
                              └────────────┬─────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              ▼                            ▼                            ▼
   getApiAuth (API routes)    requireAuth (server pages)    Login (dashboard.view)
              │                            │                            │
              └────────────────────────────┴────────────────────────────┘
                                           │
                            ┌──────────────▼──────────────┐
                            │   Action authorization      │
                            │   (per-mutation guards)     │
                            └──────────────┬──────────────┘
                                           │
       ┌───────────────────────────────────┼─────────────────────────────────┐
       ▼                                   ▼                                  ▼
hasPermission(perms, 'X.Y')   canApproveFor(approver, employee)   canAccessWhatsAppMessage(...)
   permission gate              admin OR direct manager only          owns the conversation
   (action category)            (per-employee scope)                  (per-message scope)
```

**Approval mutations** (leave, expense, timesheet) MUST combine permission gate AND scope gate. Either alone is insufficient: a custom HR role might have `leave.approve` org-wide, but should still only approve their direct reports.

**WhatsApp message mutations** (forward, react, save-to-files, media proxy) MUST call `canAccessWhatsAppMessage()`. The endpoint takes a raw `messageId` — without the guard, any agent who can guess message IDs can manipulate any customer's chats.

**Manager hierarchy** lives on `pyra_users.manager_username` (self-referencing). Drives:
- `/dashboard/approvals` data scope
- My Work inbox "مستني موافقتك" section
- Approval mutation guards
- Sidebar `team_approvals` badge counter
| Financial feature | Statement impact + report impact + portal visibility |
| Approval workflow | Both sides: who requests (employee/sales/client) + who approves (admin) |
| New entity with status | Email notification on status change to relevant audience |
| Configurable module | Admin settings page in dashboard |
| HR module | Employee self-service + admin management + payroll connection |
| Board feature | Board members scope + my-tasks integration + project link |
| WhatsApp feature | Agent scoping + lead matching + quote/invoice integration |
| Freelancer payment | pyra_employee_payments + pyra_expenses (both!) + user detail page |
| Contract feature | Invoice generation (milestone OR retainer) + billing history |
| New user type | Scope system (lib/auth/scope.ts) + board members + team members |
