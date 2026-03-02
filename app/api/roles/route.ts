import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { hasPermission } from '@/lib/auth/rbac';

export async function GET() {
  const auth = await requireApiPermission('roles.view');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();

  const { data: roles, error } = await supabase
    .from('pyra_roles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get member counts
  const { data: counts } = await supabase
    .from('pyra_users')
    .select('role_id');

  const memberCounts: Record<string, number> = {};
  if (counts) {
    for (const user of counts) {
      if (user.role_id) {
        memberCounts[user.role_id] = (memberCounts[user.role_id] || 0) + 1;
      }
    }
  }

  const rolesWithCounts = (roles || []).map(role => ({
    ...role,
    member_count: memberCounts[role.id] || 0,
  }));

  return NextResponse.json({ data: rolesWithCounts });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission('roles.manage');
  if (isApiError(auth)) return auth;

  const body = await request.json();
  const { name, name_ar, description, permissions, color, icon } = body;

  if (!name || !name_ar) {
    return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 });
  }

  if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
    return NextResponse.json({ error: 'يجب تحديد صلاحية واحدة على الأقل' }, { status: 400 });
  }

  // Prevent privilege escalation: user cannot grant permissions they don't have
  const userPerms = auth.pyraUser.rolePermissions;
  if (!userPerms.includes('*')) {
    const unauthorized = permissions.filter((p: string) => !hasPermission(userPerms, p));
    if (unauthorized.length > 0) {
      return NextResponse.json(
        { error: `لا يمكنك منح صلاحيات لا تملكها: ${unauthorized.join(', ')}` },
        { status: 403 }
      );
    }
  }

  const supabase = await createServerSupabaseClient();

  const { data: role, error } = await supabase
    .from('pyra_roles')
    .insert({
      name,
      name_ar,
      description: description || null,
      permissions,
      color: color || 'gray',
      icon: icon || 'Shield',
      is_system: false,
      created_by: auth.pyraUser.username,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'اسم الدور موجود مسبقاً' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { ...role, member_count: 0 } }, { status: 201 });
}
