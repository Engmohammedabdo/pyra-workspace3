import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiForbidden } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLeadScopeFilter, isAssignableUser } from '@/lib/auth/lead-scope';
import { hasPermission } from '@/lib/auth/rbac';
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { notify } from '@/lib/notifications/notify';
import { phoneMatchKey } from '@/lib/utils/phone';
import {
  PIPELINE_STAGE_IDS,
  STAGE_DEFAULT_WIN_PROBABILITY,
  type PipelineStageId,
} from '@/lib/constants/statuses';

const LEAD_FIELDS = [
  'id', 'name', 'phone', 'email', 'company',
  'source', 'stage_id', 'assigned_to', 'client_id',
  'priority', 'last_contact_at', 'next_follow_up',
  'converted_at', 'is_converted',
  'lead_type', 'industry', 'deal_type',
  'expected_value', 'expected_value_currency', 'billing_cycle',
  'win_probability', 'win_probability_overridden',
  'lost_reason', 'contact_person', 'contact_role',
  'company_size', 'decision_maker', 'budget_range',
  'created_by', 'created_at', 'updated_at',
  'archived_at', 'archived_by',
].join(', ');

/**
 * GET /api/crm/leads
 *
 * Permission: leads.view
 * Scope: admin sees all; non-admin scoped to assigned_to = self.
 *
 * Query params:
 *   stage_id, priority, lead_type, source, is_converted ('true'/'false'),
 *   assigned_to (admin only — non-admin override is silently ignored),
 *   search (matches name / company / phone),
 *   limit (default 50, max 200), offset (default 0),
 *   sort: 'last_contact_desc' | 'created_desc' | 'expected_value_desc' (default last_contact_desc)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('leads.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;

    const limitParam = parseInt(sp.get('limit') || '50', 10);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 200);
    const offsetParam = parseInt(sp.get('offset') || '0', 10);
    const offset = Math.max(Number.isFinite(offsetParam) ? offsetParam : 0, 0);

    let query = supabase
      .from('pyra_sales_leads')
      .select(LEAD_FIELDS, { count: 'exact' });

    // Scope: admin → unrestricted; sales_agent → own only.
    const scopeFilter = getLeadScopeFilter(auth.pyraUser.role, auth.pyraUser.username);
    if (scopeFilter) {
      query = query.eq(scopeFilter.column, scopeFilter.value);
    } else {
      // Admin overrides (mutually exclusive, checked in order):
      //   ?assigned_to=<username>        → that owner's leads
      //   ?assigned_status=inactive|active → leads whose owner is (in)active —
      //       the offboarding cleanup surface: find leads stranded on departed
      //       agents so they can be re-homed. Admin-only (this whole branch).
      const ownerParam = sp.get('assigned_to')?.trim();
      const assignedStatus = sp.get('assigned_status')?.trim();
      if (ownerParam) {
        query = query.eq('assigned_to', ownerParam);
      } else if (assignedStatus === 'inactive' || assignedStatus === 'active') {
        const { data: users } = await supabase
          .from('pyra_users')
          .select('username, status');
        const wantActive = assignedStatus === 'active';
        const usernames = (users ?? [])
          .filter((u) => (wantActive ? u.status === 'active' : u.status !== 'active'))
          .map((u) => u.username);
        // No matching owners → force an empty result rather than "all leads".
        query = usernames.length
          ? query.in('assigned_to', usernames)
          : query.eq('id', '___none___');
      }
    }

    const stageId = sp.get('stage_id')?.trim();
    if (stageId) query = query.eq('stage_id', stageId);

    const priority = sp.get('priority')?.trim();
    if (priority) query = query.eq('priority', priority);

    const leadType = sp.get('lead_type')?.trim();
    if (leadType) query = query.eq('lead_type', leadType);

    const source = sp.get('source')?.trim();
    if (source) query = query.eq('source', source);

    const isConverted = sp.get('is_converted')?.trim();
    if (isConverted === 'true') query = query.eq('is_converted', true);
    else if (isConverted === 'false') query = query.eq('is_converted', false);

    // Archive: hide archived leads by default (so they drop out of the pipeline
    // + lists). ?archived=only shows just the archived; ?include_archived=true
    // shows both.
    const archivedParam = sp.get('archived')?.trim();
    if (archivedParam === 'only') query = query.not('archived_at', 'is', null);
    else if (sp.get('include_archived') !== 'true') query = query.is('archived_at', null);

    const search = sp.get('search')?.trim();
    if (search) {
      const safe = escapePostgrestValue(`%${escapeLike(search)}%`);
      query = query.or(`name.ilike.${safe},company.ilike.${safe},phone.ilike.${safe}`);
    }

    const sort = sp.get('sort')?.trim() || 'last_contact_desc';
    if (sort === 'created_desc') query = query.order('created_at', { ascending: false });
    else if (sort === 'expected_value_desc') query = query.order('expected_value', { ascending: false, nullsFirst: false });
    else query = query.order('last_contact_at', { ascending: false, nullsFirst: false });

    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) {
      console.error('GET /api/crm/leads error:', error.message);
      return apiServerError();
    }

    type LeadRow = { id: string } & Record<string, unknown>;
    const leads = (data ?? []) as unknown as LeadRow[];

    // Enrich with activity_count + last_activity_type (one extra query batched).
    // NOTE: this materializes all activity rows for the page's leads and counts
    // in JS. Correct as long as PostgREST returns every row — verified 2026-07-02
    // that this deployment sets NO db-max-rows cap (a Range: 0-99999 request
    // returned all rows) and the whole table holds <1k activity rows, so a
    // single page can never breach a cap. v1.1: move to a server-side grouped
    // count + latest-per-lead if activity volume grows past a page's worth.
    let enriched: Array<LeadRow & { activity_count: number; last_activity_type: string | null }> =
      leads.map((l) => ({ ...l, activity_count: 0, last_activity_type: null }));
    if (leads.length > 0) {
      const ids = leads.map((l) => l.id);
      const { data: acts } = await supabase
        .from('pyra_lead_activities')
        .select('lead_id, activity_type, created_at')
        .in('lead_id', ids)
        .order('created_at', { ascending: false });

      const counts = new Map<string, number>();
      const lastType = new Map<string, string>();
      for (const a of acts ?? []) {
        counts.set(a.lead_id, (counts.get(a.lead_id) ?? 0) + 1);
        if (!lastType.has(a.lead_id)) lastType.set(a.lead_id, a.activity_type);
      }
      enriched = leads.map((l) => ({
        ...l,
        activity_count: counts.get(l.id) ?? 0,
        last_activity_type: lastType.get(l.id) ?? null,
      }));
    }

    const total = count ?? enriched.length;
    return apiSuccess(
      { leads: enriched, total, has_more: offset + enriched.length < total },
      { total, limit, offset },
    );
  } catch (err) {
    console.error('GET /api/crm/leads threw:', err);
    return apiServerError();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/crm/leads
//
// Permission: leads.create
//
// Body fields (see hooks/useLeads.ts CreateLeadInput):
//   name (required), phone (required), email?, company?,
//   lead_type ('b2b' | 'b2c'), industry?, source?,
//   deal_type?, expected_value?, expected_value_currency?, billing_cycle?,
//   contact_person?, contact_role?, notes?, priority?,
//   assigned_to? (defaults to creator), stage_id? (defaults stg_new_inquiry),
//   next_follow_up?, follow_up_title?
//
// Per Q-API-001 we DO NOT block on phone duplicates — but we surface a
// `duplicate_warning: { existing_lead_id, existing_lead_name }` when found
// so the modal can render a "هذا الرقم موجود قبل كده" hint after insert.
// (Same modal also calls /api/crm/leads/lookup on phone-blur for pre-submit
// awareness — see Q-API-001 resolution.)
//
// Per Q-BIZ-001 the win_probability is auto-defaulted from the lead's
// initial stage via STAGE_DEFAULT_WIN_PROBABILITY. Manual override flips
// win_probability_overridden = true (handled in PATCH).
// ────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('leads.create');
    if (isApiError(auth)) return auth;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return apiValidationError('JSON body مطلوب');

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!name) return apiValidationError('الاسم مطلوب');
    if (!phone) return apiValidationError('الهاتف مطلوب');

    const supabase = createServiceRoleClient();

    // ── Stage validation + win_probability default (Q-BIZ-001) ──
    const requestedStage = (body.stage_id as string | undefined) || PIPELINE_STAGE_IDS.NEW_INQUIRY;
    const stageId = (requestedStage in STAGE_DEFAULT_WIN_PROBABILITY)
      ? (requestedStage as PipelineStageId)
      : PIPELINE_STAGE_IDS.NEW_INQUIRY;

    const winProbBody = body.win_probability;
    const explicitWinProb =
      typeof winProbBody === 'number' && winProbBody >= 0 && winProbBody <= 100
        ? Math.round(winProbBody)
        : null;
    const winProbability = explicitWinProb ?? STAGE_DEFAULT_WIN_PROBABILITY[stageId];

    // assigned_to gate: creating leads for yourself is free (leads.create), but
    // assigning a NEW lead to another user is a manager/admin action — require
    // leads.assign (mirrors the PATCH reassignment gate) and validate the target
    // is a real, ACTIVE user so we never orphan the lead under a ghost account.
    let assignedTo = auth.pyraUser.username;
    const requestedAssignee =
      typeof body.assigned_to === 'string' ? body.assigned_to.trim() : '';
    if (requestedAssignee && requestedAssignee !== auth.pyraUser.username) {
      if (!hasPermission(auth.pyraUser.rolePermissions, 'leads.assign')) {
        return apiForbidden('تحتاج صلاحية "إسناد / نقل ملكية الـ Lead" لإسناده لمستخدم آخر');
      }
      const assignable = await isAssignableUser(supabase, requestedAssignee);
      if (!assignable) {
        return apiValidationError('المستخدم المحدد للإسناد غير موجود أو غير نشط');
      }
      assignedTo = requestedAssignee;
    }

    const insertId = generateId('sl');

    const insertRow: Record<string, unknown> = {
      id: insertId,
      name,
      phone,
      email: typeof body.email === 'string' ? body.email.trim() || null : null,
      company: typeof body.company === 'string' ? body.company.trim() || null : null,
      source: typeof body.source === 'string' ? body.source : 'manual',
      stage_id: stageId,
      assigned_to: assignedTo,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      priority: typeof body.priority === 'string' ? body.priority : 'medium',
      lead_type: body.lead_type === 'b2c' ? 'b2c' : 'b2b',
      industry: typeof body.industry === 'string' ? body.industry.trim() || null : null,
      deal_type: typeof body.deal_type === 'string' ? body.deal_type : null,
      expected_value: typeof body.expected_value === 'number' ? body.expected_value : 0,
      expected_value_currency: typeof body.expected_value_currency === 'string' ? body.expected_value_currency : 'AED',
      billing_cycle: typeof body.billing_cycle === 'string' ? body.billing_cycle : 'one_time',
      win_probability: winProbability,
      win_probability_overridden: explicitWinProb !== null,
      contact_person: typeof body.contact_person === 'string' ? body.contact_person.trim() || null : null,
      contact_role: typeof body.contact_role === 'string' ? body.contact_role.trim() || null : null,
      company_size: typeof body.company_size === 'string' ? body.company_size : null,
      decision_maker: typeof body.decision_maker === 'string' ? body.decision_maker.trim() || null : null,
      budget_range: typeof body.budget_range === 'string' ? body.budget_range : null,
      created_by: auth.pyraUser.username,
      next_follow_up: typeof body.next_follow_up === 'string' ? body.next_follow_up : null,
      is_converted: false,
    };

    // ── Insert lead ──
    const { data: lead, error: insertErr } = await supabase
      .from('pyra_sales_leads')
      .insert(insertRow)
      .select('*')
      .single();

    if (insertErr || !lead) {
      console.error('POST /api/crm/leads insert error:', insertErr?.message);
      return apiServerError(`فشل إنشاء الـ Lead${insertErr?.message ? ': ' + insertErr.message : ''}`);
    }

    // ── lead_created activity ──
    // Supabase query builder is lazy — `void <builder>` alone never triggers
    // .then() so the query is never sent. Always attach .then() to fire it.
    void supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: insertId,
        activity_type: 'lead_created',
        description: null,
        metadata: { source: insertRow.source, created_by: auth.pyraUser.username },
        created_by: auth.pyraUser.username,
      })
      .then(({ error: e }) => {
        if (e) console.error('[lead_created activity] insert failed:', e.message);
      });

    // ── Optional follow-up bundled with create ──
    const followUpTitle = typeof body.follow_up_title === 'string' ? body.follow_up_title.trim() : '';
    const followUpDueAt = typeof body.next_follow_up === 'string' ? body.next_follow_up : '';
    if (followUpTitle && followUpDueAt) {
      const followId = generateId('fu');
      void supabase
        .from('pyra_sales_follow_ups')
        .insert({
          id: followId,
          lead_id: insertId,
          assigned_to: assignedTo,
          due_at: followUpDueAt,
          title: followUpTitle,
          status: 'pending',
          created_by: auth.pyraUser.username,
        })
        .then(({ error: e }) => {
          if (e) console.error('[bundled follow-up] insert failed:', e.message);
        });
      void supabase
        .from('pyra_lead_activities')
        .insert({
          id: generateId('la'),
          lead_id: insertId,
          activity_type: 'follow_up_created',
          description: followUpTitle,
          metadata: { follow_up_id: followId, due_at: followUpDueAt },
          created_by: auth.pyraUser.username,
        })
        .then(({ error: e }) => {
          if (e) console.error('[bundled follow_up_created activity] insert failed:', e.message);
        });
    }

    // ── Notify the assignee if it isn't the creator ──
    if (assignedTo && assignedTo !== auth.pyraUser.username) {
      void notify(supabase, {
        to: assignedTo,
        type: 'lead_assigned',
        title: 'تم إسناد Lead جديد لك',
        message: `${auth.pyraUser.display_name} أنشأ Lead "${name}" وعيّنه عليك`,
        link: `/dashboard/crm/leads/${insertId}`,
        entity: { type: ENTITY_TYPES.LEAD, id: insertId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
    }

    // ── Phone duplicate post-warning (Q-API-001) ──
    let duplicate_warning: { existing_lead_id: string; existing_lead_name: string } | null = null;
    const key = phoneMatchKey(phone);
    if (key.length >= 6) {
      const { data: dups } = await supabase
        .from('pyra_sales_leads')
        .select('id, name')
        .ilike('phone', `%${key}%`)
        .neq('id', insertId)
        .limit(1);
      if (dups && dups.length > 0) {
        duplicate_warning = { existing_lead_id: dups[0].id, existing_lead_name: dups[0].name };
      }
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.CREATE}`,
      `/dashboard/crm/leads/${insertId}`,
      { lead_id: insertId, name, source: insertRow.source, assigned_to: assignedTo },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({ lead, duplicate_warning }, undefined, 201);
  } catch (err) {
    console.error('POST /api/crm/leads threw:', err);
    return apiServerError();
  }
}
