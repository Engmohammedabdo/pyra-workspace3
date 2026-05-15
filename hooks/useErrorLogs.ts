'use client';

/**
 * React Query hooks for the admin error-log viewer (Phase 14.1, Commit 3).
 *
 * Backing routes:
 *   GET   /api/admin/error-logs              → useErrorLogs(filters)
 *   PATCH /api/admin/error-logs/[id]         → useResolveErrorLog()
 *
 * Permission gates are server-side:
 *   - GET   requires `error_logs.view`
 *   - PATCH requires `error_logs.manage`
 *
 * The hooks themselves do NOT enforce permission — server is authoritative.
 * The sidebar already hides the nav for users without `error_logs.view`,
 * and the page-level `requirePermission('error_logs.view')` redirects
 * if a user URL-hacks.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

// ── Types ──

export type ErrorLogSeverity = 'error' | 'warning' | 'info';
export type ErrorLogEnvironment = 'production' | 'development';

export interface ErrorLog {
  id: string;
  severity: ErrorLogSeverity;
  message: string;
  error_type: string | null;
  stack_trace: string | null;
  request_path: string | null;
  request_method: string | null;
  user_id: string | null;
  user_role: string | null;
  metadata: Record<string, unknown>;
  environment: ErrorLogEnvironment;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_notes: string | null;
}

export interface ErrorLogsResponse {
  logs: ErrorLog[];
  total: number;
  page: number;
  limit: number;
}

// ── Queries ──

/**
 * List error logs with filters.
 *
 * Filter keys accepted by the API:
 *   severity     'error' | 'warning' | 'info'    (omit for all)
 *   environment  'production' | 'development'    (omit for all)
 *   resolved     'true' | 'false'                (omit for all)
 *   user_id      arbitrary string                (server uses .eq() — exact match)
 *   since        ISO date (inclusive)
 *   until        ISO date (inclusive)
 *   page         number (1-indexed)
 *   limit        number (default 50, max 200)
 *
 * Manual refresh per Q5(a) — no refetchInterval, no refetchOnWindowFocus.
 * Error volume is low; polling wastes battery on the admin's laptop.
 */
export function useErrorLogs(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<ErrorLogsResponse>({
    queryKey: ['admin', 'error-logs', params],
    queryFn: () => fetchAPI(`/api/admin/error-logs${qs}`),
    staleTime: 30_000,
  });
}

// ── Mutations ──

export interface ResolveErrorLogInput {
  id: string;
  resolved_notes?: string;
}

/**
 * Mark a single error log row as resolved. Server enforces:
 *   - resolved_by = auth.pyraUser.username (NEVER from body)
 *   - resolved_at = NOW()
 *   - resolved    = true
 *
 * Audit entry written to pyra_activity_log on success.
 *
 * Bulk-resolve intentionally not supported in v1 (Q4 decision):
 *   keeps the audit trail clean, no risk of accidentally mass-resolving
 *   real bugs.
 */
export function useResolveErrorLog() {
  const qc = useQueryClient();
  return useMutation<{ log: ErrorLog }, Error, ResolveErrorLogInput>({
    mutationFn: ({ id, resolved_notes }) =>
      mutateAPI(`/api/admin/error-logs/${id}`, 'PATCH', {
        resolved: true,
        resolved_notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'error-logs'] });
    },
  });
}
