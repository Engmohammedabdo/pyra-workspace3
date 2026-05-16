import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiServerError,
  apiValidationError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { canAccessLead } from '@/lib/auth/lead-scope';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { LEAD_TASK_TITLE_MAX } from '@/lib/constants/statuses';
import type { PyraLeadTask, LeadTaskPriority } from '@/types/database';

// ────────────────────────────────────────────────────────────────────────────
// /api/crm/leads/[id]/tasks
//
// Phase 15.1 Commit 2 — per-lead tasks. Backing table pyra_lead_tasks
// (migration 018). Independent from pyra_tasks (board tasks) — lead
// lifecycle doesn't live on project boards.
//
// Permission contract:
//   GET   leads.view   + canAccessLead   (sales agent sees their own; admin all)
//   POST  leads.update + canAccessLead   (mirrors Phase 11.5 link-client +
//                                          Phase 15.2 attachments precedent)
//
// Activity dual-write (Phase 11.5 locked pattern):
//   - pyra_lead_activities row (timeline)  — activity_type='field_updated',
//                                             metadata.source='task_created'
//   - pyra_activity_log row (system audit) — action_type='lead_update',
//                                             metadata.source='task_created'
//
// Sort ordering (FIX 3): CASE WHEN status → 0/1/2/3, then due_date ASC NULLS
// LAST, then created_at DESC. Drives the lead-detail tasks tab + my-tasks
// aggregator default ordering.
// ────────────────────────────────────────────────────────────────────────────

const ALLOWED_PRIORITY = new Set<LeadTaskPriority>(['low', 'medium', 'high', 'urgent']);

// ──────────────────────────────────────────────────────────────────────────
// GET — list tasks for a lead
// ──────────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let authForLogging: ApiAuthResult | null = null;
  let leadIdForLogging: string | null = null;
  try {
    const auth = await requireApiPermission('leads.view');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const { id: leadId } = await params;
    leadIdForLogging = leadId;

    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(
      supabase,
      auth.pyraUser.username,
      auth.pyraUser.role,
      leadId,
    );
    if (!allowed) return apiForbidden('لا تملك صلاحية الوصول لهذا الـ Lead');

    // FIX 3 — CASE-based status sort: pending(0) < in_progress(1) <
    // completed(2) < cancelled(3). Supabase JS SDK doesn't expose raw
    // CASE expressions through .order(), so we use the explicit RPC-style
    // approach: query with the natural .order() chain and rely on the
    // multi-key sort. The 4-status CASE happens to be order-equivalent to
    // sorting `status` alphabetically REVERSED then mapping cancelled last,
    // which is awkward — so we do the CASE in JS after the query for the
    // status key, and let DB do the secondary sorts.
    //
    // The list query selects all rows for the lead; the per-lead cap is
    // organic (no human creates hundreds of tasks per lead). If we ever
    // need pagination, switch to cursor pattern matching activities route.
    const { data: rows, error } = await supabase
      .from('pyra_lead_tasks')
      .select('id, lead_id, title, description, due_date, priority, status, assigned_to, created_by, created_at, completed_at, metadata')
      .eq('lead_id', leadId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      logError({
        error,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, action: 'list-tasks' },
      });
      console.error('GET /api/crm/leads/[id]/tasks error:', error.message);
      return apiServerError();
    }

    const tasks = (rows ?? []) as PyraLeadTask[];

    // Apply CASE sort in JS — keeps the .order() chain simple while
    // enforcing the documented status precedence. Self-contained
    // tiebreakers (FIX M1 Reviewer — don't rely on V8 sort stability
    // for the within-status ordering; replicate the DB sort explicitly).
    const statusOrder: Record<string, number> = {
      pending: 0,
      in_progress: 1,
      completed: 2,
      cancelled: 3,
    };
    tasks.sort((a, b) => {
      const sa = statusOrder[a.status] ?? 99;
      const sb = statusOrder[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      // Tie-breaker 1: due_date ASC NULLS LAST
      if (a.due_date && b.due_date) {
        const cmp = a.due_date.localeCompare(b.due_date);
        if (cmp !== 0) return cmp;
      } else if (a.due_date) {
        return -1;
      } else if (b.due_date) {
        return 1;
      }
      // Tie-breaker 2: created_at DESC (newest first)
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });

    // Enrich with display names — one batched lookup over union of
    // assignees + creators. Matches the activities route enrichment pattern.
    const usernames = Array.from(
      new Set(
        tasks
          .flatMap((t) => [t.assigned_to, t.created_by])
          .filter((u): u is string => !!u),
      ),
    );
    let enriched: PyraLeadTask[] = tasks;
    if (usernames.length > 0) {
      const { data: users } = await supabase
        .from('pyra_users')
        .select('username, display_name')
        .in('username', usernames);
      const nameMap = new Map<string, string>();
      for (const u of users ?? []) nameMap.set(u.username, u.display_name);
      enriched = tasks.map((t) => ({
        ...t,
        assigned_to_display_name: t.assigned_to ? nameMap.get(t.assigned_to) ?? t.assigned_to : null,
        created_by_display_name: nameMap.get(t.created_by) ?? t.created_by,
      }));
    }

    return apiSuccess({ tasks: enriched });
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { lead_id: leadIdForLogging, action: 'list-tasks' },
    });
    console.error('GET /api/crm/leads/[id]/tasks threw:', err);
    return apiServerError();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// POST — create a task
// ──────────────────────────────────────────────────────────────────────────
//
// Body:
//   title         — required, non-empty string (LEAD_TASK_TITLE_MAX enforced)
//   description?  — optional string
//   due_date?     — optional ISO date (YYYY-MM-DD)
//   priority?     — optional low|medium|high|urgent
//   assigned_to?  — optional pyra_users.username (defaults to creator)
//
// Status is forced to 'pending' on create. completed_at is forced NULL on
// create — PATCH owns the lifecycle (FIX 2).

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let authForLogging: ApiAuthResult | null = null;
  let leadIdForLogging: string | null = null;
  try {
    const auth = await requireApiPermission('leads.update');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const { id: leadId } = await params;
    leadIdForLogging = leadId;

    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(
      supabase,
      auth.pyraUser.username,
      auth.pyraUser.role,
      leadId,
    );
    if (!allowed) return apiForbidden('لا تملك صلاحية الوصول لهذا الـ Lead');

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return apiValidationError('JSON body مطلوب');

    // FIX 4 — validate title BEFORE hitting DB CHECK constraint
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return apiValidationError('العنوان مطلوب');
    if (title.length > LEAD_TASK_TITLE_MAX) {
      return apiValidationError(`العنوان طويل جداً (الحد الأقصى ${LEAD_TASK_TITLE_MAX} حرف)`);
    }

    const description = typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : null;

    // due_date: accept YYYY-MM-DD only; reject malformed
    let dueDate: string | null = null;
    if (typeof body.due_date === 'string' && body.due_date.trim()) {
      const v = body.due_date.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return apiValidationError('تاريخ الاستحقاق يجب أن يكون بصيغة YYYY-MM-DD');
      }
      dueDate = v;
    }

    let priority: LeadTaskPriority | null = null;
    if (typeof body.priority === 'string' && body.priority.trim()) {
      const v = body.priority.trim() as LeadTaskPriority;
      if (!ALLOWED_PRIORITY.has(v)) {
        return apiValidationError('الأولوية غير صحيحة — اختر: low / medium / high / urgent');
      }
      priority = v;
    }

    const assignedTo =
      typeof body.assigned_to === 'string' && body.assigned_to.trim()
        ? body.assigned_to.trim()
        : auth.pyraUser.username;

    const taskId = generateId('lt');
    const { data: inserted, error: insertError } = await supabase
      .from('pyra_lead_tasks')
      .insert({
        id: taskId,
        lead_id: leadId,
        title,
        description,
        due_date: dueDate,
        priority,
        status: 'pending',
        assigned_to: assignedTo,
        created_by: auth.pyraUser.username,
        completed_at: null,
      })
      .select('id, lead_id, title, description, due_date, priority, status, assigned_to, created_by, created_at, completed_at, metadata')
      .single();

    if (insertError || !inserted) {
      logError({
        error: insertError ?? new Error('lead task insert returned no row'),
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, action: 'create-task' },
      });
      console.error('POST /api/crm/leads/[id]/tasks insert error:', insertError?.message);
      return apiServerError('فشل إنشاء المهمة');
    }

    // Activity dual-write — timeline + system audit. Lazy-thenable for the
    // timeline; logActivity is synchronous-fire-and-forget for the audit.
    supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: leadId,
        activity_type: 'field_updated',
        description: `تم إنشاء مهمة جديدة: ${title}`,
        metadata: {
          source: 'task_created',
          task_id: taskId,
          field: 'task',
          assigned_to: assignedTo,
          due_date: dueDate,
          priority,
        },
        created_by: auth.pyraUser.username,
      })
      .then(({ error: e }) => {
        if (e) console.error('[lead task timeline] insert failed:', e.message);
      });

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/crm/leads/${leadId}?tab=tasks`,
      {
        lead_id: leadId,
        source: 'task_created',
        task_id: taskId,
        assigned_to: assignedTo,
        due_date: dueDate,
        priority,
      },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    return apiSuccess({ task: inserted as PyraLeadTask }, undefined, 201);
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { lead_id: leadIdForLogging, action: 'create-task' },
    });
    console.error('POST /api/crm/leads/[id]/tasks threw:', err);
    return apiServerError();
  }
}
