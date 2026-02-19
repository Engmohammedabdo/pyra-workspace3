import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// Fields to select — everything EXCEPT auth_user_id
const CLIENT_FIELDS = 'id, name, email, phone, company, last_login_at, is_active, created_at';

/**
 * GET /api/clients/[id]
 * Get a single client by ID.
 * Admin only.
 * Returns client details + projects count + quotes count.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // ── Fetch client ─────────────────────────────────
    const { data: client, error } = await supabase
      .from('pyra_clients')
      .select(CLIENT_FIELDS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Client fetch error:', error);
      return apiServerError();
    }

    if (!client) {
      return apiNotFound('العميل غير موجود');
    }

    // ── Count related projects ───────────────────────
    const { count: projectsCount } = await supabase
      .from('pyra_projects')
      .select('id', { count: 'exact', head: true })
      .eq('client_company', client.company);

    // ── Count related quotes ─────────────────────────
    const { count: quotesCount } = await supabase
      .from('pyra_quotes')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', id);

    return apiSuccess({
      ...client,
      projects_count: projectsCount ?? 0,
      quotes_count: quotesCount ?? 0,
    });
  } catch (err) {
    console.error('GET /api/clients/[id] error:', err);
    return apiServerError();
  }
}

/**
 * PATCH /api/clients/[id]
 * Update a client.
 * Admin only.
 *
 * Body: { name?, email?, phone?, company?, is_active? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await params;
    const body = await request.json();
    const supabase = createServiceRoleClient();

    // ── Verify client exists ─────────────────────────
    const { data: existing } = await supabase
      .from('pyra_clients')
      .select('id, email, auth_user_id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return apiNotFound('العميل غير موجود');
    }

    // ── Build update payload ─────────────────────────
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (!body.name?.trim()) return apiValidationError('الاسم لا يمكن أن يكون فارغاً');
      updates.name = body.name.trim();
    }

    if (body.email !== undefined) {
      if (!body.email?.trim()) return apiValidationError('البريد الإلكتروني لا يمكن أن يكون فارغاً');
      const newEmail = body.email.trim().toLowerCase();

      // Check for duplicate email (excluding current client)
      if (newEmail !== existing.email) {
        const { data: duplicate } = await supabase
          .from('pyra_clients')
          .select('id')
          .eq('email', newEmail)
          .neq('id', id)
          .maybeSingle();

        if (duplicate) {
          return apiValidationError('البريد الإلكتروني مسجل بالفعل');
        }

        // Update email in Supabase Auth as well
        await supabase.auth.admin.updateUserById(existing.auth_user_id, {
          email: newEmail,
        });
      }

      updates.email = newEmail;
    }

    if (body.phone !== undefined) {
      updates.phone = body.phone?.trim() || null;
    }

    if (body.company !== undefined) {
      if (!body.company?.trim()) return apiValidationError('اسم الشركة لا يمكن أن يكون فارغاً');
      updates.company = body.company.trim();
    }

    if (body.is_active !== undefined) {
      updates.is_active = Boolean(body.is_active);
    }

    // Nothing to update
    if (Object.keys(updates).length === 0) {
      return apiValidationError('لا توجد بيانات للتحديث');
    }

    // ── Update pyra_clients ──────────────────────────
    const { data: client, error: updateError } = await supabase
      .from('pyra_clients')
      .update(updates)
      .eq('id', id)
      .select(CLIENT_FIELDS)
      .single();

    if (updateError) {
      console.error('Client update error:', updateError);
      return apiServerError();
    }

    // ── Log activity ─────────────────────────────────
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'client_updated',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/clients/${id}`,
      details: {
        client_id: id,
        updated_fields: Object.keys(updates),
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(client);
  } catch (err) {
    console.error('PATCH /api/clients/[id] error:', err);
    return apiServerError();
  }
}

/**
 * DELETE /api/clients/[id]
 * Delete a client.
 * Admin only.
 * Checks for linked projects/quotes first — if any exist, returns 422 with warning.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // ── Verify client exists ─────────────────────────
    const { data: existing } = await supabase
      .from('pyra_clients')
      .select('id, name, email, company, auth_user_id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return apiNotFound('العميل غير موجود');
    }

    // ── Check for linked projects ────────────────────
    const { count: projectsCount } = await supabase
      .from('pyra_projects')
      .select('id', { count: 'exact', head: true })
      .eq('client_company', existing.company);

    // ── Check for linked quotes ──────────────────────
    const { count: quotesCount } = await supabase
      .from('pyra_quotes')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', id);

    const linkedProjects = projectsCount ?? 0;
    const linkedQuotes = quotesCount ?? 0;

    if (linkedProjects > 0 || linkedQuotes > 0) {
      return apiValidationError(
        `لا يمكن حذف العميل. يوجد ${linkedProjects} مشروع و ${linkedQuotes} عرض سعر مرتبط بهذا العميل. قم بحذفها أو نقلها أولاً.`
      );
    }

    // ── Delete from pyra_clients ─────────────────────
    const { error: deleteError } = await supabase
      .from('pyra_clients')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Client delete error:', deleteError);
      return apiServerError();
    }

    // ── Delete from Supabase Auth ────────────────────
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(
      existing.auth_user_id
    );

    if (authDeleteError) {
      console.error('Auth user delete error (non-critical):', authDeleteError);
      // Non-critical — client row is already deleted
    }

    // ── Log activity ─────────────────────────────────
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'client_deleted',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/clients/${id}`,
      details: {
        client_id: id,
        client_name: existing.name,
        client_email: existing.email,
        company: existing.company,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ deleted: true, id });
  } catch (err) {
    console.error('DELETE /api/clients/[id] error:', err);
    return apiServerError();
  }
}
