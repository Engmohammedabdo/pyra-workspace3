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
| Contracts | CRUD + milestones | ❌ | ❌ | ✅ View + milestones | — | clients, projects, invoices (milestone billing) |
| Boards/Tasks | CRUD + assign | ✅ View assigned (my-tasks) | ❌ | ❌ | — | projects, users (assignees) |
| Files | Full access | View shared files | View client files | ✅ View + download + approve | — | projects, clients (visibility), versions, shares |
| Script Reviews | Manage | ❌ | ❌ | ✅ Review + reply | — | clients, projects, files |
| Knowledge Base | CRUD articles | ✅ Read articles | ✅ Read articles | ✅ Help page | Categories management | — |

### Sales CRM

| Feature | Admin | Employee | Sales | Client (Portal) | Admin Controls | Connects To |
|---------|-------|----------|-------|-----------------|---------------|-------------|
| Sales Overview | ✅ All stats | ❌ | ✅ Own stats | ❌ | — | leads, pipeline |
| Leads | CRUD + assign | ❌ | ✅ CRUD own leads | ❌ | Pipeline settings | activities, quotes, convert to client |
| WhatsApp Chat | View all | ❌ | ✅ Own conversations | ❌ | Instance management | leads, templates |
| Quote Approvals | Approve/reject | ❌ | ✅ Submit for approval | ❌ | — | quotes, leads |
| Follow-ups | View all | ❌ | ✅ Own follow-ups | ❌ | — | leads |
| Sales Reports | ✅ All agents | ❌ | ✅ Own performance | ❌ | — | leads, activities |
| Sales Settings | ✅ Configure | ❌ | ❌ | ❌ | ✅ Pipeline stages, labels | — |

### HR & Employee

| Feature | Admin | Employee | Sales | Client (Portal) | Admin Controls | Connects To |
|---------|-------|----------|-------|-----------------|---------------|-------------|
| Attendance | View all + summary | ✅ Own clock-in/out | ✅ Own clock-in/out | ❌ | Summary dashboard | users, geolocation |
| Leave | Approve + manage | ✅ Request own | ✅ Request own | ❌ | Leave types + settings | balances, calendar, payroll |
| Timesheet | View all + periods | ✅ Log own hours | ❌ | ❌ | Period management | projects, payroll |
| Payroll | Run + approve | ❌ (sees my-payslips) | ❌ | ❌ | Full payroll management | attendance, overtime, expenses |
| My Payslips | — | ✅ View own payslips | ✅ View own payslips | ❌ | — | payroll runs |
| Evaluations | Create + score | ✅ View own evaluation | ✅ View own evaluation | ❌ | Periods + criteria settings | users |
| Directory | ✅ All info | ✅ Contact info | ✅ Contact info | ❌ | — | users, teams |
| Announcements | Create + target | ✅ Read | ✅ Read | ❌ | Priority + targeting | users (audience) |
| My Tasks | View all tasks | ✅ Own tasks only | ❌ | ❌ | — | boards, assignees |
| Content Pipeline | Manage all | ❌ | ❌ | ❌ | — | projects, stages |

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
| Users | CRUD | ❌ | ❌ | ❌ | ✅ |
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
| Financial feature | Statement impact + report impact + portal visibility |
| Approval workflow | Both sides: who requests (employee/sales/client) + who approves (admin) |
| New entity with status | Email notification on status change to relevant audience |
| Configurable module | Admin settings page in dashboard |
| HR module | Employee self-service + admin management + payroll connection |
