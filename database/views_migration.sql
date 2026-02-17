-- ============================================
-- Pyra Workspace 3: Database Views Migration
-- Run this SQL in your Supabase SQL Editor
-- These views optimize dashboard & project queries
-- ============================================

-- ============================================
-- 1. v_project_summary
-- Aggregated project data with file counts & approval stats
-- Replaces: 3 separate queries per project
-- ============================================

DROP VIEW IF EXISTS v_project_summary CASCADE;
CREATE VIEW v_project_summary AS
SELECT
    p.id,
    p.name,
    p.description,
    p.client_company,
    p.status,
    p.start_date,
    p.deadline,
    p.storage_path,
    p.cover_image,
    p.created_by,
    p.created_at,
    p.updated_at,
    COALESCE(file_stats.file_count, 0) AS file_count,
    COALESCE(file_stats.total_file_size, 0) AS total_file_size,
    COALESCE(approval_stats.approved_count, 0) AS approved_count,
    COALESCE(approval_stats.pending_count, 0) AS pending_count,
    COALESCE(approval_stats.revision_count, 0) AS revision_count,
    COALESCE(comment_stats.comment_count, 0) AS comment_count,
    COALESCE(comment_stats.unread_team_count, 0) AS unread_team_comments
FROM pyra_projects p
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) AS file_count,
        COALESCE(SUM(file_size), 0) AS total_file_size
    FROM pyra_project_files
    WHERE project_id = p.id
) file_stats ON true
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) FILTER (WHERE fa.status = 'approved') AS approved_count,
        COUNT(*) FILTER (WHERE fa.status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE fa.status = 'revision_requested') AS revision_count
    FROM pyra_file_approvals fa
    JOIN pyra_project_files pf ON pf.id = fa.file_id
    WHERE pf.project_id = p.id
) approval_stats ON true
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) AS comment_count,
        COUNT(*) FILTER (WHERE is_read_by_team = false AND author_type = 'client') AS unread_team_count
    FROM pyra_client_comments
    WHERE project_id = p.id
) comment_stats ON true;

-- ============================================
-- 2. v_pending_approvals
-- Pending approvals with full file & project context
-- Replaces: JOIN query + manual filtering
-- ============================================

DROP VIEW IF EXISTS v_pending_approvals CASCADE;
CREATE VIEW v_pending_approvals AS
SELECT
    fa.id AS approval_id,
    fa.file_id,
    fa.client_id,
    fa.status AS approval_status,
    fa.comment,
    fa.created_at AS approval_created_at,
    fa.updated_at AS approval_updated_at,
    pf.file_name,
    pf.file_path,
    pf.file_size,
    pf.mime_type,
    pf.category,
    pf.version AS file_version,
    pf.project_id,
    pf.uploaded_by,
    p.name AS project_name,
    p.client_company,
    p.status AS project_status,
    c.name AS client_name,
    c.email AS client_email
FROM pyra_file_approvals fa
JOIN pyra_project_files pf ON pf.id = fa.file_id
JOIN pyra_projects p ON p.id = pf.project_id
LEFT JOIN pyra_clients c ON c.id = fa.client_id
WHERE fa.status = 'pending';

-- ============================================
-- 3. v_storage_summary
-- Total storage used — replaces fetching 10k rows
-- Before: fetch ALL file_index rows → sum in JS
-- After: SELECT * FROM v_storage_summary (1 row)
-- ============================================

DROP VIEW IF EXISTS v_storage_summary CASCADE;
CREATE VIEW v_storage_summary AS
SELECT
    COUNT(*) AS total_files,
    COALESCE(SUM(file_size), 0) AS total_storage_bytes,
    ROUND(COALESCE(SUM(file_size), 0) / 1048576.0, 2) AS total_storage_mb,
    ROUND(COALESCE(SUM(file_size), 0) / 1073741824.0, 2) AS total_storage_gb,
    COUNT(*) FILTER (WHERE mime_type LIKE 'image/%') AS image_count,
    COUNT(*) FILTER (WHERE mime_type LIKE 'video/%') AS video_count,
    COUNT(*) FILTER (WHERE mime_type LIKE 'audio/%') AS audio_count,
    COUNT(*) FILTER (WHERE mime_type LIKE 'application/pdf') AS pdf_count,
    COUNT(*) FILTER (WHERE mime_type LIKE 'application/%' AND mime_type NOT LIKE 'application/pdf') AS document_count
FROM pyra_file_index;

-- ============================================
-- 4. v_dashboard_stats
-- All dashboard KPIs in one query
-- Before: 7 separate queries in parallel
-- After: SELECT * FROM v_dashboard_stats (1 row)
-- ============================================

DROP VIEW IF EXISTS v_dashboard_stats CASCADE;
CREATE VIEW v_dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM pyra_file_index) AS total_files,
    (SELECT COALESCE(SUM(file_size), 0) FROM pyra_file_index) AS total_storage_bytes,
    (SELECT COUNT(*) FROM pyra_users) AS total_users,
    (SELECT COUNT(*) FROM pyra_clients) AS total_clients,
    (SELECT COUNT(*) FROM pyra_projects) AS total_projects,
    (SELECT COUNT(*) FROM pyra_projects WHERE status = 'active') AS active_projects,
    (SELECT COUNT(*) FROM pyra_projects WHERE status = 'completed') AS completed_projects,
    (SELECT COUNT(*) FROM pyra_teams) AS total_teams,
    (SELECT COUNT(*) FROM pyra_quotes) AS total_quotes,
    (SELECT COUNT(*) FROM pyra_quotes WHERE status = 'signed') AS signed_quotes,
    (SELECT COUNT(*) FROM pyra_file_approvals WHERE status = 'pending') AS pending_approvals,
    (SELECT COUNT(*) FROM pyra_trash) AS trash_count,
    (SELECT COUNT(*) FROM pyra_share_links WHERE is_active = true AND expires_at > NOW()) AS active_shares;

-- ============================================
-- 5. v_project_activity
-- Latest activity per project (last 30 days)
-- Useful for project list sorting & display
-- ============================================

DROP VIEW IF EXISTS v_project_activity CASCADE;
CREATE VIEW v_project_activity AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.status,
    p.client_company,
    latest.last_activity_at,
    latest.last_activity_type,
    latest.last_activity_by
FROM pyra_projects p
LEFT JOIN LATERAL (
    SELECT
        created_at AS last_activity_at,
        action_type AS last_activity_type,
        display_name AS last_activity_by
    FROM pyra_activity_log
    WHERE target_path LIKE '%' || p.storage_path || '%'
       OR details::text LIKE '%' || p.id || '%'
    ORDER BY created_at DESC
    LIMIT 1
) latest ON true;

-- ============================================
-- 6. v_user_activity_summary
-- Per-user activity stats (for admin dashboard)
-- ============================================

DROP VIEW IF EXISTS v_user_activity_summary CASCADE;
CREATE VIEW v_user_activity_summary AS
SELECT
    u.username,
    u.display_name,
    u.role,
    COALESCE(activity.action_count, 0) AS actions_last_30_days,
    activity.last_action_at,
    COALESCE(uploads.upload_count, 0) AS uploads_last_30_days,
    COALESCE(comments.comment_count, 0) AS comments_last_30_days
FROM pyra_users u
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
-- 7. v_client_overview
-- Client details with project & approval stats
-- Useful for clients page in dashboard
-- ============================================

DROP VIEW IF EXISTS v_client_overview CASCADE;
CREATE VIEW v_client_overview AS
SELECT
    c.id,
    c.name,
    c.email,
    c.company,
    c.phone,
    c.status,
    c.last_login_at,
    c.created_at,
    COALESCE(proj.project_count, 0) AS project_count,
    COALESCE(proj.active_project_count, 0) AS active_project_count,
    COALESCE(approvals.pending_count, 0) AS pending_approvals,
    COALESCE(approvals.approved_count, 0) AS approved_files,
    COALESCE(quotes.quote_count, 0) AS total_quotes,
    COALESCE(quotes.signed_count, 0) AS signed_quotes
FROM pyra_clients c
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) AS project_count,
        COUNT(*) FILTER (WHERE status IN ('active', 'in_progress', 'review')) AS active_project_count
    FROM pyra_projects
    WHERE client_company = c.company
) proj ON true
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) FILTER (WHERE fa.status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE fa.status = 'approved') AS approved_count
    FROM pyra_file_approvals fa
    WHERE fa.client_id = c.id
) approvals ON true
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) AS quote_count,
        COUNT(*) FILTER (WHERE status = 'signed') AS signed_count
    FROM pyra_quotes
    WHERE client_id = c.id
) quotes ON true;

-- ============================================
-- 8. Favorites Table (if not exists)
-- From WS2 — for future implementation
-- ============================================

CREATE TABLE IF NOT EXISTS pyra_favorites (
    id VARCHAR(30) PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    file_path TEXT NOT NULL,
    item_type VARCHAR(10) NOT NULL DEFAULT 'file' CHECK (item_type IN ('file', 'folder')),
    display_name VARCHAR(255) DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(username, file_path)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON pyra_favorites(username);
CREATE INDEX IF NOT EXISTS idx_favorites_path ON pyra_favorites(file_path);

ALTER TABLE pyra_favorites DISABLE ROW LEVEL SECURITY;

-- ============================================
-- Performance Note:
-- These are regular views (not materialized)
-- They execute the underlying query each time
-- For high-traffic dashboards, consider:
--   CREATE MATERIALIZED VIEW v_dashboard_stats AS ...
--   Then refresh periodically with pg_cron:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY v_dashboard_stats;
-- ============================================

-- ============================================
-- GRANT access (if using service_role, this is automatic)
-- ============================================

-- GRANT SELECT ON v_project_summary TO service_role;
-- GRANT SELECT ON v_pending_approvals TO service_role;
-- GRANT SELECT ON v_storage_summary TO service_role;
-- GRANT SELECT ON v_dashboard_stats TO service_role;
-- GRANT SELECT ON v_project_activity TO service_role;
-- GRANT SELECT ON v_user_activity_summary TO service_role;
-- GRANT SELECT ON v_client_overview TO service_role;
