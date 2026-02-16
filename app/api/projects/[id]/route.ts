import { NextRequest } from 'next/server';
import { getApiAuth, getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// GET /api/projects/[id]
// Get project details with file count and recent comments count
// =============================================================
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await context.params;

    const supabase = await createServerSupabaseClient();

    // Fetch project
    const { data: project, error } = await supabase
      .from('pyra_projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !project) {
      return apiNotFound('المشروع غير موجود');
    }

    // Employee access check: must be a member of the project's team
    if (auth.pyraUser.role === 'employee') {
      if (!project.team_id) {
        // No team assigned — no employee should see this project
        return apiForbidden('لا تملك صلاحية الوصول لهذا المشروع');
      }

      const { data: membership } = await supabase
        .from('pyra_team_members')
        .select('id')
        .eq('team_id', project.team_id)
        .eq('username', auth.pyraUser.username)
        .maybeSingle();

      if (!membership) {
        return apiForbidden('لا تملك صلاحية الوصول لهذا المشروع');
      }
    }

    // Get file count
    const { count: fileCount } = await supabase
      .from('pyra_project_files')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', id);

    // Get recent comments count (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { count: recentCommentsCount } = await supabase
      .from('pyra_client_comments')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', id)
      .gte('created_at', sevenDaysAgo.toISOString());

    return apiSuccess({
      ...project,
      file_count: fileCount || 0,
      recent_comments_count: recentCommentsCount || 0,
    });
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
    const auth = await getApiAdmin();
    if (!auth) {
      const basicAuth = await getApiAuth();
      if (!basicAuth) return apiUnauthorized();
      return apiForbidden();
    }

    const { id } = await context.params;
    const body = await request.json();
    const { name, description, status, client_company } = body;

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
// Cascades: delete linked project_files and comments first.
// =============================================================
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getApiAdmin();
    if (!auth) {
      const basicAuth = await getApiAuth();
      if (!basicAuth) return apiUnauthorized();
      return apiForbidden();
    }

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

    // Cascade: delete file approvals linked to this project's files
    const { data: projectFiles } = await supabase
      .from('pyra_project_files')
      .select('id')
      .eq('project_id', id);

    if (projectFiles && projectFiles.length > 0) {
      const fileIds = projectFiles.map((f) => f.id);
      await supabase
        .from('pyra_file_approvals')
        .delete()
        .in('file_id', fileIds);
    }

    // Cascade: delete project files
    await supabase
      .from('pyra_project_files')
      .delete()
      .eq('project_id', id);

    // Cascade: delete comments
    await supabase
      .from('pyra_client_comments')
      .delete()
      .eq('project_id', id);

    // Delete the project itself
    const { error } = await supabase
      .from('pyra_projects')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Project delete error:', error);
      return apiServerError('فشل في حذف المشروع');
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'project_deleted',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: id,
      details: { project_name: existing.name },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('Project DELETE error:', err);
    return apiServerError();
  }
}
