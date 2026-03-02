import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { hasPermission } from '@/lib/auth/rbac';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('roles.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: role, error } = await supabase
    .from('pyra_roles')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !role) {
    return NextResponse.json({ error: 'الدور غير موجود' }, { status: 404 });
  }

  const { count } = await supabase
    .from('pyra_users')
    .select('*', { count: 'exact', head: true })
    .eq('role_id', id);

  return NextResponse.json({ data: { ...role, member_count: count || 0 } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('roles.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const body = await request.json();
  const supabase = await createServerSupabaseClient();

  // Get current role
  const { data: currentRole } = await supabase
    .from('pyra_roles')
    .select('*')
    .eq('id', id)
    .single();

  if (!currentRole) {
    return NextResponse.json({ error: 'الدور غير موجود' }, { status: 404 });
  }

  // Build update object
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name_ar !== undefined) update.name_ar = body.name_ar;
  if (body.description !== undefined) update.description = body.description;
  if (body.color !== undefined) update.color = body.color;
  if (body.icon !== undefined) update.icon = body.icon;

  // For system roles, only allow name_ar/description/color/icon changes
  if (!currentRole.is_system) {
    if (body.name !== undefined) update.name = body.name;
    if (body.permissions !== undefined) {
      // Prevent privilege escalation: user cannot grant permissions they don't have
      const userPerms = auth.pyraUser.rolePermissions;
      if (!userPerms.includes('*')) {
        const unauthorized = (body.permissions as string[]).filter((p: string) => !hasPermission(userPerms, p));
        if (unauthorized.length > 0) {
          return NextResponse.json(
            { error: `لا يمكنك منح صلاحيات لا تملكها: ${unauthorized.join(', ')}` },
            { status: 403 }
          );
        }
      }
      update.permissions = body.permissions;
    }
  }

  const { data: role, error } = await supabase
    .from('pyra_roles')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'اسم الدور موجود مسبقاً' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: role });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('roles.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  // Check if system role
  const { data: role } = await supabase
    .from('pyra_roles')
    .select('is_system, name')
    .eq('id', id)
    .single();

  if (!role) {
    return NextResponse.json({ error: 'الدور غير موجود' }, { status: 404 });
  }

  if (role.is_system) {
    return NextResponse.json({ error: 'لا يمكن حذف الأدوار الأساسية' }, { status: 403 });
  }

  // Check if users are assigned
  const { count } = await supabase
    .from('pyra_users')
    .select('*', { count: 'exact', head: true })
    .eq('role_id', id);

  if (count && count > 0) {
    // Need fallback role
    const url = new URL(request.url);
    const fallbackRoleId = url.searchParams.get('fallback_role_id');

    if (!fallbackRoleId) {
      return NextResponse.json(
        { error: `هناك ${count} مستخدمين بهذا الدور. يجب تحديد دور بديل.`, requires_fallback: true },
        { status: 400 }
      );
    }

    // Reassign users
    const { error: reassignError } = await supabase
      .from('pyra_users')
      .update({ role_id: fallbackRoleId })
      .eq('role_id', id);

    if (reassignError) {
      return NextResponse.json({ error: reassignError.message }, { status: 500 });
    }
  }

  const { error } = await supabase
    .from('pyra_roles')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
