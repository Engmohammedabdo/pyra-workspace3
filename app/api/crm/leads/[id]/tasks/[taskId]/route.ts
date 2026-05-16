import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  apiServerError,
  apiValidationError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { canAccessLead } from '@/lib/auth/lead-scope';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { LEAD_TASK_TITLE_MAX } from '@/lib/constants/statuses';
import type { PyraLeadTask, LeadTaskStatus, LeadTaskPriority } from '@/types/database';

// ────────────────────────────────────────────────────────────────────────────
// /api/crm/leads/[id]/tasks/[taskId]
//
// Phase 15.1 Commit 2 — per-lead task PATCH/DELETE.
//
// Cross-resource guard (Phase 15.2 Commit 1 attachments precedent):
//   Every mutation queries with `WHERE id = taskId AND lead_id = leadId` to
//   prevent {leadA, taskB-of-leadC} URL forgery. Even with canAccessLead
//   passing for leadA, the double-eq pattern ensures the task BELONGS to
//   that lead before any mutation lands.
//
// FIX 2 — completed_at lifecycle:
//   - PATCH status TO 'completed' → set completed_at = NOW()
//   - PATCH status AWAY from 'completed' → set completed_at = NULL
//   - Never settable by client — always derived server-side from the status
//     transition.
//
// DELETE permission: admin OR creator (mirrors Phase 15.2 attachments).
// Assigned-to (when different from creator) cannot delete — only the
// creator owns the lifecycle. Admin override always applies.
// ────────────────────────────────────────────────────────────────────────────

const ALLOWED_STATUS = new Set<LeadTaskStatus>(['pending', 'in_progress', 'completed', 'cancelled']);
const ALLOWED_PRIORITY = new Set<LeadTaskPriority>(['low', 'medium', 'high', 'urgent']);

// ──────────────────────────────────────────────────────────────────────────
// PATCH — update a task
// ──────────────────────────────────────────────────────────────────────────
//
// Body (all fields optional — only present keys are updated):
//   title         — non-empty string (validated BEFORE DB)
//   description   — string or null (null clears)
//   due_date      — YYYY-MM-DD or null
//   priority      — low|medium|high|urgent or null
//   status        — pending|in_progress|completed|cancelled
//   assigned_to   — pyra_users.username or null

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  let authForLogging: ApiAuthResult | null = null;
  let leadIdForLogging: string | null = null;
  let taskIdForLogging: string | null = null;
  try {
    const auth = await requireApiPermission('leads.update');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const { id: leadId, taskId } = await params;
    leadIdForLogging = leadId;
    taskIdForLogging = taskId;

    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(
      supabase,
      auth.pyraUser.username,
      auth.pyraUser.role,
      leadId,
    );
    if (!allowed) return apiForbidden('لا تملك صلاحية الوصول لهذا الـ Lead');

    // Cross-resource guard — fetch existing row WITH lead_id match
    const { data: existing, error: fetchErr } = await supabase
      .from('pyra_lead_tasks')
      .select('id, lead_id, title, status, completed_at, created_by, assigned_to')
      .eq('id', taskId)
      .eq('lead_id', leadId)
      .maybeSingle();

    if (fetchErr) {
      logError({
        error: fetchErr,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, task_id: taskId, action: 'fetch-task' },
      });
      console.error('PATCH fetch error:', fetchErr.message);
      return apiServerError();
    }
    if (!existing) return apiNotFound('المهمة غير موجودة');

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return apiValidationError('JSON body مطلوب');

    const updates: Record<string, unknown> = {};

    // FIX 4 — title validation BEFORE DB CHECK
    if ('title' in body) {
      const v = typeof body.title === 'string' ? body.title.trim() : '';
      if (!v) return apiValidationError('العنوان مطلوب');
      if (v.length > LEAD_TASK_TITLE_MAX) {
        return apiValidationError(`العنوان طويل جداً (الحد الأقصى ${LEAD_TASK_TITLE_MAX} حرف)`);
      }
      updates.title = v;
    }

    if ('description' in body) {
      if (body.description === null) updates.description = null;
      else if (typeof body.description === 'string') {
        const v = body.description.trim();
        updates.description = v ? v : null;
      }
    }

    if ('due_date' in body) {
      if (body.due_date === null) updates.due_date = null;
      else if (typeof body.due_date === 'string') {
        const v = body.due_date.trim();
        if (!v) updates.due_date = null;
        else {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
            return apiValidationError('تاريخ الاستحقاق يجب أن يكون بصيغة YYYY-MM-DD');
          }
          updates.due_date = v;
        }
      }
    }

    if ('priority' in body) {
      if (body.priority === null) updates.priority = null;
      else if (typeof body.priority === 'string') {
        const v = body.priority.trim() as LeadTaskPriority;
        if (!v) updates.priority = null;
        else {
          if (!ALLOWED_PRIORITY.has(v)) {
            return apiValidationError('الأولوية غير صحيحة');
          }
          updates.priority = v;
        }
      }
    }

    if ('assigned_to' in body) {
      if (body.assigned_to === null) updates.assigned_to = null;
      else if (typeof body.assigned_to === 'string') {
        const v = body.assigned_to.trim();
        updates.assigned_to = v ? v : null;
      }
    }

    // Status transition — FIX 2 completed_at lifecycle
    let statusTransition: { from: LeadTaskStatus; to: LeadTaskStatus } | null = null;
    if ('status' in body) {
      const newStatus = typeof body.status === 'string' ? body.status.trim() as LeadTaskStatus : '' as LeadTaskStatus;
      if (!ALLOWED_STATUS.has(newStatus)) {
        return apiValidationError('الحالة غير صحيحة');
      }
      const oldStatus = existing.status as LeadTaskStatus;
      if (newStatus !== oldStatus) {
        updates.status = newStatus;
        statusTransition = { from: oldStatus, to: newStatus };
        if (newStatus === 'completed') {
          updates.completed_at = new Date().toISOString();
        } else if (oldStatus === 'completed') {
          // Transitioning AWAY from completed
          updates.completed_at = null;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return apiValidationError('لا توجد تغييرات');
    }

    const { data: updated, error: updateErr } = await supabase
      .from('pyra_lead_tasks')
      .update(updates)
      .eq('id', taskId)
      .eq('lead_id', leadId)
      .select('id, lead_id, title, description, due_date, priority, status, assigned_to, created_by, created_at, completed_at, metadata')
      .single();

    if (updateErr || !updated) {
      logError({
        error: updateErr ?? new Error('lead task update returned no row'),
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, task_id: taskId, action: 'update-task' },
      });
      console.error('PATCH update error:', updateErr?.message);
      return apiServerError('فشل تحديث المهمة');
    }

    // Activity dual-write — only emit for status transitions OR title
    // changes (the user-visible changes). Other field updates are noisy.
    const shouldLogTimeline = !!statusTransition || 'title' in updates;
    if (shouldLogTimeline) {
      const desc = statusTransition
        ? `حالة المهمة "${(updated as PyraLeadTask).title}" → ${statusTransition.to}`
        : `تم تعديل المهمة: ${(updated as PyraLeadTask).title}`;
      supabase
        .from('pyra_lead_activities')
        .insert({
          id: generateId('la'),
          lead_id: leadId,
          activity_type: 'field_updated',
          description: desc,
          metadata: {
            source: statusTransition ? 'task_status_changed' : 'task_updated',
            task_id: taskId,
            field: 'task',
            ...(statusTransition ? { from_status: statusTransition.from, to_status: statusTransition.to } : {}),
          },
          created_by: auth.pyraUser.username,
        })
        .then(({ error: e }) => {
          if (e) console.error('[lead task timeline] update insert failed:', e.message);
        });
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/crm/leads/${leadId}?tab=tasks`,
      {
        lead_id: leadId,
        source: statusTransition ? 'task_status_changed' : 'task_updated',
        task_id: taskId,
        updated_fields: Object.keys(updates),
        ...(statusTransition ? { from_status: statusTransition.from, to_status: statusTransition.to } : {}),
      },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    return apiSuccess({ task: updated as PyraLeadTask });
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { lead_id: leadIdForLogging, task_id: taskIdForLogging, action: 'update-task' },
    });
    console.error('PATCH /api/crm/leads/[id]/tasks/[taskId] threw:', err);
    return apiServerError();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// DELETE — admin OR creator only
// ──────────────────────────────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  let authForLogging: ApiAuthResult | null = null;
  let leadIdForLogging: string | null = null;
  let taskIdForLogging: string | null = null;
  try {
    const auth = await requireApiPermission('leads.update');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const { id: leadId, taskId } = await params;
    leadIdForLogging = leadId;
    taskIdForLogging = taskId;

    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(
      supabase,
      auth.pyraUser.username,
      auth.pyraUser.role,
      leadId,
    );
    if (!allowed) return apiForbidden('لا تملك صلاحية الوصول لهذا الـ Lead');

    // Cross-resource guard + creator check
    const { data: existing, error: fetchErr } = await supabase
      .from('pyra_lead_tasks')
      .select('id, lead_id, title, created_by')
      .eq('id', taskId)
      .eq('lead_id', leadId)
      .maybeSingle();

    if (fetchErr) {
      logError({
        error: fetchErr,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, task_id: taskId, action: 'delete-task-fetch' },
      });
      console.error('DELETE fetch error:', fetchErr.message);
      return apiServerError();
    }
    if (!existing) return apiNotFound('المهمة غير موجودة');

    const isAdmin = auth.pyraUser.role === 'admin';
    const isCreator = existing.created_by === auth.pyraUser.username;
    if (!isAdmin && !isCreator) {
      return apiForbidden('فقط منشئ المهمة أو الـ admin يقدر يحذفها');
    }

    const { error: deleteErr } = await supabase
      .from('pyra_lead_tasks')
      .delete()
      .eq('id', taskId)
      .eq('lead_id', leadId);

    if (deleteErr) {
      logError({
        error: deleteErr,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, task_id: taskId, action: 'delete-task' },
      });
      console.error('DELETE error:', deleteErr.message);
      return apiServerError('فشل حذف المهمة');
    }

    // Activity dual-write
    supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: leadId,
        activity_type: 'field_updated',
        description: `تم حذف المهمة: ${existing.title}`,
        metadata: {
          source: 'task_deleted',
          task_id: taskId,
          field: 'task',
        },
        created_by: auth.pyraUser.username,
      })
      .then(({ error: e }) => {
        if (e) console.error('[lead task timeline] delete insert failed:', e.message);
      });

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/crm/leads/${leadId}?tab=tasks`,
      {
        lead_id: leadId,
        source: 'task_deleted',
        task_id: taskId,
      },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    return apiSuccess({ deleted: true });
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { lead_id: leadIdForLogging, task_id: taskIdForLogging, action: 'delete-task' },
    });
    console.error('DELETE /api/crm/leads/[id]/tasks/[taskId] threw:', err);
    return apiServerError();
  }
}
