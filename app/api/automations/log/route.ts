import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/automations/log
// Automation execution log. Admin only.
//
// Query params:
//   ?rule_id=     — filter by rule_id (optional)
//   ?status=      — filter by status (optional: success, partial_failure, failed)
//   ?page=1       — page number
//   ?pageSize=20  — items per page (max 100)
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;

    const ruleId = sp.get('rule_id')?.trim() || '';
    const status = sp.get('status')?.trim() || '';
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(sp.get('pageSize') || '20'))
    );
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('pyra_automation_log')
      .select(
        'id, rule_id, rule_name, trigger_event, trigger_data, actions_executed, status, error_message, executed_at',
        { count: 'exact' }
      );

    if (ruleId) {
      query = query.eq('rule_id', ruleId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    query = query
      .order('executed_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data: logs, count, error } = await query;

    if (error) {
      console.error('Automation log list error:', error);
      return apiServerError();
    }

    return apiSuccess(logs || [], {
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('GET /api/automations/log error:', err);
    return apiServerError();
  }
}
