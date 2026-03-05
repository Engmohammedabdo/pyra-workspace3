# Pyra Workspace 3.0 — Database Schema

> Auto-documented from live Supabase database on 2026-03-04
> Host: `pyraworkspacedb.pyramedia.cloud`
> 44 tables in `public` schema (prefix: `pyra_`)

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
14. [pyra_file_permissions](#pyra_file_permissions) — Per-file access rules
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

## pyra_file_permissions

Per-file/folder access permissions for specific users.

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
| `fp` | pyra_file_permissions |
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
