import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLeadScopeFilter } from '@/lib/auth/lead-scope';
import { phoneMatchKey, stripPhone } from '@/lib/utils/phone';

/**
 * GET /api/crm/leads/lookup?phone=<value>
 *
 * Permission: leads.view
 * Scope: same as /api/crm/leads — admin sees all, sales agent sees own.
 *
 * Used by the Add Lead modal (Q-API-001) to warn — but NOT block — the user
 * when a similar phone number already exists. Returns the matched lead's
 * id, name, assigned_to (and assigned display name) so the modal can render
 * an inline "هذا الرقم موجود قبل كده" link.
 *
 * Match strategy: case-insensitive ilike on the LAST 9 digits of the stripped
 * input. Catches +971 50 ..., 00971..., 050... variations of the same number.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('leads.view');
    if (isApiError(auth)) return auth;

    const sp = request.nextUrl.searchParams;
    const phone = sp.get('phone')?.trim() ?? '';
    if (!phone) return apiValidationError('phone مطلوب');

    const stripped = stripPhone(phone);
    if (stripped.length < 7) return apiSuccess({ match: null });
    const key = phoneMatchKey(stripped);

    const supabase = createServiceRoleClient();
    const scope = getLeadScopeFilter(auth.pyraUser.role, auth.pyraUser.username);

    // ILIKE on a digit-suffix substring — works regardless of how the phone
    // was originally formatted in the row.
    let q = supabase
      .from('pyra_sales_leads')
      .select('id, name, assigned_to, phone, company, stage_id, is_converted')
      .ilike('phone', `%${key}%`)
      .limit(5);
    if (scope) q = q.eq(scope.column, scope.value);

    const { data, error } = await q;
    if (error) {
      console.error('GET /api/crm/leads/lookup error:', error.message);
      return apiServerError();
    }

    const matches = data ?? [];
    if (matches.length === 0) return apiSuccess({ match: null });

    // Enrich with assignee display name in one batched lookup.
    const usernames = Array.from(new Set(matches.map((m) => m.assigned_to).filter((x): x is string => !!x)));
    const { data: users } = usernames.length
      ? await supabase.from('pyra_users').select('username, display_name').in('username', usernames)
      : { data: [] as Array<{ username: string; display_name: string }> };
    const userMap = new Map((users ?? []).map((u) => [u.username, u.display_name]));

    const enriched = matches.map((m) => ({
      ...m,
      assigned_display_name: m.assigned_to ? userMap.get(m.assigned_to) ?? m.assigned_to : null,
    }));

    return apiSuccess({ match: enriched[0], matches: enriched });
  } catch (err) {
    console.error('GET /api/crm/leads/lookup threw:', err);
    return apiServerError();
  }
}
