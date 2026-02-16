# Pyra Workspace 3.0 — Database Schema

> Auto-documented from live Supabase database on 2026-02-16
> Host: `pyraworkspacedb.pyramedia.cloud`
> 26 tables in `public` schema (prefix: `pyra_`)

---

## Table of Contents

1. [pyra_activity_log](#pyra_activity_log) — Activity audit trail
2. [pyra_auth_mapping](#pyra_auth_mapping) — Supabase Auth ↔ pyra_users mapping
3. [pyra_blocked_logs](#pyra_blocked_logs) — Blocked AI response logs
4. [pyra_client_comments](#pyra_client_comments) — Client–team project comments
5. [pyra_client_notifications](#pyra_client_notifications) — Portal client notifications
6. [pyra_client_password_resets](#pyra_client_password_resets) — Client password reset tokens
7. [pyra_clients](#pyra_clients) — Client accounts (portal users)
8. [pyra_favorites](#pyra_favorites) — User file/folder favorites
9. [pyra_file_approvals](#pyra_file_approvals) — File approval workflow
10. [pyra_file_index](#pyra_file_index) — File search index
11. [pyra_file_permissions](#pyra_file_permissions) — Per-file access rules
12. [pyra_file_versions](#pyra_file_versions) — File version history
13. [pyra_login_attempts](#pyra_login_attempts) — Login attempt tracking
14. [pyra_notifications](#pyra_notifications) — Internal team notifications
15. [pyra_project_files](#pyra_project_files) — Files linked to projects
16. [pyra_projects](#pyra_projects) — Project management
17. [pyra_quote_items](#pyra_quote_items) — Quote line items
18. [pyra_quotes](#pyra_quotes) — Financial quotes/invoices
19. [pyra_reviews](#pyra_reviews) — File review comments
20. [pyra_sessions](#pyra_sessions) — User sessions (cookie-based)
21. [pyra_settings](#pyra_settings) — System settings (key-value)
22. [pyra_share_links](#pyra_share_links) — Public file share links
23. [pyra_team_members](#pyra_team_members) — Team membership
24. [pyra_teams](#pyra_teams) — Teams/departments
25. [pyra_trash](#pyra_trash) — Soft-deleted files (30-day retention)
26. [pyra_users](#pyra_users) — Employee/admin accounts

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

**Notes:**
- `auth_user_id`: Set for clients using Supabase Auth. NULL for legacy bcrypt-only clients.
- `password_hash`: Set to `'supabase_auth_managed'` for Supabase Auth clients.
- `is_active`: Derived from `status = 'active'` for legacy rows.

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
| created_at | timestamptz | YES | `now()` |

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
| `cc` | pyra_client_comments |
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
