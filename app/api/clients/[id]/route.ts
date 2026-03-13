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

// Fields to select — include auth_user_id for portal status detection
const CLIENT_FIELDS = 'id, name, email, phone, company, address, source, last_login_at, is_active, created_at, auth_user_id';

/**
 * GET /api/clients/[id]
 * Get a single client by ID.
 * Admin only.
 * Returns client details + financials + tags + related counts + recent activity.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('clients.view');
    if (isApiError(auth)) return auth;

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

    // ── Fetch all related data in parallel ────────────
    const [
      projectsRes,
      quotesRes,
      invoicesRes,
      contractsRes,
      tagsRes,
      activityRes,
    ] = await Promise.all([
      // Projects count (total + active)
      supabase
        .from('pyra_projects')
        .select('id, status')
        .eq('client_company', client.company),

      // Quotes count + total
      supabase
        .from('pyra_quotes')
        .select('id, total')
        .eq('client_id', id),

      // Invoices: total, paid, outstanding
      supabase
        .from('pyra_invoices')
        .select('id, total, status')
        .eq('client_id', id),

      // Contracts count (table may not exist)
      supabase
        .from('pyra_contracts')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', id)
        .then((res) => (res.error ? { count: 0, data: null, error: null } : res)),

      // Tags
      supabase
        .from('pyra_client_tag_assignments')
        .select('tag_id, pyra_client_tags(id, name, color)')
        .eq('client_id', id),

      // Recent activity (last 10)
      supabase
        .from('pyra_activity_log')
        .select('id, action_type, username, display_name, details, created_at')
        .or(`target_path.like./clients/${id}%,details->>client_id.eq.${id}`)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // ── Compute project stats ─────────────────────────
    const projects = projectsRes.data || [];
    const activeProjects = projects.filter(
      (p) => !['completed', 'archived'].includes(p.status)
    );

    // ── Compute financial stats ───────────────────────
    const invoices = invoicesRes.data || [];
    const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalPaid = invoices
      .filter((inv) => inv.status === 'paid')
      .reduce((sum, inv) => sum + (inv.total || 0), 0);

    const quotes = quotesRes.data || [];
    const quotesTotal = quotes.reduce((sum, q) => sum + (q.total || 0), 0);

    // ── Extract tags ──────────────────────────────────
    const tags = (tagsRes.data || [])
      .map((a) => a.pyra_client_tags as unknown as { id: string; name: string; color: string })
      .filter(Boolean);

    // Strip auth_user_id from response, expose only has_portal flag
    const { auth_user_id, ...clientData } = client;

    return apiSuccess({
      ...clientData,
      has_portal: !!auth_user_id,
      tags,
      projects_count: projects.length,
      active_projects_count: activeProjects.length,
      quotes_count: quotes.length,
      quotes_total: quotesTotal,
      invoices_count: invoices.length,
      total_invoiced: totalInvoiced,
      total_paid: totalPaid,
      outstanding: totalInvoiced - totalPaid,
      contracts_count: contractsRes.count ?? 0,
      recent_activity: activityRes.data || [],
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
    const auth = await requireApiPermission('clients.edit');
    if (isApiError(auth)) return auth;

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

    if (body.address !== undefined) {
      updates.address = body.address?.trim() || null;
    }

    if (body.source !== undefined) {
      const validSources = ['manual', 'referral', 'website', 'social'];
      if (body.source && !validSources.includes(body.source)) {
        return apiValidationError(`مصدر غير صالح. المصادر المسموحة: ${validSources.join(', ')}`);
      }
      updates.source = body.source || 'manual';
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
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
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
    const auth = await requireApiPermission('clients.delete');
    if (isApiError(auth)) return auth;

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
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
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
