import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

/**
 * POST /api/clients/[id]/activate-portal
 * Create a Supabase Auth user for a client that was created without portal access.
 * Admin only.
 *
 * Body: { password: string (6+ chars) }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('clients.edit');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const { password } = await request.json();

    if (!password || password.length < 6) {
      return apiValidationError('كلمة المرور مطلوبة (6 أحرف على الأقل)');
    }

    const supabase = createServiceRoleClient();

    // Fetch client
    const { data: client, error } = await supabase
      .from('pyra_clients')
      .select('id, name, email, company, auth_user_id')
      .eq('id', id)
      .maybeSingle();

    if (error || !client) {
      return apiNotFound('العميل غير موجود');
    }

    if (client.auth_user_id) {
      return apiValidationError('العميل لديه حساب بورتال بالفعل');
    }

    // Create Supabase Auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: client.email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'client',
        company: client.company,
        display_name: client.name,
      },
    });

    if (authError) {
      console.error('Auth user creation error:', authError.message);
      if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
        return apiValidationError('البريد الإلكتروني مسجل مسبقاً في نظام المصادقة');
      }
      return apiValidationError(`فشل إنشاء الحساب: ${authError.message}`);
    }

    // Update client record
    const { error: updateError } = await supabase
      .from('pyra_clients')
      .update({
        auth_user_id: authUser.user.id,
        password_hash: 'supabase_auth_managed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('Client update error:', updateError);
      // Rollback auth user
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return apiServerError('فشل تحديث بيانات العميل');
    }

    // Log activity
    void supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'client_portal_activated',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/clients/${id}`,
      details: {
        client_id: id,
        client_name: client.name,
        client_email: client.email,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ has_portal: true });
  } catch (err) {
    console.error('POST /api/clients/[id]/activate-portal error:', err);
    return apiServerError();
  }
}
