-- =============================================
-- Pyra Workspace — Full Migration Script
-- From: db.pyramedia.info
-- To: pyraworkspacedb.pyramedia.cloud
-- Date: 2026-02-15
-- =============================================

-- 1. Drop tables (reverse dependency order)
DROP TABLE IF EXISTS public.pyra_client_password_resets CASCADE;
DROP TABLE IF EXISTS public.pyra_client_notifications CASCADE;
DROP TABLE IF EXISTS public.pyra_client_comments CASCADE;
DROP TABLE IF EXISTS public.pyra_file_approvals CASCADE;
DROP TABLE IF EXISTS public.pyra_project_files CASCADE;
DROP TABLE IF EXISTS public.pyra_projects CASCADE;
DROP TABLE IF EXISTS public.pyra_clients CASCADE;
DROP TABLE IF EXISTS public.pyra_trash CASCADE;
DROP TABLE IF EXISTS public.pyra_share_links CASCADE;
DROP TABLE IF EXISTS public.pyra_activity_log CASCADE;
DROP TABLE IF EXISTS public.pyra_notifications CASCADE;
DROP TABLE IF EXISTS public.pyra_reviews CASCADE;
DROP TABLE IF EXISTS public.pyra_favorites CASCADE;
DROP TABLE IF EXISTS public.pyra_file_permissions CASCADE;
DROP TABLE IF EXISTS public.pyra_file_versions CASCADE;
DROP TABLE IF EXISTS public.pyra_file_index CASCADE;
DROP TABLE IF EXISTS public.pyra_team_members CASCADE;
DROP TABLE IF EXISTS public.pyra_teams CASCADE;
DROP TABLE IF EXISTS public.pyra_settings CASCADE;
DROP TABLE IF EXISTS public.pyra_blocked_logs CASCADE;
DROP TABLE IF EXISTS public.pyra_login_attempts CASCADE;
DROP TABLE IF EXISTS public.pyra_sessions CASCADE;
DROP TABLE IF EXISTS public.pyra_users CASCADE;

-- 2. Create tables
CREATE TABLE public.pyra_users (
  id SERIAL NOT NULL,
  username VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'client'::character varying,
  display_name VARCHAR(100) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT pyra_users_username_key UNIQUE (username)
);

CREATE TABLE public.pyra_sessions (
  id VARCHAR(128) NOT NULL,
  username VARCHAR(50) NOT NULL,
  ip_address VARCHAR(45) DEFAULT ''::character varying,
  user_agent TEXT DEFAULT ''::text,
  last_activity TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.pyra_login_attempts (
  id SERIAL NOT NULL,
  username VARCHAR(50) NOT NULL,
  ip_address VARCHAR(45) DEFAULT ''::character varying,
  success BOOLEAN DEFAULT false,
  attempted_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.pyra_blocked_logs (
  id SERIAL NOT NULL,
  jid TEXT NOT NULL,
  original_response TEXT,
  blocked_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.pyra_settings (
  key VARCHAR(100) NOT NULL,
  value TEXT NOT NULL DEFAULT ''::text,
  updated_by VARCHAR(50) DEFAULT ''::character varying,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (key)
);

CREATE TABLE public.pyra_teams (
  id VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT ''::text,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.pyra_team_members (
  id VARCHAR(30) NOT NULL,
  team_id VARCHAR(30) NOT NULL,
  username VARCHAR(50) NOT NULL,
  added_by VARCHAR(50) NOT NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT pyra_team_members_team_id_username_key UNIQUE (team_id, username),
  CONSTRAINT pyra_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.pyra_teams(id)
);

CREATE TABLE public.pyra_file_index (
  id VARCHAR(30) NOT NULL,
  file_path TEXT NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_name_lower VARCHAR(500) NOT NULL,
  folder_path TEXT NOT NULL DEFAULT ''::text,
  file_size BIGINT DEFAULT 0,
  mime_type VARCHAR(100) DEFAULT ''::character varying,
  updated_at TIMESTAMPTZ DEFAULT now(),
  indexed_at TIMESTAMPTZ DEFAULT now(),
  original_name VARCHAR(500) DEFAULT NULL::character varying,
  PRIMARY KEY (id),
  CONSTRAINT pyra_file_index_file_path_key UNIQUE (file_path)
);

CREATE TABLE public.pyra_file_versions (
  id VARCHAR(30) NOT NULL,
  file_path TEXT NOT NULL,
  version_path TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  file_size BIGINT DEFAULT 0,
  mime_type VARCHAR(100) DEFAULT ''::character varying,
  created_by VARCHAR(50) NOT NULL,
  created_by_display VARCHAR(100) NOT NULL,
  comment TEXT DEFAULT ''::text,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.pyra_file_permissions (
  id VARCHAR(30) NOT NULL,
  file_path TEXT NOT NULL,
  target_type VARCHAR(10) NOT NULL,
  target_id VARCHAR(100) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_by VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.pyra_favorites (
  id VARCHAR(30) NOT NULL,
  username VARCHAR(50) NOT NULL,
  file_path TEXT NOT NULL,
  item_type VARCHAR(10) NOT NULL DEFAULT 'file'::character varying,
  display_name VARCHAR(255) DEFAULT ''::character varying,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT pyra_favorites_username_file_path_key UNIQUE (username, file_path)
);

CREATE TABLE public.pyra_reviews (
  id VARCHAR(20) NOT NULL,
  file_path TEXT NOT NULL,
  username VARCHAR(50) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  text TEXT DEFAULT ''::text,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  parent_id VARCHAR(20) DEFAULT NULL::character varying,
  PRIMARY KEY (id)
);

CREATE TABLE public.pyra_notifications (
  id VARCHAR(30) NOT NULL,
  recipient_username VARCHAR(50) NOT NULL,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT DEFAULT ''::text,
  source_username VARCHAR(50) DEFAULT ''::character varying,
  source_display_name VARCHAR(100) DEFAULT ''::character varying,
  target_path TEXT DEFAULT ''::text,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.pyra_activity_log (
  id VARCHAR(30) NOT NULL,
  action_type VARCHAR(30) NOT NULL,
  username VARCHAR(50) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  target_path TEXT DEFAULT ''::text,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(45) DEFAULT ''::character varying,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.pyra_share_links (
  id VARCHAR(30) NOT NULL,
  token VARCHAR(64) NOT NULL,
  file_path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  created_by VARCHAR(50) NOT NULL,
  created_by_display VARCHAR(100) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  access_count INTEGER DEFAULT 0,
  max_access INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT pyra_share_links_token_key UNIQUE (token)
);

CREATE TABLE public.pyra_trash (
  id VARCHAR(30) NOT NULL,
  original_path TEXT NOT NULL,
  trash_path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT DEFAULT 0,
  mime_type VARCHAR(100) DEFAULT 'application/octet-stream'::character varying,
  deleted_by VARCHAR(50) NOT NULL,
  deleted_by_display VARCHAR(100) NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT now(),
  auto_purge_at TIMESTAMPTZ DEFAULT (now() + '30 days'::interval),
  PRIMARY KEY (id)
);

CREATE TABLE public.pyra_clients (
  id VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  company VARCHAR(150) NOT NULL,
  phone VARCHAR(30) DEFAULT NULL::character varying,
  avatar_url TEXT,
  role VARCHAR(20) DEFAULT 'primary'::character varying,
  status VARCHAR(20) DEFAULT 'active'::character varying,
  language VARCHAR(5) DEFAULT 'ar'::character varying,
  last_login_at TIMESTAMPTZ,
  created_by VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT pyra_clients_email_key UNIQUE (email)
);

CREATE TABLE public.pyra_projects (
  id VARCHAR(20) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  client_company VARCHAR(150) NOT NULL,
  status VARCHAR(20) DEFAULT 'active'::character varying,
  start_date DATE,
  deadline DATE,
  storage_path TEXT NOT NULL,
  cover_image TEXT,
  created_by VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.pyra_project_files (
  id VARCHAR(20) NOT NULL,
  project_id VARCHAR(20) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  mime_type VARCHAR(100) DEFAULT NULL::character varying,
  category VARCHAR(50) DEFAULT 'general'::character varying,
  version INTEGER DEFAULT 1,
  needs_approval BOOLEAN DEFAULT false,
  uploaded_by VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT pyra_project_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.pyra_projects(id)
);

CREATE TABLE public.pyra_file_approvals (
  id VARCHAR(20) NOT NULL,
  file_id VARCHAR(20) NOT NULL,
  client_id VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending'::character varying,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT pyra_file_approvals_file_id_client_id_key UNIQUE (file_id, client_id),
  CONSTRAINT pyra_file_approvals_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.pyra_clients(id),
  CONSTRAINT pyra_file_approvals_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.pyra_project_files(id)
);

CREATE TABLE public.pyra_client_comments (
  id VARCHAR(20) NOT NULL,
  project_id VARCHAR(20) NOT NULL,
  file_id VARCHAR(20) DEFAULT NULL::character varying,
  author_type VARCHAR(10) NOT NULL,
  author_id VARCHAR(50) NOT NULL,
  author_name VARCHAR(100) NOT NULL,
  text TEXT NOT NULL,
  parent_id VARCHAR(20) DEFAULT NULL::character varying,
  is_read_by_client BOOLEAN DEFAULT false,
  is_read_by_team BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT pyra_client_comments_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.pyra_project_files(id),
  CONSTRAINT pyra_client_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.pyra_client_comments(id),
  CONSTRAINT pyra_client_comments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.pyra_projects(id)
);

CREATE TABLE public.pyra_client_notifications (
  id VARCHAR(20) NOT NULL,
  client_id VARCHAR(20) NOT NULL,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  target_project_id VARCHAR(20) DEFAULT NULL::character varying,
  target_file_id VARCHAR(20) DEFAULT NULL::character varying,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT pyra_client_notifications_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.pyra_clients(id)
);

CREATE TABLE public.pyra_client_password_resets (
  id VARCHAR(20) NOT NULL,
  client_id VARCHAR(20) NOT NULL,
  token VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT pyra_client_password_resets_token_key UNIQUE (token),
  CONSTRAINT pyra_client_password_resets_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.pyra_clients(id)
);

-- 3. Create indexes
CREATE INDEX idx_users_username ON public.pyra_users USING btree (username);
CREATE INDEX idx_sessions_user ON public.pyra_sessions USING btree (username);
CREATE INDEX idx_sessions_activity ON public.pyra_sessions USING btree (last_activity);
CREATE INDEX idx_login_attempts_user ON public.pyra_login_attempts USING btree (username);
CREATE INDEX idx_login_attempts_time ON public.pyra_login_attempts USING btree (attempted_at);
CREATE INDEX idx_teams_name ON public.pyra_teams USING btree (name);
CREATE INDEX idx_team_members_team ON public.pyra_team_members USING btree (team_id);
CREATE INDEX idx_team_members_user ON public.pyra_team_members USING btree (username);
CREATE INDEX idx_fileindex_name ON public.pyra_file_index USING btree (file_name_lower);
CREATE INDEX idx_fileindex_path ON public.pyra_file_index USING btree (file_path);
CREATE INDEX idx_fileindex_folder ON public.pyra_file_index USING btree (folder_path);
CREATE INDEX idx_versions_path ON public.pyra_file_versions USING btree (file_path);
CREATE INDEX idx_versions_created ON public.pyra_file_versions USING btree (created_at DESC);
CREATE INDEX idx_fileperm_path ON public.pyra_file_permissions USING btree (file_path);
CREATE INDEX idx_fileperm_target ON public.pyra_file_permissions USING btree (target_type, target_id);
CREATE INDEX idx_fileperm_expires ON public.pyra_file_permissions USING btree (expires_at);
CREATE INDEX idx_favorites_user ON public.pyra_favorites USING btree (username);
CREATE INDEX idx_favorites_path ON public.pyra_favorites USING btree (file_path);
CREATE INDEX idx_reviews_file_path ON public.pyra_reviews USING btree (file_path);
CREATE INDEX idx_reviews_username ON public.pyra_reviews USING btree (username);
CREATE INDEX idx_reviews_parent ON public.pyra_reviews USING btree (parent_id);
CREATE INDEX idx_notif_recipient ON public.pyra_notifications USING btree (recipient_username);
CREATE INDEX idx_notif_read ON public.pyra_notifications USING btree (recipient_username, is_read);
CREATE INDEX idx_notif_created ON public.pyra_notifications USING btree (created_at DESC);
CREATE INDEX idx_activity_action ON public.pyra_activity_log USING btree (action_type);
CREATE INDEX idx_activity_username ON public.pyra_activity_log USING btree (username);
CREATE INDEX idx_activity_created ON public.pyra_activity_log USING btree (created_at DESC);
CREATE INDEX idx_share_token ON public.pyra_share_links USING btree (token);
CREATE INDEX idx_share_path ON public.pyra_share_links USING btree (file_path);
CREATE INDEX idx_share_expires ON public.pyra_share_links USING btree (expires_at);
CREATE INDEX idx_trash_deleted_by ON public.pyra_trash USING btree (deleted_by);
CREATE INDEX idx_trash_original_path ON public.pyra_trash USING btree (original_path);
CREATE INDEX idx_trash_auto_purge ON public.pyra_trash USING btree (auto_purge_at);
CREATE INDEX idx_clients_email ON public.pyra_clients USING btree (email);
CREATE INDEX idx_clients_company ON public.pyra_clients USING btree (company);
CREATE INDEX idx_clients_status ON public.pyra_clients USING btree (status);
CREATE INDEX idx_projects_company ON public.pyra_projects USING btree (client_company);
CREATE INDEX idx_projects_status ON public.pyra_projects USING btree (status);
CREATE INDEX idx_pf_project ON public.pyra_project_files USING btree (project_id);
CREATE INDEX idx_pf_approval ON public.pyra_project_files USING btree (needs_approval) WHERE (needs_approval = true);
CREATE INDEX idx_fa_file ON public.pyra_file_approvals USING btree (file_id);
CREATE INDEX idx_fa_client ON public.pyra_file_approvals USING btree (client_id);
CREATE INDEX idx_fa_status ON public.pyra_file_approvals USING btree (status);
CREATE INDEX idx_cc_project ON public.pyra_client_comments USING btree (project_id);
CREATE INDEX idx_cc_file ON public.pyra_client_comments USING btree (file_id);
CREATE INDEX idx_cc_parent ON public.pyra_client_comments USING btree (parent_id);
CREATE INDEX idx_cn_client ON public.pyra_client_notifications USING btree (client_id);
CREATE INDEX idx_cn_unread ON public.pyra_client_notifications USING btree (client_id, is_read) WHERE (is_read = false);
CREATE INDEX idx_cpr_token ON public.pyra_client_password_resets USING btree (token);

-- 4. Insert data
-- pyra_users: 2 rows
INSERT INTO public.pyra_users (id, username, password_hash, role, display_name, permissions, created_at) VALUES
(1, 'elharm', '$2y$10$Q.u5khQxMCzr690sshUWZOiu580wxrfP.APWzvNr6Ec905t.FlBMS', 'admin', 'Mohamed', '{"can_edit":true,"can_delete":true,"can_review":true,"can_upload":true,"can_download":true,"allowed_paths":["*"],"can_create_folder":true}'::jsonb, '2026-02-13T18:45:41.255959+00:00'),
(2, 'ahmed', '$2y$10$bMYdEB5b.Rureu6UMf.V9efbvj9Q8pVR/GnqTeMo.SXvLzyQ69mHC', 'employee', 'Ahmed Saed', '{"can_edit":false,"can_delete":false,"can_review":true,"can_upload":true,"can_download":true,"allowed_paths":["projects/legal-research"],"can_create_folder":false}'::jsonb, '2026-02-14T18:32:32.024357+00:00');

-- pyra_sessions: 1 rows
INSERT INTO public.pyra_sessions (id, username, ip_address, user_agent, last_activity, created_at) VALUES
('9578385afbe2b25f1640e1e3d6f9fed1', 'ahmed', '109.177.57.71', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36', '2026-02-15T05:55:04+00:00', '2026-02-14T21:06:02.053078+00:00');

-- pyra_login_attempts: 2 rows
INSERT INTO public.pyra_login_attempts (id, username, ip_address, success, attempted_at) VALUES
(1, 'ahmed', '::1', FALSE, '2026-02-14T21:00:07.660207+00:00'),
(2, 'ahmed', '109.177.57.71', TRUE, '2026-02-14T21:06:01.428246+00:00');

-- pyra_blocked_logs: no data

-- pyra_settings: 12 rows
INSERT INTO public.pyra_settings (key, value, updated_by, updated_at) VALUES
('app_name', 'Pyra Workspace', 'elharm', '2026-02-14T22:02:54+00:00'),
('app_logo_url', '', 'elharm', '2026-02-14T22:02:55+00:00'),
('primary_color', '#fa7900', 'elharm', '2026-02-14T22:02:55+00:00'),
('max_upload_size', '524288000', 'elharm', '2026-02-14T22:02:55+00:00'),
('auto_version_on_upload', 'true', 'elharm', '2026-02-14T22:02:56+00:00'),
('max_versions_per_file', '10', 'elharm', '2026-02-14T22:02:57+00:00'),
('trash_auto_purge_days', '30', 'elharm', '2026-02-14T22:02:57+00:00'),
('allow_public_shares', 'true', 'elharm', '2026-02-14T22:02:58+00:00'),
('share_default_expiry_hours', '24', 'elharm', '2026-02-14T22:02:58+00:00'),
('session_timeout_minutes', '480', 'elharm', '2026-02-14T22:02:59+00:00'),
('max_failed_logins', '5', 'elharm', '2026-02-14T22:02:59+00:00'),
('lockout_duration_minutes', '15', 'elharm', '2026-02-14T22:03:00+00:00');

-- pyra_teams: no data

-- pyra_team_members: no data

-- pyra_file_index: 2 rows
INSERT INTO public.pyra_file_index (id, file_path, file_name, file_name_lower, folder_path, file_size, mime_type, updated_at, indexed_at, original_name) VALUES
('fi_9abfb01af046bfeb3288eab5', 'judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', 'judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', 'judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', '', 1521001, 'image/jpeg', '2026-02-14T21:08:18+00:00', '2026-02-14T21:08:19.614208+00:00', NULL),
('fi_fa5f73475a896f4f65d4a1dd', 'projects/legal-research/judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', 'judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', 'judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', 'projects/legal-research', 1521001, 'image/jpeg', '2026-02-14T21:22:51+00:00', '2026-02-14T21:22:52.916307+00:00', NULL);

-- pyra_file_versions: no data

-- pyra_file_permissions: no data

-- pyra_favorites: 1 rows
INSERT INTO public.pyra_favorites (id, username, file_path, item_type, display_name, created_at) VALUES
('fav_1771106296_7bff5', 'elharm', 'README.txt', 'file', 'README.txt', '2026-02-14T21:58:16.868397+00:00');

-- pyra_reviews: 5 rows
INSERT INTO public.pyra_reviews (id, file_path, username, display_name, type, text, resolved, created_at, parent_id) VALUES
('r_1771018305_3746c', 'projects/legal-research/uae-commercial-claims.md', 'elharm', 'Mohamed', 'comment', 'تمام ممتاز', FALSE, '2026-02-13T21:31:46.004202+00:00', NULL),
('r_1771019180_0c419', 'projects/ramadan-series/characters/ahmed-friend.png', 'elharm', 'Mohamed', 'comment', 'جوووود', FALSE, '2026-02-13T21:46:21.183157+00:00', NULL),
('r_1771104223_43493', 'projects/legal-research/judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', 'elharm', 'Mohamed', 'comment', '@ahmed دي ايه ؟', FALSE, '2026-02-14T21:23:44.601872+00:00', NULL),
('r_1771105348_e2d45', 'projects/legal-research/judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', 'ahmed', 'Ahmed Saed', 'comment', 'خدك علية', FALSE, '2026-02-14T21:42:29.372072+00:00', NULL),
('r_1771105429_74946', 'projects/legal-research/judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', 'elharm', 'Mohamed', 'comment', 'ربنا يسامحك ، مخصوم منك 15 يوم سوء استماع وسخرية', FALSE, '2026-02-14T21:43:49.570489+00:00', 'r_1771105348_e2d45');

-- pyra_notifications: 8 rows
INSERT INTO public.pyra_notifications (id, recipient_username, type, title, message, source_username, source_display_name, target_path, is_read, created_at) VALUES
('n_1771098757_8fded', 'ahmed', 'upload', 'New file uploaded: elevoc_dnn_kernel.log', '', 'elharm', 'Mohamed', 'projects/legal-research/elevoc_dnn_kernel.log', TRUE, '2026-02-14T19:52:37.639492+00:00'),
('n_1771103193_72df7', 'elharm', 'upload', 'New file uploaded: خدمة التفويض الإلكتروني.pdf', '', 'ahmed', 'Ahmed Saed', 'projects/legal-research/file_9f856552c2_9f8565.pdf', FALSE, '2026-02-14T21:06:34.457337+00:00'),
('n_1771103300_6adf2', 'elharm', 'upload', 'New file uploaded: judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', '', 'ahmed', 'Ahmed Saed', 'judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', TRUE, '2026-02-14T21:08:21.368811+00:00'),
('n_1771104174_71420', 'elharm', 'upload', 'New file uploaded: judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', '', 'ahmed', 'Ahmed Saed', 'projects/legal-research/judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', FALSE, '2026-02-14T21:22:54.767968+00:00'),
('n_1771104225_41e86', 'ahmed', 'comment', 'New comment on judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', '@ahmed دي ايه ؟', 'elharm', 'Mohamed', 'projects/legal-research/judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', TRUE, '2026-02-14T21:23:46.420511+00:00'),
('n_1771105350_71074', 'elharm', 'comment', 'New comment on judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', 'خدك علية', 'ahmed', 'Ahmed Saed', 'projects/legal-research/judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', TRUE, '2026-02-14T21:42:31.269505+00:00'),
('n_1771105430_09d09', 'ahmed', 'reply', 'Mohamed replied to your comment on judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', 'ربنا يسامحك ، مخصوم منك 15 يوم سوء استماع وسخرية', 'elharm', 'Mohamed', 'projects/legal-research/judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', FALSE, '2026-02-14T21:43:51.227766+00:00'),
('n_1771105431_d74c0', 'ahmed', 'comment', 'New comment on judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', 'ربنا يسامحك ، مخصوم منك 15 يوم سوء استماع وسخرية', 'elharm', 'Mohamed', 'projects/legal-research/judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', FALSE, '2026-02-14T21:43:52.244249+00:00');

-- pyra_activity_log: 28 rows
INSERT INTO public.pyra_activity_log (id, action_type, username, display_name, target_path, details, ip_address, created_at) VALUES
('l_1771011498_3ced2', 'share_created', 'elharm', 'Mohamed', 'projects/legal-research/uae-criminal-petitions.md', '{"expires_in_hours":1}'::jsonb, '::1', '2026-02-13T19:38:18.700407+00:00'),
('l_1771011749_1e046', 'login', 'elharm', 'Mohamed', '', '{"username":"elharm"}'::jsonb, '109.177.57.71', '2026-02-13T19:42:30.458578+00:00'),
('l_1771014152_fda04', 'login', 'elharm', 'Mohamed', '', '{"username":"elharm"}'::jsonb, '72.61.255.111', '2026-02-13T20:22:32.534223+00:00'),
('l_1771018306_41fea', 'review_added', 'elharm', 'Mohamed', 'projects/legal-research/uae-commercial-claims.md', '{"type":"comment"}'::jsonb, '::1', '2026-02-13T21:31:46.463129+00:00'),
('l_1771019068_97813', 'share_created', 'elharm', 'Mohamed', 'pyra agent podcast.docx', '{"expires_in_hours":24}'::jsonb, '109.177.57.71', '2026-02-13T21:44:28.834877+00:00'),
('l_1771019181_480bb', 'review_added', 'elharm', 'Mohamed', 'projects/ramadan-series/characters/ahmed-friend.png', '{"type":"comment"}'::jsonb, '109.177.57.71', '2026-02-13T21:46:21.785088+00:00'),
('l_1771067053_e44ff', 'login', 'elharm', 'Mohamed', '', '{"username":"elharm"}'::jsonb, '91.73.46.19', '2026-02-14T11:04:14.161093+00:00'),
('l_1771093952_278b0', 'user_created', 'elharm', 'Mohamed', '', '{"role":"employee","target_user":"ahmed"}'::jsonb, '::1', '2026-02-14T18:32:32.691778+00:00'),
('l_1771093967_2cbd9', 'logout', 'elharm', 'Mohamed', '', '[]'::jsonb, '::1', '2026-02-14T18:32:47.712944+00:00'),
('l_1771093976_df3d3', 'login', 'ahmed', 'Ahmed Saed', '', '{"username":"ahmed"}'::jsonb, '::1', '2026-02-14T18:32:56.934092+00:00'),
('l_1771097835_8580f', 'logout', 'ahmed', 'Ahmed Saed', '', '[]'::jsonb, '::1', '2026-02-14T19:37:15.791927+00:00'),
('l_1771097858_41654', 'login', 'elharm', 'Mohamed', '', '{"username":"elharm"}'::jsonb, '::1', '2026-02-14T19:37:38.724942+00:00'),
('l_1771098545_4d71a', 'login', 'ahmed', 'Ahmed Saed', '', '{"username":"ahmed"}'::jsonb, '87.201.88.223', '2026-02-14T19:49:06.291295+00:00'),
('l_1771098756_7b636', 'upload', 'elharm', 'Mohamed', 'projects/legal-research/elevoc_dnn_kernel.log', '{"size":2356,"file_name":"elevoc_dnn_kernel.log"}'::jsonb, '::1', '2026-02-14T19:52:36.618667+00:00'),
('l_1771098780_553bf', 'delete', 'elharm', 'Mohamed', 'projects/legal-research/elevoc_dnn_kernel.log', '{"moved_to_trash":true}'::jsonb, '::1', '2026-02-14T19:53:01.211102+00:00'),
('l_1771103147_1b915', 'logout', 'elharm', 'Mohamed', '', '[]'::jsonb, '109.177.57.71', '2026-02-14T21:05:48.352764+00:00'),
('l_1771103162_f0874', 'login', 'ahmed', 'Ahmed Saed', '', '{"username":"ahmed"}'::jsonb, '109.177.57.71', '2026-02-14T21:06:02.683269+00:00'),
('l_1771103192_5d1ee', 'upload', 'ahmed', 'Ahmed Saed', 'projects/legal-research/file_9f856552c2_9f8565.pdf', '{"size":204503,"file_name":"خدمة التفويض الإلكتروني.pdf"}'::jsonb, '109.177.57.71', '2026-02-14T21:06:33.249537+00:00'),
('l_1771103299_6e8e1', 'upload', 'ahmed', 'Ahmed Saed', 'judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', '{"size":1521001,"file_name":"judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg"}'::jsonb, '87.201.88.223', '2026-02-14T21:08:20.227082+00:00'),
('l_1771103997_3d874', 'delete', 'elharm', 'Mohamed', 'projects/legal-research/file_9f856552c2_9f8565.pdf', '{"moved_to_trash":true}'::jsonb, '::1', '2026-02-14T21:19:58.354084+00:00'),
('l_1771104173_931ba', 'upload', 'ahmed', 'Ahmed Saed', 'projects/legal-research/judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', '{"size":1521001,"file_name":"judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg"}'::jsonb, '87.201.88.223', '2026-02-14T21:22:53.529304+00:00'),
('l_1771104224_578b6', 'review_added', 'elharm', 'Mohamed', 'projects/legal-research/judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', '{"type":"comment"}'::jsonb, '::1', '2026-02-14T21:23:45.137339+00:00'),
('l_1771105349_39afc', 'review_added', 'ahmed', 'Ahmed Saed', 'projects/legal-research/judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', '{"type":"comment"}'::jsonb, '87.201.88.223', '2026-02-14T21:42:30.002201+00:00'),
('l_1771105429_c47b5', 'review_added', 'elharm', 'Mohamed', 'projects/legal-research/judge-s-gavel-on-wooden-table-in-office-closeup-2026-01-11-10-50-30-utc copy.jpg', '{"type":"comment"}'::jsonb, '::1', '2026-02-14T21:43:50.088745+00:00'),
('l_1771106558_64b80', 'settings_updated', 'elharm', 'Mohamed', '', '{"count":12}'::jsonb, '::1', '2026-02-14T22:02:39.570301+00:00'),
('l_1771106567_4ebd0', 'settings_updated', 'elharm', 'Mohamed', '', '{"count":12}'::jsonb, '::1', '2026-02-14T22:02:47.898215+00:00'),
('l_1771106573_91cae', 'settings_updated', 'elharm', 'Mohamed', '', '{"count":12}'::jsonb, '::1', '2026-02-14T22:02:54.447963+00:00'),
('l_1771106581_b8d95', 'settings_updated', 'elharm', 'Mohamed', '', '{"count":12}'::jsonb, '::1', '2026-02-14T22:03:01.806558+00:00');

-- pyra_share_links: 2 rows
INSERT INTO public.pyra_share_links (id, token, file_path, file_name, created_by, created_by_display, expires_at, access_count, max_access, is_active, created_at) VALUES
('s_1771011498_a7324', '3eed168fc6cf49ccdc8299fabacdef453a15a648fe8ef400106484f5e68ec0e3', 'projects/legal-research/uae-criminal-petitions.md', 'uae-criminal-petitions.md', 'elharm', 'Mohamed', '2026-02-13T20:38:18+00:00', 0, 0, TRUE, '2026-02-13T19:38:18.20769+00:00'),
('s_1771019067_cff85', '94f7644d578b50f0e15597c2eb9e746cf9ca33a5876d449d8b1dc78a70b27f1b', 'pyra agent podcast.docx', 'pyra agent podcast.docx', 'elharm', 'Mohamed', '2026-02-14T21:44:27+00:00', 2, 0, TRUE, '2026-02-13T21:44:28.215007+00:00');

-- pyra_trash: 2 rows
INSERT INTO public.pyra_trash (id, original_path, trash_path, file_name, file_size, mime_type, deleted_by, deleted_by_display, deleted_at, auto_purge_at) VALUES
('t_1771098779_f7dd3', 'projects/legal-research/elevoc_dnn_kernel.log', '.trash/1771098778_6a8551_elevoc_dnn_kernel.log', 'elevoc_dnn_kernel.log', 2356, 'text/plain', 'elharm', 'Mohamed', '2026-02-14T19:53:00.102196+00:00', '2026-03-16T19:53:00.102196+00:00'),
('t_1771103996_8ae69', 'projects/legal-research/file_9f856552c2_9f8565.pdf', '.trash/1771103996_1eebb6_file_9f856552c2_9f8565.pdf', 'file_9f856552c2_9f8565.pdf', 204503, 'application/pdf', 'elharm', 'Mohamed', '2026-02-14T21:19:57.180903+00:00', '2026-03-16T21:19:57.180903+00:00');

-- pyra_clients: no data

-- pyra_projects: no data

-- pyra_project_files: no data

-- pyra_file_approvals: no data

-- pyra_client_comments: no data

-- pyra_client_notifications: no data

-- pyra_client_password_resets: no data

