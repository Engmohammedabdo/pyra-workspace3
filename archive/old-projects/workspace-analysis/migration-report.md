# Pyra Workspace Migration Report
## Date: 2026-02-15
## From: db.pyramedia.info → pyraworkspacedb.pyramedia.cloud

### Summary

| Table | Columns | Rows (Old) | Rows (New) | Create | Insert | Verified |
|-------|---------|------------|------------|--------|--------|----------|
| pyra_users | 7 | 2 | 2 | OK | OK | ✅ |
| pyra_sessions | 6 | 1 | 1 | OK | OK | ✅ |
| pyra_login_attempts | 5 | 2 | 2 | OK | OK | ✅ |
| pyra_blocked_logs | 5 | 0 | - | OK | - | ✅ |
| pyra_settings | 4 | 12 | 12 | OK | OK | ✅ |
| pyra_teams | 6 | 0 | - | OK | - | ✅ |
| pyra_team_members | 5 | 0 | - | OK | - | ✅ |
| pyra_file_index | 10 | 2 | 2 | OK | OK | ✅ |
| pyra_file_versions | 10 | 0 | - | OK | - | ✅ |
| pyra_file_permissions | 8 | 0 | - | OK | - | ✅ |
| pyra_favorites | 6 | 1 | 1 | OK | OK | ✅ |
| pyra_reviews | 9 | 5 | 5 | OK | OK | ✅ |
| pyra_notifications | 10 | 8 | 8 | OK | OK | ✅ |
| pyra_activity_log | 8 | 28 | 28 | OK | OK | ✅ |
| pyra_share_links | 11 | 2 | 2 | OK | OK | ✅ |
| pyra_trash | 10 | 2 | 2 | OK | OK | ✅ |
| pyra_clients | 14 | 0 | - | OK | - | ✅ |
| pyra_projects | 12 | 0 | - | OK | - | ✅ |
| pyra_project_files | 11 | 0 | - | OK | - | ✅ |
| pyra_file_approvals | 7 | 0 | - | OK | - | ✅ |
| pyra_client_comments | 11 | 0 | - | OK | - | ✅ |
| pyra_client_notifications | 9 | 0 | - | OK | - | ✅ |
| pyra_client_password_resets | 6 | 0 | - | OK | - | ✅ |

### Verification
✅ All tables verified successfully!
