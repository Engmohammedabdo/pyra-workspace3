import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiServerError,
  apiValidationError,
  apiForbidden,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { canAccessLead } from '@/lib/auth/lead-scope';
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
    const status = sp.get('status')?.trim() || 'pending';
    const leadId = sp.get('lead_id')?.trim();
    const dueBefore = sp.get('due_before')?.trim();
    const dueAfter = sp.get('due_after')?.trim();

    let q = supabase
      .from('pyra_sales_follow_ups')
      .select('id, lead_id, assigned_to, due_at, title, notes, status, completed_at, created_by, created_at, quote_id', { count: 'exact' })
      .order('due_at', { ascending: true })
      .limit(limit);

    if (auth.pyraUser.role !== 'admin') {
      q = q.eq('assigned_to', auth.pyraUser.username);
    }

    if (status !== 'all') q = q.eq('status', status);
    if (leadId) q = q.eq('lead_id', leadId);
    if (dueBefore) q = q.lt('due_at', dueBefore);
    if (dueAfter) q = q.gte('due_at', dueAfter);

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

    return apiSuccess({ follow_ups: enriched, total: count ?? enriched.length });
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
//   reminder_at? / send_whatsapp_reminder? — accepted but not persisted in
//   v1 because Phase-0 baseline confirmed the live `pyra_sales_follow_ups`
//   table is missing reminder_at + whatsapp_reminder_sent (per Q-DB-001
//   answer). Phase 11 cron work adds those columns + persistence.
//
// Side effects:
//   - INSERT pyra_lead_activities type=follow_up_created (so it appears
//     in the Lead Detail timeline)
//   - UPDATE leads.next_follow_up to the earliest pending due_at
//   - notify(assignee, 'follow_up_due') ONLY when assignee !== caller
// ────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('follow_ups.create');
    if (isApiError(auth)) return auth;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return apiValidationError('JSON body مطلوب');

    const leadId = typeof body.lead_id === 'string' ? body.lead_id : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const dueAt = typeof body.due_at === 'string' ? body.due_at : '';
    if (!leadId || !title || !dueAt) {
      return apiValidationError('lead_id و title و due_at مطلوبة');
    }

    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(supabase, auth.pyraUser.username, auth.pyraUser.role, leadId);
    if (!allowed) return apiForbidden('لا تملك صلاحية الوصول لهذا الـ Lead');

    const assignedTo =
      (typeof body.assigned_to === 'string' && body.assigned_to.trim()) ||
      auth.pyraUser.username;
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;

    const insertId = generateId('fu');
    const { data: followUp, error } = await supabase
      .from('pyra_sales_follow_ups')
      .insert({
        id: insertId,
        lead_id: leadId,
        assigned_to: assignedTo,
        due_at: dueAt,
        title,
        notes,
        status: 'pending',
        created_by: auth.pyraUser.username,
      })
      .select('*')
      .single();
    if (error || !followUp) {
      console.error('POST /api/crm/follow-ups insert error:', error?.message);
      return apiServerError(`فشل إنشاء المتابعة${error?.message ? ': ' + error.message : ''}`);
    }

    // Timeline entry on the parent lead.
    void supabase.from('pyra_lead_activities').insert({
      id: generateId('la'),
      lead_id: leadId,
      activity_type: 'follow_up_created',
      description: title,
      metadata: { follow_up_id: insertId, due_at: dueAt, assigned_to: assignedTo },
      created_by: auth.pyraUser.username,
    });

    // Update leads.next_follow_up to the earliest pending due_at across
    // this lead's follow-ups (so the pipeline card / lead header always
    // reflects the most-imminent reminder).
    const { data: pending } = await supabase
      .from('pyra_sales_follow_ups')
      .select('due_at')
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .order('due_at', { ascending: true })
      .limit(1);
    if (pending && pending.length > 0) {
      void supabase
        .from('pyra_sales_leads')
        .update({ next_follow_up: pending[0].due_at })
        .eq('id', leadId);
    }

    if (assignedTo && assignedTo !== auth.pyraUser.username) {
      void notify(supabase, {
        to: assignedTo,
        type: 'follow_up_due',
        title: 'متابعة جديدة لك',
        message: `${auth.pyraUser.display_name} جدول متابعة "${title}"`,
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
