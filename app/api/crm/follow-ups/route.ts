import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiServerError,
  apiValidationError,
  apiForbidden,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { canAccessLead, isAssignableUser } from '@/lib/auth/lead-scope';
import { hasPermission } from '@/lib/auth/rbac';
import { generateId } from '@/lib/utils/id';
import { logActivity, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { notify } from '@/lib/notifications/notify';

/**
 * GET /api/crm/follow-ups
 *
 * Permission: follow_ups.view
 * Scope: own follow-ups (assigned_to = me) unless admin.
 *
 * Query params:
 *   status     - 'pending' (default) | 'completed' | 'overdue' | 'cancelled' | 'all'
 *   lead_id    - filter to a single lead
 *   due_before - ISO datetime
 *   due_after  - ISO datetime
 *   limit      - default 100, max 500
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('follow_ups.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;

    const limitParam = parseInt(sp.get('limit') || '100', 10);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 100, 1), 500);
    const offsetParam = parseInt(sp.get('offset') || '0', 10);
    const offset = Math.max(Number.isFinite(offsetParam) ? offsetParam : 0, 0);
    const status = sp.get('status')?.trim() || 'pending';
    const leadId = sp.get('lead_id')?.trim();
    const dueBefore = sp.get('due_before')?.trim();
    const dueAfter = sp.get('due_after')?.trim();

    let q = supabase
      .from('pyra_sales_follow_ups')
      .select('id, lead_id, assigned_to, due_at, reminder_at, whatsapp_reminder_sent, send_whatsapp_reminder, title, notes, status, completed_at, created_by, created_at, quote_id', { count: 'exact' })
      .order('due_at', { ascending: true });

    if (auth.pyraUser.role !== 'admin') {
      q = q.eq('assigned_to', auth.pyraUser.username);
    }

    // 'pending' (default) also surfaces 'overdue' rows — the check-due cron flips
    // due-past pending → overdue, and without this they'd vanish from the default
    // view (and drop out of reminder/next_follow_up logic). ?status=overdue still
    // narrows to just overdue.
    if (status === 'pending') q = q.in('status', ['pending', 'overdue']);
    else if (status !== 'all') q = q.eq('status', status);
    if (leadId) q = q.eq('lead_id', leadId);
    if (dueBefore) q = q.lt('due_at', dueBefore);
    if (dueAfter) q = q.gte('due_at', dueAfter);

    // Paginate via range (was a bare .limit(limit) with no offset, so rows past
    // the first page were unreachable — the `total` below reported more rows than
    // could ever be fetched). `offset` makes the overflow pageable.
    q = q.range(offset, offset + limit - 1);

    const { data, count, error } = await q;
    if (error) {
      console.error('GET /api/crm/follow-ups error:', error.message);
      return apiServerError();
    }

    const rows = data ?? [];

    // Enrich with lead name and assignee display_name
    const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter((x): x is string => !!x)));
    const usernames = Array.from(new Set(rows.map((r) => r.assigned_to).filter((x): x is string => !!x)));

    const [leadsRes, usersRes] = await Promise.all([
      leadIds.length
        ? supabase.from('pyra_sales_leads').select('id, name, phone, company').in('id', leadIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; phone: string | null; company: string | null }> }),
      usernames.length
        ? supabase.from('pyra_users').select('username, display_name').in('username', usernames)
        : Promise.resolve({ data: [] as Array<{ username: string; display_name: string }> }),
    ]);

    const leadMap = new Map((leadsRes.data ?? []).map((l) => [l.id, l]));
    const userMap = new Map((usersRes.data ?? []).map((u) => [u.username, u.display_name]));

    const enriched = rows.map((r) => ({
      ...r,
      lead_name: r.lead_id ? leadMap.get(r.lead_id)?.name ?? null : null,
      lead_phone: r.lead_id ? leadMap.get(r.lead_id)?.phone ?? null : null,
      lead_company: r.lead_id ? leadMap.get(r.lead_id)?.company ?? null : null,
      assigned_display_name: r.assigned_to ? userMap.get(r.assigned_to) ?? r.assigned_to : null,
    }));

    const total = count ?? enriched.length;
    return apiSuccess(
      { follow_ups: enriched, total, has_more: offset + enriched.length < total },
      { total, limit, offset },
    );
  } catch (err) {
    console.error('GET /api/crm/follow-ups threw:', err);
    return apiServerError();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/crm/follow-ups
//
// Permission: follow_ups.create + canAccessLead(lead_id)
//
// Body:
//   lead_id (required) · title (required) · due_at (required ISO)
//   notes? · assigned_to? (default = caller)
//   reminder_at? — when WhatsApp reminder fires. Default: due_at - 30min
//                  per PRD §03 line 434. Validated as ISO; 422 if invalid.
//   send_whatsapp_reminder? — user-facing toggle. Default true per line 437.
//   (whatsapp_reminder_sent defaults to false at column level.)
//
// Side effects:
//   - INSERT pyra_lead_activities type=follow_up_created (so it appears
//     in the Lead Detail timeline)
//   - UPDATE leads.next_follow_up to the earliest pending due_at
//   - notify(assignee, 'follow_up_due') ONLY when assignee !== caller
// ────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('follow_ups.create');
    if (isApiError(auth)) return auth;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return apiValidationError(t('common.jsonBodyRequired'));

    const leadId = typeof body.lead_id === 'string' ? body.lead_id : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const dueAt = typeof body.due_at === 'string' ? body.due_at : '';
    if (!leadId || !title || !dueAt) {
      return apiValidationError(t('crm.followUpFieldsRequired'));
    }

    // Validate due_at unconditionally (up front) — it goes into a NOT NULL
    // timestamptz column. Previously it was only checked inside the branch that
    // runs when reminder_at is absent, so a valid reminder_at + garbage due_at
    // slipped past app validation and surfaced the raw Postgres error as a 500.
    const dueParsed = new Date(dueAt);
    if (isNaN(dueParsed.getTime())) {
      return apiValidationError(t('crm.isoDateInvalid', { field: 'due_at' }));
    }
    const dueAtIso = dueParsed.toISOString();

    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(supabase, auth.pyraUser.username, auth.pyraUser.role, leadId);
    if (!allowed) return apiForbidden(t('crm.leadAccessDenied'));

    // assigned_to gate: assigning a follow-up to someone else is a manager/admin
    // action — require leads.assign and validate the target is a real, ACTIVE
    // user (mirrors the leads POST gate; otherwise the follow-up is orphaned).
    let assignedTo = auth.pyraUser.username;
    const requestedAssignee =
      typeof body.assigned_to === 'string' ? body.assigned_to.trim() : '';
    if (requestedAssignee && requestedAssignee !== auth.pyraUser.username) {
      if (!hasPermission(auth.pyraUser.rolePermissions, 'leads.assign')) {
        return apiForbidden(t('crm.assignPermissionFollowUp'));
      }
      const assignable = await isAssignableUser(supabase, requestedAssignee);
      if (!assignable) {
        return apiValidationError(t('crm.assigneeInactive'));
      }
      assignedTo = requestedAssignee;
    }
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;

    // Phase 11 (migration 013 + commit 2): reminder_at + send_whatsapp_reminder
    // are persisted now. The cron endpoint at /api/cron/follow-up-reminders
    // (commit 3) reads these to decide which follow-ups to send WhatsApp
    // reminders for on its 5-minute tick.
    //
    //   reminder_at default      = due_at - 30 minutes (PRD §03 line 434)
    //   send_whatsapp_reminder   = true                (PRD §03 line 437)
    //   whatsapp_reminder_sent   = false (column-level default; cron flips
    //                                     it true after a successful send)
    let reminderAt: string;
    if (typeof body.reminder_at === 'string') {
      const parsed = new Date(body.reminder_at);
      if (isNaN(parsed.getTime())) {
        return apiValidationError(t('crm.isoDateInvalid', { field: 'reminder_at' }));
      }
      reminderAt = parsed.toISOString();
    } else {
      // due_at already validated above (dueParsed) — default reminder = due − 30m.
      reminderAt = new Date(dueParsed.getTime() - 30 * 60 * 1000).toISOString();
    }
    const sendWhatsappReminder =
      typeof body.send_whatsapp_reminder === 'boolean'
        ? body.send_whatsapp_reminder
        : true;

    const insertId = generateId('fu');
    const { data: followUp, error } = await supabase
      .from('pyra_sales_follow_ups')
      .insert({
        id: insertId,
        lead_id: leadId,
        assigned_to: assignedTo,
        due_at: dueAtIso,
        reminder_at: reminderAt,
        send_whatsapp_reminder: sendWhatsappReminder,
        title,
        notes,
        status: 'pending',
        created_by: auth.pyraUser.username,
      })
      .select('*')
      .single();
    if (error || !followUp) {
      console.error('POST /api/crm/follow-ups insert error:', error?.message);
      return apiServerError(t('crm.followUpCreateFailed', { reason: error?.message ? ': ' + error.message : '' }));
    }

    // Timeline entry on the parent lead.
    // NOTE: Supabase's query builder is a lazy thenable — `void <builder>`
    // alone never triggers .then() so the query is built but never sent.
    // Always attach .then() (or await) to actually execute the query.
    void supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: leadId,
        activity_type: 'follow_up_created',
        description: title,
        metadata: { follow_up_id: insertId, due_at: dueAt, assigned_to: assignedTo },
        created_by: auth.pyraUser.username,
      })
      .then(({ error: e }) => {
        if (e) console.error('[follow_up_created activity] insert failed:', e.message);
      });

    // Update leads.next_follow_up to the earliest pending due_at across
    // this lead's follow-ups (so the pipeline card / lead header always
    // reflects the most-imminent reminder).
    const { data: pending } = await supabase
      .from('pyra_sales_follow_ups')
      .select('due_at')
      .eq('lead_id', leadId)
      .in('status', ['pending', 'overdue'])
      .order('due_at', { ascending: true })
      .limit(1);
    if (pending && pending.length > 0) {
      void supabase
        .from('pyra_sales_leads')
        .update({ next_follow_up: pending[0].due_at })
        .eq('id', leadId)
        .then(({ error: e }) => {
          if (e) console.error('[lead next_follow_up update] failed:', e.message);
        });
    }

    if (assignedTo && assignedTo !== auth.pyraUser.username) {
      void notify(supabase, {
        to: assignedTo,
        type: 'follow_up_due',
        title: 'متابعة جديدة لك', // i18n-exempt: notification content (Phase 8)
        message: `${auth.pyraUser.display_name} جدول متابعة "${title}"`, // i18n-exempt: notification content (Phase 8)
        link: `/dashboard/crm/leads/${leadId}`,
        entity: { type: 'follow_up', id: insertId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `follow_up_${ACTIVITY_ACTIONS.CREATE}`,
      `/dashboard/crm/leads/${leadId}`,
      { lead_id: leadId, follow_up_id: insertId, due_at: dueAt },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({ follow_up: followUp }, undefined, 201);
  } catch (err) {
    console.error('POST /api/crm/follow-ups threw:', err);
    return apiServerError();
  }
}
