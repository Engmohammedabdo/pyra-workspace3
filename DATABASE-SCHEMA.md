# Pyra Workspace 3.0 — Database Schema

> Auto-documented from live Supabase database on 2026-03-05
> Host: `pyraworkspacedb.pyramedia.cloud`
> 84 tables in `public` schema (prefix: `pyra_`)
> Includes 15 new ERP tables from `002_erp_features.sql` migration
> `pyra_file_permissions` renamed to `pyra_file_permissions_archived`

---

## Table of Contents

1. [pyra_activity_log](#pyra_activity_log) — Activity audit trail
2. [pyra_auth_mapping](#pyra_auth_mapping) — Supabase Auth ↔ pyra_users mapping
3. [pyra_blocked_logs](#pyra_blocked_logs) — Blocked AI response logs
4. [pyra_client_comments](#pyra_client_comments) — Client–team project comments
5. [pyra_client_notes](#pyra_client_notes) — Client relationship notes
6. [pyra_client_notifications](#pyra_client_notifications) — Portal client notifications
7. [pyra_client_password_resets](#pyra_client_password_resets) — Client password reset tokens
8. [pyra_client_tag_assignments](#pyra_client_tag_assignments) — Client–tag junction table
9. [pyra_client_tags](#pyra_client_tags) — Client classification tags
10. [pyra_clients](#pyra_clients) — Client accounts (portal users)
11. [pyra_favorites](#pyra_favorites) — User file/folder favorites
12. [pyra_file_approvals](#pyra_file_approvals) — File approval workflow
13. [pyra_file_index](#pyra_file_index) — File search index
14. [pyra_file_permissions_archived](#pyra_file_permissions_archived) — ~~Per-file access rules~~ **(ARCHIVED — renamed in ERP migration)**
15. [pyra_file_versions](#pyra_file_versions) — File version history
16. [pyra_login_attempts](#pyra_login_attempts) — Login attempt tracking
17. [pyra_notifications](#pyra_notifications) — Internal team notifications
18. [pyra_project_files](#pyra_project_files) — Files linked to projects
19. [pyra_projects](#pyra_projects) — Project management
20. [pyra_quote_items](#pyra_quote_items) — Quote line items
21. [pyra_quotes](#pyra_quotes) — Financial quotes/invoices
22. [pyra_reviews](#pyra_reviews) — File review comments
23. [pyra_sessions](#pyra_sessions) — User sessions (cookie-based)
24. [pyra_settings](#pyra_settings) — System settings (key-value)
25. [pyra_share_links](#pyra_share_links) — Public file share links
26. [pyra_team_members](#pyra_team_members) — Team membership
27. [pyra_teams](#pyra_teams) — Teams/departments
28. [pyra_trash](#pyra_trash) — Soft-deleted files (30-day retention)
29. [pyra_users](#pyra_users) — Employee/admin accounts
30. [pyra_boards](#pyra_boards) — Kanban boards
31. [pyra_board_columns](#pyra_board_columns) — Kanban board columns
32. [pyra_board_labels](#pyra_board_labels) — Board label definitions
33. [pyra_tasks](#pyra_tasks) — Task cards
34. [pyra_task_assignees](#pyra_task_assignees) — Task–user assignments
35. [pyra_task_labels](#pyra_task_labels) — Task–label junction
36. [pyra_task_checklist](#pyra_task_checklist) — Task checklist items
37. [pyra_task_comments](#pyra_task_comments) — Task comments
38. [pyra_task_attachments](#pyra_task_attachments) — Task file attachments
39. [pyra_task_activity](#pyra_task_activity) — Task activity log
40. [pyra_timesheets](#pyra_timesheets) — Employee time tracking
41. [pyra_announcements](#pyra_announcements) — Company announcements
42. [pyra_announcement_reads](#pyra_announcement_reads) — Announcement read tracking
43. [pyra_leave_requests](#pyra_leave_requests) — Leave/vacation requests
44. [pyra_leave_balances](#pyra_leave_balances) — Annual leave balances
45. [pyra_roles](#pyra_roles) — User role definitions with permissions
46. [pyra_invoices](#pyra_invoices) — Invoice management
47. [pyra_invoice_items](#pyra_invoice_items) — Line items for invoices
48. [pyra_payments](#pyra_payments) — Payment records
49. [pyra_expenses](#pyra_expenses) — Expense tracking
50. [pyra_expense_categories](#pyra_expense_categories) — Expense categories
51. [pyra_subscriptions](#pyra_subscriptions) — Subscription management
52. [pyra_contracts](#pyra_contracts) — Contract management
53. [pyra_contract_milestones](#pyra_contract_milestones) — Contract milestones
54. [pyra_cards](#pyra_cards) — Company payment cards
55. [pyra_recurring_invoices](#pyra_recurring_invoices) — Recurring invoice templates
56. [pyra_revenue_targets](#pyra_revenue_targets) — Revenue goals
57. [pyra_automation_rules](#pyra_automation_rules) — Automation workflow rules
58. [pyra_automation_log](#pyra_automation_log) — Automation execution logs
59. [pyra_webhooks](#pyra_webhooks) — Webhook configurations
60. [pyra_webhook_deliveries](#pyra_webhook_deliveries) — Webhook delivery logs
61. [pyra_kb_articles](#pyra_kb_articles) — Knowledge base articles
62. [pyra_kb_categories](#pyra_kb_categories) — Knowledge base categories
63. [pyra_script_reviews](#pyra_script_reviews) — Script review submissions
64. [pyra_script_review_replies](#pyra_script_review_replies) — Replies to script reviews
65. [pyra_file_tags](#pyra_file_tags) — File tags
66. [pyra_client_branding](#pyra_client_branding) — Client portal branding
67. [pyra_stripe_payments](#pyra_stripe_payments) — Stripe payment records
68. [pyra_api_keys](#pyra_api_keys) — API key management
69. [pyra_approvals](#pyra_approvals) — Approval workflows

### ERP Migration Tables (002_erp_features.sql)

70. [pyra_leave_types](#pyra_leave_types) — Custom leave type definitions
71. [pyra_leave_balances_v2](#pyra_leave_balances_v2) — Dynamic leave balances (per type/year)
72. [pyra_work_schedules](#pyra_work_schedules) — Work schedule definitions
73. [pyra_attendance](#pyra_attendance) — Daily clock-in/out records
74. [pyra_timesheet_periods](#pyra_timesheet_periods) — Timesheet submission periods
75. [pyra_employee_payments](#pyra_employee_payments) — Employee payment ledger
76. [pyra_payroll_runs](#pyra_payroll_runs) — Monthly payroll runs
77. [pyra_payroll_items](#pyra_payroll_items) — Per-employee payroll line items
78. [pyra_evaluation_periods](#pyra_evaluation_periods) — Performance evaluation periods
79. [pyra_evaluation_criteria](#pyra_evaluation_criteria) — Evaluation scoring criteria
80. [pyra_evaluations](#pyra_evaluations) — Individual evaluations
81. [pyra_evaluation_scores](#pyra_evaluation_scores) — Per-criteria scores
82. [pyra_kpi_targets](#pyra_kpi_targets) — KPI targets per employee
83. [pyra_content_pipeline](#pyra_content_pipeline) — Content production pipeline
84. [pyra_pipeline_stages](#pyra_pipeline_stages) — Pipeline stage tracking

---

## pyra_activity_log

Activity audit trail for all system actions.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| action_type | varchar | NOT NULL | — |
| username | varchar | NOT NULL | — |
| display_name | varchar | NOT NULL | — |
| target_path | text | YES | `''` |
| details | jsonb | YES | `'{}'` |
| ip_address | varchar | YES | `''` |
| created_at | timestamptz | YES | `now()` |

---

## pyra_auth_mapping

Maps `pyra_users.username` to Supabase Auth user UUIDs. Used for password changes and auth user management.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| auth_user_id | uuid | NOT NULL | — |
| pyra_username | varchar | NOT NULL | FK → pyra_users(username) |
| created_at | timestamptz | YES | `now()` |

**Unique indexes:** `auth_user_id`, `pyra_username`

---

## pyra_blocked_logs

Logs of blocked AI responses (content moderation).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | integer | NOT NULL | auto-increment |
| jid | text | NOT NULL | — |
| original_response | text | YES | — |
| blocked_reason | text | YES | — |
| created_at | timestamptz | YES | `now()` |

---

## pyra_client_comments

Bidirectional comments between clients (portal) and team members on projects.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| project_id | varchar | NOT NULL | — |
| file_id | varchar | YES | — |
| author_type | varchar | NOT NULL | `'client'` or `'team'` |
| author_id | varchar | NOT NULL | — |
| author_name | varchar | NOT NULL | — |
| text | text | NOT NULL | — |
| parent_id | varchar | YES | — (self-reference for threads) |
| is_read_by_client | boolean | YES | `false` |
| is_read_by_team | boolean | YES | `false` |
| created_at | timestamptz | YES | `now()` |
| mentions | jsonb | YES | `'[]'` |
| attachments | jsonb | YES | `'[]'` |

---

## pyra_client_notes

Notes attached to clients for relationship management (meetings, decisions, follow-ups).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | text | NOT NULL | — |
| client_id | text | NOT NULL | FK → pyra_clients(id) ON DELETE CASCADE |
| content | text | NOT NULL | — |
| is_pinned | boolean | YES | `false` |
| created_by | text | NOT NULL | — |
| created_at | timestamptz | YES | `now()` |
| updated_at | timestamptz | YES | `now()` |

**Indexes:** `idx_client_notes_client` on `client_id`

---

## pyra_client_notifications

Notifications shown in the client portal (file approvals, status updates).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| client_id | varchar | NOT NULL | — |
| type | varchar | NOT NULL | — |
| title | varchar | NOT NULL | — |
| message | text | YES | — |
| target_project_id | varchar | YES | — |
| target_file_id | varchar | YES | — |
| is_read | boolean | YES | `false` |
| created_at | timestamptz | YES | `now()` |

---

## pyra_client_password_resets

Password reset tokens for portal clients. Tokens expire and can only be used once.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| client_id | varchar | NOT NULL | — |
| token | varchar | NOT NULL | — |
| expires_at | timestamptz | NOT NULL | — |
| used | boolean | YES | `false` |
| created_at | timestamptz | YES | `now()` |

---

## pyra_client_tag_assignments

Junction table linking clients to tags (many-to-many).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **client_id** | text | NOT NULL | FK → pyra_clients(id) ON DELETE CASCADE |
| **tag_id** | text | NOT NULL | FK → pyra_client_tags(id) ON DELETE CASCADE |

**Primary Key:** `(client_id, tag_id)`

---

## pyra_client_tags

Classification tags for organizing clients (e.g., VIP, New, Priority).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | text | NOT NULL | — |
| name | text | NOT NULL | — |
| color | text | NOT NULL | `'blue'` |
| created_at | timestamptz | YES | `now()` |

**Unique indexes:** `idx_client_tags_name` on `name`

**Available colors:** `orange`, `red`, `green`, `blue`, `purple`, `pink`, `teal`, `amber`, `gray`

---

## pyra_clients

Client accounts for the portal. Supports both Supabase Auth (new) and legacy bcrypt passwords.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| name | varchar | NOT NULL | — |
| email | varchar | NOT NULL | UNIQUE |
| password_hash | varchar | NOT NULL | — |
| company | varchar | NOT NULL | — |
| phone | varchar | YES | — |
| avatar_url | text | YES | — |
| role | varchar | YES | `'primary'` |
| status | varchar | YES | `'active'` |
| language | varchar | YES | `'ar'` |
| last_login_at | timestamptz | YES | — |
| created_by | varchar | YES | — |
| created_at | timestamptz | YES | `now()` |
| updated_at | timestamptz | YES | `now()` |
| auth_user_id | uuid | YES | — |
| is_active | boolean | YES | `true` |
| address | text | YES | — |
| source | text | YES | `'manual'` |

**Notes:**
- `auth_user_id`: Set for clients using Supabase Auth. NULL for legacy bcrypt-only clients.
- `password_hash`: Set to `'supabase_auth_managed'` for Supabase Auth clients.
- `is_active`: Derived from `status = 'active'` for legacy rows.
- `source`: How the client was acquired. Values: `'manual'`, `'referral'`, `'website'`, `'social'`.

**Migration:**
```sql
ALTER TABLE pyra_clients ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE pyra_clients ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
```

---

## pyra_favorites

User bookmarks for files and folders.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| username | varchar | NOT NULL | — |
| item_path | text | NOT NULL | — |
| item_type | varchar | NOT NULL | `'file'` |
| display_name | varchar | YES | `''` |
| created_at | timestamptz | YES | `now()` |

---

## pyra_file_approvals

File approval workflow — clients approve/reject deliverables.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| file_id | varchar | NOT NULL | FK → pyra_project_files(id) |
| client_id | varchar | NOT NULL | — |
| status | varchar | YES | `'pending'` |
| comment | text | YES | — |
| created_at | timestamptz | YES | `now()` |
| updated_at | timestamptz | YES | `now()` |
| reviewed_by | text | YES | — |
| reviewed_at | timestamptz | YES | — |

---

## pyra_file_index

Search index for all files in storage. Maintained on upload/delete/rename.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| file_path | text | NOT NULL | UNIQUE |
| file_name | varchar | NOT NULL | — |
| file_name_lower | varchar | NOT NULL | — |
| folder_path | text | NOT NULL | `''` |
| file_size | bigint | YES | `0` |
| mime_type | varchar | YES | `''` |
| updated_at | timestamptz | YES | `now()` |
| indexed_at | timestamptz | YES | `now()` |
| original_name | varchar | YES | — |
| parent_path | text | YES | — |
| is_folder | boolean | YES | `false` |

**Notes:**
- `parent_path` mirrors `folder_path` (added for code compatibility).
- `file_name_lower` used for case-insensitive search.
- `file_path` has a UNIQUE constraint for upsert operations.

---

## pyra_file_permissions_archived

> **ARCHIVED**: This table was renamed from `pyra_file_permissions` to `pyra_file_permissions_archived`
> in the ERP migration (`supabase/migrations/002_erp_features.sql`, Wave 1C).
> File access is now controlled via Team -> Project -> Storage Path chain + RBAC roles.
> The table is retained for historical reference only and is no longer written to by application code.

~~Per-file/folder access permissions for specific users.~~

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| file_path | text | NOT NULL | — |
| username | varchar | NOT NULL | — |
| permission | varchar | NOT NULL | `'browse'`, `'upload'`, `'full'` |
| granted_by | varchar | NOT NULL | — |
| created_at | timestamptz | YES | `now()` |

---

## pyra_file_versions

Version history for files. Each version is stored as a separate file in storage.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| file_path | text | NOT NULL | — |
| version_path | text | NOT NULL | — |
| version_number | integer | NOT NULL | `1` |
| file_size | bigint | YES | `0` |
| mime_type | varchar | YES | `''` |
| created_by | varchar | NOT NULL | — |
| created_by_display | varchar | NOT NULL | — |
| comment | text | YES | `''` |
| created_at | timestamptz | YES | `now()` |

---

## pyra_login_attempts

Tracks login attempts for security monitoring and brute-force detection.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | integer | NOT NULL | auto-increment |
| username | varchar | NOT NULL | — |
| ip_address | varchar | YES | `''` |
| success | boolean | YES | `false` |
| attempted_at | timestamptz | YES | `now()` |

---

## pyra_notifications

Internal notifications for team members (employees/admins).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| recipient_username | varchar | NOT NULL | FK → pyra_users(username) |
| type | varchar | NOT NULL | — |
| title | varchar | NOT NULL | — |
| message | text | YES | `''` |
| source_username | varchar | YES | `''` |
| source_display_name | varchar | YES | `''` |
| target_path | text | YES | `''` |
| is_read | boolean | YES | `false` |
| created_at | timestamptz | YES | `now()` |

---

## pyra_project_files

Files associated with projects. Links storage files to project context.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| project_id | varchar | NOT NULL | FK → pyra_projects(id) |
| file_name | varchar | NOT NULL | — |
| file_path | text | NOT NULL | — |
| file_size | bigint | YES | `0` |
| mime_type | varchar | YES | — |
| category | varchar | YES | `'general'` |
| version | integer | YES | `1` |
| needs_approval | boolean | YES | `false` |
| uploaded_by | varchar | NOT NULL | — |
| created_at | timestamptz | YES | `now()` |
| client_visible | boolean | YES | `true` |

---

## pyra_projects

Project management with client and team associations.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| name | varchar | NOT NULL | — |
| description | text | YES | — |
| client_company | varchar | NOT NULL | — |
| status | varchar | YES | `'active'` |
| start_date | date | YES | — |
| deadline | date | YES | — |
| storage_path | text | NOT NULL | — |
| cover_image | text | YES | — |
| created_by | varchar | NOT NULL | — |
| created_at | timestamptz | YES | `now()` |
| updated_at | timestamptz | YES | `now()` |
| client_id | text | YES | FK → pyra_clients(id) |
| team_id | text | YES | FK → pyra_teams(id) |

---

## pyra_quote_items

Line items within a quote/invoice.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | text | NOT NULL | — |
| quote_id | text | YES | FK → pyra_quotes(id) |
| sort_order | integer | YES | `0` |
| description | text | NOT NULL | — |
| quantity | numeric | YES | `1` |
| rate | numeric | YES | `0` |
| amount | numeric | YES | `0` |
| created_at | timestamptz | YES | `now()` |

---

## pyra_quotes

Financial quotes/invoices for clients. Supports digital signatures.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | text | NOT NULL | — |
| quote_number | text | NOT NULL | UNIQUE |
| client_id | text | YES | — |
| project_name | text | YES | — |
| status | text | YES | `'draft'` |
| estimate_date | date | YES | `CURRENT_DATE` |
| expiry_date | date | YES | — |
| currency | text | YES | `'SAR'` |
| subtotal | numeric | YES | `0` |
| tax_rate | numeric | YES | `0` |
| tax_amount | numeric | YES | `0` |
| total | numeric | YES | `0` |
| notes | text | YES | — |
| terms | jsonb | YES | `'[]'` |
| bank_details | jsonb | YES | `'{}'` |
| company_name | text | YES | — |
| company_logo | text | YES | — |
| client_name | text | YES | — |
| client_email | text | YES | — |
| client_company | text | YES | — |
| client_phone | text | YES | — |
| client_address | text | YES | — |
| signature_data | text | YES | — |
| signed_by | text | YES | — |
| signed_at | timestamptz | YES | — |
| signed_ip | text | YES | — |
| sent_at | timestamptz | YES | — |
| viewed_at | timestamptz | YES | — |
| created_by | text | YES | — |
| created_at | timestamptz | YES | `now()` |
| updated_at | timestamptz | YES | `now()` |

---

## pyra_reviews

File review comments and annotations (threaded).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| file_path | text | NOT NULL | — |
| username | varchar | NOT NULL | — |
| display_name | varchar | NOT NULL | — |
| type | varchar | NOT NULL | — |
| text | text | YES | `''` |
| resolved | boolean | YES | `false` |
| created_at | timestamptz | YES | `now()` |
| parent_id | varchar | YES | — (self-reference for threads) |

---

## pyra_sessions

Cookie-based user sessions with SHA-256 hashed tokens.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| username | varchar | NOT NULL | — |
| token_hash | varchar | NOT NULL | — |
| expires_at | timestamptz | NOT NULL | — |
| created_at | timestamptz | YES | `now()` |

---

## pyra_settings

System-wide key-value settings store.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **key** | varchar | NOT NULL | PRIMARY KEY |
| value | jsonb | YES | `'{}'` |
| updated_at | timestamptz | YES | `now()` |

---

## pyra_share_links

Public share links for files with expiry and access limits.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| token | varchar | NOT NULL | UNIQUE |
| file_path | text | NOT NULL | — |
| file_name | varchar | NOT NULL | — |
| created_by | varchar | NOT NULL | — |
| created_by_display | varchar | NOT NULL | — |
| expires_at | timestamptz | NOT NULL | — |
| access_count | integer | YES | `0` |
| max_access | integer | YES | `0` (0 = unlimited) |
| is_active | boolean | YES | `true` |
| password_hash | text | YES | `NULL` |
| notification_email | text | YES | `NULL` |
| created_at | timestamptz | YES | `now()` |

**Migration:**
```sql
ALTER TABLE pyra_share_links ADD COLUMN password_hash TEXT;
ALTER TABLE pyra_share_links ADD COLUMN notification_email TEXT;
```

---

## pyra_team_members

Team membership (many-to-many between users and teams).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| team_id | varchar | NOT NULL | FK → pyra_teams(id) |
| username | varchar | NOT NULL | FK → pyra_users(username) |
| added_by | varchar | NOT NULL | — |
| added_at | timestamptz | YES | `now()` |

---

## pyra_teams

Teams/departments for project scoping and access control.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| name | varchar | NOT NULL | — |
| description | text | YES | `''` |
| permissions | jsonb | NOT NULL | `'{}'` |
| created_by | varchar | NOT NULL | — |
| created_at | timestamptz | YES | `now()` |

---

## pyra_trash

Soft-deleted files with 30-day auto-purge. Original file is copied to `.trash/` in storage.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| original_path | text | NOT NULL | — |
| trash_path | text | NOT NULL | — |
| file_name | varchar | NOT NULL | — |
| file_size | bigint | YES | `0` |
| mime_type | varchar | YES | `''` |
| deleted_by | varchar | NOT NULL | — |
| deleted_by_display | varchar | NOT NULL | — |
| deleted_at | timestamptz | YES | `now()` |
| auto_purge_at | timestamptz | YES | — |

---

## pyra_users

Employee and admin accounts. Passwords hashed with scrypt.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | integer | NOT NULL | auto-increment |
| username | varchar | NOT NULL | UNIQUE |
| password_hash | varchar | NOT NULL | — |
| role | varchar | NOT NULL | `'client'` |
| display_name | varchar | NOT NULL | — |
| permissions | jsonb | NOT NULL | `'{}'` |
| created_at | timestamptz | YES | `now()` |

**Permissions JSON structure:**
```json
{
  "paths": {
    "projects/company-name": "full",
    "projects/another": "browse"
  },
  "allowed_paths": ["projects/company-name"]
}
```

---

## Views

### v_project_summary

Aggregated project view (depends on `pyra_projects`).

---

## Key Relationships

```
pyra_users.username ← pyra_auth_mapping.pyra_username
pyra_users.username ← pyra_team_members.username
pyra_users.username ← pyra_notifications.recipient_username
pyra_users.username ← pyra_sessions.username

pyra_teams.id ← pyra_team_members.team_id
pyra_teams.id ← pyra_projects.team_id

pyra_clients.id ← pyra_projects.client_id
pyra_clients.id ← pyra_client_notifications.client_id
pyra_clients.id ← pyra_client_password_resets.client_id
pyra_clients.id ← pyra_client_notes.client_id
pyra_clients.id ← pyra_client_tag_assignments.client_id

pyra_client_tags.id ← pyra_client_tag_assignments.tag_id

pyra_projects.id ← pyra_project_files.project_id
pyra_projects.id ← pyra_client_comments.project_id

pyra_project_files.id ← pyra_file_approvals.file_id

pyra_quotes.id ← pyra_quote_items.quote_id
```

---

## ID Generation

All `varchar` IDs use the format: `{prefix}_{unix_timestamp}_{random}`
- Max length constrained by `varchar(20)` on some tables (pyra_clients, pyra_projects)
- Generated by `lib/utils/id.ts` using `nanoid`

| Prefix | Table |
|--------|-------|
| `al` | pyra_activity_log |
| `am` | pyra_auth_mapping |
| `cn` | pyra_client_notifications |
| `cno` | pyra_client_notes |
| `cc` | pyra_client_comments |
| `ct` | pyra_client_tags |
| `fa` | pyra_file_approvals |
| `fi` | pyra_file_index |
| `fp` | pyra_file_permissions_archived *(legacy, no longer used)* |
| `fv` | pyra_file_versions |
| `n` | pyra_notifications |
| `pf` | pyra_project_files |
| `rv` | pyra_reviews |
| `sl` | pyra_share_links |
| `tm` | pyra_team_members |
| `tr` | pyra_trash |
| `brd` | pyra_boards |
| `col` | pyra_board_columns |
| `lbl` | pyra_board_labels |
| `tsk` | pyra_tasks |
| `ta` | pyra_task_assignees |
| `chk` | pyra_task_checklist |
| `tc` | pyra_task_comments |
| `tatt` | pyra_task_attachments |
| `tact` | pyra_task_activity |
| `ts` | pyra_timesheets |
| `ann` | pyra_announcements |
| `lr` | pyra_leave_requests |

---

## pyra_boards

Kanban boards linked to projects. Supports templates for quick setup.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| project_id | varchar(20) | NULL | — |
| name | varchar(255) | NOT NULL | — |
| description | text | NULL | — |
| template | text | NULL | — |
| is_default | boolean | NULL | false |
| position | integer | NULL | 0 |
| created_by | varchar | NOT NULL | — |
| created_at | timestamptz | NULL | now() |
| updated_at | timestamptz | NULL | now() |

**PK**: `id`
**FK**: `project_id` → `pyra_projects(id)` ON DELETE CASCADE
**Index**: `idx_boards_project` on `project_id`

---

## pyra_board_columns

Columns within a Kanban board (e.g., "To Do", "In Progress", "Done").

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| board_id | varchar(20) | NOT NULL | — |
| name | varchar(255) | NOT NULL | — |
| color | varchar(20) | NULL | 'gray' |
| position | integer | NULL | 0 |
| wip_limit | integer | NULL | — |
| is_done_column | boolean | NULL | false |
| created_at | timestamptz | NULL | now() |

**PK**: `id`
**FK**: `board_id` → `pyra_boards(id)` ON DELETE CASCADE
**Index**: `idx_columns_board` on `board_id`

---

## pyra_board_labels

Label definitions per board for categorizing tasks.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| board_id | varchar(20) | NOT NULL | — |
| name | varchar(100) | NOT NULL | — |
| color | varchar(20) | NOT NULL | — |
| created_at | timestamptz | NULL | now() |

**PK**: `id`
**FK**: `board_id` → `pyra_boards(id)` ON DELETE CASCADE

---

## pyra_tasks

Task cards on Kanban boards with priority, dates, and hour tracking.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| board_id | varchar(20) | NOT NULL | — |
| column_id | varchar(20) | NOT NULL | — |
| title | varchar(500) | NOT NULL | — |
| description | text | NULL | — |
| position | integer | NULL | 0 |
| priority | varchar(20) | NULL | 'medium' |
| due_date | date | NULL | — |
| start_date | date | NULL | — |
| estimated_hours | numeric(6,2) | NULL | — |
| actual_hours | numeric(6,2) | NULL | 0 |
| cover_image | text | NULL | — |
| is_archived | boolean | NULL | false |
| created_by | varchar | NOT NULL | — |
| created_at | timestamptz | NULL | now() |
| updated_at | timestamptz | NULL | now() |

**PK**: `id`
**FK**: `board_id` → `pyra_boards(id)` ON DELETE CASCADE, `column_id` → `pyra_board_columns(id)`
**Indexes**: `idx_tasks_board`, `idx_tasks_column`, `idx_tasks_due` (partial, where due_date IS NOT NULL)

---

## pyra_task_assignees

Junction table for task–user assignments.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| task_id | varchar(20) | NOT NULL | — |
| username | varchar | NOT NULL | — |
| assigned_by | varchar | NOT NULL | — |
| assigned_at | timestamptz | NULL | now() |

**PK**: `id`
**FK**: `task_id` → `pyra_tasks(id)` ON DELETE CASCADE
**Unique**: `(task_id, username)`
**Indexes**: `idx_assignees_task`, `idx_assignees_user`

---

## pyra_task_labels

Junction table linking tasks to board labels.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **task_id** | varchar(20) | NOT NULL | — |
| **label_id** | varchar(20) | NOT NULL | — |

**PK**: `(task_id, label_id)`
**FK**: `task_id` → `pyra_tasks(id)` ON DELETE CASCADE, `label_id` → `pyra_board_labels(id)` ON DELETE CASCADE

---

## pyra_task_checklist

Checklist items within a task card.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| task_id | varchar(20) | NOT NULL | — |
| title | text | NOT NULL | — |
| is_checked | boolean | NULL | false |
| position | integer | NULL | 0 |
| created_at | timestamptz | NULL | now() |

**PK**: `id`
**FK**: `task_id` → `pyra_tasks(id)` ON DELETE CASCADE
**Index**: `idx_checklist_task`

---

## pyra_task_comments

Comments on task cards.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| task_id | varchar(20) | NOT NULL | — |
| author_username | varchar | NOT NULL | — |
| author_name | varchar | NOT NULL | — |
| content | text | NOT NULL | — |
| created_at | timestamptz | NULL | now() |
| updated_at | timestamptz | NULL | now() |

**PK**: `id`
**FK**: `task_id` → `pyra_tasks(id)` ON DELETE CASCADE
**Index**: `idx_task_comments`

---

## pyra_task_attachments

Files attached to task cards.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| task_id | varchar(20) | NOT NULL | — |
| file_id | varchar(20) | NULL | — |
| file_name | varchar | NOT NULL | — |
| file_url | text | NOT NULL | — |
| file_size | bigint | NULL | 0 |
| uploaded_by | varchar | NOT NULL | — |
| created_at | timestamptz | NULL | now() |

**PK**: `id`
**FK**: `task_id` → `pyra_tasks(id)` ON DELETE CASCADE

---

## pyra_task_activity

Activity log for task-level events (moved, assigned, edited, etc.).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| task_id | varchar(20) | NOT NULL | — |
| username | varchar | NOT NULL | — |
| display_name | varchar | NOT NULL | — |
| action | varchar(50) | NOT NULL | — |
| details | jsonb | NULL | '{}' |
| created_at | timestamptz | NULL | now() |

**PK**: `id`
**FK**: `task_id` → `pyra_tasks(id)` ON DELETE CASCADE
**Index**: `idx_task_activity`

---

## pyra_timesheets

Employee time entries for tracking work hours per project/task.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| username | varchar | NOT NULL | — |
| project_id | varchar(20) | NULL | — |
| task_id | varchar(20) | NULL | — |
| date | date | NOT NULL | — |
| hours | numeric(4,2) | NOT NULL | — |
| description | text | NULL | — |
| status | varchar(20) | NULL | 'draft' |
| approved_by | varchar | NULL | — |
| approved_at | timestamptz | NULL | — |
| created_at | timestamptz | NULL | now() |

**PK**: `id`
**FK**: `project_id` → `pyra_projects(id)`, `task_id` → `pyra_tasks(id)`
**Check**: `hours > 0 AND hours <= 24`
**Indexes**: `idx_timesheet_user`, `idx_timesheet_date`
**Status values**: `draft`, `submitted`, `approved`, `rejected`

---

## pyra_announcements

Company-wide announcements with priority and pin support.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| title | varchar(500) | NOT NULL | — |
| content | text | NOT NULL | — |
| priority | varchar(20) | NULL | 'normal' |
| is_pinned | boolean | NULL | false |
| target_teams | jsonb | NULL | '[]' |
| created_by | varchar | NOT NULL | — |
| created_at | timestamptz | NULL | now() |
| updated_at | timestamptz | NULL | now() |
| expires_at | timestamptz | NULL | — |

**PK**: `id`
**Priority values**: `normal`, `important`, `urgent`

---

## pyra_announcement_reads

Tracks which users have read which announcements.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **announcement_id** | varchar(20) | NOT NULL | — |
| **username** | varchar | NOT NULL | — |
| read_at | timestamptz | NULL | now() |

**PK**: `(announcement_id, username)`
**FK**: `announcement_id` → `pyra_announcements(id)` ON DELETE CASCADE

---

## pyra_leave_requests

Employee leave/vacation requests with approval workflow.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| username | varchar | NOT NULL | — |
| type | varchar(30) | NOT NULL | — |
| start_date | date | NOT NULL | — |
| end_date | date | NOT NULL | — |
| days_count | integer | NOT NULL | — |
| reason | text | NULL | — |
| status | varchar(20) | NULL | 'pending' |
| reviewed_by | varchar | NULL | — |
| reviewed_at | timestamptz | NULL | — |
| review_note | text | NULL | — |
| created_at | timestamptz | NULL | now() |

**PK**: `id`
**Index**: `idx_leave_user`
**Type values**: `annual`, `sick`, `personal`
**Status values**: `pending`, `approved`, `rejected`

---

## pyra_leave_balances

Annual leave balance per employee per year.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **username** | varchar | NOT NULL | — |
| **year** | integer | NOT NULL | — |
| annual_total | integer | NULL | 30 |
| annual_used | integer | NULL | 0 |
| sick_total | integer | NULL | 15 |
| sick_used | integer | NULL | 0 |
| personal_total | integer | NULL | 5 |
| personal_used | integer | NULL | 0 |

**PK**: `(username, year)`

---

## pyra_users — Additional Columns (Employee System)

The following columns were added to `pyra_users` for the Employee System:

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| phone | text | NULL | — |
| job_title | text | NULL | — |
| avatar_url | text | NULL | — |
| bio | text | NULL | — |
| status | text | NULL | 'active' |

---

## 45. pyra_roles

Defines user roles with associated permissions, color/icon for display, and system-role protection.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | uuid | NOT NULL | gen_random_uuid() |
| name | varchar | NOT NULL | — |
| name_ar | varchar | NOT NULL | — |
| description | text | NULL | — |
| permissions | jsonb (text[]) | NOT NULL | '[]' |
| color | varchar | NOT NULL | 'gray' |
| icon | varchar | NOT NULL | 'Shield' |
| is_system | boolean | NOT NULL | false |
| created_by | varchar | NULL | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**Unique constraint**: `name`

---

## 46. pyra_invoices

Stores invoice records with client snapshot data, financial totals, milestone tracking, and parent-invoice linking.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| invoice_number | varchar | NOT NULL | — |
| quote_id | varchar | NULL | — |
| client_id | varchar | NULL | — |
| project_name | text | NULL | — |
| status | varchar | NOT NULL | 'draft' |
| issue_date | date | NOT NULL | — |
| due_date | date | NOT NULL | — |
| currency | varchar | NOT NULL | 'AED' |
| subtotal | numeric | NOT NULL | 0 |
| tax_rate | numeric | NOT NULL | 0 |
| tax_amount | numeric | NOT NULL | 0 |
| total | numeric | NOT NULL | 0 |
| amount_paid | numeric | NOT NULL | 0 |
| amount_due | numeric | NOT NULL | 0 |
| notes | text | NULL | — |
| terms_conditions | text | NULL | — |
| bank_details | text | NULL | — |
| company_name | varchar | NULL | — |
| company_logo | text | NULL | — |
| client_name | varchar | NULL | — |
| client_email | varchar | NULL | — |
| client_company | varchar | NULL | — |
| client_phone | varchar | NULL | — |
| client_address | text | NULL | — |
| milestone_type | varchar | NULL | — |
| parent_invoice_id | varchar | NULL | — |
| contract_id | varchar | NULL | — |
| created_by | varchar | NULL | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**Unique constraint**: `invoice_number`

---

## 47. pyra_invoice_items

Line items belonging to an invoice, with sort ordering and computed amounts.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| invoice_id | varchar | NOT NULL | — |
| sort_order | integer | NOT NULL | 0 |
| description | text | NOT NULL | — |
| quantity | numeric | NOT NULL | 1 |
| rate | numeric | NOT NULL | 0 |
| amount | numeric | NOT NULL | 0 |
| created_at | timestamptz | NOT NULL | now() |

**FK**: `invoice_id` → `pyra_invoices.id`

---

## 48. pyra_payments

Payment records against invoices, tracking method, reference, and who recorded the payment.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| invoice_id | varchar | NOT NULL | — |
| amount | numeric | NOT NULL | — |
| payment_date | date | NOT NULL | — |
| method | varchar | NULL | — |
| reference | varchar | NULL | — |
| notes | text | NULL | — |
| recorded_by | varchar | NULL | — |
| created_at | timestamptz | NOT NULL | now() |

**FK**: `invoice_id` → `pyra_invoices.id`

---

## 49. pyra_expenses

Individual expense entries linked to categories, projects, or subscriptions. Supports VAT and recurring flags.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| category_id | varchar | NULL | — |
| project_id | varchar | NULL | — |
| subscription_id | varchar | NULL | — |
| description | text | NOT NULL | — |
| amount | numeric | NOT NULL | — |
| currency | varchar | NOT NULL | 'AED' |
| vat_rate | numeric | NOT NULL | 0 |
| vat_amount | numeric | NOT NULL | 0 |
| expense_date | date | NOT NULL | — |
| vendor | varchar | NULL | — |
| payment_method | varchar | NULL | — |
| receipt_url | text | NULL | — |
| notes | text | NULL | — |
| is_recurring | boolean | NOT NULL | false |
| recurring_period | varchar | NULL | — |
| created_by | varchar | NULL | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**FK**: `category_id` → `pyra_expense_categories.id`, `project_id` → `pyra_projects.id`

---

## 50. pyra_expense_categories

Categorization for expenses with Arabic names, icons, and custom colors.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| name | varchar | NOT NULL | — |
| name_ar | varchar | NOT NULL | — |
| icon | varchar | NULL | — |
| color | varchar | NULL | — |
| is_default | boolean | NOT NULL | false |
| sort_order | integer | NOT NULL | 0 |
| created_at | timestamptz | NOT NULL | now() |

---

## 51. pyra_subscriptions

Tracks recurring subscriptions with renewal dates, billing cycles, and linked payment cards.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| name | varchar | NOT NULL | — |
| provider | varchar | NULL | — |
| cost | numeric | NOT NULL | — |
| currency | varchar | NOT NULL | 'AED' |
| billing_cycle | varchar | NOT NULL | 'monthly' |
| next_renewal_date | date | NULL | — |
| card_id | varchar | NULL | — |
| category | varchar | NULL | — |
| status | varchar | NOT NULL | 'active' |
| url | text | NULL | — |
| notes | text | NULL | — |
| auto_renew | boolean | NOT NULL | true |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**FK**: `card_id` → `pyra_cards.id`

---

## 52. pyra_contracts

Client contracts with value tracking, billing structures, and milestone-based invoicing.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| client_id | varchar | NULL | — |
| project_id | varchar | NULL | — |
| title | varchar | NOT NULL | — |
| description | text | NULL | — |
| contract_type | varchar | NOT NULL | — |
| total_value | numeric | NOT NULL | 0 |
| currency | varchar | NOT NULL | 'AED' |
| vat_rate | numeric | NOT NULL | 0 |
| billing_structure | varchar | NULL | — |
| start_date | date | NULL | — |
| end_date | date | NULL | — |
| status | varchar | NOT NULL | 'draft' |
| amount_billed | numeric | NOT NULL | 0 |
| amount_collected | numeric | NOT NULL | 0 |
| notes | text | NULL | — |
| retainer_amount | numeric | NOT NULL | 0 |
| retainer_cycle | varchar | NOT NULL | 'monthly' |
| billing_day | integer | NOT NULL | 1 |
| created_by | varchar | NULL | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**FK**: `client_id` → `pyra_clients.id`, `project_id` → `pyra_projects.id`

**Retainer fields**: `retainer_amount` is the monthly/periodic billing amount. `retainer_cycle` is `monthly` or `quarterly`. `billing_day` is 1–28.

---

## 53. pyra_contract_milestones

Individual milestones within a contract, tracking completion, percentage, and linked invoices.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| contract_id | varchar | NOT NULL | — |
| title | varchar | NOT NULL | — |
| description | text | NULL | — |
| percentage | numeric | NOT NULL | 0 |
| amount | numeric | NOT NULL | 0 |
| due_date | date | NULL | — |
| status | varchar | NOT NULL | 'pending' |
| invoice_id | varchar | NULL | — |
| sort_order | integer | NOT NULL | 0 |
| completed_at | timestamptz | NULL | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**FK**: `contract_id` → `pyra_contracts.id`, `invoice_id` → `pyra_invoices.id`

---

## 53b. pyra_contract_items

Structured deliverables / scope of work for contracts. Items are descriptive only (no pricing). Supports one level of nesting via `parent_id`.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| contract_id | varchar | NOT NULL | — |
| parent_id | varchar | NULL | — |
| title | text | NOT NULL | — |
| description | text | NULL | — |
| sort_order | integer | NOT NULL | 0 |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**FK**: `contract_id` → `pyra_contracts.id` (CASCADE), `parent_id` → `pyra_contract_items.id` (CASCADE)
**Prefix**: `cti`

---

## 54. pyra_cards

Payment card references (no full card numbers stored) used for linking to subscriptions.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| card_name | varchar | NOT NULL | — |
| bank_name | varchar | NULL | — |
| last_four | varchar(4) | NULL | — |
| card_type | varchar | NULL | — |
| expiry_month | integer | NULL | — |
| expiry_year | integer | NULL | — |
| is_default | boolean | NOT NULL | false |
| notes | text | NULL | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

---

## 55. pyra_recurring_invoices

Templates for auto-generating invoices on a schedule, linked to contracts and clients.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| contract_id | varchar | NULL | — |
| client_id | varchar | NULL | — |
| title | varchar | NOT NULL | — |
| items | jsonb | NOT NULL | '[]' |
| currency | varchar | NOT NULL | 'AED' |
| billing_cycle | varchar | NOT NULL | 'monthly' |
| next_generation_date | date | NULL | — |
| last_generated_at | timestamptz | NULL | — |
| status | varchar | NOT NULL | 'active' |
| auto_send | boolean | NOT NULL | false |
| created_by | varchar | NULL | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**FK**: `contract_id` → `pyra_contracts.id`, `client_id` → `pyra_clients.id`

---

## 56. pyra_revenue_targets

Revenue goals per period (monthly/quarterly/yearly) with actual revenue calculated at query time from paid invoices.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| period_type | varchar | NOT NULL | — |
| period_start | date | NOT NULL | — |
| period_end | date | NOT NULL | — |
| target_amount | numeric | NOT NULL | — |
| currency | varchar | NOT NULL | 'AED' |
| notes | text | NULL | — |
| created_by | varchar | NULL | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**Note**: `period_type` accepts `monthly`, `quarterly`, or `yearly`.

---

## 57. pyra_automation_rules

Workflow automation rule definitions with trigger events, conditions, and action configurations.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| name | varchar | NOT NULL | — |
| description | text | NULL | — |
| trigger_event | varchar | NOT NULL | — |
| conditions | jsonb | NOT NULL | '{}' |
| actions | jsonb | NOT NULL | '[]' |
| is_enabled | boolean | NOT NULL | true |
| created_by | varchar | NULL | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

---

## 58. pyra_automation_log

Execution log for automation rules, recording trigger data, actions taken, and any errors.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| rule_id | varchar | NOT NULL | — |
| rule_name | varchar | NULL | — |
| trigger_event | varchar | NOT NULL | — |
| trigger_data | jsonb | NULL | — |
| actions_executed | jsonb | NULL | — |
| status | varchar | NOT NULL | — |
| error_message | text | NULL | — |
| executed_at | timestamptz | NOT NULL | now() |

**FK**: `rule_id` → `pyra_automation_rules.id`

---

## 59. pyra_webhooks

Webhook endpoint configurations with event subscriptions, secrets, and enable/disable state.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| name | varchar | NOT NULL | — |
| url | text | NOT NULL | — |
| secret | varchar | NULL | — |
| events | jsonb (text[]) | NOT NULL | '[]' |
| is_enabled | boolean | NOT NULL | true |
| created_by | varchar | NULL | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

---

## 60. pyra_webhook_deliveries

Delivery attempts for webhook events, with retry tracking and response logging.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| webhook_id | varchar | NOT NULL | — |
| event | varchar | NOT NULL | — |
| payload | jsonb | NOT NULL | — |
| response_status | integer | NULL | — |
| response_body | text | NULL | — |
| attempt_count | integer | NOT NULL | 1 |
| max_attempts | integer | NOT NULL | 3 |
| status | varchar | NOT NULL | 'pending' |
| next_retry_at | timestamptz | NULL | — |
| error_message | text | NULL | — |
| delivered_at | timestamptz | NULL | — |
| created_at | timestamptz | NOT NULL | now() |

**FK**: `webhook_id` → `pyra_webhooks.id`

---

## 61. pyra_kb_articles

Knowledge base articles with slugs, public/private visibility, and view tracking.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| category_id | varchar | NULL | — |
| title | varchar | NOT NULL | — |
| slug | varchar | NOT NULL | — |
| content | text | NULL | — |
| excerpt | text | NULL | — |
| is_public | boolean | NOT NULL | true |
| sort_order | integer | NOT NULL | 0 |
| view_count | integer | NOT NULL | 0 |
| author | varchar | NULL | — |
| author_display_name | varchar | NULL | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**Unique constraint**: `slug`
**FK**: `category_id` → `pyra_kb_categories.id`

---

## 62. pyra_kb_categories

Categories for organizing knowledge base articles, with slug-based routing and visibility control.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| name | varchar | NOT NULL | — |
| slug | varchar | NOT NULL | — |
| description | text | NULL | — |
| icon | varchar | NULL | — |
| sort_order | integer | NOT NULL | 0 |
| is_public | boolean | NOT NULL | true |
| created_by | varchar | NULL | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**Unique constraint**: `slug`

---

## 63. pyra_script_reviews

Client script review submissions from the portal, tracking version, status, and reviewer info.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| filename | varchar | NOT NULL | — |
| video_number | varchar | NULL | — |
| version | integer | NOT NULL | 1 |
| status | varchar | NOT NULL | 'pending' |
| comment | text | NULL | — |
| client_id | varchar | NOT NULL | — |
| client_name | varchar | NULL | — |
| reviewed_at | timestamptz | NULL | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**FK**: `client_id` → `pyra_clients.id`

---

## 64. pyra_script_review_replies

Threaded replies on script reviews, supporting both admin and client sender types.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| review_id | varchar | NOT NULL | — |
| sender_type | varchar | NOT NULL | — |
| sender_name | varchar | NULL | — |
| message | text | NOT NULL | — |
| created_at | timestamptz | NOT NULL | now() |

**FK**: `review_id` → `pyra_script_reviews.id`
**Note**: `sender_type` is either `admin` or `client`.

---

## 65. pyra_file_tags

Tags applied to files, supporting batch tagging with upsert on unique constraint.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| file_path | text | NOT NULL | — |
| tag_name | varchar | NOT NULL | — |
| color | varchar | NULL | — |
| created_by | varchar | NULL | — |

**Unique constraint**: `(file_path, tag_name)`

---

## 66. pyra_client_branding

Per-client portal branding overrides including colors, logos, and custom display names.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| client_id | varchar | NOT NULL | — |
| primary_color | varchar | NULL | — |
| secondary_color | varchar | NULL | — |
| logo_url | text | NULL | — |
| favicon_url | text | NULL | — |
| company_name_display | varchar | NULL | — |
| login_background_url | text | NULL | — |

**FK**: `client_id` → `pyra_clients.id`
**Unique constraint**: `client_id`

---

## 67. pyra_stripe_payments

Stripe checkout session and payment intent records linked to invoices for online payment tracking.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| invoice_id | varchar | NOT NULL | — |
| stripe_session_id | varchar | NULL | — |
| stripe_payment_intent_id | varchar | NULL | — |
| amount | numeric | NOT NULL | — |
| currency | varchar | NOT NULL | 'AED' |
| status | varchar | NOT NULL | 'pending' |
| client_id | varchar | NULL | — |
| metadata | jsonb | NULL | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**FK**: `invoice_id` → `pyra_invoices.id`, `client_id` → `pyra_clients.id`

---

## 68. pyra_api_keys

API key management with SHA-256 hashed keys, prefix display, permission scoping, and expiration.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| name | varchar | NOT NULL | — |
| key_hash | varchar | NOT NULL | — |
| key_prefix | varchar | NOT NULL | — |
| permissions | jsonb (text[]) | NOT NULL | '[]' |
| is_active | boolean | NOT NULL | true |
| last_used_at | timestamptz | NULL | — |
| expires_at | timestamptz | NULL | — |
| created_by | varchar | NULL | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**Note**: Full key is only returned once at creation time. Only `key_prefix` and `key_hash` are stored.

---

## 69. pyra_approvals

Approval workflow records. Used for tracking pending approval counts in the KPI dashboard.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| status | varchar | NOT NULL | 'pending' |

**Note**: Minimal columns confirmed from code. This table is primarily queried via count with `status = 'pending'` filter in the KPI alerts endpoint. Additional columns may exist in the database but are not referenced in the application code.

---

# ERP Migration Tables

> Added by `supabase/migrations/002_erp_features.sql`.
> These tables support the Employee Experience & HR Management features.

---

## pyra_users — ERP Columns Added (Wave 1A/1B)

The following columns were added to `pyra_users` by the ERP migration:

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| employment_type | varchar(30) | YES | `'full_time'` | `full_time`, `part_time`, `contractor`, `freelance`, `intern` |
| work_location | varchar(20) | YES | `'onsite'` | `onsite`, `remote`, `hybrid` |
| payment_type | varchar(30) | YES | `'monthly_salary'` | `monthly_salary`, `hourly`, `per_task`, `commission` |
| salary | numeric(12,2) | YES | `0` | Base monthly salary |
| hourly_rate | numeric(8,2) | YES | `0` | Hourly rate (for hourly workers) |
| hire_date | date | YES | — | Employment start date |
| national_id | text | YES | — | National/Emirates ID |
| bank_details | jsonb | YES | `'{}'` | Bank account info (encrypted at rest) |
| department | varchar(100) | YES | — | Department name |
| manager_username | varchar | YES | — | Reporting manager (self-referencing) |
| work_schedule_id | varchar(20) | YES | — | FK to `pyra_work_schedules(id)` |

**Index**: `idx_users_manager` on `manager_username`

---

## 70. pyra_leave_types

Custom leave type definitions. Seeded with Annual, Sick, and Personal types.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| name | varchar(100) | NOT NULL | — |
| name_ar | varchar(100) | NOT NULL | — |
| icon | varchar(50) | YES | `'CalendarOff'` |
| color | varchar(20) | YES | `'gray'` |
| default_days | integer | NOT NULL | `0` |
| max_carry_over | integer | YES | `0` |
| requires_attachment | boolean | YES | `false` |
| is_paid | boolean | YES | `true` |
| is_active | boolean | YES | `true` |
| sort_order | integer | YES | `0` |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`

---

## 71. pyra_leave_balances_v2

Dynamic leave balances per employee, per year, per leave type. Replaces the static `pyra_leave_balances` table.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| username | varchar | NOT NULL | — |
| year | integer | NOT NULL | — |
| leave_type_id | varchar(20) | NOT NULL | — |
| total_days | integer | NOT NULL | `0` |
| used_days | integer | NOT NULL | `0` |
| carried_over | integer | NOT NULL | `0` |

**PK**: `id`
**FK**: `leave_type_id` -> `pyra_leave_types(id)`
**Unique**: `(username, year, leave_type_id)`
**Index**: `idx_leave_bal_v2_user` on `(username, year)`

---

## 72. pyra_work_schedules

Work schedule templates. Seeded with UAE Standard (Sun-Thu, 09:00-18:00).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| name | varchar(100) | NOT NULL | — |
| name_ar | varchar(100) | NOT NULL | — |
| work_days | jsonb | NOT NULL | `'[0,1,2,3,4]'` |
| start_time | time | NOT NULL | `'09:00'` |
| end_time | time | NOT NULL | `'18:00'` |
| break_minutes | integer | YES | `60` |
| daily_hours | numeric(4,2) | YES | `8` |
| overtime_multiplier | numeric(3,2) | YES | `1.5` |
| weekend_multiplier | numeric(3,2) | YES | `2.0` |
| is_default | boolean | YES | `false` |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`

---

## 73. pyra_attendance

Daily attendance records with clock-in/out times.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| username | varchar | NOT NULL | — |
| date | date | NOT NULL | — |
| clock_in | timestamptz | YES | — |
| clock_out | timestamptz | YES | — |
| total_hours | numeric(5,2) | YES | `0` |
| status | varchar(20) | YES | `'present'` |
| notes | text | YES | — |
| ip_address | varchar(45) | YES | — |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`
**Unique**: `(username, date)`
**Index**: `idx_attendance_user_date` on `(username, date)`

---

## 74. pyra_timesheet_periods

Timesheet submission periods (weekly/biweekly) with approval workflow.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| username | varchar | NOT NULL | — |
| period_type | varchar(20) | NOT NULL | `'weekly'` |
| start_date | date | NOT NULL | — |
| end_date | date | NOT NULL | — |
| total_hours | numeric(6,2) | YES | `0` |
| status | varchar(20) | YES | `'open'` |
| submitted_at | timestamptz | YES | — |
| approved_by | varchar | YES | — |
| approved_at | timestamptz | YES | — |
| rejection_note | text | YES | — |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`
**Index**: `idx_ts_period_user` on `(username, start_date)`

---

## pyra_timesheets — ERP Columns Added (Wave 3B/3C)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| period_id | varchar(20) | — | FK to `pyra_timesheet_periods(id)` |
| is_overtime | boolean | `false` | Whether entry is overtime |
| overtime_multiplier | numeric(3,2) | `1.5` | Overtime pay multiplier |

---

## pyra_tasks — ERP Columns Added (Wave 4A)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| payment_amount | numeric(10,2) | `0` | Per-task payment amount |
| payment_currency | varchar(3) | `'AED'` | Payment currency |
| payment_status | varchar(20) | `'unpaid'` | `unpaid`, `pending`, `paid` |
| task_hourly_rate | numeric(8,2) | — | Task-specific hourly rate override |

---

## pyra_leave_requests — ERP Columns Added (Wave 2B)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| cancelled_at | timestamptz | — | When the leave was cancelled |
| cancelled_by | varchar | — | Who cancelled the leave |
| cancellation_reason | text | — | Reason for cancellation |

---

## 75. pyra_employee_payments

Employee payment ledger tracking all payment sources (salary, tasks, overtime, bonuses).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| username | varchar | NOT NULL | — |
| source_type | varchar(30) | NOT NULL | — |
| source_id | varchar(20) | YES | — |
| description | text | YES | — |
| amount | numeric(10,2) | NOT NULL | — |
| currency | varchar(3) | YES | `'AED'` |
| status | varchar(20) | YES | `'pending'` |
| payroll_id | varchar(20) | YES | — |
| approved_by | varchar | YES | — |
| approved_at | timestamptz | YES | — |
| paid_at | timestamptz | YES | — |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`
**Index**: `idx_emp_payments_user` on `username`, `idx_emp_payments_payroll` on `payroll_id`

---

## 76. pyra_payroll_runs

Monthly payroll runs with approval workflow.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| month | integer | NOT NULL | — |
| year | integer | NOT NULL | — |
| status | varchar(20) | YES | `'draft'` |
| total_amount | numeric(14,2) | YES | `0` |
| currency | varchar(3) | YES | `'AED'` |
| employee_count | integer | YES | `0` |
| calculated_at | timestamptz | YES | — |
| approved_by | varchar | YES | — |
| approved_at | timestamptz | YES | — |
| paid_at | timestamptz | YES | — |
| notes | text | YES | — |
| created_by | varchar | NOT NULL | — |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`
**Unique**: `(month, year)`

---

## 77. pyra_payroll_items

Per-employee payroll line items within a payroll run.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| payroll_id | varchar(20) | NOT NULL | — |
| username | varchar | NOT NULL | — |
| base_salary | numeric(12,2) | YES | `0` |
| task_payments | numeric(12,2) | YES | `0` |
| overtime_amount | numeric(12,2) | YES | `0` |
| bonus | numeric(12,2) | YES | `0` |
| deductions | numeric(12,2) | YES | `0` |
| deduction_details | jsonb | YES | `'[]'` |
| net_pay | numeric(12,2) | YES | `0` |
| status | varchar(20) | YES | `'pending'` |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`
**FK**: `payroll_id` -> `pyra_payroll_runs(id)`
**Index**: `idx_payroll_items_run` on `payroll_id`, `idx_payroll_items_user` on `username`

---

## 78. pyra_evaluation_periods

Performance evaluation periods (e.g., Q1 2026, Annual 2026).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| name | varchar(200) | NOT NULL | — |
| name_ar | varchar(200) | NOT NULL | — |
| start_date | date | NOT NULL | — |
| end_date | date | NOT NULL | — |
| status | varchar(20) | YES | `'draft'` |
| created_by | varchar | NOT NULL | — |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`

---

## 79. pyra_evaluation_criteria

Evaluation criteria definitions with weights and categories.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| name | varchar(200) | NOT NULL | — |
| name_ar | varchar(200) | NOT NULL | — |
| description | text | YES | — |
| weight | numeric(5,2) | YES | `1.0` |
| category | varchar(50) | YES | — |
| is_active | boolean | YES | `true` |
| sort_order | integer | YES | `0` |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`

---

## 80. pyra_evaluations

Individual employee evaluations within a period.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| period_id | varchar(20) | NOT NULL | — |
| employee_username | varchar | NOT NULL | — |
| evaluator_username | varchar | NOT NULL | — |
| evaluation_type | varchar(30) | YES | `'manager'` |
| overall_rating | numeric(3,1) | YES | — |
| status | varchar(20) | YES | `'draft'` |
| comments | text | YES | — |
| strengths | text | YES | — |
| improvements | text | YES | — |
| submitted_at | timestamptz | YES | — |
| acknowledged_at | timestamptz | YES | — |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`
**FK**: `period_id` -> `pyra_evaluation_periods(id)`
**Index**: `idx_evaluations_period` on `period_id`, `idx_evaluations_employee` on `employee_username`

---

## 81. pyra_evaluation_scores

Per-criteria scores within an evaluation.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| evaluation_id | varchar(20) | NOT NULL | — |
| criteria_id | varchar(20) | NOT NULL | — |
| score | numeric(3,1) | NOT NULL | — |
| comment | text | YES | — |

**PK**: `id`
**FK**: `evaluation_id` -> `pyra_evaluations(id)` ON DELETE CASCADE, `criteria_id` -> `pyra_evaluation_criteria(id)`
**Unique**: `(evaluation_id, criteria_id)`

---

## 82. pyra_kpi_targets

KPI targets per employee, optionally linked to an evaluation period.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| username | varchar | NOT NULL | — |
| period_id | varchar(20) | YES | — |
| title | varchar(300) | NOT NULL | — |
| target_value | numeric(12,2) | YES | — |
| actual_value | numeric(12,2) | YES | `0` |
| unit | varchar(50) | YES | — |
| status | varchar(20) | YES | `'active'` |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`
**FK**: `period_id` -> `pyra_evaluation_periods(id)`
**Index**: `idx_kpi_user` on `username`

---

## 83. pyra_content_pipeline

Content production pipeline items linked to projects.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| project_id | varchar(20) | YES | — |
| title | varchar(500) | NOT NULL | — |
| content_type | varchar(50) | YES | `'video'` |
| current_stage | varchar(50) | YES | `'scripting'` |
| assigned_to | varchar | YES | — |
| script_review_id | varchar(20) | YES | — |
| deadline | date | YES | — |
| notes | text | YES | — |
| created_by | varchar | NOT NULL | — |
| created_at | timestamptz | YES | `now()` |
| updated_at | timestamptz | YES | `now()` |

**PK**: `id`
**FK**: `project_id` -> `pyra_projects(id)`
**Index**: `idx_pipeline_project` on `project_id`

---

## 84. pyra_pipeline_stages

Individual stage tracking within a content pipeline item.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar(20) | NOT NULL | — |
| pipeline_id | varchar(20) | NOT NULL | — |
| stage | varchar(50) | NOT NULL | — |
| status | varchar(20) | YES | `'pending'` |
| assigned_to | varchar | YES | — |
| started_at | timestamptz | YES | — |
| completed_at | timestamptz | YES | — |
| notes | text | YES | — |
| sort_order | integer | YES | `0` |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`
**FK**: `pipeline_id` -> `pyra_content_pipeline(id)` ON DELETE CASCADE
**Index**: `idx_pipeline_stages` on `pipeline_id`

---

# Sales & Call Center CRM Tables (Migration 005)

## 85. pyra_sales_pipeline_stages

Configurable sales pipeline stages (funnel steps).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| name | text | NOT NULL | — |
| name_ar | text | NOT NULL | — |
| color | varchar | YES | `'blue'` |
| sort_order | int | NOT NULL | `0` |
| is_default | bool | YES | `false` |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`

## 86. pyra_sales_labels

Labels/tags for classifying sales leads.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| name | text | NOT NULL | — |
| name_ar | text | YES | — |
| color | varchar | YES | `'gray'` |
| created_by | varchar | YES | — |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`

## 87. pyra_sales_leads

Potential clients (leads) tracked through the sales pipeline.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| name | text | NOT NULL | — |
| phone | text | YES | — |
| email | text | YES | — |
| company | text | YES | — |
| source | varchar | YES | `'manual'` |
| stage_id | varchar | YES | — |
| assigned_to | varchar | YES | — |
| client_id | varchar | YES | — |
| notes | text | YES | — |
| priority | varchar | YES | `'medium'` |
| last_contact_at | timestamptz | YES | — |
| next_follow_up | timestamptz | YES | — |
| converted_at | timestamptz | YES | — |
| is_converted | bool | YES | `false` |
| created_by | varchar | YES | — |
| created_at | timestamptz | YES | `now()` |
| updated_at | timestamptz | YES | `now()` |

**PK**: `id`
**FK**: `stage_id` -> `pyra_sales_pipeline_stages(id)`, `client_id` -> `pyra_clients(id)`
**Indexes**: `idx_leads_assigned`, `idx_leads_stage`, `idx_leads_phone`

## 88. pyra_lead_labels

Junction table: Lead ↔ Label (many-to-many).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **lead_id** | varchar | NOT NULL | — |
| **label_id** | varchar | NOT NULL | — |

**PK**: `(lead_id, label_id)`
**FK**: `lead_id` -> `pyra_sales_leads(id)` CASCADE, `label_id` -> `pyra_sales_labels(id)` CASCADE

## 89. pyra_lead_activities

Activity log for each lead (notes, calls, stage changes, etc.).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| lead_id | varchar | NOT NULL | — |
| activity_type | varchar | NOT NULL | — |
| description | text | YES | — |
| metadata | jsonb | YES | — |
| created_by | varchar | YES | — |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`
**FK**: `lead_id` -> `pyra_sales_leads(id)` CASCADE
**Index**: `idx_lead_activities_lead`

## 90. pyra_lead_transfers

Transfer history when leads are reassigned between agents.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| lead_id | varchar | NOT NULL | — |
| from_agent | varchar | YES | — |
| to_agent | varchar | YES | — |
| reason | text | YES | — |
| created_by | varchar | YES | — |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`
**FK**: `lead_id` -> `pyra_sales_leads(id)` CASCADE

## 91. pyra_whatsapp_instances

WhatsApp instances linked to sales agents via Evolution API.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| instance_name | varchar | NOT NULL | — |
| agent_username | varchar | YES | — |
| phone_number | varchar | YES | — |
| status | varchar | YES | `'disconnected'` |
| api_key | varchar | YES | — |
| created_by | varchar | YES | — |
| created_at | timestamptz | YES | `now()` |
| updated_at | timestamptz | YES | `now()` |

**PK**: `id`
**Unique**: `instance_name`

## 92. pyra_whatsapp_messages

WhatsApp message history synced from Evolution API.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| instance_name | varchar | YES | — |
| remote_jid | varchar | NOT NULL | — |
| lead_id | varchar | YES | — |
| client_id | varchar | YES | — |
| message_id | varchar | YES | — |
| direction | varchar | NOT NULL | — |
| message_type | varchar | YES | `'text'` |
| content | text | YES | — |
| media_url | text | YES | — |
| file_name | text | YES | — |
| status | varchar | YES | `'sent'` |
| timestamp | timestamptz | NOT NULL | — |
| metadata | jsonb | YES | — |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`
**FK**: `lead_id` -> `pyra_sales_leads(id)`, `client_id` -> `pyra_clients(id)`
**Indexes**: `idx_wa_messages_jid`, `idx_wa_messages_lead`, `idx_wa_messages_instance`

## 93. pyra_quote_approvals

Quote approval workflow for sales agent quote submissions.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| quote_id | text | YES | — |
| requested_by | varchar | YES | — |
| approved_by | varchar | YES | — |
| status | varchar | YES | `'pending'` |
| comments | text | YES | — |
| requested_at | timestamptz | YES | `now()` |
| responded_at | timestamptz | YES | — |

**PK**: `id`
**FK**: `quote_id` -> `pyra_quotes(id)` CASCADE
**Indexes**: `idx_quote_approvals_quote`, `idx_quote_approvals_status`

## 94. pyra_sales_follow_ups

Scheduled follow-up reminders for sales leads.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **id** | varchar | NOT NULL | — |
| lead_id | varchar | YES | — |
| assigned_to | varchar | YES | — |
| due_at | timestamptz | NOT NULL | — |
| title | text | YES | — |
| notes | text | YES | — |
| status | varchar | YES | `'pending'` |
| completed_at | timestamptz | YES | — |
| created_by | varchar | YES | — |
| created_at | timestamptz | YES | `now()` |

**PK**: `id`
**FK**: `lead_id` -> `pyra_sales_leads(id)` CASCADE
**Indexes**: `idx_follow_ups_assigned`, `idx_follow_ups_due`
