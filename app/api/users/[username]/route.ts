import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
  apiError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

type RouteParams = { params: Promise<{ username: string }> };

// =============================================================
// GET /api/users/[username]
// Get a single user by username (admin only).
// =============================================================
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { username } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: user, error } = await supabase
      .from('pyra_users')
      .select('id, username, role, display_name, permissions, created_at')
      .eq('username', username)
      .single();

    if (error || !user) {
      return apiNotFound('المستخدم غير موجود');
    }

    return apiSuccess(user);
  } catch (err) {
    console.error('User GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/users/[username]
// Update a user (admin only).
// Body can include: { display_name?, role?, permissions? }
// =============================================================
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { username } = await params;
    const body = await request.json();

    const supabase = await createServerSupabaseClient();

    // Verify user exists
    const { data: existingUser, error: findError } = await supabase
      .from('pyra_users')
      .select('id, username, role, display_name, permissions, created_at')
      .eq('username', username)
      .single();

    if (findError || !existingUser) {
      return apiNotFound('المستخدم غير موجود');
    }

    // Build update payload — only include provided fields
    const updateData: Record<string, unknown> = {};

    if (body.display_name !== undefined) {
      if (typeof body.display_name !== 'string' || body.display_name.trim().length === 0) {
        return apiValidationError('اسم العرض غير صالح');
      }
      updateData.display_name = body.display_name.trim();
    }

    if (body.role !== undefined) {
      if (body.role !== 'admin' && body.role !== 'employee') {
        return apiValidationError('الدور يجب أن يكون admin أو employee');
      }
      updateData.role = body.role;
    }

    if (body.permissions !== undefined) {
      if (typeof body.permissions !== 'object' || body.permissions === null) {
        return apiValidationError('الصلاحيات يجب أن تكون كائن JSON');
      }
      updateData.permissions = body.permissions;
    }

    if (Object.keys(updateData).length === 0) {
      return apiValidationError('لا توجد بيانات للتحديث');
    }

    // Perform the update
    const { data: updatedUser, error: updateError } = await supabase
      .from('pyra_users')
      .update(updateData)
      .eq('username', username)
      .select('id, username, role, display_name, permissions, created_at')
      .single();

    if (updateError) {
      console.error('User update error:', updateError);
      return apiServerError('فشل في تحديث المستخدم');
    }

    // Update Supabase Auth user metadata if display_name or role changed
    if (updateData.display_name || updateData.role) {
      const { data: mapping } = await supabase
        .from('pyra_auth_mapping')
        .select('auth_user_id')
        .eq('pyra_username', username)
        .single();

      if (mapping) {
        const serviceClient = createServiceRoleClient();
        await serviceClient.auth.admin.updateUserById(mapping.auth_user_id, {
          user_metadata: {
            username,
            display_name: updatedUser.display_name,
            role: updatedUser.role,
          },
        });
      }
    }

    // Log the activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'user_updated',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: username,
      details: {
        updated_fields: Object.keys(updateData),
        changes: updateData,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(updatedUser);
  } catch (err) {
    console.error('User PATCH error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/users/[username]
// Delete a user (admin only). Cannot delete own account.
// =============================================================
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { username } = await params;

    // Prevent deleting own account
    if (username === admin.pyraUser.username) {
      return apiError('لا يمكنك حذف حسابك الخاص', 400);
    }

    const supabase = await createServerSupabaseClient();

    // Verify user exists
    const { data: existingUser, error: findError } = await supabase
      .from('pyra_users')
      .select('id, username, display_name, role')
      .eq('username', username)
      .single();

    if (findError || !existingUser) {
      return apiNotFound('المستخدم غير موجود');
    }

    // Step 1: Delete from pyra_users
    const { error: deleteError } = await supabase
      .from('pyra_users')
      .delete()
      .eq('username', username);

    if (deleteError) {
      console.error('pyra_users delete error:', deleteError);
      return apiServerError('فشل في حذف المستخدم');
    }

    // Step 2: Find and delete Supabase Auth user
    const { data: mapping } = await supabase
      .from('pyra_auth_mapping')
      .select('auth_user_id')
      .eq('pyra_username', username)
      .single();

    if (mapping) {
      const serviceClient = createServiceRoleClient();
      await serviceClient.auth.admin.deleteUser(mapping.auth_user_id);

      // Clean up the mapping record
      await supabase
        .from('pyra_auth_mapping')
        .delete()
        .eq('pyra_username', username);
    }

    // Step 3: Log the activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'user_deleted',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: username,
      details: {
        deleted_username: existingUser.username,
        deleted_display_name: existingUser.display_name,
        deleted_role: existingUser.role,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ message: 'تم حذف المستخدم بنجاح' });
  } catch (err) {
    console.error('User DELETE error:', err);
    return apiServerError();
  }
}
