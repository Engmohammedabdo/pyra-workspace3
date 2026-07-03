-- 033_production_board.sql
-- Data-only: production pipeline board + members + Egypt work schedule.
-- Remote-production-tracking (spec 2026-07-03). Idempotent (ON CONFLICT DO NOTHING).

INSERT INTO pyra_boards (id, name, description, is_default, position, created_by, view_mode, is_pipeline, auto_advance)
VALUES ('bd_production', 'الإنتاج', 'لوحة تتبع شغل الإنتاج (فيديو + تصميم) للموظفين الريموت — خام → تنفيذ → مراجعة → معتمد → تسليم', false, 99, 'system', 'kanban', true, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO pyra_board_columns (id, board_id, name, color, position, is_done_column, requires_approval, column_type) VALUES
  ('col_prod_new',      'bd_production', 'جديد',          '#6b7280', 0, false, false, 'backlog'),
  ('col_prod_wip',      'bd_production', 'قيد التنفيذ',   '#3b82f6', 1, false, false, 'in_progress'),
  ('col_prod_review',   'bd_production', 'جاهز للمراجعة', '#f59e0b', 2, false, false, 'review'),
  ('col_prod_approved', 'bd_production', 'معتمد',         '#10b981', 3, false, true,  'approved'),
  ('col_prod_done',     'bd_production', 'تم التسليم',    '#22c55e', 4, true,  false, 'delivery')
ON CONFLICT (id) DO NOTHING;

INSERT INTO pyra_board_members (id, board_id, username, role, added_by) VALUES
  ('bm_prod_wael', 'bd_production', 'wael.hany',            'editor', 'system'),
  ('bm_prod_abdo', 'bd_production', 'abdelrahman.morshedy', 'editor', 'system')
ON CONFLICT (id) DO NOTHING;

-- Egypt production schedule. Times are stored in UAE clock (attendance
-- computes "today"/lateness at UTC+4): Egypt 10:00–18:00 = UAE 12:00–20:00.
-- Work week Mon–Sat (company weekend = Sunday only, day 0).
-- Abdou can adjust times later from /dashboard/hr/work-schedules.
INSERT INTO pyra_work_schedules (id, name, name_ar, work_days, start_time, end_time, break_minutes, daily_hours, overtime_multiplier, weekend_multiplier, is_default)
VALUES ('ws_egypt_production', 'Egypt Production', 'دوام الإنتاج — مصر', '[1,2,3,4,5,6]'::jsonb, '12:00', '20:00', 60, 8, 1.5, 1.5, false)
ON CONFLICT (id) DO NOTHING;

UPDATE pyra_users
SET work_schedule_id = 'ws_egypt_production'
WHERE username IN ('wael.hany', 'abdelrahman.morshedy')
  AND (work_schedule_id IS NULL OR work_schedule_id = '');
