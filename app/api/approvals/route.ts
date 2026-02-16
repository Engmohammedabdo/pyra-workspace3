import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// GET /api/approvals
// List approvals. Support ?status=, ?project_id= filters.
// Joins with pyra_project_files for file details.
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const projectId = searchParams.get('project_id');

    const supabase = await createServerSupabaseClient();

    // Join approvals with project files to get file details
    let query = supabase
      .from('pyra_file_approvals')
      .select(
        '*, pyra_project_files!inner(id, project_id, file_path, file_name, mime_type, uploaded_by, created_at)',
        { count: 'exact' }
      );

    // Filter by status
    if (status) {
      const validStatuses = ['pending', 'approved', 'revision_requested'];
      if (!validStatuses.includes(status)) {
        return apiValidationError(`حالة غير صالحة. الحالات المسموحة: ${validStatuses.join(', ')}`);
      }
      query = query.eq('status', status);
    }

    // Filter by project_id through the joined table
    if (projectId) {
      query = query.eq('pyra_project_files.project_id', projectId);
    }

    query = query.order('created_at', { ascending: false });

    const { data: approvals, error, count } = await query;

    if (error) {
      console.error('Approvals list error:', error);
      return apiServerError('فشل في جلب الموافقات');
    }

    return apiSuccess(approvals || [], { total: count || 0 });
  } catch (err) {
    console.error('Approvals GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/approvals
// Submit a file for approval.
// Body: { file_id }
// Creates approval with status='pending' and notifies client.
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { file_id } = body;

    if (!file_id || typeof file_id !== 'string') {
      return apiValidationError('معرّف الملف مطلوب (file_id)');
    }

    const supabase = await createServerSupabaseClient();

    // Verify the project file exists and get project details
    const { data: projectFile, error: fileError } = await supabase
      .from('pyra_project_files')
      .select('*, pyra_projects(id, name, client_company)')
      .eq('id', file_id)
      .single();

    if (fileError || !projectFile) {
      return apiNotFound('الملف غير موجود');
    }

    // Check if there's already a pending approval for this file
    const { data: existingApproval } = await supabase
      .from('pyra_file_approvals')
      .select('id')
      .eq('file_id', file_id)
      .eq('status', 'pending')
      .single();

    if (existingApproval) {
      return apiValidationError('يوجد طلب موافقة معلق بالفعل لهذا الملف');
    }

    const approvalId = generateId('fa');
    const now = new Date().toISOString();

    const newApproval = {
      id: approvalId,
      file_id,
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      comment: null,
      created_at: now,
    };

    const { data: approval, error } = await supabase
      .from('pyra_file_approvals')
      .insert(newApproval)
      .select()
      .single();

    if (error) {
      console.error('Approval create error:', error);
      return apiServerError('فشل في إنشاء طلب الموافقة');
    }

    // Notify client via pyra_client_notifications
    const project = projectFile.pyra_projects as { id: string; name: string; client_company: string } | null;

    if (project) {
      // Find client(s) associated with this company
      const { data: clients } = await supabase
        .from('pyra_clients')
        .select('id')
        .eq('company', project.client_company)
        .eq('is_active', true);

      if (clients && clients.length > 0) {
        const notifications = clients.map((client) => ({
          id: generateId('cn'),
          client_id: client.id,
          type: 'approval_request',
          title: 'طلب موافقة جديد',
          message: `ملف جديد بانتظار موافقتك: ${projectFile.file_name} في مشروع ${project.name}`,
          is_read: false,
          created_at: now,
        }));

        await supabase.from('pyra_client_notifications').insert(notifications);
      }
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'approval_submitted',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: projectFile.file_path,
      details: {
        approval_id: approvalId,
        file_id,
        file_name: projectFile.file_name,
        project_id: projectFile.project_id,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(approval, undefined, 201);
  } catch (err) {
    console.error('Approvals POST error:', err);
    return apiServerError();
  }
}
