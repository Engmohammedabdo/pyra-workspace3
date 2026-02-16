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
import { generateId } from '@/lib/utils/id';

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// GET /api/projects/[id]/files
// List files assigned to this project
// =============================================================
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await context.params;

    const supabase = await createServerSupabaseClient();

    // Verify project exists
    const { data: project, error: projectError } = await supabase
      .from('pyra_projects')
      .select('id, team_id')
      .eq('id', id)
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

    // Fetch project files
    const { data: files, error, count } = await supabase
      .from('pyra_project_files')
      .select('*', { count: 'exact' })
      .eq('project_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Project files list error:', error);
      return apiServerError('فشل في جلب ملفات المشروع');
    }

    return apiSuccess(files || [], { total: count || 0 });
  } catch (err) {
    console.error('Project files GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/projects/[id]/files
// Assign a file to a project
// Body: { file_path, file_name, file_type }
// =============================================================
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await context.params;
    const body = await request.json();
    const { file_path, file_name, mime_type, category, client_visible } = body;

    // Validation
    if (!file_path || typeof file_path !== 'string') {
      return apiValidationError('مسار الملف مطلوب');
    }
    if (!file_name || typeof file_name !== 'string') {
      return apiValidationError('اسم الملف مطلوب');
    }
    if (!mime_type || typeof mime_type !== 'string') {
      return apiValidationError('نوع الملف مطلوب');
    }

    const supabase = await createServerSupabaseClient();

    // Verify project exists
    const { data: project, error: projectError } = await supabase
      .from('pyra_projects')
      .select('id, team_id')
      .eq('id', id)
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

    // Check if file is already assigned to this project
    const { data: existingFile } = await supabase
      .from('pyra_project_files')
      .select('id')
      .eq('project_id', id)
      .eq('file_path', file_path)
      .single();

    if (existingFile) {
      return apiValidationError('هذا الملف مضاف بالفعل لهذا المشروع');
    }

    const fileId = generateId('pf');
    const now = new Date().toISOString();

    const newFile = {
      id: fileId,
      project_id: id,
      file_path: file_path.trim(),
      file_name: file_name.trim(),
      mime_type: mime_type.trim(),
      category: category?.trim() || null,
      client_visible: client_visible !== false, // default true
      uploaded_by: auth.pyraUser.username,
    };

    const { data: projectFile, error } = await supabase
      .from('pyra_project_files')
      .insert(newFile)
      .select()
      .single();

    if (error) {
      console.error('Project file create error:', error);
      return apiServerError('فشل في إضافة الملف للمشروع');
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'file_assigned_to_project',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: file_path,
      details: { project_id: id, file_name: file_name.trim() },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(projectFile, undefined, 201);
  } catch (err) {
    console.error('Project files POST error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/projects/[id]/files?file_id=xxx
// Remove a file from a project
// =============================================================
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const fileId = searchParams.get('file_id');

    if (!fileId) {
      return apiValidationError('معرّف الملف مطلوب (file_id)');
    }

    const supabase = await createServerSupabaseClient();

    // Employee access check
    if (auth.pyraUser.role === 'employee') {
      const { data: proj } = await supabase
        .from('pyra_projects')
        .select('team_id')
        .eq('id', id)
        .single();

      if (!proj?.team_id) {
        return apiForbidden('لا تملك صلاحية الوصول لهذا المشروع');
      }
      const { data: membership } = await supabase
        .from('pyra_team_members')
        .select('id')
        .eq('team_id', proj.team_id)
        .eq('username', auth.pyraUser.username)
        .maybeSingle();
      if (!membership) {
        return apiForbidden('لا تملك صلاحية الوصول لهذا المشروع');
      }
    }

    // Verify the file belongs to this project
    const { data: existingFile, error: fetchError } = await supabase
      .from('pyra_project_files')
      .select('id, file_name, file_path')
      .eq('id', fileId)
      .eq('project_id', id)
      .single();

    if (fetchError || !existingFile) {
      return apiNotFound('الملف غير موجود في هذا المشروع');
    }

    // Delete associated approvals first
    await supabase
      .from('pyra_file_approvals')
      .delete()
      .eq('file_id', fileId);

    // Delete the file link
    const { error } = await supabase
      .from('pyra_project_files')
      .delete()
      .eq('id', fileId);

    if (error) {
      console.error('Project file delete error:', error);
      return apiServerError('فشل في إزالة الملف من المشروع');
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'file_removed_from_project',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: existingFile.file_path,
      details: { project_id: id, file_name: existingFile.file_name },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('Project files DELETE error:', err);
    return apiServerError();
  }
}
