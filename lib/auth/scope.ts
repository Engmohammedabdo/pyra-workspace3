// lib/auth/scope.ts — Dynamic ERP-style scope resolver
// Resolves what an employee can access based on team membership + task assignments.
// Everything flows from RELATIONSHIPS, not static permissions.

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { hasPermission } from './rbac';
import type { ApiAuthResult } from '@/lib/api/auth';

export interface UserScope {
  isAdmin: boolean;
  teamIds: string[];
  projectIds: string[];
  boardIds: string[];
  clientIds: number[];
  storagePaths: string[];
  assignedTaskIds: string[];
}

// In-request cache to avoid duplicate DB queries
const scopeCache = new Map<string, { scope: UserScope; ts: number }>();
const CACHE_TTL = 30_000; // 30 seconds

/**
 * Resolve the full scope of what a user can access.
 *
 * Chain:
 *   1. pyra_team_members → teamIds
 *   2. pyra_projects WHERE team_id IN teamIds → projectIds, clientIds, storagePaths
 *   3. pyra_task_assignees → assignedTaskIds
 *   4. pyra_tasks → boards → projects (from task assignments)
 *   5. pyra_boards WHERE project_id IN projectIds → boardIds
 *
 * Admins bypass all scoping (isAdmin = true).
 */
export async function resolveUserScope(auth: ApiAuthResult): Promise<UserScope> {
  const perms = auth.pyraUser.rolePermissions;
  const isAdmin =
    hasPermission(perms, '*') ||
    auth.pyraUser.role === 'admin';

  // Admins see everything — no need to resolve scope
  if (isAdmin) {
    return {
      isAdmin: true,
      teamIds: [],
      projectIds: [],
      boardIds: [],
      clientIds: [],
      storagePaths: [],
      assignedTaskIds: [],
    };
  }

  // Check cache
  const username = auth.pyraUser.username;
  const cached = scopeCache.get(username);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.scope;
  }

  const supabase = await createServerSupabaseClient();

  // Step 1: Get team memberships
  const { data: teamRows } = await supabase
    .from('pyra_team_members')
    .select('team_id')
    .eq('username', username);

  const teamIds = (teamRows || []).map((r) => r.team_id);

  // Step 2: Get projects from teams
  let teamProjectIds: string[] = [];
  let clientIds: number[] = [];
  let storagePaths: string[] = [];

  if (teamIds.length > 0) {
    const { data: projects } = await supabase
      .from('pyra_projects')
      .select('id, client_id, storage_path')
      .in('team_id', teamIds);

    if (projects) {
      teamProjectIds = projects.map((p) => p.id);
      clientIds = projects
        .filter((p) => p.client_id != null)
        .map((p) => p.client_id as number);
      storagePaths = projects
        .filter((p) => p.storage_path)
        .map((p) => p.storage_path as string);
    }
  }

  // Step 3: Get task assignments → additional projects from tasks
  const { data: taskRows } = await supabase
    .from('pyra_task_assignees')
    .select('task_id')
    .eq('username', username);

  const assignedTaskIds = (taskRows || []).map((r) => r.task_id);

  // Step 4: From assigned tasks, get board IDs → project IDs
  let taskProjectIds: string[] = [];
  let taskBoardIds: string[] = [];

  if (assignedTaskIds.length > 0) {
    const { data: tasks } = await supabase
      .from('pyra_tasks')
      .select('board_id')
      .in('id', assignedTaskIds);

    if (tasks) {
      taskBoardIds = [...new Set(tasks.map((t) => t.board_id))];
    }

    if (taskBoardIds.length > 0) {
      const { data: boards } = await supabase
        .from('pyra_boards')
        .select('id, project_id')
        .in('id', taskBoardIds);

      if (boards) {
        taskProjectIds = boards
          .filter((b) => b.project_id != null)
          .map((b) => b.project_id as string);
      }
    }
  }

  // Step 5: Merge project IDs from both team membership and task assignments
  const allProjectIds = [...new Set([...teamProjectIds, ...taskProjectIds])];

  // Step 6: Get additional project details for task-derived projects
  if (taskProjectIds.length > 0) {
    const missingProjectIds = taskProjectIds.filter(
      (id) => !teamProjectIds.includes(id)
    );
    if (missingProjectIds.length > 0) {
      const { data: extraProjects } = await supabase
        .from('pyra_projects')
        .select('client_id, storage_path')
        .in('id', missingProjectIds);

      if (extraProjects) {
        for (const p of extraProjects) {
          if (p.client_id != null && !clientIds.includes(p.client_id)) {
            clientIds.push(p.client_id);
          }
          if (p.storage_path && !storagePaths.includes(p.storage_path)) {
            storagePaths.push(p.storage_path);
          }
        }
      }
    }
  }

  // Step 7: Get all boards for the resolved projects
  let allBoardIds: string[] = [...taskBoardIds];
  if (allProjectIds.length > 0) {
    const { data: projectBoards } = await supabase
      .from('pyra_boards')
      .select('id')
      .in('project_id', allProjectIds);

    if (projectBoards) {
      allBoardIds = [
        ...new Set([...allBoardIds, ...projectBoards.map((b) => b.id)]),
      ];
    }
  }

  // Also include standalone boards (no project) created by the user
  const { data: ownBoards } = await supabase
    .from('pyra_boards')
    .select('id')
    .is('project_id', null)
    .eq('created_by', username);

  if (ownBoards) {
    allBoardIds = [
      ...new Set([...allBoardIds, ...ownBoards.map((b) => b.id)]),
    ];
  }

  // Also include manual allowed_paths from pyra_users.permissions (legacy/manual overrides)
  const userPerms = (auth.pyraUser as unknown as Record<string, unknown>)
    .permissions as {
    allowed_paths?: string[];
    paths?: Record<string, string>;
  } | null;

  if (userPerms) {
    const manualPaths = [
      ...(userPerms.allowed_paths || []),
      ...(userPerms.paths ? Object.keys(userPerms.paths) : []),
    ];
    for (const mp of manualPaths) {
      if (!storagePaths.includes(mp)) {
        storagePaths.push(mp);
      }
    }
  }

  const scope: UserScope = {
    isAdmin: false,
    teamIds,
    projectIds: allProjectIds,
    boardIds: allBoardIds,
    clientIds: [...new Set(clientIds)],
    storagePaths: [...new Set(storagePaths)],
    assignedTaskIds,
  };

  // Cache the result
  scopeCache.set(username, { scope, ts: Date.now() });

  return scope;
}

/**
 * Invalidate scope cache for a user.
 * Call this when team membership, project assignment, or task assignment changes.
 */
export function invalidateScopeCache(username?: string) {
  if (username) {
    scopeCache.delete(username);
  } else {
    scopeCache.clear();
  }
}

/**
 * Check if user can access a specific file path based on their dynamic scope.
 * Uses resolved storage paths from team→project→storage_path chain.
 */
export function canAccessPathByScope(scope: UserScope, targetPath: string): boolean {
  if (scope.isAdmin) return true;
  if (scope.storagePaths.length === 0) return false;

  const normalized = targetPath.replace(/^\/+/, '').replace(/\/+$/, '');

  return scope.storagePaths.some((sp) => {
    const nsp = sp.replace(/^\/+/, '').replace(/\/+$/, '');
    return (
      normalized === nsp ||
      normalized.startsWith(nsp + '/')
    );
  });
}
