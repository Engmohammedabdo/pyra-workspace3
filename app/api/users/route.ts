import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { escapeLike } from '@/lib/utils/path';
import { hashPassword } from '@/lib/utils/password';

// =============================================================
// GET /api/users
// List all users (admin only). Supports ?search= and ?role= filters.
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || '';

    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from('pyra_users')
      .select('id, username, role, display_name, permissions, created_at');

    // Apply role filter
    if (role === 'admin' || role === 'employee') {
      query = query.eq('role', role);
    }

    // Apply search filter (search in username and display_name)
    if (search.trim()) {
      const escaped = escapeLike(search.trim());
      query = query.or(
        `username.ilike.%${escaped}%,display_name.ilike.%${escaped}%`
      );
    }

    // Order by creation date descending
    query = query.order('created_at', { ascending: false });

    const { data: users, error } = await query;

    if (error) {
      console.error('Users list error:', error);
      return apiServerError('فشل في جلب قائمة المستخدمين');
    }

    return apiSuccess(users || [], { total: (users || []).length });
  } catch (err) {
    console.error('Users GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/users
// Create a new user (admin only).
// Body: { username, password, role, display_name, permissions }
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const body = await request.json();
    const { username, password, role, display_name, permissions } = body;

    // --- Validation ---
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return apiValidationError('اسم المستخدم مطلوب (3 أحرف على الأقل)');
    }

    if (!password || typeof password !== 'string' || password.length < 12) {
      return apiValidationError('كلمة المرور مطلوبة (12 حرف على الأقل)');
    }

    if (!role || (role !== 'admin' && role !== 'employee')) {
      return apiValidationError('الدور يجب أن يكون admin أو employee');
    }

    if (!display_name || typeof display_name !== 'string' || display_name.trim().length === 0) {
      return apiValidationError('اسم العرض مطلوب');
    }

    const cleanUsername = username.trim().toLowerCase();
    const email = `${cleanUsername}@pyra.local`;

    // Use service-role client for admin write operations
    const serviceClient = createServiceRoleClient();

    // Check if username already exists
    const { data: existing } = await serviceClient
      .from('pyra_users')
      .select('id')
      .eq('username', cleanUsername)
      .single();

    if (existing) {
      return apiValidationError('اسم المستخدم مستخدم بالفعل');
    }

    // Step 1: Create Supabase Auth user
    const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username: cleanUsername,
        display_name: display_name.trim(),
        role,
      },
    });

    if (authError) {
      console.error('Supabase auth create error:', authError);
      return apiServerError(`فشل في إنشاء حساب المصادقة: ${authError.message}`);
    }

    // Step 2: Insert into pyra_users (password_hash via scrypt)
    const passwordHash = hashPassword(password);
    const { data: newUser, error: insertError } = await serviceClient
      .from('pyra_users')
      .insert({
        username: cleanUsername,
        password_hash: passwordHash,
        role,
        display_name: display_name.trim(),
        permissions: permissions || {},
      })
      .select('id, username, role, display_name, permissions, created_at')
      .single();

    if (insertError) {
      console.error('pyra_users insert error:', insertError);
      // Rollback: delete the auth user we just created
      if (authData.user) {
        await serviceClient.auth.admin.deleteUser(authData.user.id);
      }
      return apiServerError(`فشل في إنشاء المستخدم: ${insertError.message}`);
    }

    // Step 3: Insert auth mapping
    await serviceClient.from('pyra_auth_mapping').insert({
      id: generateId('am'),
      auth_user_id: authData.user.id,
      pyra_username: cleanUsername,
    });

    // Step 4: Log the activity
    await serviceClient.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'user_created',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: cleanUsername,
      details: {
        created_username: cleanUsername,
        created_display_name: display_name.trim(),
        created_role: role,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(newUser, undefined, 201);
  } catch (err) {
    console.error('Users POST error:', err);
    return apiServerError();
  }
}
