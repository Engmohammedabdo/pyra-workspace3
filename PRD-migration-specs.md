# Pyra Workspace 3.0 — Migration Specifications PRD

> **Sections 12-19** | Module Migration, Data Strategy, Testing, Deployment, Timeline, Risk, Dependencies, Acceptance
> **Date:** 2026-02-15
> **Author:** Bayra AI (Senior Project Manager & Technical Lead)
> **Target:** Claude Code (AI Developer)
> **Status:** Ready for Implementation

---

## SECTION 12: MODULE-BY-MODULE MIGRATION SPECIFICATIONS

This section provides a comprehensive migration blueprint for every module in the Pyra Workspace system. Each module maps the current PHP implementation to the target Next.js 15 + React 19 architecture, specifying components, API routes, state management, and testing requirements.

---

### 12.1 File Manager Module

#### 12.1.1 Current PHP Implementation Summary

The File Manager is the core module of Pyra Workspace. It is implemented across two files:

| File | Responsibility | Lines |
|------|---------------|-------|
| `api/api.php` | 12 switch-case actions: `list`, `upload`, `delete`, `rename`, `content`, `save`, `createFolder`, `proxy`, `download`, `publicUrl`, `deleteBatch`, `deepSearch` | ~600 |
| `includes/auth.php` | Helper functions: `indexFile`, `getOriginalNames`, `removeFileIndex`, `updateFileIndexPath`, `searchFileIndex` | ~120 |

**Current Storage Architecture:**
- Supabase Storage bucket: `pyraai-workspace`
- File listing via `POST /storage/v1/object/list/{bucket}` with prefix-based navigation
- Upload via `POST /storage/v1/object/{bucket}/{path}` with `x-upsert: true`
- Delete via `DELETE /storage/v1/object/{bucket}/{path}`
- Rename/Move via `POST /storage/v1/object/move` with `sourceKey`/`destinationKey`
- Public URLs via `/storage/v1/object/public/{bucket}/{path}`
- Signed URLs via `POST /storage/v1/object/sign/{bucket}/{path}` (1-hour expiry)
- Hidden directories: `.trash/` (soft deletes), `.versions/` (file history)
- Folder creation uses `.keep` placeholder files

**Current RBAC Filtering on File List:**
- Admin users see all files/folders
- Non-admin users filtered by `canAccessPathEnhanced()` for folders and `isPathDirectlyAllowed()` for files
- Path permissions stored as JSON: `{"paths":{"folder1":"browse","folder2":"full"},"per_folder":{"folder1":{"can_upload":true}}}`
- Three permission levels: `browse` (read-only), `upload` (read+write), `full` (read+write+delete)

**Current File Name Handling:**
- Arabic/Unicode filenames sanitized to ASCII via `sanitizeFileName()`
- Original names stored in `pyra_file_index` table for display
- `getOriginalNames()` enriches file listings with original Arabic names

**Current Search:**
- `deepSearch` action uses `pyra_file_index` table with `ILIKE` pattern matching
- Fallback to `recursiveListFiles()` if index is empty (max depth 10)
- Search fields: `file_name_lower`, `original_name`, `file_path`

#### 12.1.2 New Next.js Implementation Plan

**Architecture Pattern:** Server Components for initial listing + Client Components for interactions

```
app/
  (dashboard)/
    files/
      page.tsx                    # Server Component - initial file list
      layout.tsx                  # File manager layout with sidebar
      [..path]/
        page.tsx                  # Dynamic catch-all for folder navigation
      _components/
        file-browser.tsx          # Client - main browser container
        file-grid.tsx             # Client - grid view with thumbnails
        file-list.tsx             # Client - table/list view
        file-toolbar.tsx          # Client - action toolbar (upload, new folder, etc.)
        file-breadcrumbs.tsx      # Client - path breadcrumbs with click navigation
        file-preview-panel.tsx    # Client - right-side preview panel
        file-context-menu.tsx     # Client - right-click context menu
        file-upload-zone.tsx      # Client - drag-drop upload with progress
        file-search.tsx           # Client - search overlay with results
        file-rename-dialog.tsx    # Client - rename modal
        file-move-dialog.tsx      # Client - move/copy modal
        batch-actions-bar.tsx     # Client - multi-select action bar
```

**API Route Handlers:**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/files` | `GET` | List files with prefix, RBAC filtering | `action=list` |
| `/api/files` | `POST` | Upload file(s) with auto-versioning | `action=upload` |
| `/api/files` | `DELETE` | Delete single file (move to trash) | `action=delete` |
| `/api/files/batch` | `DELETE` | Batch delete files | `action=deleteBatch` |
| `/api/files/rename` | `PATCH` | Rename file/folder | `action=rename` |
| `/api/files/content` | `GET` | Get file content (text files) | `action=content` |
| `/api/files/content` | `PUT` | Save file content (text editor) | `action=save` |
| `/api/files/folder` | `POST` | Create new folder | `action=createFolder` |
| `/api/files/proxy` | `GET` | Proxy file content for preview | `action=proxy` |
| `/api/files/download` | `GET` | Download file with signed URL | `action=download` |
| `/api/files/public-url` | `GET` | Get public URL | `action=publicUrl` |
| `/api/files/search` | `GET` | Deep search across all files | `action=deepSearch` |
| `/api/files/index/rebuild` | `POST` | Rebuild file search index | `action=rebuildIndex` |

**State Management (Zustand):**

```typescript
// stores/file-store.ts
interface FileStore {
  // Navigation state
  currentPath: string;
  breadcrumbs: PathSegment[];

  // File data
  folders: FolderItem[];
  files: FileItem[];

  // UI state
  viewMode: 'grid' | 'list';
  selectedItems: Set<string>;
  previewFile: FileItem | null;
  sortBy: 'name' | 'size' | 'date';
  sortDirection: 'asc' | 'desc';

  // Search
  searchQuery: string;
  searchResults: FileItem[];
  isSearching: boolean;

  // Upload
  uploadQueue: UploadItem[];
  isUploading: boolean;

  // Actions
  navigateTo: (path: string) => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  toggleSelection: (path: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setPreviewFile: (file: FileItem | null) => void;
  addToUploadQueue: (files: File[]) => void;
}
```

**TanStack Query Keys:**

```typescript
export const fileKeys = {
  all: ['files'] as const,
  list: (path: string) => ['files', 'list', path] as const,
  search: (query: string) => ['files', 'search', query] as const,
  content: (path: string) => ['files', 'content', path] as const,
  preview: (path: string) => ['files', 'preview', path] as const,
};
```

**Key Migration Decisions:**
- Upload uses `tus-js-client` for resumable uploads to Supabase Storage
- Preview panel uses `@react-pdf/renderer` for PDF, `mammoth` for DOCX, native for images/video
- Drag-drop via `react-dropzone` with progress tracking
- File name sanitization moves server-side to API route handler
- Context menu via Radix UI `ContextMenu` primitive
- Virtual scrolling via `@tanstack/react-virtual` for large directories (1000+ items)

**Estimated Effort:** 8-10 days

---

### 12.2 User Management Module

#### 12.2.1 Current PHP Implementation Summary

| File | Responsibility | Lines |
|------|---------------|-------|
| `api/api.php` | 5 actions: `getUsers`, `getUsersLite`, `addUser`, `updateUser`, `deleteUser`, `changePassword` | ~180 |
| `includes/auth.php` | Functions: `findUser`, `getAllUsers`, `getAllUsersLite`, `createUser`, `updateUser`, `changeUserPassword`, `deleteUser` | ~110 |

**Current Data Model (`pyra_users`):**

| Column | Type | Notes |
|--------|------|-------|
| `id` | `SERIAL` | Auto-increment PK |
| `username` | `VARCHAR(50)` | Unique, used as FK across system |
| `password_hash` | `VARCHAR(255)` | bcrypt hash |
| `role` | `VARCHAR(20)` | `admin`, `employee`, `client` |
| `display_name` | `VARCHAR(100)` | Shown in UI |
| `permissions` | `JSONB` | Path-based permissions object |
| `created_at` | `TIMESTAMPTZ` | Auto-set |

**Current Permission JSON Structure:**
```json
{
  "paths": {
    "Clients/CompanyA": "full",
    "Clients/CompanyB": "browse",
    "Internal": "upload"
  },
  "per_folder": {
    "Clients/CompanyA": {
      "can_upload": true,
      "can_delete": true,
      "can_rename": true,
      "can_share": true
    }
  }
}
```

**Current RBAC Logic:**
- `canAccessPath(path)` checks if any permission path is a prefix of the target path (browse access)
- `isPathDirectlyAllowed(path)` checks for write-level permissions (upload/full)
- `hasPermission(perm)` checks role-based permissions (admin has all)
- `hasPathPermission(path, action)` combines user permissions + team permissions + file-level permissions
- `canAccessPathEnhanced(path)` is the master check: user perms OR team perms OR file-level perms
- Admin role bypasses all checks

**Current Restrictions:**
- Admin-only actions: `getUsers`, `addUser`, `updateUser`, `deleteUser`, `changePassword`
- Cannot delete yourself
- Username is immutable after creation
- Password is never returned in API responses (`unset($user['password_hash'])`)

#### 12.2.2 New Next.js Implementation Plan

**Architecture:** Migrate to Supabase Auth for authentication, keep custom RBAC in PostgreSQL.

```
app/
  (dashboard)/
    users/
      page.tsx                  # Server Component - user list
      _components/
        user-table.tsx          # Client - sortable/filterable user table
        user-create-dialog.tsx  # Client - create user modal
        user-edit-dialog.tsx    # Client - edit user with permission builder
        user-delete-dialog.tsx  # Client - confirmation dialog
        permission-builder.tsx  # Client - visual path permission editor
        role-badge.tsx          # Server - role display badge
```

**API Route Handlers:**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/users` | `GET` | List all users (admin) | `action=getUsers` |
| `/api/users/lite` | `GET` | List usernames + display names | `action=getUsersLite` |
| `/api/users` | `POST` | Create user with Supabase Auth + profile | `action=addUser` |
| `/api/users/[username]` | `PATCH` | Update user role/permissions/name | `action=updateUser` |
| `/api/users/[username]` | `DELETE` | Delete user | `action=deleteUser` |
| `/api/users/[username]/password` | `PATCH` | Change password | `action=changePassword` |

**Key Migration Change - Supabase Auth Integration:**

```typescript
// Current PHP: Manual bcrypt + session
// New: Supabase Auth + custom profile table

// Creating a user:
// 1. supabase.auth.admin.createUser({ email, password })
// 2. INSERT into pyra_users (id = auth.uid(), username, role, permissions)

// Login:
// 1. supabase.auth.signInWithPassword({ email, password })
// 2. Middleware reads session cookie, fetches pyra_users profile
// 3. Profile cached in session/cookie for RBAC checks
```

**Permission Builder Component:**
- Tree view showing Supabase Storage folder structure
- Checkboxes for `browse`, `upload`, `full` per folder
- Per-folder granular toggles: `can_upload`, `can_delete`, `can_rename`, `can_share`
- Preview of effective permissions with team inheritance shown

**Estimated Effort:** 5-6 days

---

### 12.3 Team Management Module

#### 12.3.1 Current PHP Implementation Summary

| File | Responsibility | Lines |
|------|---------------|-------|
| `api/api.php` | 6 actions: `getTeams`, `createTeam`, `updateTeam`, `deleteTeam`, `addTeamMember`, `removeTeamMember` | ~160 |
| `includes/auth.php` | Functions: `createTeam`, `getAllTeams`, `getTeam`, `updateTeam`, `deleteTeam`, `getTeamMembers`, `addTeamMember`, `removeTeamMember`, `getUserTeams` | ~150 |

**Current Data Model:**

**`pyra_teams`:**
| Column | Type | Notes |
|--------|------|-------|
| `id` | `VARCHAR(30)` | Generated ID (e.g., `team_1707926400_a3f2`) |
| `name` | `VARCHAR(100)` | Team name |
| `description` | `TEXT` | Optional description |
| `permissions` | `JSONB` | Same structure as user permissions |
| `created_by` | `VARCHAR(50)` | Admin who created |
| `created_at` | `TIMESTAMPTZ` | Auto-set |

**`pyra_team_members`:**
| Column | Type | Notes |
|--------|------|-------|
| `id` | `VARCHAR(30)` | Generated ID |
| `team_id` | `VARCHAR(30)` | FK to `pyra_teams` (CASCADE delete) |
| `username` | `VARCHAR(50)` | Member username |
| `added_by` | `VARCHAR(50)` | Who added |
| `added_at` | `TIMESTAMPTZ` | Auto-set |

**Current Team Permission Logic:**
- Team permissions are merged with user permissions in `canAccessPathEnhanced()`
- `getUserTeams(username)` fetches all teams for a user
- Team permission structure is identical to user permissions (paths + per_folder)
- If ANY team grants access, the user gets access (union of all permissions)

#### 12.3.2 New Next.js Implementation Plan

```
app/
  (dashboard)/
    teams/
      page.tsx                    # Server Component - team list
      [teamId]/
        page.tsx                  # Server Component - team detail
      _components/
        team-card-grid.tsx        # Client - team cards with member avatars
        team-create-dialog.tsx    # Client - create team modal
        team-edit-dialog.tsx      # Client - edit team name/description/permissions
        team-members-list.tsx     # Client - member list with add/remove
        team-permission-view.tsx  # Client - permission tree (reuses permission-builder)
        add-member-combobox.tsx   # Client - searchable user selector
```

**API Route Handlers:**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/teams` | `GET` | List all teams with member counts | `action=getTeams` |
| `/api/teams` | `POST` | Create team | `action=createTeam` |
| `/api/teams/[teamId]` | `PATCH` | Update team | `action=updateTeam` |
| `/api/teams/[teamId]` | `DELETE` | Delete team | `action=deleteTeam` |
| `/api/teams/[teamId]/members` | `POST` | Add member | `action=addTeamMember` |
| `/api/teams/[teamId]/members/[username]` | `DELETE` | Remove member | `action=removeTeamMember` |

**Estimated Effort:** 3-4 days

---

### 12.4 Review & Comment Module

#### 12.4.1 Current PHP Implementation Summary

| File | Responsibility | Lines |
|------|---------------|-------|
| `api/api.php` | 4 actions: `getReviews`, `addReview`, `resolveReview`, `deleteReview` | ~120 |
| `includes/auth.php` | Functions: `getFileReviews`, `addReview`, `toggleResolveReview`, `deleteReview`, `updateReviewPaths`, `parseMentions` | ~130 |

**Current Data Model (`pyra_reviews`):**

| Column | Type | Notes |
|--------|------|-------|
| `id` | `VARCHAR(20)` | Generated (e.g., `rev_1707926400_a3f2`) |
| `file_path` | `TEXT` | Path of reviewed file |
| `username` | `VARCHAR(50)` | Reviewer username |
| `display_name` | `VARCHAR(100)` | Reviewer display name |
| `type` | `VARCHAR(20)` | `comment` or `approval` |
| `text` | `TEXT` | Review/comment text |
| `resolved` | `BOOLEAN` | Resolved status |
| `parent_id` | `VARCHAR(20)` | NULL for top-level, ID for replies (threading) |
| `created_at` | `TIMESTAMPTZ` | Auto-set |

**Current Features:**
- Threaded replies via `parent_id` self-reference
- @mention parsing: `parseMentions(text)` extracts `@username` patterns, validates users exist
- Mentions trigger notifications via `createNotification()`
- Two review types: `comment` (text feedback) and `approval` (formal approval)
- Resolve/unresolve toggle for comments
- Review paths auto-update on file rename via `updateReviewPaths()`
- Notification types: `review_comment`, `review_mention`, `review_approval`

#### 12.4.2 New Next.js Implementation Plan

```
app/
  (dashboard)/
    files/
      _components/
        review-panel.tsx          # Client - side panel for file reviews
        review-thread.tsx         # Client - threaded comment display
        review-compose.tsx        # Client - comment input with @mention autocomplete
        review-item.tsx           # Client - single review with resolve/delete actions
        mention-autocomplete.tsx  # Client - @mention user picker (Combobox)
        approval-badge.tsx        # Server - approval status indicator
```

**API Route Handlers:**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/reviews` | `GET` | Get reviews for file path | `action=getReviews` |
| `/api/reviews` | `POST` | Add review/comment (with @mention parsing) | `action=addReview` |
| `/api/reviews/[id]/resolve` | `PATCH` | Toggle resolve status | `action=resolveReview` |
| `/api/reviews/[id]` | `DELETE` | Delete review | `action=deleteReview` |

**Real-Time Enhancement (New):**
- Supabase Realtime subscription on `pyra_reviews` table
- Live comment updates without polling
- Typing indicator for concurrent reviewers

**Estimated Effort:** 4-5 days

---

### 12.5 Notification Module

#### 12.5.1 Current PHP Implementation Summary

| File | Responsibility | Lines |
|------|---------------|-------|
| `api/api.php` | 4 actions: `getNotifications`, `getUnreadCount`, `markNotifRead`, `markAllNotifsRead` | ~80 |
| `includes/auth.php` | Functions: `createNotification`, `getNotifications`, `getUnreadNotificationCount`, `markNotificationRead`, `markAllNotificationsRead`, `findUsersWithPathAccess` | ~120 |

**Current Data Model (`pyra_notifications`):**

| Column | Type | Notes |
|--------|------|-------|
| `id` | `VARCHAR(30)` | Generated ID |
| `recipient_username` | `VARCHAR(50)` | Target user |
| `type` | `VARCHAR(30)` | Notification type (see below) |
| `title` | `VARCHAR(200)` | Notification title |
| `message` | `TEXT` | Full message |
| `source_username` | `VARCHAR(50)` | Who triggered |
| `source_display_name` | `VARCHAR(100)` | Display name of source |
| `target_path` | `TEXT` | Related file/folder path |
| `is_read` | `BOOLEAN` | Read status |
| `created_at` | `TIMESTAMPTZ` | Auto-set |

**Current Notification Types:**
- `review_comment` - New comment on a file
- `review_mention` - @mentioned in a comment
- `review_approval` - File approved
- `file_upload` - New file uploaded to accessible path
- `file_delete` - File deleted from accessible path
- `share_link` - Share link created for accessible file
- `permission_change` - Permissions modified
- `team_added` - Added to a team
- `team_removed` - Removed from a team

**Current Notification Targeting:**
- `findUsersWithPathAccess(path)` queries all users whose permissions include the given path
- Notifications sent to all users with access to the affected file/folder
- Admin always receives all notifications

#### 12.5.2 New Next.js Implementation Plan

```
app/
  (dashboard)/
    _components/
      notification-bell.tsx       # Client - bell icon with unread badge
      notification-dropdown.tsx   # Client - dropdown list of recent notifications
      notification-item.tsx       # Client - single notification with click-to-navigate
    notifications/
      page.tsx                    # Server Component - full notification history
      _components/
        notification-list.tsx     # Client - paginated full list
        notification-filters.tsx  # Client - filter by type/read status
```

**API Route Handlers:**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/notifications` | `GET` | Get paginated notifications | `action=getNotifications` |
| `/api/notifications/unread-count` | `GET` | Get unread count | `action=getUnreadCount` |
| `/api/notifications/[id]/read` | `PATCH` | Mark single as read | `action=markNotifRead` |
| `/api/notifications/read-all` | `PATCH` | Mark all as read | `action=markAllNotifsRead` |

**Real-Time Enhancement (New):**
```typescript
// Supabase Realtime subscription for live notifications
const channel = supabase
  .channel('notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'pyra_notifications',
    filter: `recipient_username=eq.${username}`,
  }, (payload) => {
    // Show toast + update bell badge
    toast({ title: payload.new.title, description: payload.new.message });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  })
  .subscribe();
```

**Estimated Effort:** 3-4 days

---

### 12.6 Activity Log Module

#### 12.6.1 Current PHP Implementation Summary

| File | Responsibility | Lines |
|------|---------------|-------|
| `api/api.php` | 1 action: `getActivityLog` | ~30 |
| `includes/auth.php` | Functions: `logActivity`, `getActivityLog` | ~60 |

**Current Data Model (`pyra_activity_log`):**

| Column | Type | Notes |
|--------|------|-------|
| `id` | `VARCHAR(30)` | Generated ID |
| `action_type` | `VARCHAR(30)` | Action name (see below) |
| `username` | `VARCHAR(50)` | Who performed |
| `display_name` | `VARCHAR(100)` | Display name |
| `target_path` | `TEXT` | Affected file/folder |
| `details` | `JSONB` | Action-specific metadata |
| `ip_address` | `VARCHAR(45)` | Client IP |
| `created_at` | `TIMESTAMPTZ` | Auto-set |

**Current Logged Action Types:**
`login`, `logout`, `upload`, `delete`, `rename`, `create_folder`, `save_content`, `move_to_trash`, `restore_from_trash`, `permanent_delete`, `empty_trash`, `create_share_link`, `deactivate_share`, `create_user`, `update_user`, `delete_user`, `change_password`, `create_team`, `update_team`, `delete_team`, `add_team_member`, `remove_team_member`, `set_file_permission`, `remove_file_permission`, `update_settings`, `rebuild_index`, `batch_delete`, `add_review`, `resolve_review`, `delete_review`

**Current Query Pattern:**
- Admin only: `GET /api/api.php?action=getActivityLog`
- Optional filters: `?type=upload&user=admin&limit=50&offset=0`
- Returns newest first (`ORDER BY created_at DESC`)
- Pagination via `limit`/`offset`

#### 12.6.2 New Next.js Implementation Plan

```
app/
  (dashboard)/
    activity/
      page.tsx                    # Server Component - activity log page
      _components/
        activity-timeline.tsx     # Client - vertical timeline display
        activity-filters.tsx      # Client - filter by type/user/date range
        activity-item.tsx         # Client - single log entry with icon + details
        activity-export.tsx       # Client - CSV/JSON export button
```

**API Route Handlers:**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/activity` | `GET` | Get paginated activity log | `action=getActivityLog` |
| `/api/activity/export` | `GET` | Export as CSV (new) | N/A |

**Enhancement: Server-Side Filtering via Supabase:**
```typescript
// Direct Supabase query with filters
const query = supabase
  .from('pyra_activity_log')
  .select('*')
  .order('created_at', { ascending: false })
  .range(offset, offset + limit - 1);

if (actionType) query.eq('action_type', actionType);
if (username) query.eq('username', username);
if (startDate) query.gte('created_at', startDate);
if (endDate) query.lte('created_at', endDate);
```

**Estimated Effort:** 2-3 days

---

### 12.7 Trash / Recycle Bin Module

#### 12.7.1 Current PHP Implementation Summary

| File | Responsibility | Lines |
|------|---------------|-------|
| `api/api.php` | 5 actions: `listTrash`, `restoreTrash`, `permanentDelete`, `emptyTrash`, `purgeExpired` | ~180 |
| `includes/auth.php` | Functions: `addTrashRecord`, `getTrashItems`, `getTrashRecord`, `deleteTrashRecord`, `getExpiredTrashItems` | ~80 |

**Current Trash Architecture:**
- Soft delete moves files to `.trash/` directory in Supabase Storage
- Trash path format: `.trash/{timestamp}_{random_hex}_{filename}`
- Metadata stored in `pyra_trash` table with `original_path`, `trash_path`, `deleted_by`
- Auto-purge: `auto_purge_at = NOW() + INTERVAL '30 days'` (configurable via `trash_auto_purge_days` setting)
- `purgeExpired` action deletes files past `auto_purge_at`
- Restore moves file back from `.trash/` to `original_path`
- File index updated on trash/restore operations

**Current Data Model (`pyra_trash`):**

| Column | Type | Notes |
|--------|------|-------|
| `id` | `VARCHAR(30)` | Generated ID |
| `original_path` | `TEXT` | Path before deletion |
| `trash_path` | `TEXT` | Current path in `.trash/` |
| `file_name` | `VARCHAR(255)` | Original filename |
| `file_size` | `BIGINT` | File size in bytes |
| `mime_type` | `VARCHAR(100)` | MIME type |
| `deleted_by` | `VARCHAR(50)` | Who deleted |
| `deleted_by_display` | `VARCHAR(100)` | Display name |
| `deleted_at` | `TIMESTAMPTZ` | When deleted |
| `auto_purge_at` | `TIMESTAMPTZ` | Auto-delete date (30 days default) |

#### 12.7.2 New Next.js Implementation Plan

```
app/
  (dashboard)/
    trash/
      page.tsx                    # Server Component - trash listing
      _components/
        trash-table.tsx           # Client - trash items with restore/delete
        trash-toolbar.tsx         # Client - empty trash, purge expired buttons
        trash-item-row.tsx        # Client - single item with original path, timer
        restore-dialog.tsx        # Client - restore confirmation
        empty-trash-dialog.tsx    # Client - "empty all" confirmation
```

**API Route Handlers:**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/trash` | `GET` | List trashed items | `action=listTrash` |
| `/api/trash/[id]/restore` | `POST` | Restore item to original path | `action=restoreTrash` |
| `/api/trash/[id]` | `DELETE` | Permanently delete | `action=permanentDelete` |
| `/api/trash/empty` | `DELETE` | Empty entire trash | `action=emptyTrash` |
| `/api/trash/purge-expired` | `DELETE` | Purge auto-expired items | `action=purgeExpired` |

**New Feature: Auto-Purge Cron (Vercel Cron Jobs):**
```typescript
// app/api/cron/trash-purge/route.ts
// Vercel cron: runs daily at 2:00 AM UTC
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch expired items and delete from storage + database
  const expired = await getExpiredTrashItems();
  for (const item of expired) {
    await supabase.storage.from(BUCKET).remove([item.trash_path]);
    await supabase.from('pyra_trash').delete().eq('id', item.id);
  }

  return Response.json({ purged: expired.length });
}
```

**Estimated Effort:** 3-4 days

---

### 12.8 Share Links Module

#### 12.8.1 Current PHP Implementation Summary

| File | Responsibility | Lines |
|------|---------------|-------|
| `api/api.php` | 4 actions: `createShareLink`, `getShareLinks`, `deactivateShareLink`, `shareAccess` | ~120 |
| `includes/auth.php` | Functions: `createShareLink`, `getShareLinkByToken`, `incrementShareAccess`, `getShareLinksForFile`, `deactivateShareLink`, `generateShareToken` | ~100 |

**Current Data Model (`pyra_share_links`):**

| Column | Type | Notes |
|--------|------|-------|
| `id` | `VARCHAR(30)` | Generated ID |
| `token` | `VARCHAR(64)` | Unique random token (32 bytes hex) |
| `file_path` | `TEXT` | Shared file path |
| `file_name` | `VARCHAR(255)` | Display filename |
| `created_by` | `VARCHAR(50)` | Creator username |
| `created_by_display` | `VARCHAR(100)` | Creator display name |
| `expires_at` | `TIMESTAMPTZ` | Expiry timestamp |
| `access_count` | `INT` | Times accessed |
| `max_access` | `INT` | Max allowed accesses (0 = unlimited) |
| `is_active` | `BOOLEAN` | Active status |
| `created_at` | `TIMESTAMPTZ` | Auto-set |

**Current Share Link Flow:**
1. User creates share link: generates 32-byte hex token, sets expiry (default from `share_default_expiry_hours` setting)
2. Share URL format: `{base_url}/api/api.php?action=shareAccess&token={token}`
3. `shareAccess` validates token, checks expiry, checks `max_access`, increments `access_count`
4. Returns signed URL (1-hour) for the file if valid
5. No authentication required for share access (public action)

#### 12.8.2 New Next.js Implementation Plan

```
app/
  (dashboard)/
    files/
      _components/
        share-dialog.tsx          # Client - create share link modal
        share-links-list.tsx      # Client - active shares for a file
        share-link-item.tsx       # Client - single link with copy/deactivate
  share/
    [token]/
      page.tsx                    # Server Component - public share access page
      _components/
        share-preview.tsx         # Client - file preview for shared files
        share-download.tsx        # Client - download button
        share-expired.tsx         # Server - expired/invalid link message
```

**API Route Handlers:**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/shares` | `POST` | Create share link | `action=createShareLink` |
| `/api/shares` | `GET` | Get shares for file | `action=getShareLinks` |
| `/api/shares/[id]` | `DELETE` | Deactivate share link | `action=deactivateShareLink` |
| `/api/shares/access/[token]` | `GET` | Public share access | `action=shareAccess` |

**Estimated Effort:** 3-4 days

---

### 12.9 Settings Module

#### 12.9.1 Current PHP Implementation Summary

| File | Responsibility | Lines |
|------|---------------|-------|
| `api/api.php` | 3 actions: `getSettings`, `updateSettings`, `getPublicSettings` | ~60 |
| `includes/auth.php` | Functions: `getSettings`, `getSetting`, `updateSetting`, `getPublicSettings` | ~70 |

**Current Settings (`pyra_settings`):**

| Key | Default Value | Purpose |
|-----|--------------|---------|
| `app_name` | `Pyra Workspace` | Application name |
| `app_logo_url` | (empty) | Logo URL |
| `primary_color` | `#8b5cf6` | Theme primary color |
| `max_upload_size` | `524288000` (500MB) | Max file upload size |
| `allow_public_shares` | `true` | Enable/disable sharing |
| `share_default_expiry_hours` | `24` | Default share link duration |
| `session_timeout_minutes` | `480` | Session timeout (8 hours) |
| `max_failed_logins` | `5` | Before account lockout |
| `lockout_duration_minutes` | `15` | Lockout period |
| `auto_version_on_upload` | `true` | Auto-create version on upload |
| `max_versions_per_file` | `10` | Max version history |
| `trash_auto_purge_days` | `30` | Days before auto-purge |
| `quote_number_counter` | `1` | Quote number sequence |
| `quote_number_prefix` | `QT-` | Quote number prefix |
| `quote_default_expiry_days` | `30` | Quote expiry duration |
| `quote_company_name` | `Pyramedia` | Company name for quotes |

**Access Control:**
- `getSettings` and `updateSettings`: Admin only
- `getPublicSettings`: No auth required (returns `app_name`, `app_logo_url`, `primary_color`)

#### 12.9.2 New Next.js Implementation Plan

```
app/
  (dashboard)/
    settings/
      page.tsx                    # Server Component - settings page
      _components/
        settings-form.tsx         # Client - full settings form
        general-settings.tsx      # Client - app name, logo, color
        security-settings.tsx     # Client - login/session settings
        storage-settings.tsx      # Client - upload, versioning, trash
        share-settings.tsx        # Client - share link defaults
        quote-settings.tsx        # Client - quote numbering, company
        logo-uploader.tsx         # Client - logo upload with preview
        color-picker.tsx          # Client - theme color picker
```

**API Route Handlers:**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/settings` | `GET` | Get all settings (admin) | `action=getSettings` |
| `/api/settings` | `PATCH` | Update settings (admin) | `action=updateSettings` |
| `/api/settings/public` | `GET` | Get public settings (no auth) | `action=getPublicSettings` |

**Estimated Effort:** 2-3 days

---

### 12.10 Dashboard Module

#### 12.10.1 Current PHP Implementation Summary

| File | Responsibility | Lines |
|------|---------------|-------|
| `api/api.php` | 1 action: `getDashboard` | ~80 |

**Current Dashboard Data (Role-Based):**

**Admin Dashboard:**
- Total files count (from file index)
- Total storage used (sum of file sizes)
- Total users count
- Total teams count
- Recent activity log (last 10)
- Active share links count
- Trash items count
- Pending approvals count (from portal)

**Employee Dashboard:**
- Accessible files count (filtered by permissions)
- Recent activity (own actions, last 10)
- Unread notifications count
- Favorite files list

**Client Dashboard:**
- (Handled by portal, not main dashboard)

#### 12.10.2 New Next.js Implementation Plan

```
app/
  (dashboard)/
    page.tsx                      # Server Component - main dashboard
    _components/
      dashboard-admin.tsx         # Server - admin dashboard layout
      dashboard-employee.tsx      # Server - employee dashboard layout
      stat-card.tsx               # Client - animated stat card (GSAP)
      recent-activity-feed.tsx    # Client - live activity feed
      storage-usage-chart.tsx     # Client - storage usage visualization
      quick-actions.tsx           # Client - quick action buttons
      favorites-widget.tsx        # Client - pinned favorites
      pending-approvals.tsx       # Client - pending approvals widget
```

**API Route Handlers:**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/dashboard` | `GET` | Get role-based dashboard data | `action=getDashboard` |
| `/api/favorites` | `GET` | Get user favorites | `action=getFavorites` |
| `/api/favorites` | `POST` | Add favorite | `action=addFavorite` |
| `/api/favorites/[id]` | `DELETE` | Remove favorite | `action=removeFavorite` |

**Animation Stack:**
- Stat cards use GSAP `countTo` animation on mount
- Glassmorphism cards with CSS `backdrop-filter: blur()`
- Gradient backgrounds matching current PHP implementation
- Staggered entrance animations via GSAP `ScrollTrigger`

**Estimated Effort:** 4-5 days

---

### 12.11 Quotation & Contract Module

#### 12.11.1 Current PHP Implementation Summary

| File | Responsibility | Lines |
|------|---------------|-------|
| `api/api.php` | 1 compound action: `manage_quotes` with sub-actions: `create`, `update`, `delete`, `duplicate`, `send`, `list`, `get` | ~200 |
| `includes/auth.php` | Functions: `generateQuoteId`, `generateQuoteItemId`, `generateNextQuoteNumber` | ~40 |

**Current Data Model:**

**`pyra_quotes`:**
| Column | Type | Notes |
|--------|------|-------|
| `id` | `TEXT` | Generated (e.g., `qt_1707926400_a3f2`) |
| `quote_number` | `TEXT` | Sequential (e.g., `QT-001`) |
| `client_id` | `TEXT` | FK to `pyra_clients` |
| `project_name` | `TEXT` | Project/quote name |
| `status` | `TEXT` | `draft`, `sent`, `viewed`, `signed`, `expired`, `cancelled` |
| `estimate_date` | `DATE` | Quote date |
| `expiry_date` | `DATE` | Expiry date |
| `currency` | `TEXT` | Default `AED` |
| `subtotal` | `NUMERIC(12,2)` | Sum of line items |
| `tax_rate` | `NUMERIC(5,2)` | Tax percentage (default 15%) |
| `tax_amount` | `NUMERIC(12,2)` | Calculated tax |
| `total` | `NUMERIC(12,2)` | Grand total |
| `notes` | `TEXT` | Additional notes |
| `terms_conditions` | `JSONB` | Array of terms |
| `bank_details` | `JSONB` | Bank info object |
| `company_name` | `TEXT` | Issuing company |
| `company_logo` | `TEXT` | Logo URL |
| `client_name` | `TEXT` | Client name (denormalized) |
| `client_email` | `TEXT` | Client email |
| `client_company` | `TEXT` | Client company |
| `client_phone` | `TEXT` | Client phone |
| `client_address` | `TEXT` | Client address |
| `signature_data` | `TEXT` | Base64 signature image |
| `signed_by` | `TEXT` | Signer name |
| `signed_at` | `TIMESTAMPTZ` | Signature timestamp |
| `signed_ip` | `TEXT` | Signer IP address |
| `sent_at` | `TIMESTAMPTZ` | When sent to client |
| `viewed_at` | `TIMESTAMPTZ` | When first viewed |
| `created_by` | `TEXT` | Creator username |

**`pyra_quote_items`:**
| Column | Type | Notes |
|--------|------|-------|
| `id` | `TEXT` | Generated ID |
| `quote_id` | `TEXT` | FK to `pyra_quotes` (CASCADE) |
| `sort_order` | `INT` | Display order |
| `description` | `TEXT` | Line item description |
| `quantity` | `NUMERIC(10,2)` | Quantity |
| `rate` | `NUMERIC(12,2)` | Unit rate |
| `amount` | `NUMERIC(12,2)` | Line total (qty x rate) |

**Current Quote Flow:**
1. Admin creates quote with line items, selects client
2. Quote number auto-incremented from `pyra_settings.quote_number_counter`
3. Admin sends quote: status changes to `sent`, email sent to client
4. Client views in portal: status changes to `viewed`
5. Client signs: Canvas signature captured, stored as base64 in `signature_data`
6. PDF generation: Client-side via `html2canvas` + `jsPDF`

**Current Portal Quote Endpoints (portal/index.php):**
- `client_quotes` - List quotes for client's company
- `client_quote_detail` - Get single quote with items
- `client_sign_quote` - Submit signature (signature_data, signed_by, IP)

#### 12.11.2 New Next.js Implementation Plan

```
app/
  (dashboard)/
    quotes/
      page.tsx                    # Server Component - quote list
      new/
        page.tsx                  # Client Component - quote builder
      [quoteId]/
        page.tsx                  # Server Component - quote detail
        edit/
          page.tsx                # Client Component - edit quote
      _components/
        quote-table.tsx           # Client - filterable quote list
        quote-builder.tsx         # Client - full quote creation form
        quote-line-items.tsx      # Client - draggable line items editor
        quote-preview.tsx         # Client - live preview of quote PDF
        quote-pdf.tsx             # Server - PDF generation (@react-pdf/renderer)
        quote-send-dialog.tsx     # Client - send to client modal
        quote-status-badge.tsx    # Server - status badge component
        client-selector.tsx       # Client - client search/select combobox
        signature-pad.tsx         # Client - canvas signature component
```

**API Route Handlers:**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/quotes` | `GET` | List quotes with filters | `manage_quotes` sub=list |
| `/api/quotes` | `POST` | Create quote with items | `manage_quotes` sub=create |
| `/api/quotes/[id]` | `GET` | Get quote detail with items | `manage_quotes` sub=get |
| `/api/quotes/[id]` | `PATCH` | Update quote and items | `manage_quotes` sub=update |
| `/api/quotes/[id]` | `DELETE` | Delete quote | `manage_quotes` sub=delete |
| `/api/quotes/[id]/duplicate` | `POST` | Duplicate quote | `manage_quotes` sub=duplicate |
| `/api/quotes/[id]/send` | `POST` | Send to client via email | `manage_quotes` sub=send |
| `/api/quotes/[id]/pdf` | `GET` | Generate and download PDF | N/A (was client-side) |

**PDF Generation Migration:**
```typescript
// Current: Client-side html2canvas + jsPDF
// New: Server-side @react-pdf/renderer

// app/api/quotes/[id]/pdf/route.ts
import { renderToBuffer } from '@react-pdf/renderer';
import { QuotePDFDocument } from '@/components/quotes/quote-pdf-document';

export async function GET(req, { params }) {
  const quote = await getQuoteWithItems(params.id);
  const pdfBuffer = await renderToBuffer(
    <QuotePDFDocument quote={quote} />
  );

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${quote.quote_number}.pdf"`,
    },
  });
}
```

**Estimated Effort:** 6-8 days

---

### 12.12 Client Portal Module

#### 12.12.1 Current PHP Implementation Summary

| File | Responsibility | Lines |
|------|---------------|-------|
| `portal/index.php` | Complete portal: API (22 actions) + HTML/JS SPA | ~1200 |
| `includes/auth.php` | Client auth: `isClientLoggedIn`, `getClientData`, `requireClientAuth`, `validateClientCsrf`, `isClientAccountLocked`, `recordClientLoginAttempt`, `sendClientEmail`, `_sendSmtpEmail`, `getEmailTemplate` | ~250 |

**Current Portal API Actions (22 total):**

| Action | Purpose |
|--------|---------|
| `client_login` | Client authentication (email + password) |
| `client_logout` | End client session |
| `client_session` | Check session status |
| `client_forgot_password` | Send reset email with token |
| `client_reset_password` | Reset password via token |
| `client_dashboard` | Dashboard: projects, approvals, files, notifications |
| `client_projects` | List client's projects |
| `client_project_detail` | Single project with files and approvals |
| `client_file_preview` | Get signed URL for file preview |
| `client_download` | Download file |
| `client_approve_file` | Approve a file |
| `client_request_revision` | Request revision with comment |
| `client_get_comments` | Get threaded comments for project/file |
| `client_add_comment` | Add comment (threaded, with notifications) |
| `client_unread_count` | Unread notification count |
| `client_notifications` | List client notifications |
| `client_mark_notif_read` | Mark notification read |
| `client_mark_all_read` | Mark all notifications read |
| `client_profile` | Get client profile |
| `client_update_profile` | Update name, phone, company |
| `client_change_password` | Change client password |
| `client_quotes` | List quotes for client company |
| `client_quote_detail` | Quote detail with items |
| `client_sign_quote` | Submit e-signature |

**Current Portal Architecture:**
- Completely separate from main app (different `portal/index.php` entry point)
- Separate PHP session namespace (`client_id` vs `user`)
- Arabic RTL interface (`lang="ar" dir="rtl"`)
- Cairo font (Arabic-optimized Google Font)
- Separate session management and CSRF protection
- Email system: raw SMTP via `fsockopen` (port 587, STARTTLS) with branded HTML templates
- All queries scoped by `client_company` for data isolation

**Current Portal Database Tables (7):**
- `pyra_clients` - Client accounts (email auth, company-scoped)
- `pyra_projects` - Projects linked to client company
- `pyra_project_files` - Files within projects (categories: general, design, video, document, audio)
- `pyra_file_approvals` - Approval workflow (pending, approved, revision_requested)
- `pyra_client_comments` - Threaded comments (author_type: client/team)
- `pyra_client_notifications` - Client notifications (separate from team notifications)
- `pyra_client_password_resets` - Password reset tokens

**Current Admin Portal Management (in api.php):**
- `manage_clients` - CRUD for client accounts (admin only)
- `manage_projects` - CRUD for projects (admin only)
- `manage_project_files` - Add/remove files to projects (admin only)
- `team_reply_to_client` - Team members reply to client comments
- `getClientComments` - Admin view of client comments

#### 12.12.2 New Next.js Implementation Plan

**Architecture: Separate Route Group with Independent Auth Boundary**

```
app/
  (portal)/
    layout.tsx                    # Portal layout - RTL, Cairo font, Arabic
    login/
      page.tsx                    # Client login page
    forgot-password/
      page.tsx                    # Password reset request
    reset-password/
      page.tsx                    # Password reset form
    dashboard/
      page.tsx                    # Server Component - client dashboard
    projects/
      page.tsx                    # Server Component - project list
      [projectId]/
        page.tsx                  # Server Component - project detail
        _components/
          project-files.tsx       # Client - file grid with categories
          file-approval-card.tsx  # Client - approve/revision UI
          comment-thread.tsx      # Client - threaded comments
          comment-compose.tsx     # Client - comment input
    quotes/
      page.tsx                    # Server Component - quote list
      [quoteId]/
        page.tsx                  # Server Component - quote detail
        _components/
          quote-view.tsx          # Client - rendered quote
          signature-pad.tsx       # Client - e-signature canvas
    profile/
      page.tsx                    # Server Component - profile settings
    notifications/
      page.tsx                    # Server Component - notification list
    _components/
      portal-header.tsx           # Client - RTL header with nav
      portal-sidebar.tsx          # Client - Arabic sidebar navigation
      portal-notification-bell.tsx # Client - notification bell

  (dashboard)/
    clients/
      page.tsx                    # Server - admin client management
      _components/
        client-table.tsx          # Client - client list
        client-create-dialog.tsx  # Client - create client
        client-edit-dialog.tsx    # Client - edit client
    projects/
      page.tsx                    # Server - admin project management
      [projectId]/
        page.tsx                  # Server - project detail
        _components/
          project-files-manager.tsx # Client - manage project files
          project-comments.tsx    # Client - view/reply to comments
```

**API Route Handlers (Portal):**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/portal/auth/login` | `POST` | Client login | `client_login` |
| `/api/portal/auth/logout` | `POST` | Client logout | `client_logout` |
| `/api/portal/auth/session` | `GET` | Session check | `client_session` |
| `/api/portal/auth/forgot-password` | `POST` | Send reset email | `client_forgot_password` |
| `/api/portal/auth/reset-password` | `POST` | Reset password | `client_reset_password` |
| `/api/portal/dashboard` | `GET` | Client dashboard data | `client_dashboard` |
| `/api/portal/projects` | `GET` | Client's projects | `client_projects` |
| `/api/portal/projects/[id]` | `GET` | Project detail | `client_project_detail` |
| `/api/portal/files/[id]/preview` | `GET` | File preview URL | `client_file_preview` |
| `/api/portal/files/[id]/download` | `GET` | Download file | `client_download` |
| `/api/portal/files/[id]/approve` | `POST` | Approve file | `client_approve_file` |
| `/api/portal/files/[id]/revision` | `POST` | Request revision | `client_request_revision` |
| `/api/portal/comments` | `GET` | Get comments | `client_get_comments` |
| `/api/portal/comments` | `POST` | Add comment | `client_add_comment` |
| `/api/portal/notifications` | `GET` | List notifications | `client_notifications` |
| `/api/portal/notifications/unread` | `GET` | Unread count | `client_unread_count` |
| `/api/portal/notifications/[id]/read` | `PATCH` | Mark read | `client_mark_notif_read` |
| `/api/portal/notifications/read-all` | `PATCH` | Mark all read | `client_mark_all_read` |
| `/api/portal/profile` | `GET` | Get profile | `client_profile` |
| `/api/portal/profile` | `PATCH` | Update profile | `client_update_profile` |
| `/api/portal/profile/password` | `PATCH` | Change password | `client_change_password` |
| `/api/portal/quotes` | `GET` | List quotes | `client_quotes` |
| `/api/portal/quotes/[id]` | `GET` | Quote detail | `client_quote_detail` |
| `/api/portal/quotes/[id]/sign` | `POST` | Submit signature | `client_sign_quote` |

**API Route Handlers (Admin Portal Management):**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/clients` | `GET` | List clients | `manage_clients` sub=list |
| `/api/clients` | `POST` | Create client | `manage_clients` sub=create |
| `/api/clients/[id]` | `PATCH` | Update client | `manage_clients` sub=update |
| `/api/clients/[id]` | `DELETE` | Delete client | `manage_clients` sub=delete |
| `/api/projects` | `GET` | List projects | `manage_projects` sub=list |
| `/api/projects` | `POST` | Create project | `manage_projects` sub=create |
| `/api/projects/[id]` | `PATCH` | Update project | `manage_projects` sub=update |
| `/api/projects/[id]` | `DELETE` | Delete project | `manage_projects` sub=delete |
| `/api/projects/[id]/files` | `POST` | Add file to project | `manage_project_files` sub=add |
| `/api/projects/[id]/files/[fileId]` | `DELETE` | Remove file from project | `manage_project_files` sub=remove |
| `/api/projects/[id]/comments` | `GET` | Get comments (admin) | `getClientComments` |
| `/api/projects/[id]/comments` | `POST` | Team reply | `team_reply_to_client` |

**RTL/Localization:**
```typescript
// app/(portal)/layout.tsx
export default function PortalLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${cairoFont.className} antialiased`}>
        <PortalHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}
```

**Email Migration (SMTP to Resend):**
```typescript
// Current: Raw fsockopen SMTP with STARTTLS
// New: Resend SDK

import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'Pyramedia <noreply@pyramedia.cloud>',
  to: clientEmail,
  subject: 'عرض سعر جديد - Pyramedia',  // Arabic subject
  html: getEmailTemplate({ ... }),          // RTL branded HTML
});
```

**Estimated Effort:** 10-12 days

---

### 12.13 Session & Security Module

#### 12.13.1 Current PHP Implementation Summary

| File | Responsibility | Lines |
|------|---------------|-------|
| `api/api.php` | 3 actions: `getSessions`, `terminateSession`, `terminateAllSessions`, `getLoginHistory` | ~80 |
| `includes/auth.php` | Functions: `recordLoginAttempt`, `isAccountLocked`, `createSessionRecord`, `trackSession`, `getUserSessions`, `terminateSession`, `terminateAllSessions`, `generateCsrfToken`, `validateCsrfToken`, `getLoginHistory` | ~200 |

**Current Security Features:**
- PHP sessions with `httponly`, `samesite=Strict`, `secure` flags
- CSRF protection: 32-byte hex token in session, validated on all non-GET requests
- Account lockout: Configurable max failed attempts (default 5) and lockout duration (default 15 min)
- Session tracking: `pyra_sessions` table with IP, user agent, last activity
- Login history: `pyra_login_attempts` table with success/fail flag
- Session regeneration on login (`session_regenerate_id(true)`)
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- 200ms artificial delay on login to mitigate brute force

#### 12.13.2 New Next.js Implementation Plan

**Architecture: Supabase Auth + Next.js Middleware**

```
middleware.ts                     # Auth check, session refresh, RBAC routing
lib/
  supabase/
    server.ts                     # Server-side Supabase client factory
    client.ts                     # Client-side Supabase client factory
    middleware.ts                 # Middleware Supabase client
  auth/
    session.ts                   # Session helpers
    rbac.ts                      # Permission checking utilities

app/
  (dashboard)/
    sessions/
      page.tsx                   # Server - active sessions list
      _components/
        session-table.tsx        # Client - sessions with terminate buttons
        login-history.tsx        # Client - login attempt history
```

**API Route Handlers:**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/auth/login` | `POST` | Login via Supabase Auth | `action=login` |
| `/api/auth/logout` | `POST` | Logout, terminate session | `action=logout` |
| `/api/auth/session` | `GET` | Session status + user info | `action=session` |
| `/api/sessions` | `GET` | List active sessions | `action=getSessions` |
| `/api/sessions/[id]` | `DELETE` | Terminate session | `action=terminateSession` |
| `/api/sessions/terminate-all` | `DELETE` | Terminate all sessions | `action=terminateAllSessions` |
| `/api/auth/login-history` | `GET` | Login attempt history | `action=getLoginHistory` |

**Estimated Effort:** 4-5 days

---

### 12.14 File Versioning Module

#### 12.14.1 Current PHP Implementation Summary

| File | Responsibility | Lines |
|------|---------------|-------|
| `api/api.php` | 3 actions: `getFileVersions`, `restoreVersion`, `deleteVersion` | ~100 |
| `includes/auth.php` | Functions: `getFileVersions`, `createFileVersionRecord`, `deleteFileVersionRecord`, `getNextVersionNumber` | ~70 |
| `api/api.php` | Helper: `createFileVersion()` | ~50 |

**Current Version Architecture:**
- Versions stored in `.versions/{file_path}/{timestamp}_{filename}` in Supabase Storage
- Metadata in `pyra_file_versions` table
- Auto-versioning on upload (configurable via `auto_version_on_upload` setting)
- Max versions per file (configurable, default 10) with oldest-first eviction
- Restore copies version content back to original path
- Version numbering is sequential per file

**Current Data Model (`pyra_file_versions`):**

| Column | Type | Notes |
|--------|------|-------|
| `id` | `VARCHAR(30)` | Generated ID |
| `file_path` | `TEXT` | Original file path |
| `version_path` | `TEXT` | Path in `.versions/` |
| `version_number` | `INT` | Sequential number |
| `file_size` | `BIGINT` | Version file size |
| `mime_type` | `VARCHAR(100)` | MIME type |
| `created_by` | `VARCHAR(50)` | Who triggered version |
| `created_by_display` | `VARCHAR(100)` | Display name |
| `comment` | `TEXT` | Optional version comment |
| `created_at` | `TIMESTAMPTZ` | When created |

#### 12.14.2 New Next.js Implementation Plan

```
app/
  (dashboard)/
    files/
      _components/
        version-panel.tsx         # Client - version history side panel
        version-item.tsx          # Client - single version with restore/delete/preview
        version-compare.tsx       # Client - side-by-side comparison (new feature)
        version-diff.tsx          # Client - text diff viewer for code files (new)
```

**API Route Handlers:**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/files/versions` | `GET` | Get versions for file | `action=getFileVersions` |
| `/api/files/versions/[id]/restore` | `POST` | Restore version | `action=restoreVersion` |
| `/api/files/versions/[id]` | `DELETE` | Delete version | `action=deleteVersion` |

**Estimated Effort:** 3-4 days

---

### 12.15 File Permissions Module

#### 12.15.1 Current PHP Implementation Summary

| File | Responsibility | Lines |
|------|---------------|-------|
| `api/api.php` | 4 actions: `setFilePermission`, `getFilePermissions`, `removeFilePermission`, `cleanExpiredPermissions` | ~100 |
| `includes/auth.php` | Functions: `setFilePermission`, `getFilePermissions`, `removeFilePermission`, `getEffectiveFilePermissions`, `cleanExpiredFilePermissions` | ~120 |

**Current Data Model (`pyra_file_permissions`):**

| Column | Type | Notes |
|--------|------|-------|
| `id` | `VARCHAR(30)` | Generated ID |
| `file_path` | `TEXT` | File/folder path |
| `target_type` | `VARCHAR(10)` | `user` or `team` |
| `target_id` | `VARCHAR(100)` | Username or team ID |
| `permissions` | `JSONB` | `{"can_view":true,"can_edit":true,"can_delete":false}` |
| `expires_at` | `TIMESTAMPTZ` | Optional expiry |
| `created_by` | `VARCHAR(50)` | Admin who set |
| `created_at` | `TIMESTAMPTZ` | Auto-set |

**Current Permission Resolution Order:**
1. Check if user is admin (bypass all)
2. Check user's `pyra_users.permissions` paths
3. Check user's team permissions (all teams the user belongs to)
4. Check file-level permissions (`pyra_file_permissions`)
5. Result: Union of all granted permissions

#### 12.15.2 New Next.js Implementation Plan

```
app/
  (dashboard)/
    files/
      _components/
        file-permissions-dialog.tsx  # Client - set permissions modal
        permission-target-select.tsx # Client - user/team selector
        permission-level-select.tsx  # Client - permission level checkboxes
        effective-permissions.tsx    # Client - show resolved permissions
```

**API Route Handlers:**

| Route | Method | Purpose | PHP Equivalent |
|-------|--------|---------|----------------|
| `/api/file-permissions` | `GET` | Get permissions for path | `action=getFilePermissions` |
| `/api/file-permissions` | `POST` | Set file permission | `action=setFilePermission` |
| `/api/file-permissions/[id]` | `DELETE` | Remove permission | `action=removeFilePermission` |
| `/api/file-permissions/cleanup` | `DELETE` | Clean expired | `action=cleanExpiredPermissions` |

**Estimated Effort:** 3-4 days

---

## SECTION 12 SUMMARY

| # | Module | PHP Actions | New API Routes | Components | Est. Days |
|---|--------|------------|----------------|------------|-----------|
| 12.1 | File Manager | 12 | 13 | 12 | 8-10 |
| 12.2 | User Management | 6 | 6 | 6 | 5-6 |
| 12.3 | Team Management | 6 | 6 | 6 | 3-4 |
| 12.4 | Review & Comment | 4 | 4 | 6 | 4-5 |
| 12.5 | Notification | 4 | 4 | 5 | 3-4 |
| 12.6 | Activity Log | 1 | 2 | 4 | 2-3 |
| 12.7 | Trash / Recycle Bin | 5 | 5 | 5 | 3-4 |
| 12.8 | Share Links | 4 | 4 | 6 | 3-4 |
| 12.9 | Settings | 3 | 3 | 8 | 2-3 |
| 12.10 | Dashboard | 1+3 | 4 | 7 | 4-5 |
| 12.11 | Quotation & Contract | 7+3 | 8 | 9 | 6-8 |
| 12.12 | Client Portal | 22+5 | 25 | 15+ | 10-12 |
| 12.13 | Session & Security | 4 | 6 | 3 | 4-5 |
| 12.14 | File Versioning | 3 | 3 | 4 | 3-4 |
| 12.15 | File Permissions | 4 | 4 | 4 | 3-4 |
| **Total** | | **~90** | **~97** | **~100** | **~65-81** |

---

## SECTION 13: DATA MIGRATION STRATEGY

### 13.1 Database Migration Assessment

Pyra Workspace uses Supabase PostgreSQL as its database, which remains unchanged in the migration. There is **no database migration required** -- the same Supabase instance, tables, indexes, and data will be used by the Next.js application. This is a major advantage that significantly reduces migration risk.

#### 13.1.1 Current Database Inventory

| Category | Tables | Total Columns | Indexes | Views |
|----------|--------|---------------|---------|-------|
| Core (schema.sql) | 15 | ~95 | 28 | 0 |
| Portal (portal-schema.sql) | 7 | ~55 | 12 | 2 |
| Quotes (migration_quotes.sql) | 2 | ~35 | 3 | 0 |
| **Total** | **24** | **~185** | **43** | **2** |

**Complete Table Listing:**

| # | Table | PK Type | Row Estimate | RLS |
|---|-------|---------|-------------|-----|
| 1 | `pyra_users` | `SERIAL` | <50 | Disabled |
| 2 | `pyra_reviews` | `VARCHAR(20)` | <500 | Disabled |
| 3 | `pyra_trash` | `VARCHAR(30)` | <200 | Disabled |
| 4 | `pyra_activity_log` | `VARCHAR(30)` | <10,000 | Disabled |
| 5 | `pyra_notifications` | `VARCHAR(30)` | <5,000 | Disabled |
| 6 | `pyra_share_links` | `VARCHAR(30)` | <500 | Disabled |
| 7 | `pyra_teams` | `VARCHAR(30)` | <20 | Disabled |
| 8 | `pyra_team_members` | `VARCHAR(30)` | <100 | Disabled |
| 9 | `pyra_file_permissions` | `VARCHAR(30)` | <200 | Disabled |
| 10 | `pyra_file_versions` | `VARCHAR(30)` | <2,000 | Disabled |
| 11 | `pyra_file_index` | `VARCHAR(30)` | <5,000 | Disabled |
| 12 | `pyra_settings` | `VARCHAR(100)` | ~16 | Disabled |
| 13 | `pyra_sessions` | `VARCHAR(128)` | <50 | Disabled |
| 14 | `pyra_login_attempts` | `SERIAL` | <1,000 | Disabled |
| 15 | `pyra_favorites` | `VARCHAR(30)` | <500 | Disabled |
| 16 | `pyra_clients` | `VARCHAR(20)` | <100 | Disabled |
| 17 | `pyra_projects` | `VARCHAR(20)` | <200 | Disabled |
| 18 | `pyra_project_files` | `VARCHAR(20)` | <2,000 | Disabled |
| 19 | `pyra_file_approvals` | `VARCHAR(20)` | <1,000 | Disabled |
| 20 | `pyra_client_comments` | `VARCHAR(20)` | <2,000 | Disabled |
| 21 | `pyra_client_notifications` | `VARCHAR(20)` | <5,000 | Disabled |
| 22 | `pyra_client_password_resets` | `VARCHAR(20)` | <100 | Disabled |
| 23 | `pyra_quotes` | `TEXT` | <500 | Enabled (service_role) |
| 24 | `pyra_quote_items` | `TEXT` | <2,000 | Enabled (service_role) |

### 13.2 Schema Modifications for Next.js

While the database stays, several schema modifications are needed to support the new architecture:

#### 13.2.1 User Table Migration (Supabase Auth Integration)

The most significant data change: migrating from custom auth (`pyra_users`) to Supabase Auth.

**Migration SQL:**

```sql
-- Step 1: Add auth_uid column to pyra_users
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS auth_uid UUID UNIQUE;

-- Step 2: For each user, create Supabase Auth user and link
-- This is done programmatically via supabase.auth.admin.createUser()
-- After creating each auth user, update pyra_users:
-- UPDATE pyra_users SET auth_uid = '{auth_user_id}' WHERE username = '{username}';

-- Step 3: Add email column (required by Supabase Auth)
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS email VARCHAR(150);

-- Step 4: Create index on auth_uid
CREATE INDEX IF NOT EXISTS idx_users_auth_uid ON pyra_users(auth_uid);

-- Step 5: After migration verified, password_hash column can be dropped
-- ALTER TABLE pyra_users DROP COLUMN password_hash;  -- ONLY after full verification
```

**User Migration Script (Node.js):**

```typescript
// scripts/migrate-users.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function migrateUsers() {
  // Fetch all existing users
  const { data: users } = await supabase
    .from('pyra_users')
    .select('username, display_name, role, password_hash');

  for (const user of users) {
    // Create Supabase Auth user
    const { data: authUser, error } = await supabase.auth.admin.createUser({
      email: `${user.username}@pyramedia.cloud`,  // Generate email from username
      password: generateTempPassword(),            // Temp password, force reset
      email_confirm: true,
      user_metadata: {
        display_name: user.display_name,
        username: user.username,
        role: user.role,
      },
    });

    if (authUser) {
      // Link auth user to profile
      await supabase
        .from('pyra_users')
        .update({ auth_uid: authUser.user.id, email: authUser.user.email })
        .eq('username', user.username);
    }
  }
}
```

#### 13.2.2 RLS Policy Migration

**Current State:** All 24 tables have RLS disabled. The PHP app uses the `service_role` key for all operations, effectively bypassing RLS.

**Target State:** Enable RLS on user-facing tables with policies that enforce data isolation:

```sql
-- Enable RLS on notifications (example)
ALTER TABLE pyra_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users read own notifications"
  ON pyra_notifications FOR SELECT
  USING (recipient_username = (
    SELECT username FROM pyra_users WHERE auth_uid = auth.uid()
  ));

-- Service role bypass for server-side operations
CREATE POLICY "Service role full access"
  ON pyra_notifications FOR ALL
  USING (auth.role() = 'service_role');
```

**RLS Migration Priority:**

| Priority | Tables | Reason |
|----------|--------|--------|
| P0 (Critical) | `pyra_users`, `pyra_sessions`, `pyra_login_attempts` | Auth-sensitive |
| P1 (High) | `pyra_notifications`, `pyra_favorites`, `pyra_client_*` | User-scoped data |
| P2 (Medium) | `pyra_reviews`, `pyra_file_permissions` | Permission-dependent |
| P3 (Low) | `pyra_activity_log`, `pyra_settings`, `pyra_trash` | Admin-only access |

#### 13.2.3 New Settings Keys

```sql
-- New settings for Next.js features
INSERT INTO pyra_settings (key, value) VALUES
  ('next_app_url', 'https://workspace.pyramedia.cloud'),
  ('portal_app_url', 'https://portal.pyramedia.cloud'),
  ('resend_api_key_configured', 'false'),
  ('realtime_enabled', 'true'),
  ('maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;
```

### 13.3 Storage Migration

**No migration needed.** Supabase Storage bucket `pyraai-workspace` remains identical. The Next.js application will use the `@supabase/supabase-js` SDK to interact with the same bucket, same files, same folder structure.

**Storage Access Pattern Change:**

| Aspect | PHP (Current) | Next.js (New) |
|--------|--------------|---------------|
| SDK | cURL HTTP requests | `@supabase/supabase-js` SDK |
| Auth | `service_role` key in header | SDK with service role or user JWT |
| Upload | `storageRequest('POST', ...)` | `supabase.storage.from(bucket).upload()` |
| Download | `storageRequest('GET', ...)` | `supabase.storage.from(bucket).download()` |
| Delete | `storageRequest('DELETE', ...)` | `supabase.storage.from(bucket).remove()` |
| Move/Rename | `supabaseRequest('POST', '/object/move')` | `supabase.storage.from(bucket).move()` |
| List | `supabaseRequest('POST', '/object/list/')` | `supabase.storage.from(bucket).list()` |
| Public URL | Manual URL construction | `supabase.storage.from(bucket).getPublicUrl()` |
| Signed URL | `supabaseRequest('POST', '/object/sign/')` | `supabase.storage.from(bucket).createSignedUrl()` |

### 13.4 Migration Execution Plan

#### Phase 1: Pre-Migration (No Downtime)

- [ ] Add `auth_uid` and `email` columns to `pyra_users`
- [ ] Add new settings keys
- [ ] Run user migration script (create Supabase Auth accounts)
- [ ] Verify all auth_uid values are populated
- [ ] Test Supabase Auth login for migrated users
- [ ] Create RLS policies (but keep RLS disabled)

#### Phase 2: Parallel Operation (No Downtime)

- [ ] Deploy Next.js app alongside PHP app on separate subdomain
- [ ] Both apps read/write same database and storage
- [ ] Verify data consistency between both apps
- [ ] Monitor for conflicts (session isolation is key)

#### Phase 3: Cutover (Brief Downtime Window)

- [ ] Put PHP app in maintenance mode
- [ ] Enable RLS policies on all tables
- [ ] Switch DNS from PHP to Next.js
- [ ] Verify all features work on Next.js
- [ ] Keep PHP app available on fallback URL for 2 weeks

#### Phase 4: Cleanup (Post-Migration)

- [ ] Drop `password_hash` column from `pyra_users` (after 30-day grace period)
- [ ] Remove PHP-specific session data from `pyra_sessions`
- [ ] Archive PHP codebase
- [ ] Update all documentation

**Rollback Plan:**
- If critical issues found during cutover: switch DNS back to PHP
- PHP app remains fully functional (shared database)
- RLS policies can be disabled in minutes via SQL if they cause issues
- User `password_hash` column retained for 30 days as fallback

---

## SECTION 14: TESTING STRATEGY

### 14.1 Testing Pyramid

```
                    ┌─────────┐
                    │  E2E    │  5-10 critical flows
                    │  Tests  │  Playwright
                    ├─────────┤
                  ┌─┤  Integ  ├─┐  20-30 API route tests
                  │ │  Tests  │ │  Supertest + Supabase
                  │ ├─────────┤ │
                ┌─┤ │Component│ ├─┐  50-80 component tests
                │ │ │  Tests  │ │ │  React Testing Library
                │ │ ├─────────┤ │ │
              ┌─┤ │ │  Unit   │ │ ├─┐  100+ unit tests
              │ │ │ │  Tests  │ │ │ │  Vitest
              └─┴─┴─┴─────────┴─┴─┴─┘
```

| Layer | Tool | Target Coverage | Est. Tests |
|-------|------|----------------|------------|
| Unit Tests | Vitest | 80%+ functions, utils, hooks | 100-150 |
| Component Tests | React Testing Library + Vitest | 70%+ components | 50-80 |
| Integration Tests | Vitest + Supabase test client | 90%+ API routes | 20-30 |
| E2E Tests | Playwright | Critical user flows | 10-15 |
| **Total** | | | **180-275** |

### 14.2 Unit Testing Specifications

**Framework:** Vitest (compatible with Next.js 15, faster than Jest)

**Configuration:**
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['node_modules', 'tests', '*.config.*'],
      thresholds: {
        branches: 70,
        functions: 75,
        lines: 75,
        statements: 75,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

**Unit Test Categories:**

| Category | Functions to Test | Priority |
|----------|------------------|----------|
| RBAC / Permissions | `canAccessPath`, `isPathAllowed`, `hasPermission`, `getEffectivePermissions`, `hasPathPermission` | P0 |
| File Path Utils | `sanitizePath`, `sanitizeFileName`, `getExtension`, `buildBreadcrumbs` | P0 |
| Auth Helpers | `validateSession`, `isSessionExpired`, `checkAccountLockout` | P0 |
| Data Formatters | `formatFileSize`, `formatDate`, `formatCurrency`, `truncatePath` | P1 |
| ID Generators | `generateId`, `generateToken`, `generateQuoteNumber` | P1 |
| Notification Logic | `findUsersWithPathAccess`, `buildNotificationMessage` | P1 |
| Mention Parser | `parseMentions`, `extractMentions` | P2 |
| Search Utils | `buildSearchQuery`, `highlightMatch` | P2 |

**Example RBAC Unit Tests:**

```typescript
// tests/unit/lib/auth/rbac.test.ts
import { describe, it, expect } from 'vitest';
import { canAccessPath, isPathDirectlyAllowed, getEffectivePermissions } from '@/lib/auth/rbac';

describe('canAccessPath', () => {
  const adminUser = { role: 'admin', permissions: {} };
  const employeeUser = {
    role: 'employee',
    permissions: {
      paths: {
        'Clients/CompanyA': 'full',
        'Clients/CompanyB': 'browse',
        'Internal/Docs': 'upload',
      },
      per_folder: {
        'Clients/CompanyA': { can_upload: true, can_delete: true },
      },
    },
  };

  it('should grant admin access to any path', () => {
    expect(canAccessPath(adminUser, 'any/path')).toBe(true);
    expect(canAccessPath(adminUser, '')).toBe(true);
  });

  it('should grant access to exact permitted path', () => {
    expect(canAccessPath(employeeUser, 'Clients/CompanyA')).toBe(true);
  });

  it('should grant access to child of permitted path', () => {
    expect(canAccessPath(employeeUser, 'Clients/CompanyA/subfolder')).toBe(true);
  });

  it('should deny access to non-permitted path', () => {
    expect(canAccessPath(employeeUser, 'Clients/CompanyC')).toBe(false);
  });

  it('should grant browse access to parent of permitted path', () => {
    expect(canAccessPath(employeeUser, 'Clients')).toBe(true);
  });

  it('should deny access to sibling of permitted path', () => {
    expect(canAccessPath(employeeUser, 'Clients/CompanyD/files')).toBe(false);
  });
});

describe('isPathDirectlyAllowed', () => {
  const user = {
    role: 'employee',
    permissions: {
      paths: {
        'Clients/CompanyA': 'full',
        'Clients/CompanyB': 'browse',
        'Internal': 'upload',
      },
    },
  };

  it('should allow write for "full" permission', () => {
    expect(isPathDirectlyAllowed(user, 'Clients/CompanyA/file.pdf')).toBe(true);
  });

  it('should deny write for "browse" permission', () => {
    expect(isPathDirectlyAllowed(user, 'Clients/CompanyB/file.pdf')).toBe(false);
  });

  it('should allow write for "upload" permission', () => {
    expect(isPathDirectlyAllowed(user, 'Internal/file.pdf')).toBe(true);
  });
});
```

### 14.3 Component Testing Specifications

**Framework:** React Testing Library + Vitest

**Component Test Categories:**

| Component | Test Focus | Priority |
|-----------|-----------|----------|
| `file-browser.tsx` | Renders files/folders, click navigation, selection | P0 |
| `file-upload-zone.tsx` | Drag-drop events, progress display, error states | P0 |
| `permission-builder.tsx` | Permission JSON construction, tree interaction | P0 |
| `review-thread.tsx` | Thread rendering, @mention display, resolve toggle | P1 |
| `notification-bell.tsx` | Unread count badge, dropdown toggle | P1 |
| `quote-builder.tsx` | Line item CRUD, total calculation, validation | P1 |
| `signature-pad.tsx` | Canvas drawing, base64 export, clear action | P1 |
| `trash-table.tsx` | Restore action, purge timer display | P2 |
| `share-dialog.tsx` | Link generation, copy to clipboard, expiry input | P2 |
| `activity-timeline.tsx` | Filter application, pagination, item rendering | P2 |

**Example Component Test:**

```typescript
// tests/components/file-upload-zone.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileUploadZone } from '@/app/(dashboard)/files/_components/file-upload-zone';

describe('FileUploadZone', () => {
  it('should show drop overlay when files are dragged over', () => {
    render(<FileUploadZone currentPath="test" onUpload={vi.fn()} />);
    const zone = screen.getByTestId('upload-zone');

    fireEvent.dragEnter(zone, {
      dataTransfer: { types: ['Files'] },
    });

    expect(screen.getByText(/drop files here/i)).toBeInTheDocument();
  });

  it('should call onUpload with files when dropped', async () => {
    const onUpload = vi.fn();
    render(<FileUploadZone currentPath="test" onUpload={onUpload} />);
    const zone = screen.getByTestId('upload-zone');

    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.drop(zone, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledWith([file]);
    });
  });

  it('should reject files exceeding max size', async () => {
    render(<FileUploadZone currentPath="test" maxSize={1024} onUpload={vi.fn()} />);
    const zone = screen.getByTestId('upload-zone');

    const largeFile = new File(['x'.repeat(2048)], 'large.pdf', { type: 'application/pdf' });
    fireEvent.drop(zone, {
      dataTransfer: { files: [largeFile] },
    });

    await waitFor(() => {
      expect(screen.getByText(/file too large/i)).toBeInTheDocument();
    });
  });
});
```

### 14.4 Integration Testing Specifications

**Framework:** Vitest + Supabase Test Client

**Test Database Strategy:**
- Use a separate Supabase project for testing (or test schema)
- Seed data before each test suite, clean up after
- Use transactions for test isolation where possible

**Integration Test Suites:**

| Suite | Routes Tested | Priority |
|-------|--------------|----------|
| Auth Flow | `/api/auth/login`, `/api/auth/logout`, `/api/auth/session` | P0 |
| File CRUD | `/api/files` (GET, POST, DELETE, PATCH) | P0 |
| RBAC Enforcement | All routes with different user roles | P0 |
| User CRUD | `/api/users` (GET, POST, PATCH, DELETE) | P1 |
| Team CRUD | `/api/teams` (GET, POST, PATCH, DELETE) + members | P1 |
| Review CRUD | `/api/reviews` (GET, POST, PATCH, DELETE) | P1 |
| Notification Flow | Create notification -> fetch -> mark read | P1 |
| Trash Flow | Delete -> list trash -> restore / permanent delete | P1 |
| Share Link Flow | Create -> access -> deactivate -> verify expired | P2 |
| Quote Flow | Create -> add items -> send -> client view -> sign | P2 |
| Portal Auth | `/api/portal/auth/*` login/logout/reset | P2 |
| Settings | `/api/settings` GET/PATCH with admin vs non-admin | P2 |

**Example Integration Test:**

```typescript
// tests/integration/api/files.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestClient, seedTestData, cleanupTestData } from '@/tests/helpers';

describe('File API Routes', () => {
  let adminClient: TestClient;
  let employeeClient: TestClient;

  beforeAll(async () => {
    await seedTestData();
    adminClient = await createTestClient('admin');
    employeeClient = await createTestClient('employee', {
      permissions: { paths: { 'TestFolder': 'full' } }
    });
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('GET /api/files', () => {
    it('should list files at root for admin', async () => {
      const res = await adminClient.get('/api/files?prefix=');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.folders).toBeDefined();
      expect(res.body.files).toBeDefined();
    });

    it('should filter files for employee by permissions', async () => {
      const res = await employeeClient.get('/api/files?prefix=');
      expect(res.status).toBe(200);
      const folderNames = res.body.folders.map(f => f.name);
      expect(folderNames).toContain('TestFolder');
      expect(folderNames).not.toContain('AdminOnly');
    });

    it('should deny access to unauthorized path', async () => {
      const res = await employeeClient.get('/api/files?prefix=AdminOnly');
      expect(res.status).toBe(403);
    });

    it('should hide .trash and .versions folders', async () => {
      const res = await adminClient.get('/api/files?prefix=');
      const folderNames = res.body.folders.map(f => f.name);
      expect(folderNames).not.toContain('.trash');
      expect(folderNames).not.toContain('.versions');
    });
  });

  describe('POST /api/files (upload)', () => {
    it('should upload file to permitted path', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['test content']), 'test.txt');
      formData.append('prefix', 'TestFolder');

      const res = await employeeClient.post('/api/files', formData);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.path).toContain('TestFolder/test.txt');
    });

    it('should create version on upload if auto-versioning enabled', async () => {
      // Upload same file twice
      const formData = new FormData();
      formData.append('file', new Blob(['updated']), 'test.txt');
      formData.append('prefix', 'TestFolder');

      await employeeClient.post('/api/files', formData);

      const versions = await adminClient.get('/api/files/versions?path=TestFolder/test.txt');
      expect(versions.body.length).toBeGreaterThanOrEqual(1);
    });
  });
});
```

### 14.5 End-to-End Testing Specifications

**Framework:** Playwright

**Configuration:**
```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,   // Sequential for state-dependent tests
  retries: 2,
  reporter: [['html'], ['github']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
});
```

**E2E Test Flows:**

| # | Flow | Steps | Priority |
|---|------|-------|----------|
| 1 | Admin Login & Dashboard | Login -> verify dashboard stats -> check widgets | P0 |
| 2 | File Upload & Browse | Login -> navigate to folder -> upload file -> verify in list | P0 |
| 3 | File Preview & Download | Browse -> click file -> preview panel -> download | P0 |
| 4 | User CRUD | Login as admin -> create user -> edit permissions -> delete | P0 |
| 5 | RBAC Enforcement | Login as employee -> verify restricted folders hidden | P0 |
| 6 | Review & Comment | Open file -> add comment with @mention -> resolve | P1 |
| 7 | Trash Workflow | Delete file -> open trash -> restore -> verify | P1 |
| 8 | Share Link | Create share link -> open in incognito -> verify access | P1 |
| 9 | Quote Creation | Create quote -> add items -> preview PDF -> send | P1 |
| 10 | Client Portal Login | Portal login -> view projects -> approve file | P1 |
| 11 | Client Portal Quote Sign | View quote -> sign with canvas -> verify signed status | P2 |
| 12 | Team Management | Create team -> add members -> set permissions -> verify access | P2 |
| 13 | Settings Update | Change app name -> verify reflected in UI | P2 |
| 14 | Search | Upload file with Arabic name -> search -> verify found | P2 |
| 15 | RTL Portal Navigation | Login to portal -> verify RTL layout -> navigate all pages | P2 |

**Example E2E Test:**

```typescript
// tests/e2e/file-upload.spec.ts
import { test, expect } from '@playwright/test';

test.describe('File Upload Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="username"]', 'admin');
    await page.fill('[name="password"]', 'testpass');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should upload a file via drag and drop', async ({ page }) => {
    // Navigate to test folder
    await page.click('text=TestFolder');
    await page.waitForSelector('[data-testid="file-browser"]');

    // Create a test file buffer
    const buffer = Buffer.from('Test file content for E2E');

    // Trigger file input (since drag-drop is complex in Playwright)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'e2e-test.txt',
      mimeType: 'text/plain',
      buffer,
    });

    // Wait for upload to complete
    await expect(page.locator('text=e2e-test.txt')).toBeVisible({ timeout: 10_000 });

    // Verify file appears in list
    const fileItem = page.locator('[data-testid="file-item"]', { hasText: 'e2e-test.txt' });
    await expect(fileItem).toBeVisible();
  });

  test('should show upload progress for large files', async ({ page }) => {
    await page.click('text=TestFolder');

    const largeBuffer = Buffer.alloc(5 * 1024 * 1024, 'x'); // 5MB
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'large-file.bin',
      mimeType: 'application/octet-stream',
      buffer: largeBuffer,
    });

    // Progress bar should appear
    await expect(page.locator('[data-testid="upload-progress"]')).toBeVisible();
  });
});
```

### 14.6 Testing CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  unit-and-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit --coverage
      - run: pnpm test:integration
      - uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info

  e2e:
    runs-on: ubuntu-latest
    needs: unit-and-integration
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: npx playwright install --with-deps
      - run: pnpm build
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm type-check

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
```

---

## SECTION 15: DEPLOYMENT & DEVOPS

### 15.1 Hosting Architecture

| Component | Platform | Reason |
|-----------|----------|--------|
| Next.js Application | Vercel | Native Next.js support, edge functions, ISR |
| Database | Supabase (existing) | Already in use, no migration needed |
| File Storage | Supabase Storage (existing) | Already in use, bucket stays |
| Email | Resend | Modern email API, React Email templates |
| DNS | Cloudflare | Current DNS provider |
| Monitoring | Vercel Analytics + Sentry | Error tracking + performance |

### 15.2 Environment Configuration

**Environment Variables:**

| Variable | Scope | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service role key (full access) |
| `NEXT_PUBLIC_STORAGE_BUCKET` | Client + Server | `pyraai-workspace` |
| `RESEND_API_KEY` | Server only | Resend email API key |
| `CRON_SECRET` | Server only | Vercel cron authentication |
| `NEXT_PUBLIC_APP_URL` | Client + Server | `https://workspace.pyramedia.cloud` |
| `NEXT_PUBLIC_PORTAL_URL` | Client + Server | `https://portal.pyramedia.cloud` |
| `SENTRY_DSN` | Server only | Sentry error tracking |
| `SENTRY_AUTH_TOKEN` | Build only | Sentry source map upload |

**Environment Files:**

```
.env.local              # Local development (gitignored)
.env.development        # Development defaults (committed)
.env.production         # Production defaults (committed, no secrets)
.env.test               # Test environment
```

### 15.3 Vercel Configuration

```json
// vercel.json
{
  "framework": "nextjs",
  "buildCommand": "pnpm build",
  "installCommand": "pnpm install --frozen-lockfile",
  "regions": ["cdg1"],
  "crons": [
    {
      "path": "/api/cron/trash-purge",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/clean-expired-permissions",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/clean-expired-shares",
      "schedule": "0 4 * * *"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "X-DNS-Prefetch-Control", "value": "on" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }
      ]
    }
  ]
}
```

### 15.4 CI/CD Pipeline

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Push /   │───>│  Lint &  │───>│  Unit &  │───>│  Build   │
│  PR Open  │    │  Type    │    │  Integ   │    │  Check   │
│           │    │  Check   │    │  Tests   │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                      │
                                                      v
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Post-    │<───│  Deploy  │<───│  E2E     │<───│ Preview  │
│ Deploy   │    │  Prod    │    │  Tests   │    │ Deploy   │
│ Verify   │    │ (main)   │    │ (Preview)│    │ (Vercel) │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

**Branch Strategy:**

| Branch | Purpose | Auto-Deploy |
|--------|---------|-------------|
| `main` | Production | Yes (production) |
| `develop` | Integration | Yes (staging preview) |
| `feature/*` | Feature branches | Yes (PR preview) |
| `hotfix/*` | Critical fixes | Yes (PR preview) |

**Deployment Checks (Required Before Merge):**

- [ ] TypeScript type check passes
- [ ] ESLint passes with zero errors
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Build succeeds without errors
- [ ] Preview deployment is accessible
- [ ] E2E tests pass on preview deployment
- [ ] Bundle size within budget (< 350KB first load JS)
- [ ] Lighthouse score >= 90 (performance)

---

## SECTION 16: MIGRATION TIMELINE

### 16.1 Phase Overview

```
Week 1-2    │ Phase 0: Foundation & Setup
Week 2-3    │ Phase 1: Auth & Core Layout
Week 3-4    │ Phase 2: File Manager (Core)
Week 4-5    │ Phase 3: User & Team Management
Week 5-6    │ Phase 4: Reviews, Notifications, Activity
Week 6-7    │ Phase 5: Trash, Share, Settings, Dashboard
Week 7-8    │ Phase 6: Quotation & Contract System
Week 8-9    │ Phase 7: Client Portal
Week 9-10   │ Phase 8: Testing, Polish & Deployment
```

### 16.2 Detailed Phase Breakdown

#### Phase 0: Foundation & Setup (Week 1-2, 8-10 days)

| # | Task | Est. Days | Dependencies |
|---|------|-----------|-------------|
| 0.1 | Initialize Next.js 15 project with TypeScript | 0.5 | None |
| 0.2 | Configure pnpm, ESLint, Prettier, Husky | 0.5 | 0.1 |
| 0.3 | Set up Tailwind CSS + shadcn/ui + Cairo font | 1 | 0.1 |
| 0.4 | Configure Supabase SDK (server + client + middleware) | 1 | 0.1 |
| 0.5 | Set up project structure (all directories) | 0.5 | 0.1 |
| 0.6 | Create shared TypeScript types for all 24 tables | 1.5 | 0.1 |
| 0.7 | Set up Zustand stores (file, auth, ui, notifications) | 1 | 0.6 |
| 0.8 | Configure TanStack Query provider + query key factory | 0.5 | 0.1 |
| 0.9 | Set up Vitest + React Testing Library + Playwright | 1 | 0.1 |
| 0.10 | Create reusable UI primitives (Button, Dialog, etc.) | 1 | 0.3 |
| 0.11 | Set up Vercel project + environment variables | 0.5 | 0.1 |

**Phase 0 Deliverables:**
- [x] Running Next.js app with basic route structure
- [x] Supabase connection verified (read from `pyra_settings`)
- [x] Type definitions for all database tables
- [x] CI pipeline running lint + type check
- [x] First Vercel preview deployment

#### Phase 1: Auth & Core Layout (Week 2-3, 6-8 days)

| # | Task | Est. Days | Dependencies |
|---|------|-----------|-------------|
| 1.1 | Implement Supabase Auth login page | 1 | Phase 0 |
| 1.2 | Create auth middleware (session check, redirect) | 1.5 | 1.1 |
| 1.3 | Build RBAC utility functions (port from PHP) | 2 | 0.6 |
| 1.4 | Create dashboard layout (sidebar, header, breadcrumbs) | 1.5 | 0.10 |
| 1.5 | Implement session management (active sessions, terminate) | 1 | 1.2 |
| 1.6 | Port login history and account lockout | 0.5 | 1.2 |
| 1.7 | Write RBAC unit tests (full coverage) | 1 | 1.3 |

**Phase 1 Deliverables:**
- [x] Working login/logout flow
- [x] Protected routes with middleware
- [x] RBAC functions with 90%+ test coverage
- [x] Dashboard layout shell

#### Phase 2: File Manager (Week 3-4, 8-10 days)

| # | Task | Est. Days | Dependencies |
|---|------|-----------|-------------|
| 2.1 | File listing API route with RBAC filtering | 1.5 | Phase 1 |
| 2.2 | File browser component (grid + list views) | 2 | 2.1 |
| 2.3 | File upload with drag-drop and progress | 1.5 | 2.1 |
| 2.4 | File preview panel (images, PDF, DOCX, video) | 2 | 2.2 |
| 2.5 | File operations (rename, delete, create folder) | 1 | 2.1 |
| 2.6 | Deep search with index | 1 | 2.1 |
| 2.7 | Batch operations (select all, batch delete) | 0.5 | 2.5 |
| 2.8 | Context menu | 0.5 | 2.2 |

**Phase 2 Deliverables:**
- [x] Full file manager with browse, upload, preview, search
- [x] RBAC-filtered file listing
- [x] Drag-drop upload with progress
- [x] File preview for all supported types

#### Phase 3: User & Team Management (Week 4-5, 6-8 days)

| # | Task | Est. Days | Dependencies |
|---|------|-----------|-------------|
| 3.1 | User CRUD API routes | 1 | Phase 1 |
| 3.2 | User management UI (table, create, edit, delete) | 1.5 | 3.1 |
| 3.3 | Permission builder component | 2 | 3.2 |
| 3.4 | Team CRUD API routes | 1 | Phase 1 |
| 3.5 | Team management UI (cards, members, permissions) | 1.5 | 3.4 |
| 3.6 | File-level permissions API + UI | 1 | 3.1 |

**Phase 3 Deliverables:**
- [x] User CRUD with visual permission builder
- [x] Team CRUD with member management
- [x] File-level permission management

#### Phase 4: Reviews, Notifications, Activity (Week 5-6, 7-9 days)

| # | Task | Est. Days | Dependencies |
|---|------|-----------|-------------|
| 4.1 | Review API routes (CRUD + @mentions) | 1 | Phase 2 |
| 4.2 | Review panel UI (threads, compose, resolve) | 2 | 4.1 |
| 4.3 | Notification API routes | 0.5 | Phase 1 |
| 4.4 | Notification bell + dropdown + full page | 1.5 | 4.3 |
| 4.5 | Supabase Realtime for notifications | 1 | 4.3 |
| 4.6 | Activity log API + timeline UI | 1.5 | Phase 1 |
| 4.7 | Activity log export (CSV) | 0.5 | 4.6 |

**Phase 4 Deliverables:**
- [x] Threaded reviews with @mentions
- [x] Real-time notifications via Supabase Realtime
- [x] Activity log with filters and export

#### Phase 5: Trash, Share, Settings, Dashboard (Week 6-7, 8-10 days)

| # | Task | Est. Days | Dependencies |
|---|------|-----------|-------------|
| 5.1 | Trash API routes (list, restore, delete, purge) | 1 | Phase 2 |
| 5.2 | Trash management UI | 1 | 5.1 |
| 5.3 | Auto-purge cron job | 0.5 | 5.1 |
| 5.4 | Share link API routes | 1 | Phase 2 |
| 5.5 | Share link UI (create, list, deactivate) | 1 | 5.4 |
| 5.6 | Public share access page | 1 | 5.4 |
| 5.7 | Settings API + admin UI | 1.5 | Phase 1 |
| 5.8 | Dashboard API + stat cards + widgets | 2 | Phase 2 |
| 5.9 | Favorites API + UI | 0.5 | Phase 2 |

**Phase 5 Deliverables:**
- [x] Trash management with auto-purge cron
- [x] Share links with public access page
- [x] Settings panel
- [x] Dashboard with animated stat cards

#### Phase 6: Quotation & Contract System (Week 7-8, 6-8 days)

| # | Task | Est. Days | Dependencies |
|---|------|-----------|-------------|
| 6.1 | Quote CRUD API routes | 1 | Phase 1 |
| 6.2 | Quote list + status filters | 1 | 6.1 |
| 6.3 | Quote builder (line items, client selector) | 2 | 6.1 |
| 6.4 | Quote PDF generation (@react-pdf/renderer) | 1.5 | 6.3 |
| 6.5 | Quote send via email (Resend) | 0.5 | 6.4 |
| 6.6 | File version management UI | 1 | Phase 2 |

**Phase 6 Deliverables:**
- [x] Quote creation with line items
- [x] Server-side PDF generation
- [x] Email sending via Resend
- [x] File version history panel

#### Phase 7: Client Portal (Week 8-9, 10-12 days)

| # | Task | Est. Days | Dependencies |
|---|------|-----------|-------------|
| 7.1 | Portal layout (RTL, Cairo font, Arabic UI) | 1.5 | Phase 0 |
| 7.2 | Portal auth (login, forgot/reset password) | 1.5 | Phase 1 |
| 7.3 | Portal dashboard | 1 | 7.2 |
| 7.4 | Project list + detail + file preview | 2 | 7.2 |
| 7.5 | File approval workflow (approve/revision) | 1 | 7.4 |
| 7.6 | Threaded comments (client + team) | 1.5 | 7.4 |
| 7.7 | Client notifications | 0.5 | 7.2 |
| 7.8 | Client profile + password change | 0.5 | 7.2 |
| 7.9 | Client quote view + e-signature | 1.5 | Phase 6 |
| 7.10 | Admin client/project management pages | 1 | Phase 3 |

**Phase 7 Deliverables:**
- [x] Full Arabic RTL client portal
- [x] File approval workflow
- [x] Threaded comments between client and team
- [x] E-signature on quotes

#### Phase 8: Testing, Polish & Deployment (Week 9-10, 8-10 days)

| # | Task | Est. Days | Dependencies |
|---|------|-----------|-------------|
| 8.1 | Write remaining unit tests (coverage target: 75%) | 2 | All phases |
| 8.2 | Write E2E tests (15 critical flows) | 2 | All phases |
| 8.3 | Performance optimization (bundle size, LCP) | 1.5 | All phases |
| 8.4 | Accessibility audit (WCAG 2.1 AA) | 1 | All phases |
| 8.5 | Security audit (CSRF, XSS, auth bypass) | 1 | All phases |
| 8.6 | User migration script execution | 0.5 | Phase 1 |
| 8.7 | Production deployment + DNS switch | 0.5 | 8.1-8.6 |
| 8.8 | Post-deployment monitoring + hotfixes | 1.5 | 8.7 |

**Phase 8 Deliverables:**
- [x] 75%+ test coverage
- [x] All 15 E2E flows passing
- [x] Lighthouse score >= 90
- [x] Production deployment live

### 16.3 Timeline Summary

| Phase | Duration | Cumulative | Key Milestone |
|-------|----------|-----------|---------------|
| Phase 0 | 8-10 days | Week 1-2 | Project scaffold deployed |
| Phase 1 | 6-8 days | Week 2-3 | Auth + RBAC working |
| Phase 2 | 8-10 days | Week 3-4 | File manager operational |
| Phase 3 | 6-8 days | Week 4-5 | User/team management |
| Phase 4 | 7-9 days | Week 5-6 | Reviews + notifications live |
| Phase 5 | 8-10 days | Week 6-7 | All secondary features |
| Phase 6 | 6-8 days | Week 7-8 | Quotes + versioning |
| Phase 7 | 10-12 days | Week 8-9 | Portal complete |
| Phase 8 | 8-10 days | Week 9-10 | Production launch |
| **Total** | **67-85 days** | **~10 weeks** | **Full migration** |

**Critical Path:**
```
Phase 0 -> Phase 1 -> Phase 2 -> Phase 4 (reviews need files)
                                -> Phase 5 (trash/share need files)
                                -> Phase 6 (quotes independent)
                        Phase 3 (users can parallel with Phase 2)
Phase 6 -> Phase 7.9 (portal quotes need quote system)
Phase 1 -> Phase 7.2 (portal auth needs auth system)
```

---

## SECTION 17: RISK ASSESSMENT & MITIGATION

### 17.1 Risk Matrix

| # | Risk | Probability | Impact | Severity | Mitigation |
|---|------|------------|--------|----------|------------|
| R1 | Supabase Auth migration breaks existing user sessions | High | High | **Critical** | Run parallel auth for 2 weeks; keep PHP session fallback; force password reset for all users |
| R2 | RBAC logic port introduces permission bypass | Medium | Critical | **Critical** | 90%+ unit test coverage on RBAC; test with all 3 roles; diff PHP vs Next.js permission results |
| R3 | File upload fails for large files (>100MB) | Medium | High | **High** | Use tus-js-client for resumable uploads; set Vercel function timeout to 300s; chunk uploads |
| R4 | Arabic filename handling differs between PHP and Next.js | Medium | Medium | **High** | Port `sanitizeFileName()` exactly; test with 50+ Arabic filenames; maintain file index compatibility |
| R5 | Supabase Realtime connection drops cause missed notifications | Medium | Medium | **Medium** | Implement reconnection logic; poll as fallback every 30s; queue missed notifications |
| R6 | Bundle size exceeds Vercel limits | Low | High | **Medium** | Monitor with `@next/bundle-analyzer`; dynamic imports for heavy libraries (PDF, DOCX); target <350KB first load |
| R7 | Client portal RTL layout breaks in some browsers | Low | Medium | **Medium** | Test in Chrome, Firefox, Safari; use CSS logical properties; test with actual Arabic content |
| R8 | E-signature legal validity differs across jurisdictions | Low | Low | **Low** | Capture IP, timestamp, user agent; store signature as image + metadata; consult legal if needed |
| R9 | Vercel cold starts affect API response times | Medium | Low | **Low** | Use edge runtime where possible; keep functions warm with cron; optimize function size |
| R10 | Email deliverability issues with Resend | Low | Medium | **Low** | Set up SPF/DKIM/DMARC records; use verified domain; monitor bounce rates |
| R11 | Database connection pool exhaustion under load | Low | High | **Medium** | Use Supabase connection pooler (PgBouncer); limit concurrent connections; implement request queuing |
| R12 | Data inconsistency during parallel PHP/Next.js operation | Medium | Medium | **Medium** | Use database as single source of truth; no client-side caching of mutable data; timestamp-based conflict resolution |

### 17.2 Risk Response Strategies

#### R1: Supabase Auth Migration (Critical)

**Pre-Migration Checklist:**
- [ ] Create Supabase Auth accounts for all users (scripted)
- [ ] Map `username` to `auth_uid` in `pyra_users`
- [ ] Test login for every user account
- [ ] Verify session persistence across page refreshes
- [ ] Test session timeout behavior
- [ ] Test account lockout with new auth system
- [ ] Prepare rollback script to re-enable PHP sessions

**Rollback Procedure:**
1. Switch DNS back to PHP application
2. PHP sessions are independent, so no data loss
3. `password_hash` column preserved for 30 days
4. Users can log in with original credentials

#### R2: RBAC Permission Bypass (Critical)

**Validation Approach:**
1. Extract all unique permission combinations from production `pyra_users`
2. Create test matrix of path + user + action combinations
3. Run identical checks through both PHP and Next.js RBAC
4. Compare results, flag any discrepancies
5. Fix and re-test until 100% match

**RBAC Regression Tests:**
```typescript
// tests/rbac-regression.test.ts
const testCases = [
  { user: 'admin', path: 'any/path', action: 'delete', expected: true },
  { user: 'employee1', path: 'Clients/CompanyA', action: 'browse', expected: true },
  { user: 'employee1', path: 'Clients/CompanyA', action: 'upload', expected: true },
  { user: 'employee1', path: 'Clients/CompanyB', action: 'upload', expected: false },
  { user: 'employee1', path: 'Internal/Secret', action: 'browse', expected: false },
  // ... 50+ test cases from production data
];
```

#### R3: Large File Upload (High)

**Mitigation Implementation:**
```typescript
// Resumable upload with tus-js-client
import * as tus from 'tus-js-client';

function uploadLargeFile(file: File, path: string) {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-upsert': 'true',
      },
      metadata: {
        bucketName: BUCKET,
        objectName: path,
        contentType: file.type,
      },
      chunkSize: 6 * 1024 * 1024, // 6MB chunks
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = (bytesUploaded / bytesTotal * 100).toFixed(2);
        updateProgress(percentage);
      },
      onSuccess: () => resolve(upload),
      onError: (error) => reject(error),
    });

    upload.start();
  });
}
```

### 17.3 Contingency Plans

| Scenario | Trigger | Action |
|----------|---------|--------|
| Auth migration fails | >5% users cannot login | Revert DNS to PHP, debug auth mapping |
| Performance regression | LCP > 3s on file listing | Profile with React DevTools, add pagination, implement virtual scrolling |
| Storage API rate limiting | 429 errors from Supabase | Implement request batching, add exponential backoff |
| Critical security vulnerability | Any auth bypass discovered | Immediate hotfix, notify affected users, rotate API keys |
| Vercel deployment fails | Build errors in production | Roll back to previous deployment via Vercel dashboard (instant) |

---

## SECTION 18: DEPENDENCIES & PACKAGE LIST

### 18.1 Core Dependencies

| Package | Version | Purpose | Replaces |
|---------|---------|---------|----------|
| `next` | `^15.x` | React framework with App Router | PHP entry points |
| `react` | `^19.x` | UI library | Alpine.js |
| `react-dom` | `^19.x` | DOM rendering | Browser DOM |
| `typescript` | `^5.x` | Type safety | N/A (PHP untyped) |

### 18.2 Supabase

| Package | Version | Purpose | Replaces |
|---------|---------|---------|----------|
| `@supabase/supabase-js` | `^2.x` | Client-side Supabase SDK | cURL (`supabaseRequest`, `dbRequest`) |
| `@supabase/ssr` | `^0.5.x` | Server-side Supabase for Next.js | cURL with service key |

### 18.3 UI Framework

| Package | Version | Purpose | Replaces |
|---------|---------|---------|----------|
| `tailwindcss` | `^4.x` | Utility-first CSS | Inline CSS in PHP |
| `@radix-ui/react-*` | Latest | Accessible primitives (via shadcn/ui) | Custom HTML elements |
| `class-variance-authority` | `^0.7.x` | Component variant management | N/A |
| `clsx` | `^2.x` | Conditional class names | N/A |
| `tailwind-merge` | `^2.x` | Merge Tailwind classes | N/A |
| `lucide-react` | `^0.4.x` | Icon library | CDN Lucide Icons |
| `next-themes` | `^0.3.x` | Dark mode support | N/A (new feature) |
| `sonner` | `^1.x` | Toast notifications | Custom toast JS |

### 18.4 State Management & Data Fetching

| Package | Version | Purpose | Replaces |
|---------|---------|---------|----------|
| `zustand` | `^5.x` | Client state management | Alpine.js store / globals |
| `@tanstack/react-query` | `^5.x` | Server state / caching | Custom fetch + `window.pyraState` |
| `@tanstack/react-virtual` | `^3.x` | Virtual scrolling for large lists | N/A (new performance feature) |

### 18.5 File Handling

| Package | Version | Purpose | Replaces |
|---------|---------|---------|----------|
| `react-dropzone` | `^14.x` | Drag-drop file upload | Custom drag-drop JS |
| `tus-js-client` | `^4.x` | Resumable large file uploads | Direct cURL upload |
| `mammoth` | `^1.x` | DOCX preview/conversion | CDN mammoth.js |
| `@react-pdf/renderer` | `^4.x` | Server-side PDF generation | html2canvas + jsPDF (client-side) |

### 18.6 Animation & Design

| Package | Version | Purpose | Replaces |
|---------|---------|---------|----------|
| `gsap` | `^3.x` | Animations (stat counters, entrances) | CDN GSAP + ScrollTrigger |
| `framer-motion` | `^11.x` | React-native animations, page transitions | N/A (new) |

### 18.7 Email

| Package | Version | Purpose | Replaces |
|---------|---------|---------|----------|
| `resend` | `^4.x` | Email sending API | Raw SMTP via `fsockopen` |
| `@react-email/components` | `^0.x` | Email template components | HTML string templates |

### 18.8 Forms & Validation

| Package | Version | Purpose | Replaces |
|---------|---------|---------|----------|
| `react-hook-form` | `^7.x` | Form management | Manual form handling |
| `zod` | `^3.x` | Schema validation | Manual PHP validation |
| `@hookform/resolvers` | `^3.x` | Zod integration with react-hook-form | N/A |

### 18.9 Date & Internationalization

| Package | Version | Purpose | Replaces |
|---------|---------|---------|----------|
| `date-fns` | `^4.x` | Date formatting/manipulation | PHP `date()` |
| `next-intl` | `^3.x` | Internationalization (Arabic + English) | Hardcoded Arabic strings |

### 18.10 Testing

| Package | Version | Purpose | Replaces |
|---------|---------|---------|----------|
| `vitest` | `^2.x` | Unit + integration test runner | N/A (no PHP tests) |
| `@testing-library/react` | `^16.x` | Component testing | N/A |
| `@testing-library/jest-dom` | `^6.x` | DOM assertion matchers | N/A |
| `@playwright/test` | `^1.x` | End-to-end testing | N/A |
| `msw` | `^2.x` | API mocking for tests | N/A |

### 18.11 Development Tools

| Package | Version | Purpose |
|---------|---------|---------|
| `eslint` | `^9.x` | Code linting |
| `prettier` | `^3.x` | Code formatting |
| `husky` | `^9.x` | Git hooks |
| `lint-staged` | `^15.x` | Pre-commit linting |
| `@next/bundle-analyzer` | `^15.x` | Bundle size analysis |
| `@sentry/nextjs` | `^8.x` | Error tracking |

### 18.12 Package Count Summary

| Category | Packages | Notes |
|----------|----------|-------|
| Core (Next.js, React, TS) | 4 | Framework foundation |
| Supabase | 2 | Database + Auth + Storage |
| UI Framework | 8 | shadcn/ui + Radix + icons |
| State & Data | 3 | Zustand + TanStack |
| File Handling | 4 | Upload + preview + PDF |
| Animation | 2 | GSAP + Framer Motion |
| Email | 2 | Resend + React Email |
| Forms & Validation | 3 | RHF + Zod |
| Date & i18n | 2 | date-fns + next-intl |
| Testing | 5 | Vitest + RTL + Playwright |
| Dev Tools | 6 | Lint + format + monitoring |
| **Total** | **~41** | Production: ~30, Dev: ~11 |

### 18.13 Removed Dependencies (PHP Libraries No Longer Needed)

| Library | Was Used For | Replaced By |
|---------|-------------|-------------|
| Alpine.js | Client-side reactivity | React 19 |
| CDN Lucide Icons | Icon rendering | `lucide-react` |
| CDN mammoth.js | DOCX preview | `mammoth` (npm) |
| CDN GSAP + ScrollTrigger | Animations | `gsap` (npm) |
| CDN html2canvas | Screenshot for PDF | `@react-pdf/renderer` |
| CDN jsPDF | Client-side PDF | `@react-pdf/renderer` |
| PHP cURL | HTTP requests to Supabase | `@supabase/supabase-js` |
| PHP `password_hash` | Bcrypt hashing | Supabase Auth |
| PHP `session_*` | Session management | Supabase Auth cookies |
| PHP `fsockopen` | SMTP email sending | `resend` |
| PHP `finfo_*` | MIME type detection | Supabase Storage auto-detection |

---

## SECTION 19: SUCCESS CRITERIA & ACCEPTANCE

### 19.1 Functional Acceptance Criteria

Every feature in the PHP application must work identically (or better) in the Next.js application. The following checklists define feature parity.

#### 19.1.1 Authentication & Authorization

- [ ] Users can log in with Supabase Auth credentials
- [ ] Failed login shows appropriate error messages
- [ ] Account lockout activates after configured failed attempts
- [ ] Session persists across page refreshes
- [ ] Session expires after configured timeout
- [ ] Logout clears session and redirects to login
- [ ] CSRF protection active on all state-changing requests
- [ ] Admin role bypasses all RBAC checks
- [ ] Employee role sees only permitted files/folders
- [ ] Permission inheritance works (child paths inherit parent access)
- [ ] Team permissions merge correctly with user permissions
- [ ] File-level permissions override user permissions correctly
- [ ] Per-folder granular permissions (can_upload, can_delete, can_rename, can_share) enforced
- [ ] Active sessions list visible (admin)
- [ ] Session termination works (single and all)
- [ ] Login history shows all attempts with success/fail status

#### 19.1.2 File Management

- [ ] File browser displays folders and files correctly
- [ ] Grid view and list view both functional
- [ ] Folder navigation via click and breadcrumbs
- [ ] File upload with drag-drop works
- [ ] Upload progress indicator accurate
- [ ] Multiple file upload supported
- [ ] Large file upload (>100MB) works via resumable upload
- [ ] Arabic/Unicode filenames handled correctly
- [ ] Original filenames preserved in display (via file index)
- [ ] File preview: images (JPEG, PNG, GIF, WebP, SVG)
- [ ] File preview: PDF documents
- [ ] File preview: DOCX documents (via mammoth)
- [ ] File preview: video (MP4, WebM)
- [ ] File preview: audio (MP3, WAV)
- [ ] File preview: text files with syntax highlighting
- [ ] File download works for all file types
- [ ] File rename updates all references (reviews, index)
- [ ] File delete moves to trash (soft delete)
- [ ] Batch delete works for multiple files
- [ ] Create folder works
- [ ] Deep search finds files by name, original name, path
- [ ] Search results respect RBAC permissions
- [ ] File index rebuild works (admin)
- [ ] Context menu with all actions (preview, download, rename, delete, share, permissions)
- [ ] Auto-versioning creates version on upload (when enabled)
- [ ] Version history panel shows all versions
- [ ] Version restore works (copies version back to original path)
- [ ] Version delete works
- [ ] Max versions enforced (oldest evicted)

#### 19.1.3 User & Team Management

- [ ] User list displays all users (admin)
- [ ] Create user with username, password, role, display name, permissions
- [ ] Edit user role, display name, permissions
- [ ] Delete user (cannot delete self)
- [ ] Change user password (admin)
- [ ] Permission builder shows folder tree with permission levels
- [ ] Team list displays all teams
- [ ] Create team with name, description, permissions
- [ ] Edit team name, description, permissions
- [ ] Delete team (cascades to members)
- [ ] Add member to team
- [ ] Remove member from team
- [ ] File-level permissions: set, view, remove, clean expired

#### 19.1.4 Reviews & Comments

- [ ] Review panel shows all reviews for a file
- [ ] Add comment type review
- [ ] Add approval type review
- [ ] Threaded replies (parent_id)
- [ ] @mention autocomplete shows user list
- [ ] @mention triggers notification to mentioned user
- [ ] Resolve/unresolve toggle
- [ ] Delete review
- [ ] Reviews update path on file rename

#### 19.1.5 Notifications

- [ ] Notification bell shows unread count
- [ ] Dropdown shows recent notifications
- [ ] Click notification navigates to relevant file/page
- [ ] Mark single notification as read
- [ ] Mark all notifications as read
- [ ] Full notification list page with pagination
- [ ] Real-time notifications via Supabase Realtime
- [ ] All notification types trigger correctly (review_comment, review_mention, review_approval, file_upload, file_delete, share_link, permission_change, team_added, team_removed)

#### 19.1.6 Activity Log

- [ ] Activity log shows all actions (admin)
- [ ] Filter by action type
- [ ] Filter by user
- [ ] Filter by date range
- [ ] Pagination works
- [ ] CSV export works
- [ ] All 30+ action types logged correctly

#### 19.1.7 Trash

- [ ] Trash list shows all deleted items
- [ ] Restore item to original path
- [ ] Permanent delete
- [ ] Empty trash (all items)
- [ ] Auto-purge cron runs daily
- [ ] Auto-purge respects configured days (default 30)
- [ ] Purge timer countdown displayed per item

#### 19.1.8 Share Links

- [ ] Create share link with expiry
- [ ] Copy share URL to clipboard
- [ ] View active shares for a file
- [ ] Deactivate share link
- [ ] Public share access page works (no auth required)
- [ ] Share link respects expiry date
- [ ] Share link respects max access count
- [ ] Access count increments correctly
- [ ] Expired/deactivated share shows appropriate message

#### 19.1.9 Settings

- [ ] All 16 settings displayed and editable (admin)
- [ ] App name change reflected in header
- [ ] Logo upload and display works
- [ ] Primary color change updates theme
- [ ] Security settings (lockout, timeout) take effect
- [ ] Storage settings (versioning, trash purge) take effect
- [ ] Quote settings (prefix, company) used in quote creation
- [ ] Public settings accessible without auth

#### 19.1.10 Dashboard

- [ ] Admin dashboard shows: file count, storage used, user count, team count, recent activity, share count, trash count, pending approvals
- [ ] Employee dashboard shows: accessible file count, own activity, unread notifications, favorites
- [ ] Stat cards animate on load (GSAP counter)
- [ ] Glassmorphism design with gradient backgrounds
- [ ] Favorites widget: add, remove, click-to-navigate

#### 19.1.11 Quotation & Contract

- [ ] Quote list with status filters
- [ ] Create quote with client selection
- [ ] Add, edit, remove line items
- [ ] Auto-calculate subtotal, tax, total
- [ ] Auto-generate quote number (prefix + counter)
- [ ] Duplicate quote
- [ ] Send quote via email to client
- [ ] PDF generation (server-side, matches current design)
- [ ] PDF download
- [ ] Quote status transitions: draft -> sent -> viewed -> signed

#### 19.1.12 Client Portal

- [ ] Client login with email + password
- [ ] Forgot password sends reset email
- [ ] Password reset via token works
- [ ] Dashboard shows: projects, pending approvals, recent files, unread notifications
- [ ] Project list displays client's projects
- [ ] Project detail shows files with categories
- [ ] File preview works (signed URL)
- [ ] File download works
- [ ] Approve file updates approval status
- [ ] Request revision with comment
- [ ] Threaded comments between client and team
- [ ] Comment notifications sent to other party
- [ ] Notification list with read/unread
- [ ] Profile view and edit (name, phone, company)
- [ ] Password change
- [ ] Quote list for client
- [ ] Quote detail view
- [ ] E-signature canvas works
- [ ] Signature captured with IP, timestamp, signer name
- [ ] Arabic RTL layout renders correctly
- [ ] Cairo font loaded and applied
- [ ] All text in Arabic where currently Arabic

### 19.2 Non-Functional Acceptance Criteria

#### 19.2.1 Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| First Contentful Paint (FCP) | < 1.5s | Lighthouse |
| Largest Contentful Paint (LCP) | < 2.5s | Lighthouse |
| Time to Interactive (TTI) | < 3.5s | Lighthouse |
| Cumulative Layout Shift (CLS) | < 0.1 | Lighthouse |
| First Input Delay (FID) | < 100ms | Lighthouse |
| Lighthouse Performance Score | >= 90 | Lighthouse |
| First Load JS Bundle | < 350KB | `@next/bundle-analyzer` |
| File listing response time | < 500ms | API monitoring |
| File upload throughput | >= 50MB/s | Load testing |
| Search response time | < 1s | API monitoring |
| PDF generation time | < 5s per quote | Server-side timing |

#### 19.2.2 Reliability

| Metric | Target |
|--------|--------|
| Uptime | 99.9% (Vercel SLA) |
| API error rate | < 0.1% |
| Zero data loss during migration | 100% data preserved |
| Successful rollback capability | Within 5 minutes |
| Recovery time from failure | < 15 minutes |

#### 19.2.3 Security

| Criteria | Verification |
|----------|-------------|
| No XSS vulnerabilities | Automated scan + manual review |
| No SQL injection | Parameterized queries via Supabase SDK |
| CSRF protection on all mutations | Supabase Auth tokens + middleware |
| Secure session management | Supabase Auth JWT with rotation |
| HTTPS enforced | Vercel + HSTS header |
| Security headers present | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `HSTS` |
| No sensitive data in client bundle | Environment variable audit |
| Service role key never exposed to client | Server-only access verified |
| Account lockout functional | Integration test verified |
| Password hashing via Supabase Auth | bcrypt by default |

#### 19.2.4 Accessibility

| Criteria | Standard |
|----------|----------|
| WCAG compliance level | 2.1 AA |
| Keyboard navigation | All interactive elements accessible |
| Screen reader support | ARIA labels on all components |
| Color contrast ratio | >= 4.5:1 (text), >= 3:1 (large text) |
| Focus indicators | Visible on all focusable elements |
| RTL support | Full Arabic RTL in portal |

#### 19.2.5 Code Quality

| Metric | Target |
|--------|--------|
| TypeScript strict mode | Enabled, zero `any` types |
| Unit test coverage | >= 75% (lines) |
| Component test coverage | >= 70% |
| Integration test coverage | >= 90% API routes |
| E2E test pass rate | 100% (15 flows) |
| ESLint errors | Zero |
| TypeScript errors | Zero |
| Bundle size regression | CI check on every PR |

### 19.3 Migration Acceptance Criteria

| # | Criteria | Verification Method |
|---|---------|---------------------|
| 1 | All 24 database tables accessible from Next.js | Integration test: query each table |
| 2 | All 90+ PHP API actions have Next.js equivalents | Endpoint mapping checklist (Section 12) |
| 3 | RBAC produces identical results for all user/path combinations | Regression test with production permission data |
| 4 | File operations (CRUD) work identically | E2E test: upload, rename, delete, restore |
| 5 | Existing files in Supabase Storage accessible | Browse all top-level folders |
| 6 | Arabic filenames display correctly | Test with 50+ production Arabic filenames |
| 7 | All notification types trigger correctly | Integration test for each type |
| 8 | Quote PDF output matches current design | Visual comparison of generated PDFs |
| 9 | Client portal fully functional in Arabic RTL | E2E test of all portal flows |
| 10 | Email delivery works for all templates | Send test emails for each template |
| 11 | No data loss during migration | Row count comparison pre/post |
| 12 | Rollback to PHP possible within 5 minutes | Documented and tested rollback procedure |

### 19.4 Sign-Off Requirements

| Stage | Sign-Off By | Criteria |
|-------|------------|----------|
| Phase 0 Complete | Tech Lead | Project scaffold, CI pipeline running |
| Phase 2 Complete | Tech Lead + QA | File manager matches PHP parity |
| Phase 7 Complete | Tech Lead + QA + Product | Portal RTL, approvals, quotes working |
| Pre-Production | Tech Lead + QA + Product + Security | All tests pass, security audit clear |
| Production Launch | Tech Lead + Product + Stakeholder | All acceptance criteria met |
| Post-Launch (Day 7) | Tech Lead + Product | Zero critical bugs, <5 minor bugs |
| Post-Launch (Day 30) | Tech Lead + Product | PHP fallback decommissioned |

---

## APPENDIX A: COMPLETE API ENDPOINT MAPPING

This table provides a complete 1:1 mapping of every PHP action to its Next.js equivalent.

| # | PHP Action | PHP File | Next.js Route | Method |
|---|-----------|----------|---------------|--------|
| 1 | `login` | api.php | `/api/auth/login` | POST |
| 2 | `logout` | api.php | `/api/auth/logout` | POST |
| 3 | `session` | api.php | `/api/auth/session` | GET |
| 4 | `list` | api.php | `/api/files` | GET |
| 5 | `upload` | api.php | `/api/files` | POST |
| 6 | `delete` | api.php | `/api/files` | DELETE |
| 7 | `rename` | api.php | `/api/files/rename` | PATCH |
| 8 | `content` | api.php | `/api/files/content` | GET |
| 9 | `save` | api.php | `/api/files/content` | PUT |
| 10 | `createFolder` | api.php | `/api/files/folder` | POST |
| 11 | `proxy` | api.php | `/api/files/proxy` | GET |
| 12 | `download` | api.php | `/api/files/download` | GET |
| 13 | `publicUrl` | api.php | `/api/files/public-url` | GET |
| 14 | `deleteBatch` | api.php | `/api/files/batch` | DELETE |
| 15 | `deepSearch` | api.php | `/api/files/search` | GET |
| 16 | `rebuildIndex` | api.php | `/api/files/index/rebuild` | POST |
| 17 | `getReviews` | api.php | `/api/reviews` | GET |
| 18 | `addReview` | api.php | `/api/reviews` | POST |
| 19 | `resolveReview` | api.php | `/api/reviews/[id]/resolve` | PATCH |
| 20 | `deleteReview` | api.php | `/api/reviews/[id]` | DELETE |
| 21 | `getNotifications` | api.php | `/api/notifications` | GET |
| 22 | `getUnreadCount` | api.php | `/api/notifications/unread-count` | GET |
| 23 | `markNotifRead` | api.php | `/api/notifications/[id]/read` | PATCH |
| 24 | `markAllNotifsRead` | api.php | `/api/notifications/read-all` | PATCH |
| 25 | `getActivityLog` | api.php | `/api/activity` | GET |
| 26 | `listTrash` | api.php | `/api/trash` | GET |
| 27 | `restoreTrash` | api.php | `/api/trash/[id]/restore` | POST |
| 28 | `permanentDelete` | api.php | `/api/trash/[id]` | DELETE |
| 29 | `emptyTrash` | api.php | `/api/trash/empty` | DELETE |
| 30 | `purgeExpired` | api.php | `/api/trash/purge-expired` | DELETE |
| 31 | `createShareLink` | api.php | `/api/shares` | POST |
| 32 | `getShareLinks` | api.php | `/api/shares` | GET |
| 33 | `deactivateShareLink` | api.php | `/api/shares/[id]` | DELETE |
| 34 | `shareAccess` | api.php | `/api/shares/access/[token]` | GET |
| 35 | `getUsers` | api.php | `/api/users` | GET |
| 36 | `getUsersLite` | api.php | `/api/users/lite` | GET |
| 37 | `addUser` | api.php | `/api/users` | POST |
| 38 | `updateUser` | api.php | `/api/users/[username]` | PATCH |
| 39 | `deleteUser` | api.php | `/api/users/[username]` | DELETE |
| 40 | `changePassword` | api.php | `/api/users/[username]/password` | PATCH |
| 41 | `getTeams` | api.php | `/api/teams` | GET |
| 42 | `createTeam` | api.php | `/api/teams` | POST |
| 43 | `updateTeam` | api.php | `/api/teams/[teamId]` | PATCH |
| 44 | `deleteTeam` | api.php | `/api/teams/[teamId]` | DELETE |
| 45 | `addTeamMember` | api.php | `/api/teams/[teamId]/members` | POST |
| 46 | `removeTeamMember` | api.php | `/api/teams/[teamId]/members/[username]` | DELETE |
| 47 | `setFilePermission` | api.php | `/api/file-permissions` | POST |
| 48 | `getFilePermissions` | api.php | `/api/file-permissions` | GET |
| 49 | `removeFilePermission` | api.php | `/api/file-permissions/[id]` | DELETE |
| 50 | `cleanExpiredPermissions` | api.php | `/api/file-permissions/cleanup` | DELETE |
| 51 | `getDashboard` | api.php | `/api/dashboard` | GET |
| 52 | `getFileVersions` | api.php | `/api/files/versions` | GET |
| 53 | `restoreVersion` | api.php | `/api/files/versions/[id]/restore` | POST |
| 54 | `deleteVersion` | api.php | `/api/files/versions/[id]` | DELETE |
| 55 | `getSettings` | api.php | `/api/settings` | GET |
| 56 | `updateSettings` | api.php | `/api/settings` | PATCH |
| 57 | `getPublicSettings` | api.php | `/api/settings/public` | GET |
| 58 | `getSessions` | api.php | `/api/sessions` | GET |
| 59 | `terminateSession` | api.php | `/api/sessions/[id]` | DELETE |
| 60 | `terminateAllSessions` | api.php | `/api/sessions/terminate-all` | DELETE |
| 61 | `getLoginHistory` | api.php | `/api/auth/login-history` | GET |
| 62 | `getFavorites` | api.php | `/api/favorites` | GET |
| 63 | `addFavorite` | api.php | `/api/favorites` | POST |
| 64 | `removeFavorite` | api.php | `/api/favorites/[id]` | DELETE |
| 65 | `manage_clients` (list) | api.php | `/api/clients` | GET |
| 66 | `manage_clients` (create) | api.php | `/api/clients` | POST |
| 67 | `manage_clients` (update) | api.php | `/api/clients/[id]` | PATCH |
| 68 | `manage_clients` (delete) | api.php | `/api/clients/[id]` | DELETE |
| 69 | `manage_projects` (list) | api.php | `/api/projects` | GET |
| 70 | `manage_projects` (create) | api.php | `/api/projects` | POST |
| 71 | `manage_projects` (update) | api.php | `/api/projects/[id]` | PATCH |
| 72 | `manage_projects` (delete) | api.php | `/api/projects/[id]` | DELETE |
| 73 | `manage_project_files` (add) | api.php | `/api/projects/[id]/files` | POST |
| 74 | `manage_project_files` (remove) | api.php | `/api/projects/[id]/files/[fileId]` | DELETE |
| 75 | `team_reply_to_client` | api.php | `/api/projects/[id]/comments` | POST |
| 76 | `getClientComments` | api.php | `/api/projects/[id]/comments` | GET |
| 77 | `manage_quotes` (list) | api.php | `/api/quotes` | GET |
| 78 | `manage_quotes` (create) | api.php | `/api/quotes` | POST |
| 79 | `manage_quotes` (get) | api.php | `/api/quotes/[id]` | GET |
| 80 | `manage_quotes` (update) | api.php | `/api/quotes/[id]` | PATCH |
| 81 | `manage_quotes` (delete) | api.php | `/api/quotes/[id]` | DELETE |
| 82 | `manage_quotes` (duplicate) | api.php | `/api/quotes/[id]/duplicate` | POST |
| 83 | `manage_quotes` (send) | api.php | `/api/quotes/[id]/send` | POST |
| 84 | `client_login` | portal/index.php | `/api/portal/auth/login` | POST |
| 85 | `client_logout` | portal/index.php | `/api/portal/auth/logout` | POST |
| 86 | `client_session` | portal/index.php | `/api/portal/auth/session` | GET |
| 87 | `client_forgot_password` | portal/index.php | `/api/portal/auth/forgot-password` | POST |
| 88 | `client_reset_password` | portal/index.php | `/api/portal/auth/reset-password` | POST |
| 89 | `client_dashboard` | portal/index.php | `/api/portal/dashboard` | GET |
| 90 | `client_projects` | portal/index.php | `/api/portal/projects` | GET |
| 91 | `client_project_detail` | portal/index.php | `/api/portal/projects/[id]` | GET |
| 92 | `client_file_preview` | portal/index.php | `/api/portal/files/[id]/preview` | GET |
| 93 | `client_download` | portal/index.php | `/api/portal/files/[id]/download` | GET |
| 94 | `client_approve_file` | portal/index.php | `/api/portal/files/[id]/approve` | POST |
| 95 | `client_request_revision` | portal/index.php | `/api/portal/files/[id]/revision` | POST |
| 96 | `client_get_comments` | portal/index.php | `/api/portal/comments` | GET |
| 97 | `client_add_comment` | portal/index.php | `/api/portal/comments` | POST |
| 98 | `client_unread_count` | portal/index.php | `/api/portal/notifications/unread` | GET |
| 99 | `client_notifications` | portal/index.php | `/api/portal/notifications` | GET |
| 100 | `client_mark_notif_read` | portal/index.php | `/api/portal/notifications/[id]/read` | PATCH |
| 101 | `client_mark_all_read` | portal/index.php | `/api/portal/notifications/read-all` | PATCH |
| 102 | `client_profile` | portal/index.php | `/api/portal/profile` | GET |
| 103 | `client_update_profile` | portal/index.php | `/api/portal/profile` | PATCH |
| 104 | `client_change_password` | portal/index.php | `/api/portal/profile/password` | PATCH |
| 105 | `client_quotes` | portal/index.php | `/api/portal/quotes` | GET |
| 106 | `client_quote_detail` | portal/index.php | `/api/portal/quotes/[id]` | GET |
| 107 | `client_sign_quote` | portal/index.php | `/api/portal/quotes/[id]/sign` | POST |

**New Routes (No PHP Equivalent):**

| # | Next.js Route | Method | Purpose |
|---|---------------|--------|---------|
| N1 | `/api/activity/export` | GET | CSV export of activity log |
| N2 | `/api/quotes/[id]/pdf` | GET | Server-side PDF generation |
| N3 | `/api/cron/trash-purge` | GET | Vercel cron: auto-purge trash |
| N4 | `/api/cron/clean-expired-permissions` | GET | Vercel cron: clean expired file permissions |
| N5 | `/api/cron/clean-expired-shares` | GET | Vercel cron: clean expired share links |

---

*End of PRD Sections 12-19*
*Total API routes: 107 migrated + 5 new = 112 routes*
*Total components: ~100 React components*
*Total estimated effort: 67-85 development days (~10 weeks)*
