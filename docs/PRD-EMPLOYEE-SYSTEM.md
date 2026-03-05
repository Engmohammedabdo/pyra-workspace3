# PRD: Employee Experience & Task Management System
# Pyra Workspace 3.0

> **Version:** 1.0
> **Date:** 2026-03-04
> **Status:** Draft — Pending Review
> **Author:** Development Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [Research & Reference Projects](#4-research--reference-projects)
5. [System Architecture Decision](#5-system-architecture-decision)
6. [Feature Specification](#6-feature-specification)
   - Phase 1: Employee Foundation
   - Phase 2: Task & Workflow Management (Kanban)
   - Phase 3: Operations & HR
   - Phase 4: Advanced (Future)
7. [Database Schema](#7-database-schema)
8. [API Endpoints](#8-api-endpoints)
9. [UI/UX Wireframes](#9-uiux-wireframes)
10. [Integration with Existing Systems](#10-integration-with-existing-systems)
11. [Technical Implementation Plan](#11-technical-implementation-plan)
12. [Risk Assessment](#12-risk-assessment)

---

## 1. Executive Summary

Pyra Workspace currently serves two user types: **Admins** (full dashboard) and **Clients** (portal). Employees currently access the same admin dashboard with permission-gated navigation — but they lack a personalized experience, task management, and operational tools.

This PRD defines a comprehensive **Employee Experience System** that adds:
- Personal profiles and employee directory
- Role-adaptive dashboard with personalized widgets
- **Kanban-style task & workflow management** (Trello/ClickUp-like) deeply integrated with existing projects
- Timesheets, leave management, and internal announcements

**Approach:** Hybrid — enhance the existing `/dashboard` with employee-specific modules rather than building a separate portal. This leverages the existing RBAC system (30+ permissions, dynamic roles) while avoiding code duplication.

---

## 2. Problem Statement

### Current State
| Aspect | Status | Gap |
|--------|--------|-----|
| Employee Authentication | Done | RBAC with 30+ permissions |
| Permission Gating | Done | Sidebar + API level |
| Personal Profile | Missing | No `/dashboard/profile` page |
| Employee Directory | Missing | No team visibility |
| Task Assignment | Missing | No task tracking per employee |
| Kanban Boards | Missing | No visual workflow management |
| Adaptive Dashboard | Missing | Admin and employee see the same KPIs |
| Timesheets | Missing | No hour tracking |
| Leave Management | Missing | No absence system |
| Announcements | Missing | No internal communications |
| Employee Status | Missing | No active/inactive/suspended states |

### Impact
- Employees have no task-level visibility into their workload
- Project managers can't assign and track individual tasks within projects
- No visual workflow (Kanban) for marketing deliverables pipeline
- No personal workspace for the employee
- No HR operations (leave, time tracking)

---

## 3. Goals & Success Metrics

### Goals
1. **Personalized Employee Experience** — Each employee has a profile, adaptive dashboard, and personal workspace
2. **Visual Task Management** — Kanban boards with drag-and-drop, labels, due dates, assignees, checklists
3. **Project-Task Hierarchy** — Tasks live inside projects, enabling granular tracking of marketing deliverables
4. **Agency Workflow Optimization** — Tailored for marketing/creative agency workflows (design reviews, content pipelines, campaign tracking)
5. **Operational Efficiency** — Timesheets, leave, and announcements reduce admin overhead

### Success Metrics
| Metric | Target |
|--------|--------|
| Employee profile completion rate | > 80% within first month |
| Daily active task board usage | > 60% of employees |
| Average task completion time tracking | Measurable for all projects |
| Leave request processing time | < 24 hours |
| Timesheet submission rate | > 90% weekly |

---

## 4. Research & Reference Projects

### GitHub Projects Analyzed

| Project | Stack | Stars | DnD Library | DB | Fit Score |
|---------|-------|-------|-------------|-----|-----------|
| [Kanba](https://github.com/Kanba-co/kanba) | Next.js, Supabase, Tailwind, Radix UI, Stripe | 553 | @hello-pangea/dnd | Supabase + Prisma | **9/10** |
| [Kan](https://github.com/kanbn/kan) | Next.js, tRPC, Drizzle ORM, TypeScript | 4,500+ | Unknown | PostgreSQL | 6/10 |
| [Planka](https://github.com/plankanban/planka) | React, Node.js, SCSS | 11,600+ | react-beautiful-dnd | PostgreSQL | 5/10 |
| [Trello Clone](https://github.com/Mshandev/Trello-Clone) | Next.js, Supabase, Clerk, shadcn | 5 | @dnd-kit | Supabase | 7/10 |

### Why Kanba is the Best Reference (Not for direct integration)

**Kanba** is the closest match to our stack:
- Same DB (Supabase), same UI primitives (Radix/Tailwind), same framework (Next.js)
- Same payment system (Stripe), same deployment target (Vercel)
- Has: Projects, Boards, Columns, Tasks, Bookmarks, Teams, Dark mode
- MIT License — we can study patterns and architecture

**However, direct integration is NOT recommended because:**
1. Kanba uses Next.js 13 (we use 15) + Prisma (we use raw Supabase queries)
2. Kanba has its own auth system (NextAuth vs our cookie-based Supabase auth)
3. Our RBAC, activity logging, and notification systems are already mature
4. Kanba lacks: Arabic RTL, employee-specific features, agency workflows

### Our Approach: Build Natively, Learn from Kanba
- **Study Kanba's UX patterns**: Board layout, column drag, task cards, modals
- **Use our existing stack**: @dnd-kit (already installed!), Supabase, shadcn/ui
- **Extend our existing projects**: Add task boards to each project, not a separate boards system
- **Agency-specific features**: Review workflows, content pipeline stages, client approval integration

---

## 5. System Architecture Decision

### Decision: Hybrid Enhancement (NOT a Separate Portal)

```
Current Architecture:
┌─────────────────┐     ┌─────────────────┐
│  Admin Dashboard │     │  Client Portal  │
│  /dashboard/*    │     │  /portal/*      │
│  (Full access)   │     │  (Scoped)       │
└─────────────────┘     └─────────────────┘

Enhanced Architecture:
┌──────────────────────────────────────────┐     ┌─────────────────┐
│           Unified Dashboard              │     │  Client Portal  │
│           /dashboard/*                   │     │  /portal/*      │
│                                          │     │                 │
│  ┌─ Admin View ──┐  ┌─ Employee View ─┐ │     │  (Unchanged)    │
│  │ Full KPIs     │  │ My Tasks        │ │     │                 │
│  │ All Projects  │  │ My Projects     │ │     │                 │
│  │ All Users     │  │ My Profile      │ │     │                 │
│  │ Finance       │  │ My Timesheet    │ │     │                 │
│  │ Settings      │  │ Team Directory  │ │     │                 │
│  └───────────────┘  └────────────────┘ │     │                 │
│                                          │     │                 │
│  ┌─ Shared (Both) ──────────────────┐   │     │                 │
│  │ Task Boards (Kanban)             │   │     │                 │
│  │ Notifications                     │   │     │                 │
│  │ Activity Log                      │   │     │                 │
│  │ Announcements                     │   │     │                 │
│  └──────────────────────────────────┘   │     │                 │
└──────────────────────────────────────────┘     └─────────────────┘
```

### Rationale
1. Existing RBAC already gates sidebar items per role — no need for a separate route tree
2. Shared components (EmptyState, PageGuide, Sidebar) work across all roles
3. Dashboard page (`/dashboard`) already loads user role — we just render different widgets
4. Activity logging, notifications, and audit trail are already unified

---

## 6. Feature Specification

---

### PHASE 1: Employee Foundation

#### 1.1 Employee Profile (`/dashboard/profile`)

**Priority:** P0 (Must Have)
**Permission:** None (every logged-in user can access their own profile)

**Features:**
- View & edit personal info (display name, phone, job title, bio)
- Upload/change avatar (Supabase Storage)
- Change password (via existing password API)
- View assigned role & permissions (read-only)
- View active sessions (with option to revoke)
- View personal login history
- View personal activity log

**Tabs:**
| Tab | Content |
|-----|---------|
| Personal Info | Name, phone, job title, bio, avatar |
| Security | Password change, active sessions, 2FA (future) |
| Role & Permissions | Current role badge, permission list (read-only) |
| My Activity | Filtered activity log (own actions only) |

**Database Changes:**
```sql
ALTER TABLE pyra_users ADD COLUMN phone TEXT;
ALTER TABLE pyra_users ADD COLUMN job_title TEXT;
ALTER TABLE pyra_users ADD COLUMN avatar_url TEXT;
ALTER TABLE pyra_users ADD COLUMN bio TEXT;
ALTER TABLE pyra_users ADD COLUMN status TEXT DEFAULT 'active';
-- status: active, inactive, suspended
```

---

#### 1.2 Role-Adaptive Dashboard

**Priority:** P0 (Must Have)
**Affected Page:** `/dashboard` (main page)

**Current:** Single dashboard with same KPIs for all users.

**Enhanced:**

**Admin Dashboard Widgets:**
| Widget | Data |
|--------|------|
| Revenue KPIs | Total revenue, pending, overdue |
| Client Stats | Total clients, new this month |
| Project Overview | Active, completed, overdue |
| Storage Usage | Used/total with chart |
| Team Activity | Recent team-wide activity |
| Smart Alerts | Overdue invoices, expiring quotes |

**Employee Dashboard Widgets:**
| Widget | Data |
|--------|------|
| My Tasks Summary | Open, in progress, completed today |
| My Projects | Active projects assigned to me |
| Pending Reviews | Files awaiting my review |
| My Hours This Week | Total hours from timesheet |
| Upcoming Deadlines | Tasks due within 7 days |
| Team Announcements | Latest pinned announcements |
| Quick Actions | New task, log hours, request leave |

**Logic:** Check `isSuperAdmin(permissions)` or specific permissions to decide which widget set to render.

---

#### 1.3 Employee Directory (`/dashboard/directory`)

**Priority:** P1 (Should Have)
**Permission:** `directory.view` (new permission)

**Features:**
- Grid of employee cards: avatar, name, job title, team, role badge
- Search by name, job title
- Filter by team, role
- Click card → mini profile modal (contact info, recent activity)
- Respects employee visibility settings (phone/email can be hidden)

**No new tables needed** — pulls from `pyra_users` + `pyra_teams` + `pyra_team_members` + `pyra_roles`.

---

### PHASE 2: Task & Workflow Management (Kanban)

> This is the core differentiator — a Trello-like task management system built natively into Pyra Workspace, specifically designed for **marketing agency workflows**.

#### 2.1 Data Model: Boards, Columns, Tasks

**Hierarchy:**
```
Project (pyra_projects)
  └── Board (pyra_boards) — one or more per project
        └── Column (pyra_board_columns) — e.g., "To Do", "In Progress", "Review", "Done"
              └── Task (pyra_tasks) — individual work items
                    ├── Assignees (pyra_task_assignees)
                    ├── Labels (pyra_task_labels)
                    ├── Checklist Items (pyra_task_checklist)
                    ├── Comments (pyra_task_comments)
                    └── Attachments (linked to pyra_project_files)
```

**Key Design Decisions:**
1. **Boards belong to Projects** — Every board is scoped to a project. This ties task management directly into the existing project system.
2. **Default Board Templates** — When creating a project, auto-create a default board with agency-standard columns.
3. **Standalone Boards** — Optional boards not tied to projects (for internal operations, HR tasks, etc.)
4. **Column Templates** — Pre-built for marketing workflows:
   - **Content Pipeline:** Brief → Writing → Editing → Design → Client Review → Published
   - **Design Pipeline:** Brief → Concept → Design → Internal Review → Client Review → Approved
   - **Campaign Pipeline:** Planning → Creative → Production → QA → Launch → Reporting
   - **General:** To Do → In Progress → Review → Done

---

#### 2.2 Board View (`/dashboard/projects/[id]/board`)

**Priority:** P0 (Must Have)
**Permission:** `projects.view` (reuses existing permission)

**UI Layout:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  مشروع: هوية بصرية لشركة النور          [عرض القائمة] [عرض اللوحة]    │
│  ──────────────────────────────────────────────────────────────────────  │
│  [+ عمود جديد]   [فلترة ▾]   [ترتيب ▾]   [أعضاء ▾]   [تسميات ▾]     │
│                                                                         │
│  ┌─── المهام ──────┐  ┌─── قيد التنفيذ ─┐  ┌─── مراجعة ────┐  ┌─── مكتمل ──────┐
│  │                 │  │                  │  │               │  │                │
│  │ ┌─────────────┐ │  │ ┌──────────────┐ │  │ ┌───────────┐ │  │ ┌────────────┐ │
│  │ │ 🏷 تصميم    │ │  │ │ 🏷 تصميم     │ │  │ │ 🏷 محتوى  │ │  │ │ 🏷 تصميم   │ │
│  │ │ تصميم الشعار│ │  │ │ تصميم الألوان│ │  │ │ كتابة     │ │  │ │ الأيقونات  │ │
│  │ │             │ │  │ │              │ │  │ │ المحتوى   │ │  │ │            │ │
│  │ │ 👤 أحمد     │ │  │ │ 👤 سارة      │ │  │ │ 👤 خالد   │ │  │ │ ✅ مكتمل   │ │
│  │ │ 📅 15 مارس  │ │  │ │ 📅 18 مارس   │ │  │ │ 📅 12 مار │ │  │ │ 2 مارس    │ │
│  │ │ ☑ 2/5       │ │  │ │ ⚡ عالي       │ │  │ │ ⚡ متوسط  │ │  │ └────────────┘ │
│  │ └─────────────┘ │  │ └──────────────┘ │  │ └───────────┘ │  │                │
│  │                 │  │                  │  │               │  │                │
│  │ ┌─────────────┐ │  │                  │  │               │  │                │
│  │ │ + مهمة جديدة│ │  │ │ + مهمة جديدة │ │  │ │ + مهمة    │ │  │                │
│  │ └─────────────┘ │  │ └──────────────┘ │  │ └───────────┘ │  │                │
│  └─────────────────┘  └──────────────────┘  └───────────────┘  └────────────────┘
└─────────────────────────────────────────────────────────────────────────┘
```

**Interactions:**
- **Drag & Drop** — Move tasks between columns (via @dnd-kit, already installed)
- **Click Task** — Opens task detail modal/drawer
- **Quick Add** — Inline task creation at bottom of each column
- **Column Management** — Add, rename, reorder, delete columns
- **Board Switching** — Multiple boards per project via tabs

---

#### 2.3 Task Detail Modal

**Priority:** P0 (Must Have)

**UI Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  ✕                                            [حذف] [أرشفة] │
│                                                              │
│  ┌─ العنوان ────────────────────────────────────────────┐   │
│  │  تصميم الشعار النهائي لشركة النور                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  العمود: قيد التنفيذ ▾     المشروع: هوية بصرية النور        │
│                                                              │
│  ┌─ التفاصيل ──────────────────────────────────────────┐   │
│  │                                                      │   │
│  │  👥 المسؤولون: [أحمد ×] [سارة ×] [+ إضافة]         │   │
│  │  🏷 التسميات: [تصميم] [عاجل] [+ إضافة]              │   │
│  │  📅 تاريخ التسليم: 15 مارس 2026                      │   │
│  │  ⚡ الأولوية: عالية ▾                                 │   │
│  │  ⏱ الوقت المقدر: 8 ساعات                             │   │
│  │  ⏱ الوقت الفعلي: 5 ساعات                             │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ الوصف (Markdown) ──────────────────────────────────┐   │
│  │  تصميم 3 مقترحات للشعار مع:                         │   │
│  │  - نسخة ملونة                                        │   │
│  │  - نسخة أبيض وأسود                                   │   │
│  │  - favicon                                            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ قائمة المهام (Checklist) ──────────────────────────┐   │
│  │  ■■■■■□□ 5/7 مكتمل                                  │   │
│  │  ☑ بحث عن المنافسين                                  │   │
│  │  ☑ مودبورد                                           │   │
│  │  ☑ مقترح أول                                         │   │
│  │  ☑ مقترح ثاني                                        │   │
│  │  ☑ مقترح ثالث                                        │   │
│  │  ☐ اعتماد العميل                                     │   │
│  │  ☐ تسليم الملفات النهائية                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ المرفقات ──────────────────────────────────────────┐   │
│  │  📎 logo-v1.ai (2.3 MB)  📎 logo-v2.ai (2.1 MB)    │   │
│  │  [+ إرفاق ملف]                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ التعليقات ─────────────────────────────────────────┐   │
│  │  أحمد · منذ ساعتين                                   │   │
│  │  "المقترح الثاني يحتاج تعديل الألوان"                │   │
│  │                                                      │   │
│  │  سارة · منذ 30 دقيقة                                 │   │
│  │  "تم التعديل، الرجاء المراجعة"                       │   │
│  │                                                      │   │
│  │  [اكتب تعليقك هنا...]              [إرسال]         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ سجل النشاط ────────────────────────────────────────┐   │
│  │  • أحمد نقل المهمة إلى "قيد التنفيذ" · منذ 3 ساعات │   │
│  │  • سارة أضافت تعليق · منذ 30 دقيقة                  │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**Task Properties:**
| Property | Type | Required | Notes |
|----------|------|----------|-------|
| Title | text | Yes | Task name |
| Description | markdown | No | Rich text description |
| Column | FK | Yes | Current workflow stage |
| Position | integer | Yes | Order within column |
| Assignees | multi-user | No | One or more team members |
| Labels | multi-select | No | Color-coded tags |
| Priority | enum | No | urgent, high, medium, low |
| Due Date | date | No | Deadline |
| Estimated Hours | number | No | Time estimate |
| Actual Hours | number | No | Time logged |
| Checklist | JSON | No | Sub-task checkboxes |
| Attachments | files[] | No | Linked project files |
| Cover Image | URL | No | Visual card cover |

---

#### 2.4 My Tasks View (`/dashboard/my-tasks`)

**Priority:** P0 (Must Have)
**Permission:** None (every employee sees their own tasks)

**Features:**
- Aggregated view of ALL tasks assigned to the logged-in user across all projects
- Group by: Project, Priority, Due Date, Status
- Filter by: Status, Priority, Project, Date range
- Quick status change (drag between virtual columns)
- Calendar view toggle (see tasks on a calendar)

**Sections:**
```
┌─ اليوم ─────────────────────────────┐
│ • تصميم الشعار — مشروع النور — عالية │
│ • كتابة المحتوى — مشروع ABC — متوسطة │
└──────────────────────────────────────┘

┌─ هذا الأسبوع ────────────────────────┐
│ • مراجعة الفيديو — مشروع XYZ         │
│ • تحديث الموقع — مشروع DEF           │
└──────────────────────────────────────┘

┌─ متأخرة ⚠️ ──────────────────────────┐
│ • تقرير الحملة — مشروع ABC — متأخر 3 أيام │
└──────────────────────────────────────┘
```

---

#### 2.5 Standalone Boards (`/dashboard/boards`)

**Priority:** P1 (Should Have)
**Permission:** `boards.view` / `boards.manage` (new permissions)

**Use Cases:**
- Internal operations board (not tied to a project)
- HR tasks board
- Marketing calendar board
- Sprint planning board

**Features:**
- Create boards without project association
- Same Kanban UI as project boards
- Board templates for common agency workflows
- Share boards with specific teams

---

#### 2.6 Board Templates

**Priority:** P1 (Should Have)

**Pre-built Templates:**

| Template | Columns | Best For |
|----------|---------|----------|
| Content Pipeline | Brief → Writing → Editing → Design → Client Review → Published | Content marketing |
| Design Pipeline | Brief → Concept → Design → Internal Review → Client Review → Approved | Design projects |
| Campaign Management | Planning → Creative → Production → QA → Launch → Reporting | Ad campaigns |
| Video Production | Pre-Production → Scripting → Filming → Editing → Color/Sound → Final Review → Delivered | Video projects |
| Social Media | Ideas → Approved → Designed → Scheduled → Published → Reporting | Social media management |
| General Kanban | To Do → In Progress → Review → Done | General tasks |
| Sprint Board | Backlog → Sprint → In Progress → Testing → Done | Agile sprints |

---

### PHASE 3: Operations & HR

#### 3.1 Timesheets (`/dashboard/timesheet`)

**Priority:** P1 (Should Have)
**Permission:** `timesheet.view` / `timesheet.manage`

**Features:**
- Weekly timesheet grid (Days × Projects/Tasks)
- Quick hour entry per cell
- Link hours to specific tasks
- Submit for approval workflow
- Admin: approve/reject timesheets
- Reports: hours by project, by employee, by month

---

#### 3.2 Internal Announcements (`/dashboard/announcements`)

**Priority:** P1 (Should Have)
**Permission:** `announcements.view` / `announcements.manage`

**Features:**
- Admin creates announcements (title, content, priority, pinned, expiry)
- Employees see announcements feed
- Unread tracking per employee
- Urgent announcements show as dashboard banner
- Realtime notifications for new announcements

---

#### 3.3 Leave Management (`/dashboard/leave`)

**Priority:** P2 (Nice to Have)
**Permission:** `leave.view` / `leave.manage`

**Features:**
- Employee submits leave request (type, dates, reason)
- Admin approves/rejects
- Leave balance tracking (annual, sick, personal)
- Team calendar showing who's out
- Reports and analytics

---

### PHASE 4: Advanced (Future)

| Feature | Description | Priority |
|---------|-------------|----------|
| Internal Chat | 1-1 and group messaging between employees | P3 |
| Goals & OKRs | Quarterly/yearly goals with progress tracking | P3 |
| Org Chart | Visual organizational hierarchy | P3 |
| Document Center | Company policies, templates, guides | P3 |
| Automations | When task moves to "Done" → notify client, create invoice, etc. | P2 |
| Gantt Chart | Timeline view for project tasks | P2 |
| Recurring Tasks | Auto-create tasks on a schedule | P2 |
| Time Reports | Billable hours → invoice integration | P2 |

---

## 7. Database Schema

### New Tables

```sql
-- ============================================
-- PHASE 1: Employee Foundation
-- ============================================

-- Employee profile extensions (ALTER existing table)
ALTER TABLE pyra_users ADD COLUMN phone TEXT;
ALTER TABLE pyra_users ADD COLUMN job_title TEXT;
ALTER TABLE pyra_users ADD COLUMN avatar_url TEXT;
ALTER TABLE pyra_users ADD COLUMN bio TEXT;
ALTER TABLE pyra_users ADD COLUMN status TEXT DEFAULT 'active';
-- status values: 'active', 'inactive', 'suspended'

-- ============================================
-- PHASE 2: Task & Workflow Management
-- ============================================

-- Boards (Kanban boards, can belong to a project or standalone)
CREATE TABLE pyra_boards (
  id VARCHAR(20) PRIMARY KEY,       -- bd_xxxxx
  project_id VARCHAR(20) REFERENCES pyra_projects(id) ON DELETE CASCADE,
  -- NULL project_id = standalone board
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template TEXT,                     -- template slug used to create this board
  is_default BOOLEAN DEFAULT false,  -- first board auto-created with project
  position INTEGER DEFAULT 0,       -- order among boards in a project
  created_by VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_boards_project ON pyra_boards(project_id);

-- Board Columns (workflow stages)
CREATE TABLE pyra_board_columns (
  id VARCHAR(20) PRIMARY KEY,       -- bc_xxxxx
  board_id VARCHAR(20) NOT NULL REFERENCES pyra_boards(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(20) DEFAULT 'gray', -- column header color
  position INTEGER DEFAULT 0,       -- left-to-right order
  wip_limit INTEGER,                -- optional: max tasks in this column
  is_done_column BOOLEAN DEFAULT false, -- marks tasks as "completed" when moved here
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_columns_board ON pyra_board_columns(board_id);

-- Tasks (individual work items)
CREATE TABLE pyra_tasks (
  id VARCHAR(20) PRIMARY KEY,       -- tk_xxxxx
  board_id VARCHAR(20) NOT NULL REFERENCES pyra_boards(id) ON DELETE CASCADE,
  column_id VARCHAR(20) NOT NULL REFERENCES pyra_board_columns(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,                  -- Markdown content
  position INTEGER DEFAULT 0,       -- order within column
  priority VARCHAR(20) DEFAULT 'medium', -- urgent, high, medium, low
  due_date DATE,
  start_date DATE,
  estimated_hours NUMERIC(6,2),
  actual_hours NUMERIC(6,2) DEFAULT 0,
  cover_image TEXT,                  -- URL for visual card cover
  is_archived BOOLEAN DEFAULT false,
  created_by VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tasks_board ON pyra_tasks(board_id);
CREATE INDEX idx_tasks_column ON pyra_tasks(column_id);
CREATE INDEX idx_tasks_due ON pyra_tasks(due_date) WHERE due_date IS NOT NULL;

-- Task Assignees (many-to-many)
CREATE TABLE pyra_task_assignees (
  id VARCHAR(20) PRIMARY KEY,       -- ta_xxxxx
  task_id VARCHAR(20) NOT NULL REFERENCES pyra_tasks(id) ON DELETE CASCADE,
  username VARCHAR NOT NULL REFERENCES pyra_users(username),
  assigned_by VARCHAR NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, username)
);

CREATE INDEX idx_assignees_task ON pyra_task_assignees(task_id);
CREATE INDEX idx_assignees_user ON pyra_task_assignees(username);

-- Task Labels (reusable per board)
CREATE TABLE pyra_board_labels (
  id VARCHAR(20) PRIMARY KEY,       -- bl_xxxxx
  board_id VARCHAR(20) NOT NULL REFERENCES pyra_boards(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) NOT NULL,       -- red, orange, yellow, green, blue, purple, pink
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Task-Label junction
CREATE TABLE pyra_task_labels (
  task_id VARCHAR(20) NOT NULL REFERENCES pyra_tasks(id) ON DELETE CASCADE,
  label_id VARCHAR(20) NOT NULL REFERENCES pyra_board_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

-- Task Checklist Items
CREATE TABLE pyra_task_checklist (
  id VARCHAR(20) PRIMARY KEY,       -- cl_xxxxx
  task_id VARCHAR(20) NOT NULL REFERENCES pyra_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_checked BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_checklist_task ON pyra_task_checklist(task_id);

-- Task Comments
CREATE TABLE pyra_task_comments (
  id VARCHAR(20) PRIMARY KEY,       -- tc_xxxxx
  task_id VARCHAR(20) NOT NULL REFERENCES pyra_tasks(id) ON DELETE CASCADE,
  author_username VARCHAR NOT NULL,
  author_name VARCHAR NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_task_comments ON pyra_task_comments(task_id);

-- Task Attachments (links to project files)
CREATE TABLE pyra_task_attachments (
  id VARCHAR(20) PRIMARY KEY,       -- tf_xxxxx
  task_id VARCHAR(20) NOT NULL REFERENCES pyra_tasks(id) ON DELETE CASCADE,
  file_id VARCHAR(20) REFERENCES pyra_project_files(id),
  file_name VARCHAR NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  uploaded_by VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Task Activity Log (task-specific history)
CREATE TABLE pyra_task_activity (
  id VARCHAR(20) PRIMARY KEY,       -- tl_xxxxx
  task_id VARCHAR(20) NOT NULL REFERENCES pyra_tasks(id) ON DELETE CASCADE,
  username VARCHAR NOT NULL,
  display_name VARCHAR NOT NULL,
  action VARCHAR(50) NOT NULL,
  -- actions: created, moved, assigned, unassigned, label_added, label_removed,
  --          priority_changed, due_date_changed, comment_added, checklist_toggled,
  --          description_updated, archived, restored
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_task_activity ON pyra_task_activity(task_id);

-- ============================================
-- PHASE 3: Operations & HR
-- ============================================

-- Timesheets
CREATE TABLE pyra_timesheets (
  id VARCHAR(20) PRIMARY KEY,       -- ts_xxxxx
  username VARCHAR NOT NULL REFERENCES pyra_users(username),
  project_id VARCHAR(20) REFERENCES pyra_projects(id),
  task_id VARCHAR(20) REFERENCES pyra_tasks(id),
  date DATE NOT NULL,
  hours NUMERIC(4,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  description TEXT,
  status VARCHAR(20) DEFAULT 'draft', -- draft, submitted, approved, rejected
  approved_by VARCHAR,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_timesheet_user ON pyra_timesheets(username);
CREATE INDEX idx_timesheet_date ON pyra_timesheets(date);
CREATE INDEX idx_timesheet_project ON pyra_timesheets(project_id);

-- Internal Announcements
CREATE TABLE pyra_announcements (
  id VARCHAR(20) PRIMARY KEY,       -- ann_xxxxx
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'normal', -- normal, important, urgent
  is_pinned BOOLEAN DEFAULT false,
  target_teams JSONB DEFAULT '[]',   -- empty = all teams
  created_by VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ             -- NULL = no expiry
);

-- Announcement Read Tracking
CREATE TABLE pyra_announcement_reads (
  announcement_id VARCHAR(20) NOT NULL REFERENCES pyra_announcements(id) ON DELETE CASCADE,
  username VARCHAR NOT NULL REFERENCES pyra_users(username),
  read_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (announcement_id, username)
);

-- Leave Requests
CREATE TABLE pyra_leave_requests (
  id VARCHAR(20) PRIMARY KEY,       -- lr_xxxxx
  username VARCHAR NOT NULL REFERENCES pyra_users(username),
  type VARCHAR(30) NOT NULL,        -- annual, sick, personal, unpaid, emergency
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count INTEGER NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, cancelled
  reviewed_by VARCHAR,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_leave_user ON pyra_leave_requests(username);

-- Leave Balances
CREATE TABLE pyra_leave_balances (
  username VARCHAR NOT NULL REFERENCES pyra_users(username),
  year INTEGER NOT NULL,
  annual_total INTEGER DEFAULT 30,
  annual_used INTEGER DEFAULT 0,
  sick_total INTEGER DEFAULT 15,
  sick_used INTEGER DEFAULT 0,
  personal_total INTEGER DEFAULT 5,
  personal_used INTEGER DEFAULT 0,
  PRIMARY KEY (username, year)
);
```

### New Permissions

```typescript
// Add to lib/auth/rbac.ts PERMISSION_MODULES
{ key: 'boards', label: 'Boards', labelAr: 'لوحات العمل' },
{ key: 'tasks', label: 'Tasks', labelAr: 'المهام' },
{ key: 'directory', label: 'Directory', labelAr: 'الدليل' },
{ key: 'timesheet', label: 'Timesheets', labelAr: 'سجل الساعات' },
{ key: 'announcements', label: 'Announcements', labelAr: 'الإعلانات' },
{ key: 'leave', label: 'Leave', labelAr: 'الإجازات' },

// Permission actions:
// boards.view, boards.manage
// tasks.view, tasks.create, tasks.manage
// directory.view
// timesheet.view, timesheet.manage, timesheet.approve
// announcements.view, announcements.manage
// leave.view, leave.manage, leave.approve
```

### Updated Default Permissions

```typescript
// Employee default permissions (update getDefaultPermissionsForLegacyRole)
case 'employee':
  return [
    'dashboard.view',
    'files.view',
    'projects.view',
    'boards.view',
    'tasks.view', 'tasks.create',
    'directory.view',
    'timesheet.view',
    'announcements.view',
    'leave.view',
    'notifications.view',
    'favorites.view', 'favorites.manage',
  ];
```

---

## 8. API Endpoints

### Phase 1 APIs

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/profile` | Auth only | Get own profile |
| PATCH | `/api/profile` | Auth only | Update own profile |
| POST | `/api/profile/avatar` | Auth only | Upload avatar |
| GET | `/api/directory` | directory.view | List all employees |
| GET | `/api/directory/[username]` | directory.view | Get employee card |

### Phase 2 APIs — Boards

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/boards` | boards.view | List all boards (standalone) |
| POST | `/api/boards` | boards.manage | Create board |
| GET | `/api/boards/[id]` | boards.view | Get board with columns and tasks |
| PATCH | `/api/boards/[id]` | boards.manage | Update board |
| DELETE | `/api/boards/[id]` | boards.manage | Delete board |
| GET | `/api/projects/[id]/boards` | projects.view | Get project boards |
| POST | `/api/projects/[id]/boards` | projects.view | Create project board |

### Phase 2 APIs — Columns

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/api/boards/[id]/columns` | boards.manage | Add column |
| PATCH | `/api/boards/[id]/columns/[colId]` | boards.manage | Update column |
| DELETE | `/api/boards/[id]/columns/[colId]` | boards.manage | Delete column |
| PATCH | `/api/boards/[id]/columns/reorder` | boards.manage | Reorder columns |

### Phase 2 APIs — Tasks

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/tasks/my` | Auth only | Get my tasks across all boards |
| POST | `/api/boards/[id]/tasks` | tasks.create | Create task |
| GET | `/api/tasks/[taskId]` | tasks.view | Get task detail |
| PATCH | `/api/tasks/[taskId]` | tasks.create | Update task |
| DELETE | `/api/tasks/[taskId]` | tasks.manage | Delete task |
| PATCH | `/api/tasks/[taskId]/move` | tasks.create | Move task to column |
| POST | `/api/tasks/[taskId]/assignees` | tasks.create | Add assignee |
| DELETE | `/api/tasks/[taskId]/assignees/[username]` | tasks.create | Remove assignee |
| POST | `/api/tasks/[taskId]/comments` | tasks.view | Add comment |
| POST | `/api/tasks/[taskId]/checklist` | tasks.create | Add checklist item |
| PATCH | `/api/tasks/[taskId]/checklist/[itemId]` | tasks.create | Toggle checklist |
| POST | `/api/tasks/[taskId]/labels` | tasks.create | Add label |
| POST | `/api/tasks/[taskId]/attachments` | tasks.create | Add attachment |

### Phase 3 APIs

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/timesheet` | timesheet.view | Get my timesheets |
| POST | `/api/timesheet` | timesheet.view | Log hours |
| PATCH | `/api/timesheet/[id]` | timesheet.view | Update entry |
| POST | `/api/timesheet/submit` | timesheet.view | Submit week for approval |
| PATCH | `/api/timesheet/[id]/review` | timesheet.approve | Approve/reject |
| GET | `/api/announcements` | announcements.view | List announcements |
| POST | `/api/announcements` | announcements.manage | Create announcement |
| POST | `/api/announcements/[id]/read` | announcements.view | Mark as read |
| GET | `/api/leave` | leave.view | Get my leave requests |
| POST | `/api/leave` | leave.view | Submit leave request |
| PATCH | `/api/leave/[id]/review` | leave.approve | Approve/reject |
| GET | `/api/leave/balance` | leave.view | Get leave balances |

---

## 9. UI/UX Wireframes

### Navigation Updates (Sidebar)

```typescript
// New nav groups for sidebar.tsx
{
  title: 'شخصي',
  titleEn: 'Personal',
  items: [
    { href: '/dashboard/profile', label: 'ملفي الشخصي', labelEn: 'My Profile', icon: UserCircle },
    { href: '/dashboard/my-tasks', label: 'مهامي', labelEn: 'My Tasks', icon: CheckSquare },
    { href: '/dashboard/timesheet', label: 'ساعات العمل', labelEn: 'Timesheet', icon: Clock, permission: 'timesheet.view' },
  ]
},
{
  title: 'سير العمل',
  titleEn: 'Workflow',
  items: [
    { href: '/dashboard/boards', label: 'لوحات العمل', labelEn: 'Boards', icon: LayoutDashboard, permission: 'boards.view' },
    { href: '/dashboard/announcements', label: 'الإعلانات', labelEn: 'Announcements', icon: Megaphone, permission: 'announcements.view' },
    { href: '/dashboard/directory', label: 'دليل الفريق', labelEn: 'Directory', icon: Contact, permission: 'directory.view' },
    { href: '/dashboard/leave', label: 'الإجازات', labelEn: 'Leave', icon: CalendarOff, permission: 'leave.view' },
  ]
}
```

### Dark Mode
All new components must support dark mode via CSS variables. Board columns use `bg-muted/50` (not hardcoded colors). Task cards use `bg-card` with `border` class. Labels use semantic color classes.

### RTL Layout
All new components use logical properties (`ms-`, `me-`, `ps-`, `pe-`). Board columns flow right-to-left naturally with flexbox `dir="rtl"`. Task modal content is right-aligned.

### Responsive Design
- **Desktop:** Full Kanban board with horizontal scroll
- **Tablet:** Columns stack vertically, swipeable
- **Mobile:** Single column view with column switcher dropdown

---

## 10. Integration with Existing Systems

### Projects ↔ Boards
- When a project is created, auto-create a default board with template columns
- Project detail page gets a "Board" tab alongside existing "Files" and "Comments"
- Project status can auto-update based on board progress (e.g., all tasks done → "completed")

### Files ↔ Task Attachments
- Task attachments can link to existing `pyra_project_files`
- Upload new files directly to a task → saved in project storage
- File approval workflow can be triggered from a task

### Activity Log
- All task actions logged to `pyra_activity_log` (existing system)
- Task-specific activity in `pyra_task_activity` for detailed task timeline
- Both logs use same action_type format

### Notifications
- Task assignment → notification to assignee
- Task comment → notification to task participants
- Task due date approaching → notification to assignee
- Leave approved/rejected → notification to employee
- New announcement → notification to all employees

### Client Portal Impact
- Clients do NOT see task boards (internal tool)
- But task completion can trigger client notifications:
  - "Your file is ready for review" when task moves to "Client Review" column
  - Auto-update project progress percentage shown in portal

### Timesheets ↔ Finance
- Timesheet hours can feed into invoice calculations
- Report: billable hours per project per month
- Compare estimated vs actual hours per task

---

## 11. Technical Implementation Plan

### Phase 1 — Employee Foundation (Week 1-2)

| Step | Task | Files |
|------|------|-------|
| 1.1 | DB migration: add columns to pyra_users | migration SQL |
| 1.2 | Profile API endpoints | `app/api/profile/route.ts` |
| 1.3 | Profile page UI | `app/dashboard/profile/page.tsx` |
| 1.4 | Role-adaptive dashboard widgets | `app/dashboard/page.tsx` |
| 1.5 | Employee dashboard component | `components/dashboard/employee-dashboard.tsx` |
| 1.6 | Directory API + page | `app/dashboard/directory/` |
| 1.7 | Module guide entries | `lib/config/module-guide.ts` |
| 1.8 | Sidebar navigation updates | `components/layout/sidebar.tsx` |
| 1.9 | New permissions in RBAC | `lib/auth/rbac.ts` |

### Phase 2 — Task Management (Week 3-6)

| Step | Task | Files |
|------|------|-------|
| 2.1 | DB migration: all task tables | migration SQL |
| 2.2 | Board CRUD API | `app/api/boards/` |
| 2.3 | Column CRUD API | `app/api/boards/[id]/columns/` |
| 2.4 | Task CRUD API | `app/api/tasks/`, `app/api/boards/[id]/tasks/` |
| 2.5 | Board Kanban UI component | `components/boards/board-view.tsx` |
| 2.6 | Column component with DnD | `components/boards/board-column.tsx` |
| 2.7 | Task card component | `components/boards/task-card.tsx` |
| 2.8 | Task detail modal | `components/boards/task-detail-modal.tsx` |
| 2.9 | DnD integration (@dnd-kit) | `components/boards/dnd-context.tsx` |
| 2.10 | Project board page | `app/dashboard/projects/[id]/board/page.tsx` |
| 2.11 | Standalone boards page | `app/dashboard/boards/page.tsx` |
| 2.12 | My Tasks page | `app/dashboard/my-tasks/page.tsx` |
| 2.13 | Board templates system | `lib/config/board-templates.ts` |
| 2.14 | Task comments & checklist UI | Within task-detail-modal |
| 2.15 | Task label management | Within board-view |
| 2.16 | Notification integration | `lib/email/notify.ts` additions |

### Phase 3 — Operations (Week 7-9)

| Step | Task | Files |
|------|------|-------|
| 3.1 | DB migration: timesheet, announcements, leave | migration SQL |
| 3.2 | Timesheet API + page | `app/dashboard/timesheet/` |
| 3.3 | Announcements API + page | `app/dashboard/announcements/` |
| 3.4 | Leave API + page | `app/dashboard/leave/` |
| 3.5 | Dashboard announcement banner | `components/dashboard/announcement-banner.tsx` |
| 3.6 | Leave calendar component | `components/leave/team-calendar.tsx` |

---

## 12. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| DnD performance with many tasks | Medium | Use virtualization for 100+ tasks, paginate API responses |
| Realtime sync conflicts | Medium | Optimistic updates + server reconciliation pattern |
| Complex RBAC for task permissions | Low | Reuse existing RBAC patterns, task-level access = board access |
| Mobile DnD experience | Medium | Touch-friendly DnD via @dnd-kit, fallback to dropdown move |
| Data migration for existing projects | Low | Auto-create boards only for new projects, optional for existing |
| Scope creep into PM tool | High | Stick to agency workflow focus, defer advanced features to Phase 4 |

---

## Appendix A: Technology Compatibility Matrix

| Requirement | Existing in Pyra | Status |
|-------------|------------------|--------|
| @dnd-kit | `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0` | Already installed |
| Supabase | `@supabase/supabase-js@2.49.8` | Already configured |
| shadcn/ui | Full set of Radix components | Already installed |
| framer-motion | `framer-motion@12.12.2` | Already installed |
| Recharts | `recharts@2.15.3` | Already installed |
| Markdown | `react-markdown@10.1.0` | Already installed |
| RBAC | 30+ permission modules | Already built |
| Activity Logging | `logActivity()` helper | Already built |
| Notifications | Realtime + email | Already built |
| File Management | Upload, preview, versions | Already built |

**Result:** Zero new dependencies needed. All required libraries are already installed.

---

## Appendix B: Reference Projects

- [Kanba](https://github.com/Kanba-co/kanba) — Closest stack match (Next.js + Supabase + Tailwind + Stripe), MIT license
- [Kan](https://github.com/kanbn/kan) — 4,500+ stars, best UX patterns reference
- [Planka](https://github.com/plankanban/planka) — 11,600+ stars, most mature Kanban OSS
- [Trello Clone](https://github.com/Mshandev/Trello-Clone) — Next.js + Supabase + @dnd-kit reference

---

*End of PRD*
