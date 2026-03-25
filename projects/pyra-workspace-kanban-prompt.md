# Prompt: Fix & Complete Task Management Boards — Trello-Style

## Context
We have an existing Kanban board system in pyra-workspace3 that needs to be fixed and completed. It's partially built but not fully working or integrated.

**What ALREADY exists (don't rebuild — fix and enhance):**
- DB tables: `pyra_boards`, `pyra_board_columns`, `pyra_board_labels`, `pyra_tasks`, `pyra_task_assignees`, `pyra_task_labels`, `pyra_task_checklist`, `pyra_task_comments`, `pyra_task_attachments`, `pyra_task_activity`
- API routes: `app/api/boards/` (boards CRUD, columns, tasks, attachments)
- Pages: `app/dashboard/boards/` (list + board view), `app/dashboard/my-tasks/`
- Sidebar: "لوحات العمل" + "مهامي" already added
- RBAC: `boards.view`, `boards.manage`, `tasks.view`, `tasks.create`, `tasks.manage` already defined
- Board templates: 6 templates in `lib/config/board-templates.ts` (General, Content, Design, Campaign, Video, Social Media)
- Component: `board-view-client.tsx` (1806 lines), `components/projects/project-kanban.tsx`

**The purpose:** I manage marketing, digital, and content teams. I need this board to:
1. Assign tasks to team members and track who's doing what
2. Manage content production, campaigns, and design projects visually
3. See at a glance what's overdue, what's in progress, what's done
4. Have it fully integrated with our existing Projects, Clients, Teams, and Settings

---

## Phase 1: Audit & Fix Current Board System

Read ALL board-related files first, then fix everything that's broken:

1. **Read and understand:** `app/dashboard/boards/[id]/board-view-client.tsx`, `app/dashboard/boards/boards-client.tsx`, all API routes in `app/api/boards/`, `components/projects/project-kanban.tsx`, `app/dashboard/my-tasks/my-tasks-client.tsx`
2. **Fix drag & drop:** Ensure @dnd-kit works for BOTH moving cards between columns AND reordering columns
3. **Fix card display:** Each card on the board must show: title, colored label bars, assignee avatars (stacked), due date (red if overdue), priority dot/badge, checklist progress bar (if has checklist), attachment count icon, comment count icon
4. **Fix column headers:** Card count badge, "+" quick-add button, column color indicator (top border), drag handle
5. **Fix API routes:** Test all CRUD for boards, columns, tasks, assignees, labels, checklist, comments, attachments. Fix any broken endpoints.
6. **Run `pnpm run check`** — fix ALL TypeScript errors

---

## Phase 2: Complete Task Card Modal (Like Trello)

When clicking a card on the board, open a **full-featured dialog**:

### Layout (RTL Arabic):
```
┌────────────────────────────────────────────────┐
│  [عنوان المهمة — inline editable]              │
│  في قائمة: [اسم العمود] ← clickable to move    │
├──────────────────────────┬─────────────────────┤
│  Main Content (70%)      │  Sidebar (30%)      │
│                          │                     │
│  📝 الوصف               │  👥 الأعضاء          │
│  [Textarea/markdown]     │  🏷️ التصنيفات       │
│                          │  📅 تاريخ البداية    │
│  ✅ قوائم التحقق         │  📅 تاريخ الاستحقاق  │
│  [Checklists + progress] │  ⏱️ الساعات المقدرة  │
│                          │  ⏱️ الساعات الفعلية  │
│  💬 التعليقات            │  🔴 الأولوية         │
│  [Comment thread]        │  📎 إضافة مرفق      │
│                          │  🖼️ صورة الغلاف     │
│  📎 المرفقات             │  🔗 ربط بمشروع       │
│  [File list + upload]    │  📋 نقل إلى لوحة    │
│                          │  📦 أرشفة            │
│  📋 سجل النشاط          │  🗑️ حذف             │
│  [Activity timeline]     │                     │
└──────────────────────────┴─────────────────────┘
```

### Features:
- **Inline title editing** — click to edit, Enter to save
- **Description** — textarea, saves on blur
- **Assignees** — search users dropdown, show avatars, multiple assignees
- **Labels** — select from board labels, create new labels with color picker
- **Due date** — date picker, show warning badge if overdue, highlight color
- **Priority** — urgent (red) / high (orange) / medium (blue) / low (gray)
- **Checklists** — add multiple checklists, each with items, drag reorder, progress bar, delete
- **Comments** — user avatar + name + timestamp, edit/delete own, newest first
- **Attachments** — upload to Supabase Storage, image preview, download, delete
- **Activity log** — auto-logged timeline: created, moved, assigned, label change, etc.
- **Cover image** — set from attachments, shows on card in board view
- **Time tracking** — estimated_hours + actual_hours fields

---

## Phase 3: Board View Enhancements

### Board Toolbar:
- **Filter by:** assignee (dropdown), label (multi-select), priority (buttons), due date (overdue/today/this week/no date)
- **Search:** search cards by title in real-time
- **Sort:** manual (drag), due date, priority, created date
- **View toggle:** Kanban view (default) | List view (table)
- **Board settings button** → opens board settings modal

### Kanban View Improvements:
- Column drag-to-reorder (horizontal @dnd-kit)
- Column menu (⋮): rename, change color, mark as "done column", delete with confirmation
- Smooth drag animations for cards
- Card count per column in header
- Quick-add card: click "+" → show inline input at bottom of column → Enter to create

### List View (Table Alternative):
- Sortable table with columns: Title, Status (column), Assignees, Priority, Due Date, Labels, Checklist Progress
- Click row → open card modal
- Bulk actions: select multiple → move to column, assign, change priority, archive

### Realtime Updates:
- Subscribe to board changes via Supabase Realtime
- When another user moves a card or adds a comment → update UI live

---

## Phase 4: Integration with Existing System

### 4a. Projects Integration
- `pyra_boards.project_id` FK already exists → make it work
- Project detail page (`app/dashboard/projects/[id]/`) → show embedded board (fix `project-board-embed.tsx`)
- When creating a project → option to "Create task board" with template selection
- Board header shows linked project name + client name (clickable)

### 4b. Teams Integration
- When assigning tasks → show team members dropdown grouped by team (`pyra_teams` + `pyra_team_members`)
- Board-level team assignment: assign a team to a board → only team members can be assigned tasks
- Team filter in board toolbar

### 4c. Client Integration
- Boards can be linked to clients (through projects)
- Client detail page → show their project boards
- In portal: clients can view their project boards in READ-ONLY mode (if enabled)

### 4d. Dashboard Integration
- Add to main dashboard (`app/dashboard/page.tsx`) a "مهامي" widget:
  - Overdue tasks count (red badge)
  - Tasks due today
  - Tasks assigned to me (active count)
  - Quick link to my-tasks page

### 4e. My Tasks Page Enhancement
- Page already exists at `app/dashboard/my-tasks/` — enhance it:
  - Group by: board, priority, due date, project
  - Calendar view (optional, stretch goal)
  - Quick status change: click to advance task to next column
  - Bulk actions

### 4f. Notifications & Activity
- Task assignment → create notification in `pyra_notifications`
- Task comment → notify assignees
- Due date approaching (1 day before) → notification
- All task actions → `logActivity()` to `pyra_activity_log`

---

## Phase 5: Board Settings in Settings Page ⚙️

**This is CRITICAL — add a new settings group to `app/dashboard/settings/settings-client.tsx`:**

### Add new group: "لوحات العمل" (Boards)
Follow the EXACT same pattern as existing settings groups. Add to `SETTING_LABELS`:

```typescript
// Boards Settings
board_default_template: { label: 'القالب الافتراضي', description: 'القالب المستخدم عند إنشاء لوحة جديدة', group: 'boards', placeholder: 'general' },
board_auto_create_with_project: { label: 'إنشاء لوحة تلقائياً مع المشروع', description: 'عند إنشاء مشروع جديد، تُنشأ لوحة مهام تلقائياً', group: 'boards' },
board_require_due_date: { label: 'إلزام تاريخ الاستحقاق', description: 'لا يمكن إنشاء مهمة بدون تاريخ استحقاق', group: 'boards' },
board_enable_time_tracking: { label: 'تفعيل تتبع الوقت', description: 'إظهار حقول الساعات المقدرة والفعلية في المهام', group: 'boards' },
board_overdue_notification: { label: 'إشعار المهام المتأخرة', description: 'إرسال إشعار تلقائي عند تأخر المهمة', group: 'boards' },
board_notify_on_assign: { label: 'إشعار عند التعيين', description: 'إرسال إشعار للعضو عند تعيينه على مهمة', group: 'boards' },
board_notify_on_comment: { label: 'إشعار عند التعليق', description: 'إرسال إشعار عند إضافة تعليق على مهمة معينة', group: 'boards' },
board_client_portal_visible: { label: 'عرض للعملاء في البورتال', description: 'السماح للعملاء بمشاهدة لوحات مشاريعهم (قراءة فقط)', group: 'boards' },
board_max_attachments_mb: { label: 'أقصى حجم مرفقات المهمة (MB)', description: 'الحد الأقصى لحجم المرفقات لكل مهمة', group: 'boards', placeholder: '25' },
board_done_auto_archive_days: { label: 'أرشفة تلقائية (أيام)', description: 'أرشفة المهام المكتملة تلقائياً بعد هذه المدة (0 = معطّل)', group: 'boards', placeholder: '0' },
```

Add to `GROUPS` array:
```typescript
{ key: 'boards', label: 'لوحات العمل', icon: Kanban, gradient: 'from-blue-500 to-cyan-600', category: 'business',
  tip: 'إعدادات لوحات المهام والمشاريع. تتحكم في القوالب الافتراضية والإشعارات وتتبع الوقت.' },
```

### Board-Level Settings (per board):
Each board should have its own settings modal (accessible from board toolbar):
- Board name + description (edit)
- Template info (read-only after creation)
- Team assignment (which team works on this board)
- Column management (add/reorder/rename/delete/set color/mark as done)
- Label management (add/edit/delete labels with colors)
- Default assignee per column (optional)
- Board visibility (who can see: all, team only, specific users)
- Archive settings
- Delete board (with "type board name to confirm" safety)

---

## Phase 6: Module Guide Entry

Add board system to `lib/config/module-guide.ts` — follow existing pattern:

```typescript
'/dashboard/boards': {
  title: 'لوحات العمل',
  description: 'نظام إدارة المهام المرئي — مثل Trello. أنشئ لوحات لمشاريعك، أضف مهام، عيّن أعضاء الفريق، وتابع التقدم.',
  sections: [
    { title: 'إنشاء لوحة', content: 'اختر قالباً جاهزاً (عام، محتوى، تصميم، حملة، فيديو، سوشال) أو ابدأ من الصفر. كل قالب يأتي بأعمدة وتصنيفات مخصصة.' },
    { title: 'إدارة المهام', content: 'أضف مهام، عيّن أعضاء، حدد الأولوية والتاريخ، وتابع التقدم. اسحب المهام بين الأعمدة لتحديث الحالة.' },
    { title: 'التكامل مع المشاريع', content: 'اربط اللوحة بمشروع لرؤية مهامه مباشرة. العملاء يمكنهم مشاهدة التقدم من البورتال.' },
  ],
},
'/dashboard/my-tasks': {
  title: 'مهامي',
  description: 'جميع المهام المعيّنة لك في مكان واحد، مجمعة حسب اللوحة أو الأولوية أو التاريخ.',
  sections: [],
},
```

---

## Technical Requirements (MUST follow)

Read `CLAUDE.md` at the root of the project. Follow ALL rules, especially:
- **RTL**: `ms-`/`me-`/`ps-`/`pe-`/`text-start`/`text-end` — NEVER `ml-`/`mr-`/`text-left`
- **Dark mode**: Every `bg-*-50` needs `dark:bg-*-950/30`, every `text-*-600` needs `dark:text-*-400`
- **Arabic UI**: All visible text in Arabic
- **Components**: shadcn/ui (Dialog, Card, Badge, Button, etc.), EmptyState, Skeleton, toast from sonner
- **@dnd-kit**: For ALL drag-and-drop (already installed)
- **API auth**: `requireApiPermission()` or `requireApiAuth()` from `@/lib/api/auth`
- **API response**: `apiSuccess()`/`apiError()` from `@/lib/api/response`
- **Activity logging**: `logActivity()` for all write operations
- **TypeScript strict**: No `any` types (fix existing ones too)
- **Code English, UI Arabic**

---

## Execution Order

1. **READ everything first** — all board files, CLAUDE.md, DATABASE-SCHEMA.md, FEATURE-IMPACT-MAP.md
2. **Phase 1** — Audit + fix existing → `pnpm run check`
3. **Phase 2** — Complete card modal → `pnpm run check`
4. **Phase 3** — Board view enhancements → `pnpm run check`
5. **Phase 4** — System integration → `pnpm run check`
6. **Phase 5** — Settings page → `pnpm run check`
7. **Phase 6** — Module guide → `pnpm run check`
8. **Final** — `pnpm build` → zero errors → git commit & push

**CRITICAL:** Run `pnpm run check` after EVERY phase. Don't accumulate errors.

---

## What NOT to Do
- ❌ Don't rebuild from scratch — fix and enhance what exists
- ❌ Don't break ANY existing features
- ❌ Don't skip dark mode or RTL pairing
- ❌ Don't use `alert()` — use `toast` from sonner
- ❌ Don't leave loading states blank — use `<Skeleton>`
- ❌ Don't create new UI components when shadcn/ui has them
- ❌ Don't skip `logActivity()` on write operations
- ❌ Don't forget to update sidebar badges (overdue task count)
- ❌ Don't use `any` types — define proper interfaces
