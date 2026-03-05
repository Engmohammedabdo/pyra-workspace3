# Implementation Guide: Employee Experience & Task Management System
# Pyra Workspace 3.0

> **Based on:** `docs/PRD-EMPLOYEE-SYSTEM.md`
> **Date:** 2026-03-04
> **Status:** Implementation Blueprint

---

## Table of Contents

1. [Pre-Implementation Setup](#1-pre-implementation-setup)
2. [Phase 1: Employee Foundation](#2-phase-1-employee-foundation)
3. [Phase 2: Task & Workflow Management](#3-phase-2-task--workflow-management)
4. [Phase 3: Operations & HR](#4-phase-3-operations--hr)
5. [Integration Hooks](#5-integration-hooks)
6. [Testing Checklist](#6-testing-checklist)

---

## 1. Pre-Implementation Setup

### 1.1 Database Migration

> Run this SQL in Supabase SQL Editor BEFORE any code changes.

```sql
-- ============================================================
-- MIGRATION: Employee System v1.0
-- Date: 2026-03-04
-- ============================================================

-- ──────────────────────────────────────────
-- PHASE 1: Employee Profile Extensions
-- ──────────────────────────────────────────

ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
-- status: 'active' | 'inactive' | 'suspended'

-- ──────────────────────────────────────────
-- PHASE 2: Boards & Tasks
-- ──────────────────────────────────────────

-- Boards
CREATE TABLE IF NOT EXISTS pyra_boards (
  id VARCHAR(20) PRIMARY KEY,
  project_id VARCHAR(20) REFERENCES pyra_projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template TEXT,
  is_default BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  created_by VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_boards_project ON pyra_boards(project_id);

-- Board Columns
CREATE TABLE IF NOT EXISTS pyra_board_columns (
  id VARCHAR(20) PRIMARY KEY,
  board_id VARCHAR(20) NOT NULL REFERENCES pyra_boards(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(20) DEFAULT 'gray',
  position INTEGER DEFAULT 0,
  wip_limit INTEGER,
  is_done_column BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_columns_board ON pyra_board_columns(board_id);

-- Tasks
CREATE TABLE IF NOT EXISTS pyra_tasks (
  id VARCHAR(20) PRIMARY KEY,
  board_id VARCHAR(20) NOT NULL REFERENCES pyra_boards(id) ON DELETE CASCADE,
  column_id VARCHAR(20) NOT NULL REFERENCES pyra_board_columns(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  position INTEGER DEFAULT 0,
  priority VARCHAR(20) DEFAULT 'medium',
  due_date DATE,
  start_date DATE,
  estimated_hours NUMERIC(6,2),
  actual_hours NUMERIC(6,2) DEFAULT 0,
  cover_image TEXT,
  is_archived BOOLEAN DEFAULT false,
  created_by VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_board ON pyra_tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column ON pyra_tasks(column_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON pyra_tasks(due_date) WHERE due_date IS NOT NULL;

-- Task Assignees
CREATE TABLE IF NOT EXISTS pyra_task_assignees (
  id VARCHAR(20) PRIMARY KEY,
  task_id VARCHAR(20) NOT NULL REFERENCES pyra_tasks(id) ON DELETE CASCADE,
  username VARCHAR NOT NULL,
  assigned_by VARCHAR NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, username)
);
CREATE INDEX IF NOT EXISTS idx_assignees_task ON pyra_task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_assignees_user ON pyra_task_assignees(username);

-- Board Labels
CREATE TABLE IF NOT EXISTS pyra_board_labels (
  id VARCHAR(20) PRIMARY KEY,
  board_id VARCHAR(20) NOT NULL REFERENCES pyra_boards(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Task-Label Junction
CREATE TABLE IF NOT EXISTS pyra_task_labels (
  task_id VARCHAR(20) NOT NULL REFERENCES pyra_tasks(id) ON DELETE CASCADE,
  label_id VARCHAR(20) NOT NULL REFERENCES pyra_board_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

-- Task Checklist Items
CREATE TABLE IF NOT EXISTS pyra_task_checklist (
  id VARCHAR(20) PRIMARY KEY,
  task_id VARCHAR(20) NOT NULL REFERENCES pyra_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_checked BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checklist_task ON pyra_task_checklist(task_id);

-- Task Comments
CREATE TABLE IF NOT EXISTS pyra_task_comments (
  id VARCHAR(20) PRIMARY KEY,
  task_id VARCHAR(20) NOT NULL REFERENCES pyra_tasks(id) ON DELETE CASCADE,
  author_username VARCHAR NOT NULL,
  author_name VARCHAR NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_comments ON pyra_task_comments(task_id);

-- Task Attachments
CREATE TABLE IF NOT EXISTS pyra_task_attachments (
  id VARCHAR(20) PRIMARY KEY,
  task_id VARCHAR(20) NOT NULL REFERENCES pyra_tasks(id) ON DELETE CASCADE,
  file_id VARCHAR(20),
  file_name VARCHAR NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  uploaded_by VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Task Activity Log
CREATE TABLE IF NOT EXISTS pyra_task_activity (
  id VARCHAR(20) PRIMARY KEY,
  task_id VARCHAR(20) NOT NULL REFERENCES pyra_tasks(id) ON DELETE CASCADE,
  username VARCHAR NOT NULL,
  display_name VARCHAR NOT NULL,
  action VARCHAR(50) NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_activity ON pyra_task_activity(task_id);

-- ──────────────────────────────────────────
-- PHASE 3: Operations & HR
-- ──────────────────────────────────────────

-- Timesheets
CREATE TABLE IF NOT EXISTS pyra_timesheets (
  id VARCHAR(20) PRIMARY KEY,
  username VARCHAR NOT NULL,
  project_id VARCHAR(20) REFERENCES pyra_projects(id),
  task_id VARCHAR(20) REFERENCES pyra_tasks(id),
  date DATE NOT NULL,
  hours NUMERIC(4,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  description TEXT,
  status VARCHAR(20) DEFAULT 'draft',
  approved_by VARCHAR,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timesheet_user ON pyra_timesheets(username);
CREATE INDEX IF NOT EXISTS idx_timesheet_date ON pyra_timesheets(date);

-- Announcements
CREATE TABLE IF NOT EXISTS pyra_announcements (
  id VARCHAR(20) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'normal',
  is_pinned BOOLEAN DEFAULT false,
  target_teams JSONB DEFAULT '[]',
  created_by VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Announcement Read Tracking
CREATE TABLE IF NOT EXISTS pyra_announcement_reads (
  announcement_id VARCHAR(20) NOT NULL REFERENCES pyra_announcements(id) ON DELETE CASCADE,
  username VARCHAR NOT NULL,
  read_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (announcement_id, username)
);

-- Leave Requests
CREATE TABLE IF NOT EXISTS pyra_leave_requests (
  id VARCHAR(20) PRIMARY KEY,
  username VARCHAR NOT NULL,
  type VARCHAR(30) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count INTEGER NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  reviewed_by VARCHAR,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leave_user ON pyra_leave_requests(username);

-- Leave Balances
CREATE TABLE IF NOT EXISTS pyra_leave_balances (
  username VARCHAR NOT NULL,
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

### 1.2 ID Prefixes

> Add these to `lib/utils/id.ts` usage documentation.

| Prefix | Table | Example |
|--------|-------|---------|
| `bd` | pyra_boards | `bd_a1B2c3D4e5F6g7h` |
| `bc` | pyra_board_columns | `bc_a1B2c3D4e5F6g7h` |
| `tk` | pyra_tasks | `tk_a1B2c3D4e5F6g7h` |
| `ta` | pyra_task_assignees | `ta_a1B2c3D4e5F6g7h` |
| `bl` | pyra_board_labels | `bl_a1B2c3D4e5F6g7h` |
| `cl` | pyra_task_checklist | `cl_a1B2c3D4e5F6g7h` |
| `tc` | pyra_task_comments | `tc_a1B2c3D4e5F6g7h` |
| `tf` | pyra_task_attachments | `tf_a1B2c3D4e5F6g7h` |
| `tl` | pyra_task_activity | `tl_a1B2c3D4e5F6g7h` |
| `ts` | pyra_timesheets | `ts_a1B2c3D4e5F6g7h` |
| `ann` | pyra_announcements | `ann_a1B2c3D4e5F6g7` |
| `lr` | pyra_leave_requests | `lr_a1B2c3D4e5F6g7h` |

### 1.3 New Permissions to Add in `lib/auth/rbac.ts`

```typescript
// ── Add to PERMISSIONS object ──

// Boards
BOARDS_VIEW: 'boards.view',
BOARDS_MANAGE: 'boards.manage',

// Tasks
TASKS_VIEW: 'tasks.view',
TASKS_CREATE: 'tasks.create',
TASKS_MANAGE: 'tasks.manage',

// Directory
DIRECTORY_VIEW: 'directory.view',

// Timesheets
TIMESHEET_VIEW: 'timesheet.view',
TIMESHEET_MANAGE: 'timesheet.manage',
TIMESHEET_APPROVE: 'timesheet.approve',

// Announcements
ANNOUNCEMENTS_VIEW: 'announcements.view',
ANNOUNCEMENTS_MANAGE: 'announcements.manage',

// Leave
LEAVE_VIEW: 'leave.view',
LEAVE_MANAGE: 'leave.manage',
LEAVE_APPROVE: 'leave.approve',
```

```typescript
// ── Add to PERMISSION_MODULES array ──

{
  key: 'boards',
  label: 'Boards',
  labelAr: 'لوحات العمل',
  permissions: [
    { key: 'boards.view', label: 'View Boards', labelAr: 'عرض لوحات العمل' },
    { key: 'boards.manage', label: 'Manage Boards', labelAr: 'إدارة لوحات العمل' },
  ],
},
{
  key: 'tasks',
  label: 'Tasks',
  labelAr: 'المهام',
  permissions: [
    { key: 'tasks.view', label: 'View Tasks', labelAr: 'عرض المهام' },
    { key: 'tasks.create', label: 'Create Tasks', labelAr: 'إنشاء مهام' },
    { key: 'tasks.manage', label: 'Manage Tasks', labelAr: 'إدارة المهام' },
  ],
},
{
  key: 'directory',
  label: 'Directory',
  labelAr: 'دليل الفريق',
  permissions: [
    { key: 'directory.view', label: 'View Directory', labelAr: 'عرض دليل الفريق' },
  ],
},
{
  key: 'timesheet',
  label: 'Timesheets',
  labelAr: 'سجل الساعات',
  permissions: [
    { key: 'timesheet.view', label: 'View Timesheets', labelAr: 'عرض سجل الساعات' },
    { key: 'timesheet.manage', label: 'Manage Timesheets', labelAr: 'إدارة سجل الساعات' },
    { key: 'timesheet.approve', label: 'Approve Timesheets', labelAr: 'اعتماد سجل الساعات' },
  ],
},
{
  key: 'announcements',
  label: 'Announcements',
  labelAr: 'الإعلانات',
  permissions: [
    { key: 'announcements.view', label: 'View Announcements', labelAr: 'عرض الإعلانات' },
    { key: 'announcements.manage', label: 'Manage Announcements', labelAr: 'إدارة الإعلانات' },
  ],
},
{
  key: 'leave',
  label: 'Leave',
  labelAr: 'الإجازات',
  permissions: [
    { key: 'leave.view', label: 'View Leave', labelAr: 'عرض الإجازات' },
    { key: 'leave.manage', label: 'Manage Leave', labelAr: 'إدارة الإجازات' },
    { key: 'leave.approve', label: 'Approve Leave', labelAr: 'اعتماد الإجازات' },
  ],
},
```

```typescript
// ── Update getDefaultPermissionsForLegacyRole ──

case 'employee':
  return [
    'dashboard.view',
    'files.view',
    'projects.view',
    'boards.view',
    'tasks.view',
    'tasks.create',
    'directory.view',
    'timesheet.view',
    'announcements.view',
    'leave.view',
    'notifications.view',
    'favorites.view',
    'favorites.manage',
  ];
```

### 1.4 Sidebar Navigation Updates

> File: `components/layout/sidebar.tsx`
> Add TWO new nav groups after the "General" group:

```typescript
// Add icons at top:
import {
  // ... existing imports ...
  UserCircle,
  CheckSquare,
  Clock,
  Kanban,
  Megaphone,
  Contact,
  CalendarOff,
} from 'lucide-react';

// Add new nav groups:

// INSERT AFTER the "General" (عام) group:
{
  title: 'شخصي',
  titleEn: 'Personal',
  items: [
    { href: '/dashboard/profile', label: 'ملفي الشخصي', labelEn: 'My Profile', icon: UserCircle },
    { href: '/dashboard/my-tasks', label: 'مهامي', labelEn: 'My Tasks', icon: CheckSquare },
    { href: '/dashboard/timesheet', label: 'ساعات العمل', labelEn: 'Timesheet', icon: Clock, permission: 'timesheet.view' },
  ],
},

// INSERT AFTER the "Work" (العمل) group:
{
  title: 'سير العمل',
  titleEn: 'Workflow',
  items: [
    { href: '/dashboard/boards', label: 'لوحات العمل', labelEn: 'Boards', icon: Kanban, permission: 'boards.view' },
    { href: '/dashboard/announcements', label: 'الإعلانات', labelEn: 'Announcements', icon: Megaphone, permission: 'announcements.view' },
    { href: '/dashboard/directory', label: 'دليل الفريق', labelEn: 'Directory', icon: Contact, permission: 'directory.view' },
    { href: '/dashboard/leave', label: 'الإجازات', labelEn: 'Leave', icon: CalendarOff, permission: 'leave.view' },
  ],
},
```

**Final sidebar order:**
1. عام (General) — Dashboard, Notifications
2. **شخصي (Personal)** — Profile, My Tasks, Timesheet *(NEW)*
3. إدارة الملفات (Files) — Files, Favorites, Reviews, Trash, Storage
4. العمل (Work) — Projects, Quotes, Invoices, Clients, Script Reviews
5. **سير العمل (Workflow)** — Boards, Announcements, Directory, Leave *(NEW)*
6. المالية (Finance) — all finance items
7. الفريق (Team) — Teams, Users, Roles
8. النظام (System) — all system items

### 1.5 Module Guide Entries

> File: `lib/config/module-guide.ts`
> Add these entries to `MODULE_GUIDES`:

```typescript
'/dashboard/profile': {
  href: '/dashboard/profile',
  description: 'إدارة الملف الشخصي والإعدادات',
  descriptionEn: 'Personal profile and settings management',
  goal: 'تحديث معلوماتك الشخصية، تغيير كلمة المرور، وعرض دورك وصلاحياتك في النظام.',
  tips: [
    'يمكنك رفع صورة شخصية تظهر في جميع أنحاء النظام',
    'تغيير كلمة المرور يتطلب 12 حرف على الأقل',
    'صلاحياتك تظهر للعرض فقط — تواصل مع المسؤول لتغييرها',
    'يمكنك مراجعة جلساتك النشطة وإنهاء أي جلسة مشبوهة',
  ],
  keywords: ['ملف شخصي', 'profile', 'كلمة مرور', 'صورة', 'avatar', 'إعدادات'],
},
'/dashboard/my-tasks': {
  href: '/dashboard/my-tasks',
  description: 'عرض جميع المهام المسندة إليك',
  descriptionEn: 'View all tasks assigned to you',
  goal: 'مركز مهامك الشخصي: تابع كل المهام المسندة إليك عبر جميع المشاريع، مع تصنيفها حسب الأولوية والحالة.',
  tips: [
    'المهام مجمعة حسب: اليوم، هذا الأسبوع، متأخرة',
    'انقر على أي مهمة للانتقال مباشرة للوحة المشروع',
    'استخدم الفلاتر لعرض مهام مشروع محدد أو أولوية معينة',
    'المهام المتأخرة تظهر بتنبيه أحمر في الأعلى',
  ],
  keywords: ['مهامي', 'my tasks', 'مهام', 'معلقة', 'متأخرة', 'أولوية'],
},
'/dashboard/boards': {
  href: '/dashboard/boards',
  description: 'لوحات إدارة المهام (كانبان)',
  descriptionEn: 'Kanban task management boards',
  goal: 'إنشاء وإدارة لوحات عمل بنمط كانبان. كل لوحة تحتوي أعمدة تمثل مراحل العمل، والمهام تنتقل بينها بالسحب والإفلات.',
  tips: [
    'كل مشروع يحصل تلقائياً على لوحة عمل افتراضية',
    'اسحب المهام بين الأعمدة لتحديث حالتها',
    'يمكنك إنشاء لوحات مستقلة للعمليات الداخلية',
    'استخدم القوالب الجاهزة لتسريع إنشاء اللوحات',
    'أضف تسميات ملونة لتصنيف المهام بصرياً',
  ],
  keywords: ['لوحات', 'كانبان', 'boards', 'kanban', 'سحب', 'drag', 'أعمدة'],
},
'/dashboard/directory': {
  href: '/dashboard/directory',
  description: 'دليل أعضاء الفريق',
  descriptionEn: 'Team member directory',
  goal: 'عرض جميع أعضاء الفريق مع معلومات التواصل والأدوار. يمكنك البحث والتصفية حسب الفريق أو الدور.',
  tips: [
    'انقر على بطاقة الموظف لعرض تفاصيله',
    'استخدم فلتر الفريق لعرض أعضاء فريق محدد',
    'الأدوار تظهر ببادج ملونة حسب اللون المحدد في إعدادات الدور',
  ],
  keywords: ['دليل', 'فريق', 'موظفين', 'directory', 'team', 'تواصل'],
},
'/dashboard/timesheet': {
  href: '/dashboard/timesheet',
  description: 'تسجيل ومتابعة ساعات العمل',
  descriptionEn: 'Track and manage work hours',
  goal: 'سجّل ساعات عملك اليومية مربوطة بالمشاريع والمهام. أرسل الساعات للاعتماد من المسؤول.',
  tips: [
    'سجّل ساعاتك يومياً للحصول على تقارير دقيقة',
    'اربط الساعات بمهام محددة لتتبع أدق',
    'أرسل سجلك الأسبوعي للاعتماد قبل نهاية الأسبوع',
    'يمكنك مراجعة إجماليك الشهري في التقارير',
  ],
  keywords: ['ساعات', 'عمل', 'timesheet', 'وقت', 'تسجيل', 'اعتماد'],
},
'/dashboard/announcements': {
  href: '/dashboard/announcements',
  description: 'الإعلانات والتنبيهات الداخلية',
  descriptionEn: 'Internal announcements and alerts',
  goal: 'متابعة إعلانات الشركة وآخر التحديثات. الإعلانات العاجلة تظهر كبانر في أعلى لوحة التحكم.',
  tips: [
    'الإعلانات المثبتة تظهر دائماً في الأعلى',
    'الإعلانات غير المقروءة تظهر بتمييز خاص',
    'المسؤولون يمكنهم إنشاء وتعديل الإعلانات',
    'يمكن استهداف إعلان لفرق محددة',
  ],
  keywords: ['إعلانات', 'تنبيهات', 'announcements', 'أخبار', 'داخلية'],
},
'/dashboard/leave': {
  href: '/dashboard/leave',
  description: 'طلبات الإجازة وأرصدة الإجازات',
  descriptionEn: 'Leave requests and balances',
  goal: 'تقديم طلبات إجازة ومتابعة حالتها. عرض رصيد إجازاتك (سنوية، مرضية، شخصية).',
  tips: [
    'تأكد من رصيدك قبل تقديم الطلب',
    'أضف سبباً واضحاً لتسريع الموافقة',
    'يمكنك إلغاء طلب معلق قبل مراجعته',
    'تقويم الفريق يوضح من في إجازة',
  ],
  keywords: ['إجازة', 'leave', 'رصيد', 'طلب', 'سنوية', 'مرضية'],
},
```

### 1.6 Guide Page Sections Update

> File: `app/dashboard/guide/page.tsx`
> Add new section AND update existing sections' hrefs:

```typescript
// ADD new section (after 'team' section, before 'system'):
{
  key: 'workflow',
  title: 'سير العمل',
  titleEn: 'Workflow',
  icon: Kanban, // import from lucide-react
  color: 'text-indigo-600 dark:text-indigo-400',
  bgColor: 'bg-indigo-500/10',
  hrefs: [
    '/dashboard/profile',
    '/dashboard/my-tasks',
    '/dashboard/boards',
    '/dashboard/directory',
    '/dashboard/timesheet',
    '/dashboard/announcements',
    '/dashboard/leave',
  ],
},
```

---

## 2. Phase 1: Employee Foundation

### 2.1 Profile Page

#### File Structure
```
app/dashboard/profile/
  page.tsx              ← Server component (auth guard)
  profile-client.tsx    ← Client component (all UI)
```

#### `app/dashboard/profile/page.tsx` (Server Component)
```typescript
import { requireAuth } from '@/lib/auth/guards';
import ProfileClient from './profile-client';

export default async function ProfilePage() {
  const session = await requireAuth();
  // No permission check — every user can see their own profile
  return <ProfileClient session={session} />;
}
```

#### `app/dashboard/profile/profile-client.tsx` (Client Component)

**Tab Structure:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ ┌──────────────────── Header ──────────────────────────────────────┐│
│ │  [Avatar Upload]  Display Name                                  ││
│ │                   job_title · role badge                         ││
│ │                   email · last login                             ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ ┌─ Tabs ──────────────────────────────────────────────────────────┐│
│ │  [معلومات شخصية] [الأمان] [الدور والصلاحيات] [نشاطي]          ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ ┌─ Tab Content ───────────────────────────────────────────────────┐│
│ │  (Content changes based on active tab)                          ││
│ └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

**Key Implementation Details:**

```typescript
'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { getRoleColorClasses } from '@/lib/auth/rbac';
import {
  UserCircle, Shield, Activity, Lock, Camera,
  Phone, Briefcase, FileText, Clock
} from 'lucide-react';
import type { AuthSession } from '@/lib/auth/guards';

// Tab 1: Personal Info Form
//   - display_name (Input)
//   - phone (Input)
//   - job_title (Input)
//   - bio (Textarea, max 280 chars)
//   - Avatar upload (Supabase Storage → profile-avatars bucket)
//   - API: PATCH /api/profile

// Tab 2: Security
//   - Password change form (current, new, confirm)
//   - Active sessions list (from /api/sessions?my=true)
//   - API: POST /api/profile/password

// Tab 3: Role & Permissions
//   - Role badge with color
//   - Permission modules grid (read-only)
//   - Uses PERMISSION_MODULES from rbac.ts

// Tab 4: My Activity
//   - Filtered activity log (own username only)
//   - Reuse existing activity UI pattern
//   - API: GET /api/activity?username={me}
```

**Avatar Upload Pattern:**
```typescript
async function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/profile/avatar', { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Upload failed');
  const { data } = await res.json();
  return data.avatar_url;
}
```

#### API Routes

**`app/api/profile/route.ts`**
```typescript
import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiError, apiUnauthorized } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity';

// GET: Return own profile
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('pyra_users')
    .select('id, username, display_name, role, role_id, phone, job_title, avatar_url, bio, status, created_at, pyra_roles!left(name, name_ar, permissions, color, icon)')
    .eq('username', auth.pyraUser.username)
    .single();

  if (error) return apiError(error.message);
  return apiSuccess(data);
}

// PATCH: Update own profile (only allowed fields)
export async function PATCH(req: NextRequest) {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const body = await req.json();
  const allowedFields = ['display_name', 'phone', 'job_title', 'bio'];
  const updates: Record<string, string> = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return apiError('لا توجد بيانات للتحديث');
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('pyra_users')
    .update(updates)
    .eq('username', auth.pyraUser.username);

  if (error) return apiError(error.message);

  logActivity({
    action: 'profile_updated',
    username: auth.pyraUser.username,
    displayName: auth.pyraUser.display_name,
    details: { updated_fields: Object.keys(updates) },
  });

  return apiSuccess({ message: 'تم تحديث الملف الشخصي' });
}
```

**`app/api/profile/avatar/route.ts`**
```typescript
import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiError, apiUnauthorized } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const formData = await req.formData();
  const file = formData.get('file') as File;
  if (!file) return apiError('الملف مطلوب');

  // Validate: image only, max 2MB
  if (!file.type.startsWith('image/')) return apiError('يجب أن يكون الملف صورة');
  if (file.size > 2 * 1024 * 1024) return apiError('الحد الأقصى 2 ميجا');

  const supabase = await createServerSupabaseClient();
  const ext = file.name.split('.').pop();
  const path = `avatars/${auth.pyraUser.username}.${ext}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('profile-avatars')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return apiError(uploadError.message);

  const { data: urlData } = supabase.storage
    .from('profile-avatars')
    .getPublicUrl(path);

  // Update user record
  const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
  await supabase
    .from('pyra_users')
    .update({ avatar_url: avatarUrl })
    .eq('username', auth.pyraUser.username);

  return apiSuccess({ avatar_url: avatarUrl });
}
```

---

### 2.2 Role-Adaptive Dashboard

> File: `app/dashboard/page.tsx`

**Current behavior:** `isAdmin` check shows/hides sections.
**Enhanced behavior:** Add employee-specific widgets when `!isAdmin`.

```typescript
// Add to DashboardData interface:
interface DashboardData {
  // ... existing fields ...
  // Employee-specific
  my_tasks_count?: number;
  my_tasks_overdue?: number;
  my_tasks_due_today?: number;
  my_projects_count?: number;
  my_pending_reviews?: number;
  my_hours_this_week?: number;
  unread_announcements?: number;
  upcoming_tasks?: Array<{
    id: string;
    title: string;
    project_name: string;
    due_date: string;
    priority: string;
  }>;
}
```

**New Employee Dashboard Section (add after admin sections):**
```typescript
{/* ═══ Employee Dashboard ═══ */}
{!isAdmin && data && (
  <>
    {/* Employee KPI Cards */}
    <StaggerContainer className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StaggerItem>
        <StatCard
          href="/dashboard/my-tasks"
          title="مهامي المفتوحة"
          value={data.my_tasks_count ?? 0}
          subtitle={`${data.my_tasks_overdue ?? 0} متأخرة`}
          icon={CheckSquare}
          accent={(data.my_tasks_overdue ?? 0) > 0 ? 'text-red-500' : undefined}
        />
      </StaggerItem>
      <StaggerItem>
        <StatCard
          href="/dashboard/projects"
          title="مشاريعي"
          value={data.my_projects_count ?? 0}
          subtitle="مشروع مسند إليك"
          icon={Briefcase}
        />
      </StaggerItem>
      <StaggerItem>
        <StatCard
          href="/dashboard/my-tasks"
          title="تسليم اليوم"
          value={data.my_tasks_due_today ?? 0}
          subtitle="مهام مستحقة اليوم"
          icon={Clock}
          accent={(data.my_tasks_due_today ?? 0) > 0 ? 'text-orange-500' : undefined}
        />
      </StaggerItem>
      <StaggerItem>
        <StatCard
          href="/dashboard/timesheet"
          title="ساعاتي هذا الأسبوع"
          value={`${data.my_hours_this_week ?? 0}h`}
          subtitle="ساعة مسجلة"
          icon={Clock}
        />
      </StaggerItem>
    </StaggerContainer>

    {/* Upcoming Tasks + Announcements */}
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Upcoming Tasks */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            مهام تحتاج انتباهك
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Render upcoming_tasks with priority badges */}
        </CardContent>
      </Card>

      {/* Quick Actions for Employee */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">إجراءات سريعة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link href="/dashboard/my-tasks">
            <Button variant="outline" size="sm" className="w-full justify-start">
              <CheckSquare className="h-4 w-4 me-2" /> مهامي
            </Button>
          </Link>
          <Link href="/dashboard/timesheet">
            <Button variant="outline" size="sm" className="w-full justify-start">
              <Clock className="h-4 w-4 me-2" /> تسجيل ساعات
            </Button>
          </Link>
          <Link href="/dashboard/leave">
            <Button variant="outline" size="sm" className="w-full justify-start">
              <CalendarOff className="h-4 w-4 me-2" /> طلب إجازة
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  </>
)}
```

**Dashboard API Update (`app/api/dashboard/route.ts`):**
```typescript
// If user is NOT admin, add employee-specific data:
if (!isSuperAdmin(auth.pyraUser.rolePermissions)) {
  // My tasks
  const { count: myTasks } = await supabase
    .from('pyra_task_assignees')
    .select('*, pyra_tasks!inner(is_archived, pyra_board_columns!inner(is_done_column))', { count: 'exact' })
    .eq('username', auth.pyraUser.username)
    .eq('pyra_tasks.is_archived', false)
    .eq('pyra_tasks.pyra_board_columns.is_done_column', false);

  // Overdue tasks
  const { count: overdueTasks } = await supabase
    .from('pyra_task_assignees')
    .select('*, pyra_tasks!inner(due_date, is_archived)', { count: 'exact' })
    .eq('username', auth.pyraUser.username)
    .eq('pyra_tasks.is_archived', false)
    .lt('pyra_tasks.due_date', new Date().toISOString().split('T')[0]);

  // My hours this week
  const weekStart = getWeekStart(); // Monday
  const { data: hours } = await supabase
    .from('pyra_timesheets')
    .select('hours')
    .eq('username', auth.pyraUser.username)
    .gte('date', weekStart);

  const totalHours = hours?.reduce((sum, h) => sum + Number(h.hours), 0) ?? 0;

  // Merge into response
  dashboardData.my_tasks_count = myTasks ?? 0;
  dashboardData.my_tasks_overdue = overdueTasks ?? 0;
  dashboardData.my_hours_this_week = totalHours;
}
```

---

### 2.3 Employee Directory

#### File Structure
```
app/dashboard/directory/
  page.tsx
  directory-client.tsx
```

#### UI Design
```
┌─────────────────────────────────────────────────────────────────┐
│  دليل الفريق                                                    │
│  ───────────────────────────────────────────────────────────────  │
│  [🔍 بحث بالاسم أو المسمى]    [الفريق ▾]    [الدور ▾]          │
│                                                                   │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │
│  │   ┌─────┐     │  │   ┌─────┐     │  │   ┌─────┐     │        │
│  │   │ 👤  │     │  │   │ 👤  │     │  │   │ 👤  │     │        │
│  │   └─────┘     │  │   └─────┘     │  │   └─────┘     │        │
│  │  أحمد العلي   │  │  سارة أحمد    │  │  خالد محمد    │        │
│  │  مصمم جرافيك  │  │  مطورة ويب    │  │  مدير مشاريع  │        │
│  │  ┌──────────┐ │  │  ┌──────────┐ │  │  ┌──────────┐ │        │
│  │  │ مصمم    ·│ │  │  │ مطور   ·│ │  │  │ مدير   ·│ │        │
│  │  └──────────┘ │  │  └──────────┘ │  │  └──────────┘ │        │
│  │  فريق الإبداع │  │  فريق التقنية │  │  الإدارة      │        │
│  │  📧 📱        │  │  📧 📱        │  │  📧 📱        │        │
│  └───────────────┘  └───────────────┘  └───────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

**Data Fetching:**
```typescript
// GET /api/directory
const { data } = await supabase
  .from('pyra_users')
  .select(`
    id, username, display_name, job_title, phone, avatar_url, status, created_at,
    pyra_roles!left(name, name_ar, color, icon),
    pyra_team_members!left(pyra_teams!inner(id, name))
  `)
  .eq('status', 'active')
  .order('display_name');
```

---

## 3. Phase 2: Task & Workflow Management

### 3.1 Board Templates Configuration

> File: `lib/config/board-templates.ts`

```typescript
export interface BoardTemplate {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: string; // lucide icon name
  columns: {
    name: string;
    color: string;
    isDoneColumn?: boolean;
  }[];
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'general',
    name: 'General Kanban',
    nameAr: 'كانبان عام',
    description: 'Simple board with 4 columns',
    descriptionAr: 'لوحة بسيطة بأربعة أعمدة',
    icon: 'LayoutDashboard',
    columns: [
      { name: 'المهام', color: 'gray' },
      { name: 'قيد التنفيذ', color: 'blue' },
      { name: 'مراجعة', color: 'yellow' },
      { name: 'مكتمل', color: 'green', isDoneColumn: true },
    ],
  },
  {
    id: 'content',
    name: 'Content Pipeline',
    nameAr: 'خط إنتاج المحتوى',
    description: 'For content marketing workflows',
    descriptionAr: 'لسير عمل التسويق بالمحتوى',
    icon: 'FileText',
    columns: [
      { name: 'البريف', color: 'gray' },
      { name: 'الكتابة', color: 'blue' },
      { name: 'التحرير', color: 'purple' },
      { name: 'التصميم', color: 'pink' },
      { name: 'مراجعة العميل', color: 'yellow' },
      { name: 'منشور', color: 'green', isDoneColumn: true },
    ],
  },
  {
    id: 'design',
    name: 'Design Pipeline',
    nameAr: 'خط إنتاج التصميم',
    description: 'For design project workflows',
    descriptionAr: 'لسير عمل مشاريع التصميم',
    icon: 'Palette',
    columns: [
      { name: 'البريف', color: 'gray' },
      { name: 'المفهوم', color: 'blue' },
      { name: 'التصميم', color: 'purple' },
      { name: 'مراجعة داخلية', color: 'orange' },
      { name: 'مراجعة العميل', color: 'yellow' },
      { name: 'معتمد', color: 'green', isDoneColumn: true },
    ],
  },
  {
    id: 'campaign',
    name: 'Campaign Management',
    nameAr: 'إدارة الحملات',
    description: 'For marketing campaign tracking',
    descriptionAr: 'لمتابعة الحملات التسويقية',
    icon: 'Megaphone',
    columns: [
      { name: 'تخطيط', color: 'gray' },
      { name: 'إبداع', color: 'blue' },
      { name: 'إنتاج', color: 'purple' },
      { name: 'فحص الجودة', color: 'orange' },
      { name: 'إطلاق', color: 'yellow' },
      { name: 'تقارير', color: 'green', isDoneColumn: true },
    ],
  },
  {
    id: 'video',
    name: 'Video Production',
    nameAr: 'إنتاج الفيديو',
    description: 'For video production workflows',
    descriptionAr: 'لسير عمل إنتاج الفيديو',
    icon: 'Video',
    columns: [
      { name: 'ما قبل الإنتاج', color: 'gray' },
      { name: 'السكريبت', color: 'blue' },
      { name: 'التصوير', color: 'purple' },
      { name: 'المونتاج', color: 'pink' },
      { name: 'صوت ولون', color: 'orange' },
      { name: 'مراجعة نهائية', color: 'yellow' },
      { name: 'تسليم', color: 'green', isDoneColumn: true },
    ],
  },
  {
    id: 'social',
    name: 'Social Media',
    nameAr: 'وسائل التواصل',
    description: 'For social media content management',
    descriptionAr: 'لإدارة محتوى وسائل التواصل',
    icon: 'Share2',
    columns: [
      { name: 'أفكار', color: 'gray' },
      { name: 'معتمد', color: 'blue' },
      { name: 'مصمم', color: 'purple' },
      { name: 'مجدول', color: 'orange' },
      { name: 'منشور', color: 'green', isDoneColumn: true },
    ],
  },
];
```

### 3.2 Component Architecture

```
components/boards/
  board-view.tsx            ← Main Kanban board layout
  board-column.tsx          ← Single column with DnD container
  task-card.tsx             ← Draggable task card
  task-detail-modal.tsx     ← Full task detail sheet/drawer
  task-comments.tsx         ← Comments section inside modal
  task-checklist.tsx        ← Checklist section inside modal
  task-assignees.tsx        ← Assignee selector
  task-labels.tsx           ← Label selector/creator
  board-header.tsx          ← Board title, filters, view toggle
  column-create-dialog.tsx  ← Add new column dialog
  task-create-inline.tsx    ← Quick add task at bottom of column
  board-template-picker.tsx ← Template selection when creating board
  dnd-context.tsx           ← @dnd-kit context wrapper
```

### 3.3 DnD Implementation (`components/boards/dnd-context.tsx`)

```typescript
'use client';

import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useState } from 'react';
import { TaskCard } from './task-card';

interface BoardDndContextProps {
  columns: Column[];
  tasks: Record<string, Task[]>; // columnId → tasks
  onTaskMove: (taskId: string, fromCol: string, toCol: string, newPosition: number) => void;
  onColumnReorder: (activeId: string, overId: string) => void;
  children: React.ReactNode;
}

export function BoardDndContext({
  columns, tasks, onTaskMove, onColumnReorder, children
}: BoardDndContextProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }, // prevent accidental drags
    }),
    useSensor(KeyboardSensor)
  );

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    if (active.data.current?.type === 'task') {
      setActiveTask(active.data.current.task);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    if (active.data.current?.type === 'task') {
      const taskId = active.id as string;
      const fromCol = active.data.current.columnId;
      const toCol = over.data.current?.columnId || over.id;
      const newPosition = over.data.current?.position ?? 0;

      if (fromCol !== toCol || active.id !== over.id) {
        onTaskMove(taskId, fromCol, toCol as string, newPosition);
      }
    }

    setActiveTask(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DragOverlay>
        {activeTask && <TaskCard task={activeTask} isDragOverlay />}
      </DragOverlay>
    </DndContext>
  );
}
```

### 3.4 Board View (`components/boards/board-view.tsx`)

**Layout Pattern:**
```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { BoardDndContext } from './dnd-context';
import { BoardColumn } from './board-column';
import { BoardHeader } from './board-header';
import { TaskDetailModal } from './task-detail-modal';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Kanban } from 'lucide-react';
import { toast } from 'sonner';

interface BoardViewProps {
  boardId: string;
  projectId?: string;
}

export function BoardView({ boardId, projectId }: BoardViewProps) {
  const [board, setBoard] = useState<Board | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBoard = useCallback(async () => {
    const res = await fetch(`/api/boards/${boardId}`);
    const { data } = await res.json();
    if (data) {
      setBoard(data.board);
      setColumns(data.columns);
      // Group tasks by column
      const grouped: Record<string, Task[]> = {};
      for (const col of data.columns) {
        grouped[col.id] = data.tasks
          .filter((t: Task) => t.column_id === col.id)
          .sort((a: Task, b: Task) => a.position - b.position);
      }
      setTasks(grouped);
    }
    setLoading(false);
  }, [boardId]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  // Optimistic task move
  async function handleTaskMove(taskId: string, fromCol: string, toCol: string, newPos: number) {
    // 1. Optimistic update (instant UI)
    setTasks(prev => {
      const next = { ...prev };
      const task = next[fromCol].find(t => t.id === taskId);
      if (!task) return prev;

      next[fromCol] = next[fromCol].filter(t => t.id !== taskId);
      task.column_id = toCol;
      task.position = newPos;
      next[toCol] = [...(next[toCol] || [])];
      next[toCol].splice(newPos, 0, task);
      // Recalculate positions
      next[toCol].forEach((t, i) => { t.position = i; });
      return next;
    });

    // 2. Server sync
    try {
      await fetch(`/api/tasks/${taskId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column_id: toCol, position: newPos }),
      });
    } catch {
      toast.error('فشل نقل المهمة');
      loadBoard(); // Revert on failure
    }
  }

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[500px] w-[300px] shrink-0 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!board || columns.length === 0) {
    return (
      <EmptyState
        icon={Kanban}
        title="لا توجد أعمدة"
        description="أضف أعمدة لبدء تنظيم المهام"
        actionLabel="إضافة عمود"
        onAction={() => {/* open column dialog */}}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <BoardHeader board={board} onRefresh={loadBoard} />

      <ScrollArea className="flex-1" dir="rtl">
        <BoardDndContext
          columns={columns}
          tasks={tasks}
          onTaskMove={handleTaskMove}
          onColumnReorder={handleColumnReorder}
        >
          <div className="flex gap-4 p-4 min-h-[calc(100vh-200px)]">
            <SortableContext
              items={columns.map(c => c.id)}
              strategy={horizontalListSortingStrategy}
            >
              {columns.map(column => (
                <BoardColumn
                  key={column.id}
                  column={column}
                  tasks={tasks[column.id] || []}
                  onTaskClick={setSelectedTask}
                  onRefresh={loadBoard}
                />
              ))}
            </SortableContext>

            {/* Add Column Button */}
            <button
              onClick={() => {/* open dialog */}}
              className="shrink-0 w-[300px] h-fit rounded-xl border-2 border-dashed
                         border-muted-foreground/20 hover:border-orange-500/40
                         hover:bg-orange-500/5 transition-colors p-8
                         flex flex-col items-center justify-center gap-2
                         text-muted-foreground hover:text-orange-500"
            >
              <Plus className="h-6 w-6" />
              <span className="text-sm font-medium">عمود جديد</span>
            </button>
          </div>
        </BoardDndContext>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          taskId={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={loadBoard}
        />
      )}
    </div>
  );
}
```

### 3.5 Task Card (`components/boards/task-card.tsx`)

```typescript
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Calendar, CheckSquare, MessageSquare, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';

const PRIORITY_STYLES = {
  urgent: 'border-s-4 border-s-red-500',
  high: 'border-s-4 border-s-orange-500',
  medium: 'border-s-4 border-s-blue-500',
  low: 'border-s-4 border-s-gray-300',
};

const LABEL_COLORS: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
};

interface TaskCardProps {
  task: Task;
  isDragOverlay?: boolean;
  onClick?: () => void;
}

export function TaskCard({ task, isDragOverlay, onClick }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', task, columnId: task.column_id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isOverdue = task.due_date && new Date(task.due_date) < new Date();
  const checklistTotal = task.checklist?.length ?? 0;
  const checklistDone = task.checklist?.filter((c: any) => c.is_checked).length ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'touch-manipulation',
        isDragging && 'opacity-30',
        isDragOverlay && 'rotate-2 shadow-xl',
      )}
    >
      <Card
        onClick={onClick}
        className={cn(
          'cursor-pointer hover:shadow-md transition-all duration-200',
          'hover:border-orange-500/30 hover:-translate-y-0.5',
          'active:scale-[0.98]',
          PRIORITY_STYLES[task.priority as keyof typeof PRIORITY_STYLES] || '',
        )}
      >
        {/* Cover Image */}
        {task.cover_image && (
          <div className="h-32 rounded-t-lg overflow-hidden">
            <img src={task.cover_image} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="p-3 space-y-2.5">
          {/* Labels */}
          {task.labels && task.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.labels.map((label: any) => (
                <div
                  key={label.id}
                  className={cn(
                    'h-2 w-10 rounded-full',
                    LABEL_COLORS[label.color] || 'bg-gray-400'
                  )}
                  title={label.name}
                />
              ))}
            </div>
          )}

          {/* Title */}
          <p className="text-sm font-medium leading-snug line-clamp-2">
            {task.title}
          </p>

          {/* Meta Row */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {/* Due Date */}
            {task.due_date && (
              <span className={cn(
                'flex items-center gap-1',
                isOverdue && 'text-red-500 font-medium'
              )}>
                <Calendar className="h-3 w-3" />
                {formatDate(task.due_date)}
              </span>
            )}

            {/* Checklist Progress */}
            {checklistTotal > 0 && (
              <span className={cn(
                'flex items-center gap-1',
                checklistDone === checklistTotal && 'text-green-500'
              )}>
                <CheckSquare className="h-3 w-3" />
                {checklistDone}/{checklistTotal}
              </span>
            )}

            {/* Comments Count */}
            {(task.comments_count ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {task.comments_count}
              </span>
            )}

            {/* Attachments Count */}
            {(task.attachments_count ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                {task.attachments_count}
              </span>
            )}
          </div>

          {/* Assignees */}
          {task.assignees && task.assignees.length > 0 && (
            <div className="flex items-center justify-end -space-x-2 rtl:space-x-reverse">
              {task.assignees.slice(0, 3).map((assignee: any) => (
                <Avatar key={assignee.username} className="h-6 w-6 border-2 border-background">
                  <AvatarImage src={assignee.avatar_url} />
                  <AvatarFallback className="text-[10px] bg-orange-500/10 text-orange-600">
                    {assignee.display_name?.[0]}
                  </AvatarFallback>
                </Avatar>
              ))}
              {task.assignees.length > 3 && (
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] border-2 border-background">
                  +{task.assignees.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
```

### 3.6 Task Detail Modal (`components/boards/task-detail-modal.tsx`)

**Structure:**
```typescript
// Uses Sheet (vaul drawer) from shadcn/ui for the slide-out panel
// Right side sheet that shows full task details

'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// Sections inside the modal:
// 1. Header: Title (editable inline), column selector, project link
// 2. Properties sidebar: Assignees, Labels, Priority, Due Date, Time tracking
// 3. Description (Markdown editor or textarea)
// 4. Checklist with progress bar
// 5. Attachments grid
// 6. Comments (with mention support via existing MentionTextarea)
// 7. Activity timeline

// IMPORTANT: Uses existing components:
// - Avatar, Badge, Button, Input, Select from shadcn/ui
// - MentionTextarea from components/portal/ (if needed for @mentions)
// - toast from sonner for notifications
```

### 3.7 API Routes — Boards & Tasks

#### Board CRUD (`app/api/boards/route.ts`)
```typescript
// GET: List boards (standalone or all)
// POST: Create board (with optional template)

export async function POST(req: NextRequest) {
  const auth = await requireApiPermission('boards.manage');
  if (isApiError(auth)) return auth;

  const { name, project_id, template_id } = await req.json();

  const supabase = await createServerSupabaseClient();
  const boardId = generateId('bd');

  // Create board
  const { error } = await supabase
    .from('pyra_boards')
    .insert({
      id: boardId,
      name,
      project_id: project_id || null,
      template: template_id || null,
      is_default: false,
      created_by: auth.pyraUser.username,
    });

  if (error) return apiError(error.message);

  // Auto-create columns from template
  if (template_id) {
    const template = BOARD_TEMPLATES.find(t => t.id === template_id);
    if (template) {
      const columnInserts = template.columns.map((col, i) => ({
        id: generateId('bc'),
        board_id: boardId,
        name: col.name,
        color: col.color,
        position: i,
        is_done_column: col.isDoneColumn || false,
      }));

      await supabase.from('pyra_board_columns').insert(columnInserts);
    }
  }

  logActivity({
    action: 'board_created',
    username: auth.pyraUser.username,
    displayName: auth.pyraUser.display_name,
    targetPath: name,
    details: { board_id: boardId, project_id, template_id },
  });

  return apiSuccess({ id: boardId }, undefined, 201);
}
```

#### Board Detail (`app/api/boards/[id]/route.ts`)
```typescript
// GET: Full board with columns + tasks + assignees + labels + checklist counts
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiPermission('boards.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  // Board
  const { data: board } = await supabase
    .from('pyra_boards')
    .select('*, pyra_projects!left(id, name, client_company)')
    .eq('id', id)
    .single();

  if (!board) return apiNotFound('اللوحة غير موجودة');

  // Columns
  const { data: columns } = await supabase
    .from('pyra_board_columns')
    .select('*')
    .eq('board_id', id)
    .order('position');

  // Tasks with relations
  const { data: tasks } = await supabase
    .from('pyra_tasks')
    .select(`
      *,
      pyra_task_assignees(username, pyra_users!inner(display_name, avatar_url)),
      pyra_board_labels!pyra_task_labels(id, name, color),
      pyra_task_checklist(id, is_checked),
      pyra_task_comments(count),
      pyra_task_attachments(count)
    `)
    .eq('board_id', id)
    .eq('is_archived', false)
    .order('position');

  // Board labels
  const { data: labels } = await supabase
    .from('pyra_board_labels')
    .select('*')
    .eq('board_id', id);

  return apiSuccess({ board, columns, tasks, labels });
}
```

#### Task Move (`app/api/tasks/[taskId]/move/route.ts`)
```typescript
export async function PATCH(req: NextRequest, { params }: { params: { taskId: string } }) {
  const auth = await requireApiPermission('tasks.create');
  if (isApiError(auth)) return auth;

  const { taskId } = await params;
  const { column_id, position } = await req.json();

  const supabase = await createServerSupabaseClient();

  // Get current task
  const { data: task } = await supabase
    .from('pyra_tasks')
    .select('column_id, board_id')
    .eq('id', taskId)
    .single();

  if (!task) return apiNotFound();

  const oldColumnId = task.column_id;

  // Update task column and position
  await supabase
    .from('pyra_tasks')
    .update({ column_id, position, updated_at: new Date().toISOString() })
    .eq('id', taskId);

  // Reorder other tasks in the target column
  // (shift positions to make room)

  // Check if moved to done column
  const { data: col } = await supabase
    .from('pyra_board_columns')
    .select('is_done_column, name')
    .eq('id', column_id)
    .single();

  // Log task activity
  await supabase.from('pyra_task_activity').insert({
    id: generateId('tl'),
    task_id: taskId,
    username: auth.pyraUser.username,
    display_name: auth.pyraUser.display_name,
    action: 'moved',
    details: {
      from_column: oldColumnId,
      to_column: column_id,
      to_column_name: col?.name,
    },
  });

  // Notify assignees if column changed
  if (oldColumnId !== column_id) {
    // Send notification to task assignees
  }

  return apiSuccess({ message: 'تم نقل المهمة' });
}
```

#### My Tasks (`app/api/tasks/my/route.ts`)
```typescript
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const supabase = await createServerSupabaseClient();

  const { data: assignments } = await supabase
    .from('pyra_task_assignees')
    .select(`
      task_id,
      pyra_tasks!inner(
        id, title, description, priority, due_date, position,
        is_archived, created_at,
        pyra_board_columns!inner(id, name, is_done_column, pyra_boards!inner(id, name, pyra_projects!left(id, name))),
        pyra_task_assignees(username, pyra_users!inner(display_name, avatar_url)),
        pyra_task_checklist(id, is_checked)
      )
    `)
    .eq('username', auth.pyraUser.username)
    .eq('pyra_tasks.is_archived', false)
    .eq('pyra_tasks.pyra_board_columns.is_done_column', false)
    .order('pyra_tasks(due_date)', { ascending: true, nullsFirst: false });

  return apiSuccess(assignments);
}
```

### 3.8 Project Integration

> When creating a project, auto-create a default board.

**Add to `app/api/dashboard/projects/route.ts` POST handler:**
```typescript
// After project is created successfully:
const boardId = generateId('bd');
const defaultTemplate = BOARD_TEMPLATES.find(t => t.id === 'general')!;

await supabase.from('pyra_boards').insert({
  id: boardId,
  project_id: projectId,
  name: `لوحة ${projectName}`,
  template: 'general',
  is_default: true,
  created_by: auth.pyraUser.username,
});

const columnInserts = defaultTemplate.columns.map((col, i) => ({
  id: generateId('bc'),
  board_id: boardId,
  name: col.name,
  color: col.color,
  position: i,
  is_done_column: col.isDoneColumn || false,
}));

await supabase.from('pyra_board_columns').insert(columnInserts);
```

**Add Board Tab to Project Detail Page:**
```typescript
// In project detail page, add a new tab:
<TabsTrigger value="board">
  <Kanban className="h-4 w-4 me-1.5" />
  لوحة العمل
</TabsTrigger>

<TabsContent value="board">
  <BoardView projectId={projectId} boardId={defaultBoardId} />
</TabsContent>
```

### 3.9 Standalone Boards Page

**File: `app/dashboard/boards/page.tsx`**
```
┌─────────────────────────────────────────────────────────────────┐
│  لوحات العمل                               [+ لوحة جديدة]      │
│  ───────────────────────────────────────────────────────────────  │
│  [الكل] [مشاريع] [مستقلة]                                       │
│                                                                   │
│  ┌─── مرتبطة بمشاريع ─────────────────────────────────────────┐ │
│  │                                                              │ │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │ │
│  │  │ 🎨 هوية النور    │  │ 📹 فيديو ABC     │                 │ │
│  │  │ مشروع: النور     │  │ مشروع: ABC       │                 │ │
│  │  │ 12 مهمة · 3 أعمد │  │ 8 مهمة · 7 أعمدة │                 │ │
│  │  │ آخر تحديث: اليوم │  │ آخر تحديث: أمس   │                 │ │
│  │  └──────────────────┘  └──────────────────┘                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─── لوحات مستقلة ────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │ │
│  │  │ 📋 مهام داخلية   │  │ 📅 تقويم المحتوى  │                 │ │
│  │  │ 5 مهمة · 4 أعمدة │  │ 20 مهمة · 5 أعمد │                 │ │
│  │  └──────────────────┘  └──────────────────┘                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 3.10 My Tasks Page

**File: `app/dashboard/my-tasks/page.tsx`**
```
┌─────────────────────────────────────────────────────────────────┐
│  مهامي                            [مشروع ▾] [أولوية ▾] [حالة ▾]│
│  ───────────────────────────────────────────────────────────────  │
│                                                                   │
│  ┌─ متأخرة (2) ⚠ ──────────────────────────────────────────── ┐ │
│  │  🔴 تقرير الحملة الإعلانية          متأخر 3 أيام           │ │
│  │     مشروع: ABC · لوحة: إدارة الحملات                        │ │
│  │  🔴 تسليم ملفات الهوية              متأخر يوم واحد          │ │
│  │     مشروع: النور · لوحة: تصميم                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─ اليوم (3) ──────────────────────────────────────────────── ┐ │
│  │  🟠 تصميم الشعار النهائي            أولوية عالية            │ │
│  │     مشروع: النور · ☑ 5/7                                    │ │
│  │  🔵 كتابة محتوى الموقع              أولوية متوسطة           │ │
│  │     مشروع: ABC                                               │ │
│  │  🔵 مراجعة الفيديو الإعلاني         أولوية متوسطة           │ │
│  │     مشروع: XYZ · 💬 3                                       │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─ هذا الأسبوع (5) ────────────────────────────────────────── ┐ │
│  │  ...                                                         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─ لاحقاً (8) ─────────────────────────────────────────────── ┐ │
│  │  ...                                                         │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Grouping Logic:**
```typescript
function groupTasks(tasks: Task[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));

  return {
    overdue: tasks.filter(t => t.due_date && new Date(t.due_date) < today),
    today: tasks.filter(t => t.due_date && isSameDay(new Date(t.due_date), today)),
    thisWeek: tasks.filter(t => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date);
      return d > today && d <= weekEnd;
    }),
    later: tasks.filter(t => {
      if (!t.due_date) return true; // no date = later
      return new Date(t.due_date) > weekEnd;
    }),
  };
}
```

---

## 4. Phase 3: Operations & HR

### 4.1 Timesheet Page

**File: `app/dashboard/timesheet/page.tsx`**

**Weekly Grid View:**
```
┌─────────────────────────────────────────────────────────────────┐
│  سجل الساعات            [◀ الأسبوع السابق] 1-7 مارس [▶]       │
│  ──────────────────────────────────────────────────────────────  │
│                                                                   │
│  ┌──────────── أحد  إثن  ثلا  أرب  خمي  جمع  سبت │ المجموع ┐  │
│  │ مشروع النور  2    3    4    -    2    -    -  │   11h    │  │
│  │ مشروع ABC    -    -    2    3    -    -    -  │    5h    │  │
│  │ مهام داخلية  1    1    -    1    -    -    -  │    3h    │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │ المجموع      3    4    6    4    2    0    0  │   19h    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  [+ إضافة مشروع]                   [حفظ] [إرسال للاعتماد]       │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Announcements Page

**File: `app/dashboard/announcements/page.tsx`**

```
┌─────────────────────────────────────────────────────────────────┐
│  الإعلانات                     [+ إعلان جديد] (admin only)      │
│  ──────────────────────────────────────────────────────────────  │
│                                                                   │
│  ┌─ 📌 مثبت ──────────────────────────────────────────────────┐ │
│  │ ⚡ تحديث سياسة العمل عن بُعد                                │ │
│  │ بدءاً من الشهر القادم، سيتم تطبيق سياسة العمل الهجين...    │ │
│  │ 📅 1 مارس · بواسطة: أحمد (مسؤول)                           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─ الأحدث ────────────────────────────────────────────────── ┐ │
│  │ 🟡 اجتماع الفريق الأسبوعي                    🔵 غير مقروء │ │
│  │ تذكير: الاجتماع الأسبوعي يوم الأحد الساعة 10 صباحاً       │ │
│  │ 📅 منذ ساعتين                                               │ │
│  │                                                              │ │
│  │ 🟢 مرحباً بالزميل الجديد!                                   │ │
│  │ نرحب بانضمام خالد إلى فريق التصميم...                       │ │
│  │ 📅 أمس                                                      │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Leave Management Page

**File: `app/dashboard/leave/page.tsx`**

```
┌─────────────────────────────────────────────────────────────────┐
│  الإجازات                              [+ طلب إجازة]            │
│  ──────────────────────────────────────────────────────────────  │
│                                                                   │
│  ┌─ رصيد الإجازات ────────────────────────────────────────────┐ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │ │
│  │  │  سنوية   │  │  مرضية   │  │  شخصية   │                  │ │
│  │  │  22/30   │  │  13/15   │  │  4/5     │                  │ │
│  │  │ ████████░│  │ █████████│  │ ████████ │                  │ │
│  │  │ 8 متبقي │  │ 2 متبقي  │  │ 1 متبقي  │                  │ │
│  │  └──────────┘  └──────────┘  └──────────┘                  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─ طلباتي ───────────────────────────────────────────────────┐ │
│  │  [الكل] [معلق] [معتمد] [مرفوض]                             │ │
│  │                                                              │ │
│  │  🟡 إجازة سنوية · 5-10 مارس (5 أيام) · معلق               │ │
│  │  🟢 إجازة مرضية · 1 فبراير (1 يوم) · معتمد                 │ │
│  │  🔴 إجازة شخصية · 15 يناير (2 يوم) · مرفوض                │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Integration Hooks

### 5.1 Notification Triggers

Add these notification triggers throughout the system:

| Event | Recipient | Message |
|-------|-----------|---------|
| Task assigned | Assignee | `تم تعيينك في مهمة: {task.title}` |
| Task due tomorrow | Assignee | `مهمة مستحقة غداً: {task.title}` |
| Task overdue | Assignee | `مهمة متأخرة: {task.title}` |
| Task comment added | All assignees | `{author} علّق على مهمة: {task.title}` |
| Task moved to done | Project creator | `تم إكمال مهمة: {task.title}` |
| Leave request submitted | Admins | `{employee} طلب إجازة {type}: {dates}` |
| Leave approved/rejected | Employee | `تم {status} طلب إجازتك` |
| Announcement created | All employees | `إعلان جديد: {title}` |
| Timesheet approved/rejected | Employee | `تم {status} سجل ساعاتك` |

### 5.2 Activity Log Actions

Add these `action_type` values:

```typescript
// Board actions
'board_created', 'board_updated', 'board_deleted',
// Column actions
'column_created', 'column_updated', 'column_deleted', 'column_reordered',
// Task actions
'task_created', 'task_updated', 'task_deleted', 'task_moved',
'task_assigned', 'task_unassigned',
'task_comment_added', 'task_label_added', 'task_label_removed',
'task_checklist_added', 'task_checklist_toggled',
'task_archived', 'task_restored',
// Timesheet
'timesheet_logged', 'timesheet_submitted', 'timesheet_approved', 'timesheet_rejected',
// Leave
'leave_requested', 'leave_approved', 'leave_rejected', 'leave_cancelled',
// Announcement
'announcement_created', 'announcement_updated', 'announcement_deleted',
// Profile
'profile_updated', 'avatar_updated',
```

### 5.3 Dashboard API Labels

Add to `ACTION_LABELS` in `app/dashboard/page.tsx`:
```typescript
// Board & Task actions
board_created: 'إنشاء لوحة',
task_created: 'إنشاء مهمة',
task_moved: 'نقل مهمة',
task_assigned: 'تعيين مهمة',
task_comment_added: 'تعليق على مهمة',
task_completed: 'إكمال مهمة',
// Operations
timesheet_logged: 'تسجيل ساعات',
timesheet_submitted: 'إرسال سجل ساعات',
leave_requested: 'طلب إجازة',
leave_approved: 'اعتماد إجازة',
announcement_created: 'إنشاء إعلان',
profile_updated: 'تحديث الملف الشخصي',
```

---

## 6. Testing Checklist

### Phase 1 Tests
- [ ] Profile page loads for all user roles
- [ ] Avatar upload works (< 2MB images only)
- [ ] Password change validates 12+ chars
- [ ] Role & permissions tab shows correct data (read-only)
- [ ] Employee dashboard shows different widgets than admin
- [ ] Directory page lists all active users
- [ ] Directory filters work (by team, by role)
- [ ] Empty states render correctly for all new pages

### Phase 2 Tests
- [ ] Board creation with template populates columns
- [ ] Task creation via inline add
- [ ] Drag & drop within same column (reorder)
- [ ] Drag & drop between columns (move)
- [ ] Task detail modal opens and shows all fields
- [ ] Task assignee add/remove
- [ ] Task label create/assign/remove
- [ ] Task checklist add/toggle/delete
- [ ] Task comments add/edit
- [ ] My Tasks page aggregates across all boards
- [ ] My Tasks groups correctly (overdue, today, this week, later)
- [ ] Project detail page shows Board tab
- [ ] New project auto-creates default board
- [ ] Standalone boards CRUD
- [ ] Column CRUD (add, rename, reorder, delete)
- [ ] Column WIP limit enforcement (optional)
- [ ] Task move to done column logs completion
- [ ] Notifications sent on task assignment
- [ ] Activity log records all task actions

### Phase 3 Tests
- [ ] Timesheet weekly grid renders correctly
- [ ] Hour entry validates (0-24 range)
- [ ] Submit for approval workflow
- [ ] Admin can approve/reject timesheets
- [ ] Announcements CRUD (admin only)
- [ ] Announcements read tracking per user
- [ ] Urgent announcement shows as banner
- [ ] Leave request submission
- [ ] Leave balance display
- [ ] Leave approval/rejection workflow
- [ ] Leave balance auto-deduction on approval

### Cross-cutting Tests
- [ ] Dark mode works on ALL new pages
- [ ] RTL layout correct (no `ml-`/`mr-` usage)
- [ ] Module guide entries show correctly
- [ ] Sidebar navigation visible based on permissions
- [ ] Empty states use EmptyState component
- [ ] Loading states use Skeleton component
- [ ] Toast notifications for all success/error actions
- [ ] TypeScript: `npx tsc --noEmit` passes
- [ ] Build: `npx next build` succeeds
- [ ] `DATABASE-SCHEMA.md` updated with all new tables

---

## File Map Summary

### New Files (Total: ~45 files)

```
app/dashboard/
  profile/
    page.tsx
    profile-client.tsx
  my-tasks/
    page.tsx
    my-tasks-client.tsx
  boards/
    page.tsx
    boards-client.tsx
    [id]/
      page.tsx
  directory/
    page.tsx
    directory-client.tsx
  timesheet/
    page.tsx
    timesheet-client.tsx
  announcements/
    page.tsx
    announcements-client.tsx
  leave/
    page.tsx
    leave-client.tsx

app/api/
  profile/
    route.ts
    avatar/route.ts
    password/route.ts
  boards/
    route.ts
    [id]/
      route.ts
      columns/route.ts
      columns/[colId]/route.ts
      columns/reorder/route.ts
      tasks/route.ts
  tasks/
    my/route.ts
    [taskId]/
      route.ts
      move/route.ts
      assignees/route.ts
      comments/route.ts
      checklist/route.ts
      checklist/[itemId]/route.ts
      labels/route.ts
      attachments/route.ts
  directory/
    route.ts
  timesheet/
    route.ts
    [id]/route.ts
    submit/route.ts
  announcements/
    route.ts
    [id]/
      route.ts
      read/route.ts
  leave/
    route.ts
    [id]/
      route.ts
      review/route.ts
    balance/route.ts

components/boards/
  board-view.tsx
  board-column.tsx
  board-header.tsx
  task-card.tsx
  task-detail-modal.tsx
  task-comments.tsx
  task-checklist.tsx
  task-assignees.tsx
  task-labels.tsx
  column-create-dialog.tsx
  task-create-inline.tsx
  board-template-picker.tsx
  dnd-context.tsx

lib/config/
  board-templates.ts
```

### Modified Files (Total: ~12 files)

```
lib/auth/rbac.ts                    ← New permissions
lib/config/module-guide.ts          ← New guide entries
components/layout/sidebar.tsx       ← New nav groups
app/dashboard/page.tsx              ← Employee dashboard widgets
app/dashboard/guide/page.tsx        ← New sections
app/api/dashboard/route.ts          ← Employee-specific stats
app/api/dashboard/projects/route.ts ← Auto-create board on project create
app/dashboard/projects/[id]/...     ← Board tab in project detail
DATABASE-SCHEMA.md                  ← New tables documentation
```

---

*End of Implementation Guide*
