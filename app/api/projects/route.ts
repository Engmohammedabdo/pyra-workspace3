import { NextRequest } from 'next/server';
import { getApiAuth, getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// GET /api/projects
// List projects. Admin sees all.
// Supports ?status=, ?client_company=, ?search= filters
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const clientCompany = searchParams.get('client_company');
    const search = searchParams.get('search');

    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from('pyra_projects')
      .select('*', { count: 'exact' });

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (clientCompany) {
      query = query.eq('client_company', clientCompany);
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,description.ilike.%${search}%,client_company.ilike.%${search}%`
      );
    }

    // Order by most recently updated
    query = query.order('updated_at', { ascending: false });

    const { data: projects, error, count } = await query;

    if (error) {
      console.error('Projects list error:', error);
      return apiServerError('فشل في جلب المشاريع');
    }

    return apiSuccess(projects || [], { total: count || 0 });
  } catch (err) {
    console.error('Projects GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/projects
// Create a new project. Admin only.
// Body: { name, description?, client_company, status? }
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAdmin();
    if (!auth) {
      const basicAuth = await getApiAuth();
      if (!basicAuth) return apiUnauthorized();
      return apiForbidden();
    }

    const body = await request.json();
    const { name, description, client_company, status } = body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return apiValidationError('اسم المشروع مطلوب');
    }

    if (!client_company || typeof client_company !== 'string' || client_company.trim().length === 0) {
      return apiValidationError('اسم شركة العميل مطلوب');
    }

    const validStatuses = ['active', 'in_progress', 'review', 'completed', 'archived'];
    if (status && !validStatuses.includes(status)) {
      return apiValidationError(`حالة غير صالحة. الحالات المسموحة: ${validStatuses.join(', ')}`);
    }

    const supabase = await createServerSupabaseClient();
    const now = new Date().toISOString();
    const projectId = generateId('pr');

    const newProject = {
      id: projectId,
      name: name.trim(),
      description: description?.trim() || null,
      client_company: client_company.trim(),
      status: status || 'active',
      created_by: auth.pyraUser.username,
      created_at: now,
      updated_at: now,
    };

    const { data: project, error } = await supabase
      .from('pyra_projects')
      .insert(newProject)
      .select()
      .single();

    if (error) {
      console.error('Project create error:', error);
      return apiServerError('فشل في إنشاء المشروع');
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'project_created',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: projectId,
      details: { project_name: name.trim(), client_company: client_company.trim() },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(project, undefined, 201);
  } catch (err) {
    console.error('Projects POST error:', err);
    return apiServerError();
  }
}
