-- ============================================================
-- MIGRATION: Employee System v1.0
-- Pyra Workspace 3.0
-- Date: 2026-03-04
-- Run in: Supabase SQL Editor (https://pyraworkspacedb.pyramedia.cloud)
-- ============================================================

-- ──────────────────────────────────────────
-- PHASE 1: Employee Profile Extensions
-- ──────────────────────────────────────────

ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

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

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
