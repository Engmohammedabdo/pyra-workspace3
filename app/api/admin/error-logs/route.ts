import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/admin/error-logs
//
// Permission:  error_logs.view  (admin observability viewer — Phase 14.1 Q2(a))
//
// Lists rows from pyra_error_logs with filters + pagination. Optimised for
// the three admin queries the table's indexes serve:
//   - latest first              → idx_error_logs_created_at
//   - filter by severity         → idx_error_logs_severity_created
//   - unresolved triage         → idx_error_logs_unresolved (partial)
//
// Query params (all optional):
//   severity     'error' | 'warning' | 'info'
//   environment  'production' | 'development'
//   resolved     'true' | 'false'
//   user_id      exact string match
//   since        ISO date (created_at >= since)
//   until        ISO date (created_at <= until)
//   page         1-indexed page number (default 1)
//   limit        page size (default 50, max 200)
//
// Response shape:
//   { data: { logs: ErrorLog[], total: number, page, limit }, meta: null }
//
// PII redaction note: rows are returned AS-STORED. logError already
// redacted before insert (Commit 1). The viewer is the LAST hop — no
// re-derivation possible. [EMAIL] / [PHONE] / [REDACTED] render verbatim.
// ────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('error_logs.view');
    if (isApiError(auth)) return auth;

    const sp = request.nextUrl.searchParams;
    const severity = sp.get('severity');
    const environment = sp.get('environment');
    const resolved = sp.get('resolved');
    const userId = sp.get('user_id')?.trim() || '';
    const since = sp.get('since');
    const until = sp.get('until');
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from('pyra_error_logs')
      .select(
        'id, severity, message, error_type, stack_trace, request_path, request_method, user_id, user_role, metadata, environment, created_at, resolved, resolved_at, resolved_by, resolved_notes',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false });

    // Whitelisted severity values — only accept the 3 allowed enum members
    // (the DB CHECK constraint rejects anything else, but we filter at the
    // query layer to avoid wasted round trips).
    if (severity === 'error' || severity === 'warning' || severity === 'info') {
      query = query.eq('severity', severity);
    }

    if (environment === 'production' || environment === 'development') {
      query = query.eq('environment', environment);
    }

    if (resolved === 'true' || resolved === 'false') {
      query = query.eq('resolved', resolved === 'true');
    }

    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (since) {
      query = query.gte('created_at', since);
    }

    if (until) {
      query = query.lte('created_at', until);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      logError({
        error,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'admin', view: 'error-logs', stage: 'list' },
      });
      console.error('GET /api/admin/error-logs SELECT failed:', error.message);
      return apiServerError();
    }

    return apiSuccess({
      logs: data ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    logError({
      error: err,
      request,
      metadata: { source: 'admin', view: 'error-logs' },
    });
    console.error('GET /api/admin/error-logs threw:', err);
    return apiServerError();
  }
}
