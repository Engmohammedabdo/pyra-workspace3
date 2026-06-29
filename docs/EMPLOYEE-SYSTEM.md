# Employee Experience & Task Management System

> Documentation for the Employee System added to Pyra Workspace 3.0
> Date: 2026-03-04

---

## Overview

The Employee System transforms Pyra Workspace from an admin-only tool into a full team collaboration platform. It adds **9 new modules** (including the HR Overview dashboard and Employee Documents Vault) with **17+ new database tables**, **18 new RBAC permissions**, and **12+ new dashboard pages**.

### Modules

| Module | Page | Audience | Description |
|--------|------|----------|-------------|
| HR Overview | `/dashboard/hr` | Admin only | Headcount, attendance rate, leave liability, payroll trend, evaluations, alerts, celebrations |
| Profile | `/dashboard/profile` | All employees | Personal info, avatar, password, permissions view |
| My Tasks | `/dashboard/my-tasks` | All employees | All tasks assigned to the current user |
| Timesheet | `/dashboard/timesheet` | All employees | Time tracking with approval workflow |
| Boards | `/dashboard/boards` | All employees | Kanban board management |
| Board View | `/dashboard/boards/[id]` | All employees | Full Kanban board with drag-and-drop |
| Announcements | `/dashboard/announcements` | All employees | Company announcements with read tracking |
| Directory | `/dashboard/directory` | All employees | Team member directory |
| Leave | `/dashboard/leave` | All employees | Leave request and balance management |
| Employee Documents (HR) | `/dashboard/hr/documents` | HR / Admin | Upload + manage all employees' documents; configurable types; 30/7-day expiry alerts |
| Employee Documents (Self-service) | `/dashboard/my-documents` | All employees | Read-only view of own documents with signed-URL download |

---

## Setup Instructions

### 1. Run Database Migration

The migration SQL file is at `scripts/migration-employee-system.sql`. Run it in your Supabase SQL Editor:

1. Go to your Supabase Studio (https://pyraworkspacedb.pyramedia.cloud)
2. Navigate to **SQL Editor**
3. Copy the contents of `scripts/migration-employee-system.sql`
4. Paste and execute

The migration is idempotent (uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`), so it's safe to run multiple times.

### 2. No Dependencies to Install

All features use existing packages already in the project:
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` — Kanban drag-and-drop
- `framer-motion` — Page animations
- `lucide-react` — Icons
- `sonner` — Toast notifications
- `shadcn/ui` — UI components

### 3. Build and Deploy

```bash
pnpm build   # Verify zero errors
git push     # Vercel auto-deploys
```

---

## Module Details

### HR Overview (`/dashboard/hr`) — Admin Only

**What it does**: Single-pane admin dashboard aggregating HR data across all employees. Mirrors the `/api/my-work` single-aggregator pattern.

**Access**: Requires `hr.view` permission (admin-only — NOT in `BASE_EMPLOYEE`; admins inherit it via `'*'`). The API endpoint (`GET /api/hr/overview`) gates with `requireApiPermission('hr.view')` and then uses `createServiceRoleClient()` — payroll and attendance tables are service-role-only per Gap #3 audit.

**Widgets** (`components/hr/overview/`):

| Widget | Data shown |
|--------|-----------|
| `HrKpiRow` | Headcount (active, by type, by department, new in 30d / 90d) |
| `HeadcountChart` | Department breakdown chart |
| Attendance today | Present / absent / late / on-leave counts + present-rate % |
| `UpcomingLeaveList` | Leave pending approvals + employees on leave today + upcoming |
| `PayrollTrendChart` | Current payroll status, last paid total, 6-month cost trend |
| `EvaluationsStatusCard` | Active evaluation period, pending / submitted / acknowledged counts |
| `HrAlerts` | Severity-tagged alerts (critical / high / medium / low) with deep links |
| `CelebrationsCard` | Birthdays (`date_of_birth`) + work anniversaries (`hire_date`) for the current month |

**API Endpoint**:
| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| GET | `/api/hr/overview` | hr.view | Aggregated HR metrics (headcount, attendance, leave, payroll, evaluations, alerts, celebrations) |

**Hook**: `hooks/useHROverview.ts` — `staleTime: 60_000`, `refetchOnWindowFocus: true`.

**Pure helpers**: `lib/hr/overview-helpers.ts` (`computeCelebrations`, `deriveAlerts`) — unit-tested in `__tests__/hr-overview-helpers.test.ts`.

---

### Profile (`/dashboard/profile`)

**What it does**: Personal profile management for every user.

**Features**:
- View and edit personal info (name, email, phone, job title, bio)
- Upload avatar image (stored in Supabase Storage)
- Change password with current password verification
- View assigned permissions (read-only)
- View personal activity history

**API Endpoints**:
| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| GET | `/api/profile` | Authenticated | Get current user profile |
| PATCH | `/api/profile` | Authenticated | Update profile fields |
| POST | `/api/profile/avatar` | Authenticated | Upload avatar image |
| POST | `/api/profile/password` | Authenticated | Change password |

---

### My Tasks (`/dashboard/my-tasks`)

**What it does**: Aggregated view of all tasks assigned to the current user across all boards.

**Features**:
- Tasks grouped by: Overdue, Today, This Week, Upcoming, Done
- Search filter across all tasks
- Stat cards: Total, Overdue (red), Today (blue), This Week (green)
- Click any task to navigate to its board
- Priority badges with color coding (urgent=red, high=orange, medium=blue, low=gray)

**API Endpoints**:
| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| GET | `/api/my-tasks` | Authenticated | List all tasks assigned to current user |

---

### Kanban Boards (`/dashboard/boards`)

**What it does**: Project task management using Kanban methodology.

**Features**:
- Create boards from 6 pre-built templates (General, Content, Design, Campaign, Video, Social Media)
- Each template pre-configures columns and labels for the workflow
- Full drag-and-drop between columns using @dnd-kit
- Task cards with: title, priority, due date, assignees, labels, checklist, comments
- Task detail modal for editing all task properties
- WIP (Work-In-Progress) limits per column

**Board Templates** (defined in `lib/config/board-templates.ts`):

| Template | Columns | Labels |
|----------|---------|--------|
| General | قيد الانتظار → قيد التنفيذ → مراجعة → مكتمل | عاجل, تحسين, خلل, ميزة جديدة |
| Content | أفكار → كتابة → مراجعة → نشر → مكتمل | مدونة, سوشال ميديا, فيديو, بودكاست |
| Design | طلبات → تصميم → مراجعة العميل → تعديلات → مكتمل | UI/UX, جرافيك, موشن, براندنج |
| Campaign | تخطيط → إعداد → تنفيذ → تحليل → مكتمل | إعلان مدفوع, SEO, إيميل, محتوى |
| Video | سكريبت → تصوير → مونتاج → مراجعة → نشر | ريلز, يوتيوب, TikTok, إعلان |
| Social | تخطيط → تصميم → جدولة → منشور → تحليل | Instagram, Twitter, LinkedIn, TikTok |

**API Endpoints**:
| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| GET | `/api/boards` | boards.view | List all boards |
| POST | `/api/boards` | boards.manage | Create board (with template) |
| GET | `/api/boards/[id]` | boards.view | Get board details |
| PATCH | `/api/boards/[id]` | boards.manage | Update board |
| DELETE | `/api/boards/[id]` | boards.manage | Delete board |
| POST | `/api/boards/[id]/columns` | boards.manage | Add column |
| PATCH | `/api/boards/[id]/columns` | boards.manage | Batch update column positions |
| GET | `/api/boards/[id]/tasks` | tasks.view | List tasks in board |
| POST | `/api/boards/[id]/tasks` | tasks.create | Create task |
| GET | `/api/tasks/[id]` | tasks.view | Get task details |
| PATCH | `/api/tasks/[id]` | tasks.manage | Update task |
| DELETE | `/api/tasks/[id]` | tasks.manage | Delete task |
| POST | `/api/tasks/[id]/move` | tasks.create | Move task between columns |

---

### Timesheet (`/dashboard/timesheet`)

**What it does**: Track work hours per project with approval workflow.

**Features**:
- Add time entries with: date, hours (0.5-24), project, description
- Summary cards: Total hours, Approved count, Pending count
- Status workflow: Draft → Submitted → Approved/Rejected
- Managers can approve/reject submitted entries
- Employees can only edit/delete draft entries

**API Endpoints**:
| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| GET | `/api/timesheet` | timesheet.view | List entries (scoped by role) |
| POST | `/api/timesheet` | timesheet.view | Create entry |
| PATCH | `/api/timesheet/[id]` | timesheet.view | Update/submit/approve entry |
| DELETE | `/api/timesheet/[id]` | timesheet.view | Delete entry |

**Approval permissions**: `timesheet.approve` required to approve/reject entries.

---

### Announcements (`/dashboard/announcements`)

**What it does**: Company-wide announcements with read tracking.

**Features**:
- View announcements with priority badges (normal, important, urgent)
- Unread indicator (blue left border + blue dot)
- Pin important announcements to top
- Auto-mark as read when opened
- Create/edit announcements (managers only)
- Expiration date support

**API Endpoints**:
| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| GET | `/api/announcements` | Authenticated | List active announcements |
| POST | `/api/announcements` | announcements.manage | Create announcement |
| PATCH | `/api/announcements/[id]` | announcements.manage | Update announcement |
| DELETE | `/api/announcements/[id]` | announcements.manage | Delete announcement |
| POST | `/api/announcements/[id]/read` | Authenticated | Mark as read |

---

### Employee Directory (`/dashboard/directory`)

**What it does**: Browse all team members with contact info.

**Features**:
- Card grid layout with avatar, name, role, job title
- Search by name, username, job title
- Filter by role and status
- Contact info: email and phone
- Status indicators (active/inactive)

**API Endpoints**:
| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| GET | `/api/directory` | directory.view | List all users with roles |

---

### Leave Management (`/dashboard/leave`)

**What it does**: Request and manage leave/vacation days.

**Features**:
- Leave balance cards: Annual (30 days), Sick (15 days), Personal (5 days)
- Progress bars showing used vs total
- Submit leave requests with: type, date range, reason
- Automatic day count calculation
- Balance validation before submission
- Approval workflow for managers
- Cancel pending requests

**API Endpoints**:
| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| GET | `/api/leave` | leave.view | List leave requests (scoped by role) |
| POST | `/api/leave` | leave.view | Create leave request |
| PATCH | `/api/leave/[id]` | leave.view | Approve/reject/cancel request |
| GET | `/api/leave/balance` | leave.view | Get current user's balance |

**Approval permissions**: `leave.approve` required to approve/reject requests.

---

### Employee Documents Vault (`/dashboard/hr/documents`) — HR / Admin

**What it does**: Centralised HR vault for storing, managing, and tracking expiry of employee identity and compliance documents. Employees get a read-only self-service view at `/dashboard/my-documents`; a "وثائق" tab on `/dashboard/users/[username]` gives HR one-click upload against a specific employee.

**Document types** are configurable via `/dashboard/hr/documents/settings` (catalogue of `pyra_document_types` rows). Six types are seeded: عقد عمل, هوية إماراتية _(requires\_expiry)_, جواز سفر _(requires\_expiry)_, إقامة / تأشيرة _(requires\_expiry)_, شهادة, أخرى.

**Storage**: files land in the existing **private** bucket `pyra-private` under `employee-documents/{username}/{timestamp}-{nanoid}{ext}`. `storage_path` is **never** returned to clients — all downloads go through 1-hour signed URLs (`createSignedUrl`, TTL 3600). Storage path is 100% server-controlled (file.name is never used); extension is derived from validated MIME. MIME allowlist: `pdf / jpeg / png / webp` (SVG rejected). Hard cap: 20 MB per file.

**Expiry tracking**: documents with an `expiry_date` are checked daily by the cron job (`/api/cron/document-expiry-check`). Two-tier alert system:
- **7-day tier** — sets both `expiry_alert_7_sent` and `expiry_alert_30_sent`; notifies the employee with `type: 'document_expiring_soon'` (critical).
- **30-day tier** — sets `expiry_alert_30_sent`; notifies the employee (medium severity).
Both flags flip regardless of notification outcome (idempotency). Flags reset automatically when `expiry_date` is updated via PATCH.

**HR Overview integration**: `deriveAlerts` in `lib/hr/overview-helpers.ts` surfaces expired-document counts as `critical` alerts and expiring-soon counts as `high` alerts, both linking to `/dashboard/hr/documents`.

**Pure helper**: `lib/hr/document-expiry.ts` — `classifyExpiry(expiryDate, todayKey)` → `'expired' | 'expiring_7' | 'expiring_30' | 'ok' | 'none'` + `EXPIRY_BADGE` map. Unit-tested in `__tests__/document-expiry.test.ts`.

**API Endpoints**:
| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| GET | `/api/hr/document-types` | documents.manage | List active document types |
| POST | `/api/hr/document-types` | documents.manage | Create document type |
| PATCH | `/api/hr/document-types/[id]` | documents.manage | Update document type |
| DELETE | `/api/hr/document-types/[id]` | documents.manage | Soft-delete (sets `is_active=false`) |
| GET | `/api/hr/documents` | documents.manage | List all documents (returns `signed_url`, `type_name_ar`, `employee_display_name`; `storage_path` stripped) |
| POST | `/api/hr/documents` | documents.manage | Multipart upload + DB insert; orphan cleanup on insert failure; upload rate-limited |
| PATCH | `/api/hr/documents/[id]` | documents.manage | Update metadata; resets both alert flags when `expiry_date` changes |
| DELETE | `/api/hr/documents/[id]` | documents.manage | Delete record + best-effort storage remove |
| GET | `/api/hr/documents/[id]/signed-url` | documents.manage | Fresh 1h signed URL |
| GET | `/api/my-documents` | documents.view | Own documents only (`WHERE employee_username = me`); signed URL inline |
| GET | `/api/my-documents/[id]/signed-url` | documents.view | Fresh signed URL with ownership check |
| POST | `/api/cron/document-expiry-check` | cron.document-expiry-check / `*` | Daily expiry scan; 7d + 30d tiers; grouped admin summary |

All endpoints use `gate-then-service-role` pattern (permission check first, then `createServiceRoleClient()` for DB/storage access).

**Hooks**: `hooks/useDocumentTypes.ts` (list + CRUD); `hooks/useEmployeeDocuments.ts` (`useEmployeeDocuments`, `useEmployeeDocumentsByUser`, `useUploadEmployeeDocument` [raw `fetch` FormData exemption], `useUpdateEmployeeDocument`, `useDeleteEmployeeDocument`); `hooks/useMyDocuments.ts`.

**UI components** (all in `components/hr/documents/`):
- `DocTypeRow` — one row of the document-types settings list
- `UploadDocumentDialog` — accepts optional `defaultEmployeeUsername` prop for the user-detail tab
- `DocumentRowActions` — download (signed URL) + edit + delete
- `UserDocumentsTab` — used on `/dashboard/users/[username]` "وثائق" tab

The HR documents list table is rendered inline in `documents-client.tsx` via the
shared `<DataTable>` primitive (`@/components/ui/data-table`) — there is no
dedicated table component.

**V1.1 backlog**: employee self-upload; per-download audit log; document versioning; OCR auto-expiry; 60-day tier; bulk upload; export/zip; widen cron admin summary to all `documents.manage` holders; centralize bucket/TTL/size constants; `encodeURIComponent` on `employee_username` query param.

---

### Admin Attendance Edit

**What it does**: Allows admins to create or correct any employee's attendance record for any date.

**API Endpoint**:
| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| POST | `/api/dashboard/attendance/admin` | attendance.manage | Upsert attendance record (username + date); recomputes total_hours; logs activity |

**UI**: `components/attendance/AdminAttendanceDialog.tsx` — wires the previously-dead `canManage` flag on the attendance page. Opens when an admin clicks a date cell with no existing record or clicks an existing record's edit button.

**Auth pattern**: `requireApiPermission('attendance.manage')` then `createServiceRoleClient()` (attendance tables are service-role-only per Gap #3 Phase 2).

---

## Data Layer (React Query Hooks)

All attendance and payroll pages use shared React Query hooks. Direct `useState`/`useEffect` data fetching has been removed.

| Hook file | Exports | Used by |
|-----------|---------|---------|
| `hooks/useAttendance.ts` | `useAttendanceRecords`, `useAttendanceSummary`, `useClockIn`, `useClockOut`, `useUpsertAttendance` | Attendance page + admin dialog |
| `hooks/usePayroll.ts` | `usePayrollRuns`, `usePayrollRun`, `useMyPayslips`, `useCreatePayroll`, `useCalculatePayroll`, `useUpdatePayroll` | Payroll page |
| `hooks/useEmployeePayments.ts` | `useEmployeePayments`, `useCreateEmployeePayment`, `useUpdateEmployeePayment` | Payroll → Employee Payments tab |
| `hooks/useHROverview.ts` | `useHROverview` | HR Overview dashboard |
| `hooks/useDocumentTypes.ts` | `useDocumentTypes`, `useCreateDocumentType`, `useUpdateDocumentType`, `useDeleteDocumentType` | Document types catalogue settings |
| `hooks/useEmployeeDocuments.ts` | `useEmployeeDocuments`, `useEmployeeDocumentsByUser`, `useUploadEmployeeDocument`, `useUpdateEmployeeDocument`, `useDeleteEmployeeDocument` | HR documents page + user-detail tab |
| `hooks/useMyDocuments.ts` | `useMyDocuments` | Employee self-service `/dashboard/my-documents` |

**Status constants** for attendance (`ATTENDANCE_STATUS`, `ATTENDANCE_STATUS_LABELS`, `ATTENDANCE_STATUS_STYLES`) are centralized in `lib/constants/statuses.ts`.

---

## RBAC Permissions

### New Permissions Added

| Permission | Description | Default for Employee | Notes |
|-----------|-------------|---------------------|-------|
| `boards.view` | View boards | Yes | |
| `boards.manage` | Create/edit/delete boards | No | |
| `tasks.view` | View tasks | Yes | |
| `tasks.create` | Create/move tasks | Yes | |
| `tasks.manage` | Edit/delete any task | No | |
| `directory.view` | View employee directory | Yes | |
| `timesheet.view` | View/create own timesheet | Yes | |
| `timesheet.manage` | View all timesheets | No | |
| `timesheet.approve` | Approve/reject timesheets | No | |
| `announcements.view` | View announcements | Yes | |
| `announcements.manage` | Create/edit/delete announcements | No | |
| `leave.view` | View/create own leave requests | Yes | |
| `leave.manage` | View all leave requests | No | |
| `leave.approve` | Approve/reject leave requests | No | |
| `hr.view` | View HR Overview dashboard | **No — Admin only** | Not in `BASE_EMPLOYEE`; admin gets via `'*'` |
| `hr.manage` | Manage HR data (reserved) | **No — Admin only** | Reserved for future write operations |
| `documents.view` | View own documents (read-only self-service) | Yes | In `BASE_EMPLOYEE`; own-scope only (`WHERE employee_username = me`) |
| `documents.manage` | Upload / edit / delete any employee's documents; manage document types | **No — HR / Admin** | Not in `BASE_EMPLOYEE`; required for all HR-side endpoints |

### Permission Modules (for Role Editor UI)

| Module ID | Label | Permissions |
|-----------|-------|-------------|
| boards | لوحات العمل | boards.view, boards.manage |
| tasks | المهام | tasks.view, tasks.create, tasks.manage |
| directory | دليل الموظفين | directory.view |
| timesheet | ساعات العمل | timesheet.view, timesheet.manage, timesheet.approve |
| announcements | الإعلانات | announcements.view, announcements.manage |
| leave | الإجازات | leave.view, leave.manage, leave.approve |
| hr | لوحة الموارد البشرية | hr.view, hr.manage |
| documents | وثائق الموظفين | documents.view, documents.manage |

---

## Employee Dashboard

The main dashboard (`/dashboard`) now detects user role and shows:

### For Admins
- Full system KPIs (files, projects, clients, users)
- Revenue and project pipeline charts
- Smart alerts
- Storage usage

### For Employees
- **My Tasks** stat card (total + overdue count)
- **Hours This Week** stat card
- **Announcements** stat card (unread count)
- **Leave Balance** stat card (annual remaining + sick/personal)
- **Overdue Alert** banner (red, links to My Tasks)
- **Leave Balance** sidebar card with progress
- **Quick Actions**: My Tasks, Boards, Timesheet

---

## Sidebar Navigation

Two new navigation groups added for employees:

### شخصي (Personal)
- Profile (`/dashboard/profile`)
- My Tasks (`/dashboard/my-tasks`)
- Timesheet (`/dashboard/timesheet`)

### سير العمل (Workflow)
- Boards (`/dashboard/boards`)
- Announcements (`/dashboard/announcements`)
- Directory (`/dashboard/directory`)
- Leave (`/dashboard/leave`)

---

## Database Tables

15 new tables added. Full schema documentation in `DATABASE-SCHEMA.md`.

**Phase 1 (Profile Extensions)**:
- `pyra_users` — 5 new columns: phone, job_title, avatar_url, bio, status
- `pyra_users.date_of_birth` — added in migration 020 (`date NULL`, idempotent `ADD COLUMN IF NOT EXISTS`). Used by HR Overview celebrations widget (birthdays for current month). `PyraUser` type gained `date_of_birth?: string | null`; users create/edit form and `/api/users` POST & PATCH handle it.

**Phase 2 (Boards & Tasks)**:
- `pyra_boards` — Kanban boards
- `pyra_board_columns` — Board columns
- `pyra_board_labels` — Board labels
- `pyra_tasks` — Task cards
- `pyra_task_assignees` — Task assignments
- `pyra_task_labels` — Task-label junction
- `pyra_task_checklist` — Task checklists
- `pyra_task_comments` — Task comments
- `pyra_task_attachments` — Task attachments
- `pyra_task_activity` — Task activity log

**Phase 3 (Operations & HR)**:
- `pyra_timesheets` — Time tracking
- `pyra_announcements` — Announcements
- `pyra_announcement_reads` — Read tracking
- `pyra_leave_requests` — Leave requests
- `pyra_leave_balances` — Leave balances

**Phase 4 (Employee Documents — migration 021)**:
- `pyra_document_types` — Configurable document type catalogue. Columns: `id varchar PK`, `name varchar`, `name_ar varchar`, `requires_expiry bool DEFAULT false`, `is_active bool DEFAULT true`, `sort_order int`, `created_at timestamptz`. Seeded with 6 rows (contract, Emirates ID, passport, visa/residency, certificate, other).
- `pyra_employee_documents` — Document records. Columns: `id varchar PK`, `employee_username varchar`, `type_id varchar FK→pyra_document_types`, `label text`, `storage_path text` (server-only; never returned to clients), `mime_type varchar`, `size_bytes int CHECK>0`, `expiry_date date NULL`, `expiry_alert_30_sent bool DEFAULT false`, `expiry_alert_7_sent bool DEFAULT false`, `uploaded_by varchar`, `uploaded_at timestamptz`, `notes text`, `metadata jsonb`. Indexes: `(employee_username, uploaded_at DESC)`, `(type_id)`, partial index on `(expiry_date)` where `expiry_date IS NOT NULL AND (expiry_alert_30_sent=false OR expiry_alert_7_sent=false)`.

---

## Files Created

### API Routes (18 files)
```
app/api/profile/route.ts
app/api/profile/avatar/route.ts
app/api/profile/password/route.ts
app/api/directory/route.ts
app/api/boards/route.ts
app/api/boards/[id]/route.ts
app/api/boards/[id]/columns/route.ts
app/api/boards/[id]/tasks/route.ts
app/api/tasks/[id]/route.ts
app/api/tasks/[id]/move/route.ts
app/api/my-tasks/route.ts
app/api/timesheet/route.ts
app/api/timesheet/[id]/route.ts
app/api/announcements/route.ts
app/api/announcements/[id]/route.ts
app/api/announcements/[id]/read/route.ts
app/api/leave/route.ts
app/api/leave/[id]/route.ts
app/api/leave/balance/route.ts
```

### Pages (16 files)
```
app/dashboard/profile/page.tsx
app/dashboard/profile/profile-client.tsx
app/dashboard/directory/page.tsx
app/dashboard/directory/directory-client.tsx
app/dashboard/boards/page.tsx
app/dashboard/boards/boards-client.tsx
app/dashboard/boards/[id]/page.tsx
app/dashboard/boards/[id]/board-view-client.tsx
app/dashboard/my-tasks/page.tsx
app/dashboard/my-tasks/my-tasks-client.tsx
app/dashboard/timesheet/page.tsx
app/dashboard/timesheet/timesheet-client.tsx
app/dashboard/announcements/page.tsx
app/dashboard/announcements/announcements-client.tsx
app/dashboard/leave/page.tsx
app/dashboard/leave/leave-client.tsx
```

### Config (1 file)
```
lib/config/board-templates.ts
```

### Modified Files
```
lib/auth/rbac.ts                    — 14 original + 2 new (hr.view, hr.manage) permissions + 2 more (documents.view, documents.manage); hr + documents module groups
components/layout/sidebar.tsx       — 2 new nav groups (Personal, Workflow); /dashboard/hr as first HR group item; /dashboard/hr/documents + /dashboard/my-documents in HR group
lib/config/module-guide.ts          — 7 original + 1 new (/dashboard/hr) + 2 more (/dashboard/hr/documents, /dashboard/my-documents) module guides
app/dashboard/guide/page.tsx        — New workflow section + HR Overview entry + documents entries
lib/hr/overview-helpers.ts          — deriveAlerts() extended: docsExpired → critical, docsExpiringSoon → high (links to /dashboard/hr/documents)
lib/notifications/notify.ts         — NotificationType union += 'document_expiring_soon' | 'document_expired'
lib/api/activity.ts                 — ENTITY_TYPES.DOCUMENT = 'document'
app/api/hr/overview/route.ts        — Queries pyra_employee_documents for expired + expiring-soon counts
app/dashboard/page.tsx              — Employee dashboard widgets
app/api/dashboard/route.ts          — Employee stats API
lib/constants/statuses.ts           — ATTENDANCE_STATUS / _LABELS / _STYLES centralized
DATABASE-SCHEMA.md                  — 15 new table docs
```

### Employee Documents Bundle (2026-06-29)
```
app/api/hr/document-types/route.ts                       — Document types CRUD (GET/POST)
app/api/hr/document-types/[id]/route.ts                  — PATCH / soft-DELETE
app/api/hr/documents/route.ts                            — List (GET) + multipart upload (POST)
app/api/hr/documents/[id]/route.ts                       — PATCH metadata + DELETE
app/api/hr/documents/[id]/signed-url/route.ts            — Fresh 1h signed URL (HR scope)
app/api/my-documents/route.ts                            — Own documents (GET, documents.view)
app/api/my-documents/[id]/signed-url/route.ts            — Signed URL with ownership check
app/api/cron/document-expiry-check/route.ts              — Daily 30d/7d expiry cron
app/dashboard/hr/documents/page.tsx                      — HR documents vault page
app/dashboard/hr/documents/documents-client.tsx          — HR documents client (DataTable + dialogs)
app/dashboard/hr/documents/settings/page.tsx             — Document types catalogue settings page
app/dashboard/my-documents/page.tsx                      — Employee self-service page
app/dashboard/my-documents/my-documents-client.tsx       — Employee self-service client
hooks/useDocumentTypes.ts                                — Document types list + CRUD mutations
hooks/useEmployeeDocuments.ts                            — HR-scope document hooks (upload/update/delete)
hooks/useMyDocuments.ts                                  — Employee self-service hook
lib/hr/document-expiry.ts                                — classifyExpiry() + EXPIRY_BADGE (pure, unit-tested)
components/hr/documents/DocTypeRow.tsx                   — One row of the document-types settings list
components/hr/documents/UploadDocumentDialog.tsx         — Upload dialog (accepts defaultEmployeeUsername)
components/hr/documents/DocumentRowActions.tsx           — Download + edit + delete row actions
components/hr/documents/UserDocumentsTab.tsx             — "وثائق" tab on /dashboard/users/[username]
__tests__/document-expiry.test.ts                        — Unit tests for classifyExpiry()
```

### HR Bundle Additions (2026-06-27)
```
app/dashboard/hr/page.tsx                       — Server page (requirePermission('hr.view'))
app/dashboard/hr/hr-overview-client.tsx         — Client HR Overview
app/api/hr/overview/route.ts                    — Aggregator endpoint (service-role)
app/api/dashboard/attendance/admin/route.ts     — Admin attendance upsert
hooks/useHROverview.ts                          — HR overview data hook
hooks/useAttendance.ts                          — Consolidated attendance hooks
hooks/usePayroll.ts                             — React Query payroll hooks
hooks/useEmployeePayments.ts                    — Employee payments hooks
lib/hr/overview-helpers.ts                      — computeCelebrations, deriveAlerts
components/hr/overview/HrAlerts.tsx             — Alerts widget
components/hr/overview/HrKpiRow.tsx             — KPI row widget
components/hr/overview/HeadcountChart.tsx       — Department chart
components/hr/overview/PayrollTrendChart.tsx    — 6-month payroll trend
components/hr/overview/UpcomingLeaveList.tsx    — Leave widget
components/hr/overview/EvaluationsStatusCard.tsx — Evaluations widget
components/hr/overview/CelebrationsCard.tsx     — Birthdays + anniversaries
components/attendance/AdminAttendanceDialog.tsx — Admin attendance edit UI
components/attendance/AttendanceCalendar.tsx    — Calendar sub-component
components/attendance/AttendanceSummaryCards.tsx — Summary sub-component
components/attendance/TodayClockCard.tsx        — Clock-in/out sub-component
components/payroll/PayrollRunsTable.tsx         — Payroll table sub-component
components/payroll/PayrollRunRow.tsx            — Payroll row sub-component
components/payroll/EmployeePaymentsTab.tsx      — Payments tab sub-component
components/payroll/CreatePayrollDialog.tsx      — Create payroll dialog
components/payroll/AddPaymentDialog.tsx         — Add payment dialog
__tests__/hr-overview-helpers.test.ts           — Unit tests for pure helpers
```

### Migrations
```
scripts/migration-employee-system.sql                   — Original full SQL migration (renamed 001_employee_system_bootstrap.sql)
supabase/migrations/020_pyra_users_date_of_birth.sql    — Adds date_of_birth column
supabase/migrations/021_pyra_employee_documents.sql     — pyra_document_types + pyra_employee_documents (Phase 4)
```
