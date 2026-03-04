# Client Management System

> Comprehensive client management with detail pages, notes, tags, activity tracking, branding, and export capabilities.

---

## Overview

The Client Management system provides a full CRM-like experience for managing client relationships within Pyra Workspace. It covers the entire client lifecycle from creation to ongoing relationship management.

---

## Features

### Client List Page (`/dashboard/clients`)
- Searchable, sortable table with pagination
- Status toggle (active/inactive) with visual indicators
- Quick stats: projects count, invoices total, outstanding balance
- Tag-based filtering and display
- Export to CSV/PDF
- Bulk operations

### Client Detail Page (`/dashboard/clients/[id]`)

Six tabs provide deep client insights:

| Tab | Content |
|-----|---------|
| **نظرة عامة** (Overview) | Contact info, stats cards, recent activity, quick links |
| **المشاريع** (Projects) | All projects with status, deadline, linked files |
| **الفواتير** (Invoices) | Invoice list with status badges, totals, due dates |
| **عروض الأسعار** (Quotes) | Quote list with status flow tracking |
| **الملاحظات** (Notes) | Private internal notes with timestamps |
| **الهوية البصرية** (Branding) | Portal branding customization (see [PORTAL-BRANDING.md](./PORTAL-BRANDING.md)) |

### Notes System
- Add/delete internal notes per client
- Timestamped with author attribution
- Markdown-free text with auto-linkification
- Activity logged for audit trail

### Tags System
- Create global tags with color coding (9 colors available)
- Assign multiple tags per client
- Filter clients by tag on the list page
- Tags persist across the system

---

## Database Tables

### `pyra_clients` (extended)

| Column | Type | Description |
|--------|------|-------------|
| `id` | text | Primary key (prefix: `c_`) |
| `name` | text | Client full name |
| `email` | text | Login email (unique) |
| `phone` | text | Phone number |
| `company` | text | Company name |
| `address` | text | Physical address |
| `source` | text | Acquisition source (`manual`, `referral`, `website`, `social`) |
| `is_active` | boolean | Account status |
| `last_login_at` | timestamptz | Last portal login |
| `created_at` | timestamptz | Account creation date |

### `pyra_client_notes`

| Column | Type | Description |
|--------|------|-------------|
| `id` | text | Primary key (prefix: `cno_`) |
| `client_id` | text | FK to `pyra_clients.id` |
| `content` | text | Note text |
| `created_by` | text | Author user ID |
| `created_by_name` | text | Author display name |
| `created_at` | timestamptz | Creation timestamp |

### `pyra_client_tags`

| Column | Type | Description |
|--------|------|-------------|
| `id` | text | Primary key (prefix: `ct_`) |
| `name` | text | Tag label (unique) |
| `color` | text | Color key (`orange`, `red`, `green`, `blue`, `purple`, `pink`, `teal`, `amber`, `gray`) |
| `created_at` | timestamptz | Creation timestamp |

### `pyra_client_tag_assignments`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `client_id` | text | FK to `pyra_clients.id` |
| `tag_id` | text | FK to `pyra_client_tags.id` |
| `created_at` | timestamptz | Assignment timestamp |

### `pyra_client_branding`

See [PORTAL-BRANDING.md](./PORTAL-BRANDING.md) for full details.

---

## API Endpoints

### Admin Endpoints (`/api/clients/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/clients` | List all clients (with search, sort, pagination) |
| POST | `/api/clients` | Create new client |
| GET | `/api/clients/[id]` | Get client detail with stats + recent activity |
| PATCH | `/api/clients/[id]` | Update client info |
| DELETE | `/api/clients/[id]` | Delete client |
| GET | `/api/clients/[id]/activity` | Get full activity history for client |
| GET | `/api/clients/[id]/notes` | List client notes |
| POST | `/api/clients/[id]/notes` | Add a note |
| DELETE | `/api/clients/[id]/notes/[noteId]` | Delete a note |
| GET | `/api/clients/[id]/branding` | Get branding settings |
| PATCH | `/api/clients/[id]/branding` | Update branding settings |
| POST | `/api/clients/[id]/branding/upload` | Upload logo/favicon |
| GET | `/api/clients/tags` | List all tags |
| POST | `/api/clients/tags` | Create tag |
| DELETE | `/api/clients/tags/[id]` | Delete tag |
| POST | `/api/clients/[id]/tags` | Assign tag to client |
| DELETE | `/api/clients/[id]/tags/[tagId]` | Remove tag from client |

---

## Activity Tracking

Client activity is tracked via `pyra_activity_log` with these query filters:
- `target_path` matching `/clients/{id}*`
- `details->>client_id` matching the client ID
- `details->>client_company` matching the company name

### Supported Activity Types

| Action Type | Arabic Label | Icon |
|-------------|-------------|------|
| `client_created` | تم إنشاء الحساب | Users |
| `client_updated` | تم تحديث البيانات | Users |
| `client_note_added` | تمت إضافة ملاحظة | StickyNote |
| `project_created` | تم إنشاء مشروع | Briefcase |
| `invoice_created` | تم إنشاء فاتورة | Receipt |
| `quote_created` | تم إنشاء عرض سعر | Quote |
| `upload` / `download` | تم رفع/تحميل ملف | FileText |
| `portal_login` | تسجيل دخول للبوابة | Globe |
| `branding_updated` | تم تحديث الهوية البصرية | Palette |
| *(40+ total types)* | | |

---

## Key Components

| Component | Path | Purpose |
|-----------|------|---------|
| `ClientDetailClient` | `app/dashboard/clients/[id]/client-detail-client.tsx` | Main detail page (1200+ lines) |
| `ClientNotesTab` | `components/clients/ClientNotesTab.tsx` | Notes CRUD UI |
| `BrandingEditor` | `components/clients/BrandingEditor.tsx` | Branding customization UI |
