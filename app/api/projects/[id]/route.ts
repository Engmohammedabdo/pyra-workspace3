import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, logActivity } from '@/lib/api/activity';
import { PRODUCTION_REVIEW_DELETE_BLOCKED_ERROR } from '@/lib/constants/task-review';
import { logError } from '@/lib/observability/log-error';

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// GET /api/projects/[id]
// Get project details with file count and recent comments count
// =============================================================
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('projects.view');
    if (isApiError(auth)) return auth;

    const { id } = await context.params;

    const supabase = await createServerSupabaseClient();

    // Use v_project_summary view — includes file_count, approval stats, comment_count
    const { data: project, error } = await supabase
      .from('v_project_summary')
      .select('*')
      .eq('id', id)
      .single();

    // Determine which data source to use
    let projectData = project;

    if (error || !project) {
      // Fallback: try raw table in case view doesn't exist yet
      const { data: rawProject, error: rawErr } = await supabase
        .from('pyra_projects')
        .select('*')
        .eq('id', id)
        .single();

      if (rawErr || !rawProject) {
        return apiNotFound('المشروع غير موجود');
      }

      projectData = rawProject;
    }

    // Employee access check: must be a member of the project's team
    if (auth.pyraUser.role === 'employee') {
      // Fetch team_id from raw table (not in view) for access check
      const { data: teamProject } = await supabase
        .from('pyra_projects')
        .select('team_id')
        .eq('id', id)
        .single();

      const teamId = teamProject?.team_id;

      if (!teamId) {
        return apiForbidden('لا تملك صلاحية الوصول لهذا المشروع');
      }

      const { data: membership } = await supabase
        .from('pyra_team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('username', auth.pyraUser.username)
        .maybeSingle();

      if (!membership) {
        return apiForbidden('لا تملك صلاحية الوصول لهذا المشروع');
      }
    }

    return apiSuccess(projectData);
  } catch (err) {
    console.error('Project GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/projects/[id]
// Update project. Admin only.
// Body: { name?, description?, status?, client_company? }
// =============================================================
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('projects.edit');
    if (isApiError(auth)) return auth;

    const { id } = await context.params;
    const body = await request.json();
    const { name, description, status, client_company, deadline, start_date, budget_amount, budgeted_hours } = body;

    const supabase = await createServerSupabaseClient();

    // Verify project exists
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_projects')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('المشروع غير موجود');
    }

    // Validate status if provided
    const validStatuses = ['active', 'in_progress', 'review', 'completed', 'archived'];
    if (status && !validStatuses.includes(status)) {
      return apiValidationError(`حالة غير صالحة. الحالات المسموحة: ${validStatuses.join(', ')}`);
    }

    // Build update payload — only include provided fields
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return apiValidationError('اسم المشروع لا يمكن أن يكون فارغًا');
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }

    if (status !== undefined) {
      updates.status = status;
    }

    if (client_company !== undefined) {
      if (typeof client_company !== 'string' || client_company.trim().length === 0) {
        return apiValidationError('اسم شركة العميل لا يمكن أن يكون فارغًا');
      }
      updates.client_company = client_company.trim();

      // Auto-resolve client_id from company name
      const { data: matchedClient } = await supabase
        .from('pyra_clients')
        .select('id')
        .eq('company', client_company.trim())
        .maybeSingle();
      if (matchedClient) {
        updates.client_id = matchedClient.id;
      }
    }

    if (deadline !== undefined) {
      updates.deadline = deadline || null;
    }

    if (start_date !== undefined) {
      updates.start_date = start_date || null;
    }

    if (budget_amount !== undefined) {
      if (budget_amount !== null && (typeof budget_amount !== 'number' || budget_amount < 0)) {
        return apiValidationError('ميزانية المشروع يجب أن تكون رقم موجب');
      }
      updates.budget_amount = budget_amount;
    }

    if (budgeted_hours !== undefined) {
      if (budgeted_hours !== null && (typeof budgeted_hours !== 'number' || budgeted_hours < 0)) {
        return apiValidationError('الساعات المخصصة يجب أن تكون رقم موجب');
      }
      updates.budgeted_hours = budgeted_hours;
    }

    const { data: project, error } = await supabase
      .from('pyra_projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Project update error:', error);
      return apiServerError('فشل في تحديث المشروع');
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'project_updated',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: id,
      details: { updated_fields: Object.keys(updates).filter(k => k !== 'updated_at') },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(project);
  } catch (err) {
    console.error('Project PATCH error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/projects/[id]
// Delete project. Admin only.
// One atomic DB writer deletes the project and its linked files/comments.
// =============================================================
export async function DELETE(request: NextRequest, context: RouteContext) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('projects.delete');
    if (isApiError(auth)) return auth;

    const { id } = await context.params;

    const supabase = await createServerSupabaseClient();

    // Verify project exists
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_projects')
      .select('id, name')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('المشروع غير موجود');
    }

    // Permission and existence are verified before the service-role writer is
    // created. The RPC makes child cleanup + project delete one transaction.
    const serviceSupabase = createServiceRoleClient();
    const { data: deleteStatus, error } = await serviceSupabase.rpc(
      'pyra_delete_project_atomic',
      { p_project_id: id },
    );

    if (error) {
      logError({
        error,
        request,
        metadata: { action: 'project_delete_writer', project_id: id },
      });
      if (
        error.code === 'P0001'
        && error.message.includes(PRODUCTION_REVIEW_DELETE_BLOCKED_ERROR)
      ) {
        return apiValidationError(t('tasks.productionReviewedTaskArchiveOnly'));
      }
      return apiServerError();
    }
    if (deleteStatus === 'project_not_found') {
      return apiNotFound('المشروع غير موجود');
    }
    if (deleteStatus !== 'ok') {
      logError({
        error: new Error(`Unexpected project delete status: ${String(deleteStatus)}`),
        request,
        metadata: { action: 'project_delete_writer_status', project_id: id },
      });
      return apiServerError();
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.PROJECT}_${ACTIVITY_ACTIONS.DELETE}`,
      `/dashboard/projects/${id}`,
      { source: 'project_delete', project_id: id, project_name: existing.name },
      request.headers.get('x-forwarded-for') || 'unknown',
    );

    return apiSuccess({ deleted: true });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'project_delete' } });
    return apiServerError();
  }
}
