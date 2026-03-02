-- ============================================
-- Pyra Workspace 3: RBAC Migration
-- Run this SQL in your Supabase SQL Editor
-- Creates pyra_roles table, seeds default roles,
-- adds role_id to pyra_users, updates RPC & views
-- ============================================

-- ============================================
-- 1. Create pyra_roles table
-- ============================================

CREATE TABLE IF NOT EXISTS pyra_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  description TEXT,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_system BOOLEAN DEFAULT FALSE,
  color TEXT DEFAULT 'gray',
  icon TEXT DEFAULT 'Shield',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pyra_roles_name ON pyra_roles(name);

ALTER TABLE pyra_roles DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. Seed 6 default system roles
-- ============================================

INSERT INTO pyra_roles (name, name_ar, description, permissions, is_system, color, icon) VALUES
(
  'super_admin',
  'المدير العام',
  'صلاحيات كاملة على جميع أجزاء النظام',
  ARRAY['*'],
  TRUE,
  'red',
  'Crown'
),
(
  'admin',
  'مسؤول',
  'صلاحيات إدارية شاملة بدون إدارة الأدوار',
  ARRAY[
    'dashboard.view',
    'files.view', 'files.upload', 'files.edit', 'files.delete', 'files.share',
    'projects.view', 'projects.create', 'projects.edit', 'projects.delete',
    'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
    'quotes.view', 'quotes.create', 'quotes.edit', 'quotes.delete',
    'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete',
    'finance.view', 'finance.manage',
    'users.view', 'users.manage',
    'teams.view', 'teams.manage',
    'reports.view',
    'settings.view', 'settings.manage',
    'automations.view', 'automations.manage',
    'knowledge_base.view', 'knowledge_base.manage',
    'integrations.view', 'integrations.manage',
    'activity.view',
    'trash.view', 'trash.restore', 'trash.purge',
    'sessions.view', 'sessions.manage',
    'reviews.view', 'reviews.manage',
    'notifications.view',
    'favorites.view', 'favorites.manage',
    'script_reviews.view', 'script_reviews.manage'
  ],
  TRUE,
  'orange',
  'Shield'
),
(
  'project_manager',
  'مدير مشاريع',
  'إدارة المشاريع والملفات والعملاء وعروض الأسعار',
  ARRAY[
    'dashboard.view',
    'files.view', 'files.upload', 'files.edit', 'files.share',
    'projects.view', 'projects.create', 'projects.edit',
    'clients.view', 'clients.create', 'clients.edit',
    'quotes.view', 'quotes.create', 'quotes.edit',
    'invoices.view',
    'teams.view',
    'reports.view',
    'activity.view',
    'reviews.view', 'reviews.manage',
    'notifications.view',
    'favorites.view', 'favorites.manage',
    'script_reviews.view', 'script_reviews.manage',
    'trash.view', 'trash.restore'
  ],
  TRUE,
  'blue',
  'Briefcase'
),
(
  'content_creator',
  'صانع محتوى',
  'إدارة الملفات والمراجعات مع صلاحيات عرض المشاريع',
  ARRAY[
    'dashboard.view',
    'files.view', 'files.upload', 'files.edit',
    'projects.view',
    'reviews.view', 'reviews.manage',
    'notifications.view',
    'favorites.view', 'favorites.manage',
    'script_reviews.view',
    'trash.view'
  ],
  TRUE,
  'purple',
  'Palette'
),
(
  'accountant',
  'محاسب',
  'إدارة الشؤون المالية والفواتير والتقارير',
  ARRAY[
    'dashboard.view',
    'finance.view', 'finance.manage',
    'invoices.view', 'invoices.create', 'invoices.edit',
    'quotes.view',
    'clients.view',
    'reports.view',
    'notifications.view',
    'activity.view'
  ],
  TRUE,
  'green',
  'Calculator'
),
(
  'viewer',
  'مشاهد',
  'صلاحيات عرض فقط بدون تعديل',
  ARRAY[
    'dashboard.view',
    'files.view',
    'projects.view',
    'notifications.view',
    'favorites.view', 'favorites.manage'
  ],
  TRUE,
  'gray',
  'Eye'
)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 3. Add role_id to pyra_users
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pyra_users' AND column_name = 'role_id'
  ) THEN
    ALTER TABLE pyra_users ADD COLUMN role_id UUID REFERENCES pyra_roles(id);
  END IF;
END$$;

-- Migrate existing users
UPDATE pyra_users SET role_id = (SELECT id FROM pyra_roles WHERE name = 'super_admin')
WHERE role = 'admin' AND role_id IS NULL;

UPDATE pyra_users SET role_id = (SELECT id FROM pyra_roles WHERE name = 'viewer')
WHERE role = 'employee' AND role_id IS NULL;

UPDATE pyra_users SET role_id = (SELECT id FROM pyra_roles WHERE name = 'viewer')
WHERE role_id IS NULL;

-- ============================================
-- 4. Update v_user_activity_summary view
-- Add role_name_ar and role_color from pyra_roles
-- ============================================

DROP VIEW IF EXISTS v_user_activity_summary CASCADE;
CREATE VIEW v_user_activity_summary AS
SELECT
    u.username,
    u.display_name,
    u.role,
    r.name_ar AS role_name_ar,
    r.color AS role_color,
    COALESCE(activity.action_count, 0) AS actions_last_30_days,
    activity.last_action_at,
    COALESCE(uploads.upload_count, 0) AS uploads_last_30_days,
    COALESCE(comments.comment_count, 0) AS comments_last_30_days
FROM pyra_users u
LEFT JOIN pyra_roles r ON r.id = u.role_id
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) AS action_count,
        MAX(created_at) AS last_action_at
    FROM pyra_activity_log
    WHERE username = u.username
      AND created_at > NOW() - INTERVAL '30 days'
) activity ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS upload_count
    FROM pyra_activity_log
    WHERE username = u.username
      AND action_type IN ('file_upload', 'file_create')
      AND created_at > NOW() - INTERVAL '30 days'
) uploads ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS comment_count
    FROM pyra_activity_log
    WHERE username = u.username
      AND action_type IN ('comment_created', 'client_comment', 'review_added')
      AND created_at > NOW() - INTERVAL '30 days'
) comments ON true;

-- ============================================
-- 5. Update check_path_access RPC
-- Replace role='admin' check with role permissions check
-- ============================================

CREATE OR REPLACE FUNCTION check_path_access(
    p_username TEXT,
    p_path TEXT,
    p_action TEXT DEFAULT 'read'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_user RECORD;
    v_role_perms TEXT[];
    v_permissions JSONB;
    v_team_perms JSONB;
    v_file_perm RECORD;
    v_allowed_paths JSONB;
    v_check_path TEXT;
BEGIN
    -- Get user data including role_id
    SELECT role, role_id, permissions INTO v_user
    FROM pyra_users WHERE username = p_username;

    -- Check role permissions for wildcard access
    IF v_user.role_id IS NOT NULL THEN
        SELECT permissions INTO v_role_perms
        FROM pyra_roles WHERE id = v_user.role_id;
        IF v_role_perms IS NOT NULL AND '*' = ANY(v_role_perms) THEN
            RETURN TRUE;
        END IF;
    ELSE
        -- Backward compat: old role column
        IF v_user.role = 'admin' THEN
            RETURN TRUE;
        END IF;
    END IF;

    v_permissions := v_user.permissions;

    -- 1) Check directly allowed paths
    v_allowed_paths := v_permissions -> 'allowed_paths';
    IF v_allowed_paths IS NOT NULL THEN
        FOR i IN 0..jsonb_array_length(v_allowed_paths) - 1 LOOP
            v_check_path := v_allowed_paths ->> i;
            IF p_path = v_check_path OR p_path LIKE v_check_path || '/%' THEN
                CASE p_action
                    WHEN 'read' THEN RETURN TRUE;
                    WHEN 'upload' THEN
                        RETURN COALESCE((v_permissions ->> 'can_upload')::BOOLEAN, FALSE);
                    WHEN 'write' THEN
                        RETURN COALESCE((v_permissions ->> 'can_edit')::BOOLEAN, FALSE);
                    WHEN 'delete' THEN
                        RETURN COALESCE((v_permissions ->> 'can_delete')::BOOLEAN, FALSE);
                    ELSE RETURN FALSE;
                END CASE;
            END IF;
        END LOOP;
    END IF;

    -- 2) Check team permissions
    FOR v_team_perms IN
        SELECT t.permissions
        FROM pyra_teams t
        JOIN pyra_team_members tm ON tm.team_id = t.id
        WHERE tm.username = p_username
    LOOP
        v_allowed_paths := v_team_perms -> 'allowed_paths';
        IF v_allowed_paths IS NOT NULL THEN
            FOR i IN 0..jsonb_array_length(v_allowed_paths) - 1 LOOP
                v_check_path := v_allowed_paths ->> i;
                IF p_path = v_check_path OR p_path LIKE v_check_path || '/%' THEN
                    RETURN TRUE;
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    -- 3) Check file-specific permissions
    SELECT * INTO v_file_perm
    FROM pyra_file_permissions
    WHERE file_path = p_path
    AND username = p_username
    LIMIT 1;

    IF v_file_perm IS NOT NULL THEN
        CASE p_action
            WHEN 'read' THEN RETURN TRUE;
            WHEN 'upload' THEN
                RETURN v_file_perm.permission IN ('upload', 'full');
            WHEN 'write' THEN
                RETURN v_file_perm.permission = 'full';
            WHEN 'delete' THEN
                RETURN v_file_perm.permission = 'full';
            ELSE RETURN FALSE;
        END CASE;
    END IF;

    RETURN FALSE;
END;
$$;

-- ============================================
-- Done! Run this in Supabase SQL Editor.
-- ============================================
