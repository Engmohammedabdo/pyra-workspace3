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

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// GET /api/approvals/[id]
// Get single approval details
// =============================================================
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await context.params;

    const supabase = await createServerSupabaseClient();

    const { data: approval, error } = await supabase
      .from('pyra_file_approvals')
      .select(
        '*, pyra_project_files(id, project_id, file_path, file_name, mime_type, uploaded_by, created_at)'
      )
      .eq('id', id)
      .single();

    if (error || !approval) {
      return apiNotFound('الموافقة غير موجودة');
    }

    return apiSuccess(approval);
  } catch (err) {
    console.error('Approval GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/approvals/[id]
// Update approval status.
// Body: { status: 'approved' | 'revision_requested', comment? }
// Sets reviewed_by, reviewed_at. Creates notification.
// =============================================================
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await context.params;
    const body = await request.json();
    const { status, comment } = body;

    // Validation
    const validStatuses = ['approved', 'revision_requested'];
    if (!status || !validStatuses.includes(status)) {
      return apiValidationError(`حالة غير صالحة. الحالات المسموحة: ${validStatuses.join(', ')}`);
    }

    const supabase = await createServerSupabaseClient();

    // Verify approval exists and get file details
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_file_approvals')
      .select(
        '*, pyra_project_files(id, project_id, file_path, file_name, mime_type, pyra_projects(id, name, client_company))'
      )
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('الموافقة غير موجودة');
    }

    const now = new Date().toISOString();

    const updates = {
      status,
      reviewed_by: auth.pyraUser.username,
      reviewed_at: now,
      comment: comment?.trim() || null,
    };

    const { data: approval, error } = await supabase
      .from('pyra_file_approvals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Approval update error:', error);
      return apiServerError('فشل في تحديث الموافقة');
    }

    // Create notification for relevant parties
    const projectFile = existing.pyra_project_files as {
      id: string;
      project_id: string;
      file_path: string;
      file_name: string;
      mime_type: string;
      pyra_projects: { id: string; name: string; client_company: string } | null;
    } | null;

    if (projectFile?.pyra_projects) {
      const project = projectFile.pyra_projects;
      const statusText = status === 'approved' ? 'تمت الموافقة على' : 'طُلبت مراجعة';

      // Notify clients of this company
      const { data: clients } = await supabase
        .from('pyra_clients')
        .select('id')
        .eq('company', project.client_company)
        .eq('is_active', true);

      if (clients && clients.length > 0) {
        const notifications = clients.map((client) => ({
          id: generateId('cn'),
          client_id: client.id,
          type: status === 'approved' ? 'file_approved' : 'revision_requested',
          title: status === 'approved' ? 'تمت الموافقة على ملف' : 'مراجعة مطلوبة',
          message: `${statusText} الملف: ${projectFile.file_name} في مشروع ${project.name}`,
          is_read: false,
          created_at: now,
        }));

        const { error: notifErr } = await supabase.from('pyra_client_notifications').insert(notifications);
        if (notifErr) console.error('Client notification insert error:', notifErr);
      }

      // Also notify via internal notifications (for team members)
      const { error: intNotifErr } = await supabase.from('pyra_notifications').insert({
        id: generateId('nt'),
        recipient_username: existing.reviewed_by !== auth.pyraUser.username
          ? (existing.reviewed_by || 'admin')
          : 'admin',
        type: status === 'approved' ? 'file_approved' : 'revision_requested',
        title: `${statusText} ملف`,
        message: `${statusText} الملف "${projectFile.file_name}" في مشروع "${project.name}" بواسطة ${auth.pyraUser.display_name}`,
        source_username: auth.pyraUser.username,
        source_display_name: auth.pyraUser.display_name,
        target_path: projectFile.file_path,
        is_read: false,
      });
      if (intNotifErr) console.error('Internal notification insert error:', intNotifErr);
    }

    // Log activity
    const { error: logErr } = await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: status === 'approved' ? 'file_approved' : 'revision_requested',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: projectFile?.file_path || id,
      details: {
        approval_id: id,
        status,
        comment: comment?.trim() || null,
        file_name: projectFile?.file_name,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });
    if (logErr) console.error('Activity log insert error:', logErr);

    return apiSuccess(approval);
  } catch (err) {
    console.error('Approval PATCH error:', err);
    return apiServerError();
  }
}
