import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// GET /api/dashboard/content-pipeline/[id]
// Get single pipeline item with all stages
// =============================================================
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('script_reviews.view');
    if (isApiError(auth)) return auth;

    const { id } = await context.params;
    const supabase = await createServerSupabaseClient();

    const { data: item, error } = await supabase
      .from('pyra_content_pipeline')
      .select(
        '*, pyra_pipeline_stages(id, stage, status, assigned_to, started_at, completed_at, notes, sort_order), pyra_projects(name)'
      )
      .eq('id', id)
      .single();

    if (error || !item) {
      return apiNotFound('عنصر خط الإنتاج غير موجود');
    }

    // Fetch assigned user display name
    let assignedDisplayName: string | null = null;
    if (item.assigned_to) {
      const { data: user } = await supabase
        .from('pyra_users')
        .select('display_name')
        .eq('username', item.assigned_to)
        .single();
      assignedDisplayName = user?.display_name || item.assigned_to;
    }

    // Sort stages by sort_order
    const stages = (item.pyra_pipeline_stages || []).sort(
      (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
    );

    return apiSuccess({
      ...item,
      assigned_display_name: assignedDisplayName,
      project_name: item.pyra_projects?.name || null,
      pyra_pipeline_stages: stages,
    });
  } catch (err) {
    console.error('Content pipeline [id] GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/dashboard/content-pipeline/[id]
// Update pipeline item fields
// =============================================================
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('script_reviews.manage');
    if (isApiError(auth)) return auth;

    const { id } = await context.params;
    const body = await request.json();
    const { title, content_type, project_id, assigned_to, deadline, notes } = body;

    const validTypes = ['video', 'reel', 'podcast', 'article', 'social_post'];
    if (content_type && !validTypes.includes(content_type)) {
      return apiValidationError('نوع المحتوى غير صالح');
    }

    const supabase = createServiceRoleClient();

    // Check item exists
    const { data: existing, error: existErr } = await supabase
      .from('pyra_content_pipeline')
      .select('id')
      .eq('id', id)
      .single();

    if (existErr || !existing) {
      return apiNotFound('عنصر خط الإنتاج غير موجود');
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (title !== undefined) updates.title = title.trim();
    if (content_type !== undefined) updates.content_type = content_type;
    if (project_id !== undefined) updates.project_id = project_id || null;
    if (assigned_to !== undefined) updates.assigned_to = assigned_to || null;
    if (deadline !== undefined) updates.deadline = deadline || null;
    if (notes !== undefined) updates.notes = notes?.trim() || null;

    const { data: updated, error } = await supabase
      .from('pyra_content_pipeline')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Pipeline update error:', error);
      return apiServerError('فشل في تحديث عنصر خط الإنتاج');
    }

    return apiSuccess(updated);
  } catch (err) {
    console.error('Content pipeline [id] PATCH error:', err);
    return apiServerError();
  }
}
