import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';
import { phoneMatchKey, stripPhone } from '@/lib/utils/phone';

/**
 * GET /api/crm/leads/lookup?phone=<value>
 *
 * Permission: leads.view
 * Search scope: SYSTEM-WIDE. Identity scope: own leads + crm_reports.team_view.
 *
 * Used by the Add Lead modal (Q-API-001) to warn — but NOT block — the user
 * when a similar phone number already exists.
 *
 * TWO GOODS IN TENSION, and this route must serve both:
 *
 *   1. DUPLICATE HYGIENE. The warning has to fire whenever the number is
 *      taken. This route used to filter to the caller's own leads
 *      (getLeadScopeFilter), which made it blind on exactly the numbers a
 *      cross-agent duplicate merge cleans up: the merge archives the losing
 *      card and NULLs its phone, so the only row left carrying the number is
 *      the survivor — owned by the OTHER rep, outside the caller's scope. The
 *      rep would get no warning at all and could create a sixth duplicate on
 *      the very number the merge existed to de-duplicate.
 *
 *   2. LEAD-OWNERSHIP BOUNDARY (locked 2026-08-08). A rep must not learn a
 *      colleague's client's name or lead id. Simply dropping the scope filter
 *      would turn this endpoint into a phone-number → customer-identity oracle
 *      and re-open precisely the leak fe8d78f / 12c8ffe / cf9909a closed.
 *
 * Resolution: search WITHOUT the scope so the warning always fires, then
 * WITHHOLD the identity when the caller may not see the match. A withheld
 * match carries `visible: false` and NOTHING else — no id, no name, no
 * company, no assigned_to. The rep learns the number is taken, not who has it.
 *
 * The visibility predicate is byte-identical to /api/crm/calls: `seeAll`
 * (crm_reports.team_view — admins hold '*', which hasPermission covers) OR
 * `lead.assigned_to === caller`. Deliberately the SAME notion of team-wide
 * reach, not a second one.
 *
 * Match strategy: case-insensitive ilike on the LAST 9 digits of the stripped
 * input. Catches +971 50 ..., 00971..., 050... variations of the same number.
 */

/** Fetch cap. Was 5 while the query was scoped to the caller's own leads;
 *  system-wide, a small cap could push the caller's OWN card out of the result
 *  set behind colleagues' rows and downgrade her to the anonymous notice for
 *  her own lead. 10 is far past any real-world count on one number. */
const LOOKUP_LIMIT = 10;

/** What the caller is allowed to see. A withheld match is the `visible: false`
 *  member alone — adding fields to it is how this leak comes back. */
type LookupMatch =
  | {
      visible: true;
      id: string;
      name: string;
      assigned_to: string | null;
      assigned_display_name: string | null;
      phone: string | null;
      company: string | null;
      stage_id: string | null;
      is_converted: boolean | null;
    }
  | { visible: false };
export async function GET(request: NextRequest) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('leads.view');
    if (isApiError(auth)) return auth;

    const sp = request.nextUrl.searchParams;
    const phone = sp.get('phone')?.trim() ?? '';
    if (!phone) return apiValidationError(t('crm.phoneRequired'));

    const stripped = stripPhone(phone);
    if (stripped.length < 7) return apiSuccess({ match: null });
    const key = phoneMatchKey(stripped);

    const supabase = createServiceRoleClient();
    const me = auth.pyraUser.username;
    const seeAll = hasPermission(auth.pyraUser.rolePermissions, 'crm_reports.team_view');

    // ILIKE on a digit-suffix substring — works regardless of how the phone
    // was originally formatted in the row. NO ownership filter: see good #1 in
    // the doc comment. `assigned_to` drives the identity gate below.
    const { data, error } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, assigned_to, phone, company, stage_id, is_converted')
      .ilike('phone', `%${key}%`)
      .limit(LOOKUP_LIMIT);
    if (error) {
      console.error('GET /api/crm/leads/lookup error:', error.message);
      return apiServerError();
    }

    const matches = data ?? [];
    if (matches.length === 0) return apiSuccess({ match: null });

    // Own leads first. The modal renders `match` (the best match) alone, and
    // dropping the scope must not COST the caller the named warning she gets
    // today: with no ordering, PostgREST's arbitrary row order could hand back
    // a colleague's row as `match` even when one of the matches is hers, and
    // she'd see the anonymous notice for her own lead. Stable within each
    // group (Array#sort is stable in ES2019+).
    const ordered = [...matches].sort(
      (a, b) => Number(a.assigned_to !== me) - Number(b.assigned_to !== me),
    );

    // Enrich with assignee display name in one batched lookup — for VISIBLE
    // matches only. Resolving a withheld assignee's display name would put a
    // colleague's identity in memory one careless spread away from the wire.
    const visibleOf = (assignedTo: string | null) => seeAll || assignedTo === me;
    const usernames = Array.from(
      new Set(
        ordered
          .filter((m) => visibleOf(m.assigned_to))
          .map((m) => m.assigned_to)
          .filter((x): x is string => !!x),
      ),
    );
    const { data: users } = usernames.length
      ? await supabase.from('pyra_users').select('username, display_name').in('username', usernames)
      : { data: [] as Array<{ username: string; display_name: string }> };
    const userMap = new Map((users ?? []).map((u) => [u.username, u.display_name]));

    const shaped: LookupMatch[] = ordered.map((m) =>
      visibleOf(m.assigned_to)
        ? {
            visible: true,
            id: m.id,
            name: m.name,
            assigned_to: m.assigned_to,
            assigned_display_name: m.assigned_to
              ? userMap.get(m.assigned_to) ?? m.assigned_to
              : null,
            phone: m.phone,
            company: m.company,
            stage_id: m.stage_id,
            is_converted: m.is_converted,
          }
        // Built literally, never spread from the row — a spread here is how the
        // id and name walk back out.
        : { visible: false },
    );

    return apiSuccess({ match: shaped[0], matches: shaped });
  } catch (err) {
    console.error('GET /api/crm/leads/lookup threw:', err);
    return apiServerError();
  }
}
