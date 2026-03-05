-- ============================================================
-- Pyra Workspace — ERP Features Migration
-- Run this in Supabase SQL Editor BEFORE deploying the code
-- ============================================================

-- ============================================================
-- WAVE 1: Employee Foundation
-- ============================================================

-- 1A: Employee Classification — new columns on pyra_users
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS employment_type varchar(30) DEFAULT 'full_time';
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS work_location varchar(20) DEFAULT 'onsite';
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS payment_type varchar(30) DEFAULT 'monthly_salary';
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS salary numeric(12,2) DEFAULT 0;
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS hourly_rate numeric(8,2) DEFAULT 0;
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS hire_date date;
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS national_id text;
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS bank_details jsonb DEFAULT '{}';
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS department varchar(100);

-- 1B: Reporting Manager Hierarchy
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS manager_username varchar;
CREATE INDEX IF NOT EXISTS idx_users_manager ON pyra_users(manager_username);

-- 1C: Cleanup — archive unused table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pyra_file_permissions') THEN
    ALTER TABLE pyra_file_permissions RENAME TO pyra_file_permissions_archived;
  END IF;
END $$;

-- ============================================================
-- WAVE 2: Leave Enhancements
-- ============================================================

-- 2A: Custom Leave Types
CREATE TABLE IF NOT EXISTS pyra_leave_types (
  id varchar(20) PRIMARY KEY,
  name varchar(100) NOT NULL,
  name_ar varchar(100) NOT NULL,
  icon varchar(50) DEFAULT 'CalendarOff',
  color varchar(20) DEFAULT 'gray',
  default_days integer NOT NULL DEFAULT 0,
  max_carry_over integer DEFAULT 0,
  requires_attachment boolean DEFAULT false,
  is_paid boolean DEFAULT true,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Seed default types
INSERT INTO pyra_leave_types (id, name, name_ar, icon, color, default_days, max_carry_over, sort_order)
VALUES
  ('lt_annual', 'Annual', 'سنوية', 'Sun', 'orange', 30, 10, 1),
  ('lt_sick', 'Sick', 'مرضية', 'Stethoscope', 'blue', 15, 0, 2),
  ('lt_personal', 'Personal', 'شخصية', 'UserCircle', 'purple', 5, 0, 3)
ON CONFLICT (id) DO NOTHING;

-- 2A: Dynamic Leave Balances
CREATE TABLE IF NOT EXISTS pyra_leave_balances_v2 (
  id varchar(20) PRIMARY KEY,
  username varchar NOT NULL,
  year integer NOT NULL,
  leave_type_id varchar(20) NOT NULL REFERENCES pyra_leave_types(id),
  total_days integer NOT NULL DEFAULT 0,
  used_days integer NOT NULL DEFAULT 0,
  carried_over integer NOT NULL DEFAULT 0,
  UNIQUE(username, year, leave_type_id)
);

CREATE INDEX IF NOT EXISTS idx_leave_bal_v2_user ON pyra_leave_balances_v2(username, year);

-- 2B: Leave Cancellation
ALTER TABLE pyra_leave_requests ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE pyra_leave_requests ADD COLUMN IF NOT EXISTS cancelled_by varchar;
ALTER TABLE pyra_leave_requests ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- ============================================================
-- WAVE 3: Time & Attendance
-- ============================================================

-- 3A: Work Schedules
CREATE TABLE IF NOT EXISTS pyra_work_schedules (
  id varchar(20) PRIMARY KEY,
  name varchar(100) NOT NULL,
  name_ar varchar(100) NOT NULL,
  work_days jsonb NOT NULL DEFAULT '[0,1,2,3,4]',
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '18:00',
  break_minutes integer DEFAULT 60,
  daily_hours numeric(4,2) DEFAULT 8,
  overtime_multiplier numeric(3,2) DEFAULT 1.5,
  weekend_multiplier numeric(3,2) DEFAULT 2.0,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- UAE default (Sun-Thu)
INSERT INTO pyra_work_schedules (id, name, name_ar, work_days, start_time, end_time, is_default)
VALUES ('ws_default', 'Standard UAE', 'دوام معياري', '[0,1,2,3,4]', '09:00', '18:00', true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS work_schedule_id varchar(20) REFERENCES pyra_work_schedules(id);

-- 3A: Attendance
CREATE TABLE IF NOT EXISTS pyra_attendance (
  id varchar(20) PRIMARY KEY,
  username varchar NOT NULL,
  date date NOT NULL,
  clock_in timestamptz,
  clock_out timestamptz,
  total_hours numeric(5,2) DEFAULT 0,
  status varchar(20) DEFAULT 'present',
  notes text,
  ip_address varchar(45),
  created_at timestamptz DEFAULT now(),
  UNIQUE(username, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON pyra_attendance(username, date);

-- 3B: Timesheet Periods
CREATE TABLE IF NOT EXISTS pyra_timesheet_periods (
  id varchar(20) PRIMARY KEY,
  username varchar NOT NULL,
  period_type varchar(20) NOT NULL DEFAULT 'weekly',
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_hours numeric(6,2) DEFAULT 0,
  status varchar(20) DEFAULT 'open',
  submitted_at timestamptz,
  approved_by varchar,
  approved_at timestamptz,
  rejection_note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ts_period_user ON pyra_timesheet_periods(username, start_date);

ALTER TABLE pyra_timesheets ADD COLUMN IF NOT EXISTS period_id varchar(20) REFERENCES pyra_timesheet_periods(id);

-- 3C: Overtime fields on timesheets
ALTER TABLE pyra_timesheets ADD COLUMN IF NOT EXISTS is_overtime boolean DEFAULT false;
ALTER TABLE pyra_timesheets ADD COLUMN IF NOT EXISTS overtime_multiplier numeric(3,2) DEFAULT 1.5;

-- ============================================================
-- WAVE 4: Financial
-- ============================================================

-- 4A: Per-Task Payment fields
ALTER TABLE pyra_tasks ADD COLUMN IF NOT EXISTS payment_amount numeric(10,2) DEFAULT 0;
ALTER TABLE pyra_tasks ADD COLUMN IF NOT EXISTS payment_currency varchar(3) DEFAULT 'AED';
ALTER TABLE pyra_tasks ADD COLUMN IF NOT EXISTS payment_status varchar(20) DEFAULT 'unpaid';
ALTER TABLE pyra_tasks ADD COLUMN IF NOT EXISTS task_hourly_rate numeric(8,2);

-- 4A: Employee Payments Ledger
CREATE TABLE IF NOT EXISTS pyra_employee_payments (
  id varchar(20) PRIMARY KEY,
  username varchar NOT NULL,
  source_type varchar(30) NOT NULL,
  source_id varchar(20),
  description text,
  amount numeric(10,2) NOT NULL,
  currency varchar(3) DEFAULT 'AED',
  status varchar(20) DEFAULT 'pending',
  payroll_id varchar(20),
  approved_by varchar,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emp_payments_user ON pyra_employee_payments(username);
CREATE INDEX IF NOT EXISTS idx_emp_payments_payroll ON pyra_employee_payments(payroll_id);

-- 4B: Payroll System
CREATE TABLE IF NOT EXISTS pyra_payroll_runs (
  id varchar(20) PRIMARY KEY,
  month integer NOT NULL,
  year integer NOT NULL,
  status varchar(20) DEFAULT 'draft',
  total_amount numeric(14,2) DEFAULT 0,
  currency varchar(3) DEFAULT 'AED',
  employee_count integer DEFAULT 0,
  calculated_at timestamptz,
  approved_by varchar,
  approved_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_by varchar NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(month, year)
);

CREATE TABLE IF NOT EXISTS pyra_payroll_items (
  id varchar(20) PRIMARY KEY,
  payroll_id varchar(20) NOT NULL REFERENCES pyra_payroll_runs(id),
  username varchar NOT NULL,
  base_salary numeric(12,2) DEFAULT 0,
  task_payments numeric(12,2) DEFAULT 0,
  overtime_amount numeric(12,2) DEFAULT 0,
  bonus numeric(12,2) DEFAULT 0,
  deductions numeric(12,2) DEFAULT 0,
  deduction_details jsonb DEFAULT '[]',
  net_pay numeric(12,2) DEFAULT 0,
  status varchar(20) DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON pyra_payroll_items(payroll_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_user ON pyra_payroll_items(username);

-- ============================================================
-- WAVE 5: Advanced
-- ============================================================

-- 5A: Performance Evaluation
CREATE TABLE IF NOT EXISTS pyra_evaluation_periods (
  id varchar(20) PRIMARY KEY,
  name varchar(200) NOT NULL,
  name_ar varchar(200) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status varchar(20) DEFAULT 'draft',
  created_by varchar NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pyra_evaluation_criteria (
  id varchar(20) PRIMARY KEY,
  name varchar(200) NOT NULL,
  name_ar varchar(200) NOT NULL,
  description text,
  weight numeric(5,2) DEFAULT 1.0,
  category varchar(50),
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pyra_evaluations (
  id varchar(20) PRIMARY KEY,
  period_id varchar(20) NOT NULL REFERENCES pyra_evaluation_periods(id),
  employee_username varchar NOT NULL,
  evaluator_username varchar NOT NULL,
  evaluation_type varchar(30) DEFAULT 'manager',
  overall_rating numeric(3,1),
  status varchar(20) DEFAULT 'draft',
  comments text,
  strengths text,
  improvements text,
  submitted_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pyra_evaluation_scores (
  id varchar(20) PRIMARY KEY,
  evaluation_id varchar(20) NOT NULL REFERENCES pyra_evaluations(id) ON DELETE CASCADE,
  criteria_id varchar(20) NOT NULL REFERENCES pyra_evaluation_criteria(id),
  score numeric(3,1) NOT NULL,
  comment text,
  UNIQUE(evaluation_id, criteria_id)
);

CREATE TABLE IF NOT EXISTS pyra_kpi_targets (
  id varchar(20) PRIMARY KEY,
  username varchar NOT NULL,
  period_id varchar(20) REFERENCES pyra_evaluation_periods(id),
  title varchar(300) NOT NULL,
  target_value numeric(12,2),
  actual_value numeric(12,2) DEFAULT 0,
  unit varchar(50),
  status varchar(20) DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_period ON pyra_evaluations(period_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_employee ON pyra_evaluations(employee_username);
CREATE INDEX IF NOT EXISTS idx_kpi_user ON pyra_kpi_targets(username);

-- 5B: Content Production Pipeline
CREATE TABLE IF NOT EXISTS pyra_content_pipeline (
  id varchar(20) PRIMARY KEY,
  project_id varchar(20) REFERENCES pyra_projects(id),
  title varchar(500) NOT NULL,
  content_type varchar(50) DEFAULT 'video',
  current_stage varchar(50) DEFAULT 'scripting',
  assigned_to varchar,
  script_review_id varchar(20),
  deadline date,
  notes text,
  created_by varchar NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pyra_pipeline_stages (
  id varchar(20) PRIMARY KEY,
  pipeline_id varchar(20) NOT NULL REFERENCES pyra_content_pipeline(id) ON DELETE CASCADE,
  stage varchar(50) NOT NULL,
  status varchar(20) DEFAULT 'pending',
  assigned_to varchar,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_project ON pyra_content_pipeline(project_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages ON pyra_pipeline_stages(pipeline_id);

-- ============================================================
-- Seed default evaluation criteria
-- ============================================================
INSERT INTO pyra_evaluation_criteria (id, name, name_ar, category, weight, sort_order) VALUES
  ('evc_quality', 'Work Quality', 'جودة العمل', 'technical', 1.0, 1),
  ('evc_productivity', 'Productivity', 'الإنتاجية', 'technical', 1.0, 2),
  ('evc_communication', 'Communication', 'التواصل', 'behavioral', 0.8, 3),
  ('evc_teamwork', 'Teamwork', 'العمل الجماعي', 'behavioral', 0.8, 4),
  ('evc_initiative', 'Initiative', 'المبادرة', 'behavioral', 0.7, 5),
  ('evc_reliability', 'Reliability', 'الموثوقية', 'technical', 0.9, 6)
ON CONFLICT (id) DO NOTHING;
