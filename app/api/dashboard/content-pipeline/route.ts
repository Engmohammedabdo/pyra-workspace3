import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

const DEFAULT_STAGES = [
  { stage: 'scripting', sort_order: 0 },
  { stage: 'review', sort_order: 1 },
  { stage: 'revision', sort_order: 2 },
  { stage: 'filming', sort_order: 3 },
  { stage: 'editing', sort_order: 4 },
  { stage: 'client_review', sort_order: 5 },
  { stage: 'delivery', sort_order: 6 },
];

// =============================================================
// GET /api/dashboard/content-pipeline
// List pipeline items with stages, project name, assigned user
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('script_reviews.view');
    if (isApiError(auth)) return auth;

    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');
    const stage = searchParams.get('stage');
    const contentType = searchParams.get('content_type');

    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from('pyra_content_pipeline')
      .select(
        '*, pyra_pipeline_stages(id, stage, status, assigned_to, started_at, completed_at, notes, sort_order), pyra_projects(name)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    if (stage) {
      query = query.eq('current_stage', stage);
    }
    if (contentType) {
      query = query.eq('content_type', contentType);
    }

    const { data: items, error, count } = await query;

    if (error) {
      console.error('Content pipeline list error:', error);
      return apiServerError('فشل في جلب عناصر خط الإنتاج');
    }

    // Collect unique assigned_to usernames to fetch display names
    const assignedUsernames = new Set<string>();
    (items || []).forEach((item) => {
      if (item.assigned_to) assignedUsernames.add(item.assigned_to);
    });

    let userMap: Record<string, string> = {};
    if (assignedUsernames.size > 0) {
      const { data: users } = await supabase
        .from('pyra_users')
        .select('username, display_name')
        .in('username', Array.from(assignedUsernames));

      if (users) {
        userMap = Object.fromEntries(users.map((u) => [u.username, u.display_name]));
      }
    }

    // Enrich items with display names and sort stages
    const enriched = (items || []).map((item) => ({
      ...item,
      assigned_display_name: item.assigned_to ? userMap[item.assigned_to] || item.assigned_to : null,
      project_name: item.pyra_projects?.name || null,
      pyra_pipeline_stages: (item.pyra_pipeline_stages || []).sort(
        (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
      ),
    }));

    return apiSuccess(enriched, { total: count || 0 });
  } catch (err) {
    console.error('Content pipeline GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/dashboard/content-pipeline
// Create a new pipeline item with default stages
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('script_reviews.manage');
    if (isApiError(auth)) return auth;

    const body = await request.json();
    const { title, content_type, project_id, assigned_to, deadline, notes } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return apiValidationError('عنوان المحتوى مطلوب');
    }

    const validTypes = ['video', 'reel', 'podcast', 'article', 'social_post'];
    if (content_type && !validTypes.includes(content_type)) {
      return apiValidationError('نوع المحتوى غير صالح');
    }

    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();
    const pipelineId = generateId('cp');

    const newItem = {
      id: pipelineId,
      title: title.trim(),
      content_type: content_type || 'video',
      current_stage: 'scripting',
      project_id: project_id || null,
      assigned_to: assigned_to || null,
      deadline: deadline || null,
      notes: notes?.trim() || null,
      created_by: auth.pyraUser.username,
      created_at: now,
      updated_at: now,
    };

    const { data: pipeline, error: pipelineError } = await supabase
      .from('pyra_content_pipeline')
      .insert(newItem)
      .select()
      .single();

    if (pipelineError) {
      console.error('Pipeline create error:', pipelineError);
      return apiServerError('فشل في إنشاء عنصر خط الإنتاج');
    }

    // Create default stages
    const stageRecords = DEFAULT_STAGES.map((s, idx) => ({
      id: generateId('ps'),
      pipeline_id: pipelineId,
      stage: s.stage,
      status: idx === 0 ? 'in_progress' : 'pending',
      assigned_to: null,
      started_at: idx === 0 ? now : null,
      completed_at: null,
      notes: null,
      sort_order: s.sort_order,
      created_at: now,
    }));

    const { error: stagesError } = await supabase
      .from('pyra_pipeline_stages')
      .insert(stageRecords);

    if (stagesError) {
      console.error('Stages create error:', stagesError);
      // Rollback: delete the pipeline item since stages failed
      await supabase
        .from('pyra_content_pipeline')
        .delete()
        .eq('id', pipelineId);
      return apiServerError('فشل في إنشاء مراحل خط الإنتاج');
    }

    return apiSuccess(pipeline, undefined, 201);
  } catch (err) {
    console.error('Content pipeline POST error:', err);
    return apiServerError();
  }
}
