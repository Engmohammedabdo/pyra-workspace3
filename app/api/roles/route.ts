import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { hasPermission } from '@/lib/auth/rbac';
import { logActivity } from '@/lib/api/activity';
import { apiServerError } from '@/lib/api/response';

export async function GET() {
  try {
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

  } catch (err) {
    console.error('[GET /api/roles] error:', err);
    return apiServerError();
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiPermission('roles.manage');
    if (isApiError(auth)) return auth;
    const t = await getTranslations('api');

    const body = await request.json();
    const { name, name_ar, description, permissions, color, icon } = body;

    if (!name || !name_ar) {
      return NextResponse.json({ error: t('roles.nameRequired') }, { status: 400 });
    }

    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      return NextResponse.json({ error: t('roles.permissionRequired') }, { status: 400 });
    }

    // Prevent privilege escalation: user cannot grant permissions they don't have
    const userPerms = auth.pyraUser.rolePermissions;
    if (!userPerms.includes('*')) {
      const unauthorized = permissions.filter((p: string) => !hasPermission(userPerms, p));
      if (unauthorized.length > 0) {
        return NextResponse.json(
          { error: t('roles.cannotGrantUnownedPermissions', { list: unauthorized.join(', ') }) },
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
        return NextResponse.json({ error: t('roles.nameAlreadyExists') }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'role_created',
      `/dashboard/roles/${role.id}`,
      { role_name: name, role_name_ar: name_ar, permissions_count: permissions.length },
    );

    return NextResponse.json({ data: { ...role, member_count: 0 } }, { status: 201 });

  } catch (err) {
    console.error('[POST /api/roles] error:', err);
    return apiServerError();
  }
}
