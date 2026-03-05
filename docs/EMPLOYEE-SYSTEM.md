# Employee Experience & Task Management System

> Documentation for the Employee System added to Pyra Workspace 3.0
> Date: 2026-03-04

---

## Overview

The Employee System transforms Pyra Workspace from an admin-only tool into a full team collaboration platform. It adds **7 new modules** with **15 new database tables**, **14 new RBAC permissions**, and **9 new dashboard pages**.

### Modules

| Module | Page | Description |
|--------|------|-------------|
| Profile | `/dashboard/profile` | Personal info, avatar, password, permissions view |
| My Tasks | `/dashboard/my-tasks` | All tasks assigned to the current user |
| Timesheet | `/dashboard/timesheet` | Time tracking with approval workflow |
| Boards | `/dashboard/boards` | Kanban board management |
| Board View | `/dashboard/boards/[id]` | Full Kanban board with drag-and-drop |
| Announcements | `/dashboard/announcements` | Company announcements with read tracking |
| Directory | `/dashboard/directory` | Team member directory |
| Leave | `/dashboard/leave` | Leave request and balance management |

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

## RBAC Permissions

### New Permissions Added

| Permission | Description | Default for Employee |
|-----------|-------------|---------------------|
| `boards.view` | View boards | Yes |
| `boards.manage` | Create/edit/delete boards | No |
| `tasks.view` | View tasks | Yes |
| `tasks.create` | Create/move tasks | Yes |
| `tasks.manage` | Edit/delete any task | No |
| `directory.view` | View employee directory | Yes |
| `timesheet.view` | View/create own timesheet | Yes |
| `timesheet.manage` | View all timesheets | No |
| `timesheet.approve` | Approve/reject timesheets | No |
| `announcements.view` | View announcements | Yes |
| `announcements.manage` | Create/edit/delete announcements | No |
| `leave.view` | View/create own leave requests | Yes |
| `leave.manage` | View all leave requests | No |
| `leave.approve` | Approve/reject leave requests | No |

### Permission Modules (for Role Editor UI)

| Module ID | Label | Permissions |
|-----------|-------|-------------|
| boards | لوحات العمل | boards.view, boards.manage |
| tasks | المهام | tasks.view, tasks.create, tasks.manage |
| directory | دليل الموظفين | directory.view |
| timesheet | ساعات العمل | timesheet.view, timesheet.manage, timesheet.approve |
| announcements | الإعلانات | announcements.view, announcements.manage |
| leave | الإجازات | leave.view, leave.manage, leave.approve |

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
lib/auth/rbac.ts                    — 14 new permissions, 6 new modules
components/layout/sidebar.tsx       — 2 new nav groups (Personal, Workflow)
lib/config/module-guide.ts          — 7 new module guides
app/dashboard/guide/page.tsx        — New workflow section
app/dashboard/page.tsx              — Employee dashboard widgets
app/api/dashboard/route.ts          — Employee stats API
DATABASE-SCHEMA.md                  — 15 new table docs
```

### Migration
```
scripts/migration-employee-system.sql — Full SQL migration
```
