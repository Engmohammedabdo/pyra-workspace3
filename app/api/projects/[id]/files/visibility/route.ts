import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// PATCH /api/projects/[id]/files/visibility
// Bulk toggle client_visible for multiple files
// Body: { file_ids: string[], client_visible: boolean }
// =============================================================
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id: projectId } = await context.params;
    const body = await request.json();
    const { file_ids, client_visible } = body;

    // Validation
    if (!Array.isArray(file_ids) || file_ids.length === 0) {
      return apiValidationError('يجب تحديد ملف واحد على الأقل');
    }
    if (typeof client_visible !== 'boolean') {
      return apiValidationError('قيمة الظهور للعميل يجب أن تكون true أو false');
    }

    const supabase = await createServerSupabaseClient();

    // Verify project exists
    const { data: project, error: projectError } = await supabase
      .from('pyra_projects')
      .select('id, team_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return apiNotFound('المشروع غير موجود');
    }

    // Employee access check
    if (auth.pyraUser.role === 'employee') {
      if (!project.team_id) {
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

    // Bulk update client_visible for selected files
    const { data: updated, error } = await supabase
      .from('pyra_project_files')
      .update({ client_visible })
      .eq('project_id', projectId)
      .in('id', file_ids)
      .select('id, client_visible');

    if (error) {
      console.error('Visibility update error:', error);
      return apiServerError('فشل في تحديث ظهور الملفات');
    }

    return apiSuccess({
      updated_count: updated?.length || 0,
      client_visible,
    });
  } catch (err) {
    console.error('Project files visibility PATCH error:', err);
    return apiServerError();
  }
}
