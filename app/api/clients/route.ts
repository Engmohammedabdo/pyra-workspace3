import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { escapeLike, escapePostgrestValue, sanitizeFileName } from '@/lib/utils/path';

// Fields to select — everything EXCEPT auth_user_id
const CLIENT_FIELDS = 'id, name, email, phone, company, address, source, last_login_at, is_active, created_at';
const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

/**
 * GET /api/clients
 * List all clients with optional filters.
 * Admin only.
 *
 * Query params:
 *   ?search=  — filter by name, email, or company (ilike)
 *   ?company= — exact match on company
 *   ?active=  — "true" or "false"
 *   ?tag=     — filter by tag ID
 *   ?sort=    — sort field: name, company, created_at (default: created_at)
 *   ?order=   — asc or desc (default: desc)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('clients.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const searchParams = request.nextUrl.searchParams;

    const search = searchParams.get('search')?.trim() || '';
    const company = searchParams.get('company')?.trim() || '';
    const active = searchParams.get('active')?.trim() || '';
    const tagFilter = searchParams.get('tag')?.trim() || '';
    const sortField = searchParams.get('sort')?.trim() || 'created_at';
    const sortOrder = searchParams.get('order')?.trim() || 'desc';

    // ── Tag filter: get client IDs first ────────────
    let tagClientIds: string[] | null = null;
    if (tagFilter) {
      const { data: tagAssignments } = await supabase
        .from('pyra_client_tag_assignments')
        .select('client_id')
        .eq('tag_id', tagFilter);

      tagClientIds = (tagAssignments || []).map((a) => a.client_id);
      if (tagClientIds.length === 0) {
        return apiSuccess([], { total: 0 });
      }
    }

    let query = supabase
      .from('pyra_clients')
      .select(CLIENT_FIELDS, { count: 'exact' });

    // Tag filter — scope to matched client IDs
    if (tagClientIds) {
      query = query.in('id', tagClientIds);
    }

    // Search filter — match name, email, or company
    if (search) {
      const escaped = escapeLike(search);
      const safeVal = escapePostgrestValue(`%${escaped}%`);
      query = query.or(
        `name.ilike.${safeVal},email.ilike.${safeVal},company.ilike.${safeVal}`
      );
    }

    // Company exact filter
    if (company) {
      query = query.eq('company', company);
    }

    // Active filter
    if (active === 'true') {
      query = query.eq('is_active', true);
    } else if (active === 'false') {
      query = query.eq('is_active', false);
    }

    // Sorting
    const validSortFields = ['name', 'company', 'created_at'];
    const actualSort = validSortFields.includes(sortField) ? sortField : 'created_at';
    query = query.order(actualSort, { ascending: sortOrder === 'asc' }).limit(500);

    const { data: clients, count, error } = await query;

    if (error) {
      console.error('Clients list error:', error);
      return apiServerError();
    }

    // ── Enrich with tags + project counts + invoice totals ──
    const clientList = clients || [];
    if (clientList.length === 0) {
      return apiSuccess([], { total: count ?? 0 });
    }

    const clientIds = clientList.map((c) => c.id);
    const companies = [...new Set(clientList.map((c) => c.company))];

    // Fetch tags, project counts, and invoice totals in parallel
    const [tagsRes, projectsRes, invoicesRes] = await Promise.all([
      // Tags for all clients
      supabase
        .from('pyra_client_tag_assignments')
        .select('client_id, tag_id, pyra_client_tags(id, name, color)')
        .in('client_id', clientIds),

      // Project counts per company
      supabase
        .from('pyra_projects')
        .select('client_company, id')
        .in('client_company', companies),

      // Invoice totals per client
      supabase
        .from('pyra_invoices')
        .select('client_id, total, status')
        .in('client_id', clientIds),
    ]);

    // Build tags map: client_id → tags[]
    const tagsMap: Record<string, { id: string; name: string; color: string }[]> = {};
    for (const assignment of tagsRes.data || []) {
      const tag = assignment.pyra_client_tags as unknown as { id: string; name: string; color: string } | null;
      if (!tag) continue;
      if (!tagsMap[assignment.client_id]) tagsMap[assignment.client_id] = [];
      tagsMap[assignment.client_id].push(tag);
    }

    // Build project count map: company → count
    const projectCountMap: Record<string, number> = {};
    for (const proj of projectsRes.data || []) {
      projectCountMap[proj.client_company] = (projectCountMap[proj.client_company] || 0) + 1;
    }

    // Build invoice totals map: client_id → { total, paid }
    const invoiceMap: Record<string, { total: number; paid: number }> = {};
    for (const inv of invoicesRes.data || []) {
      if (!inv.client_id) continue;
      if (!invoiceMap[inv.client_id]) invoiceMap[inv.client_id] = { total: 0, paid: 0 };
      invoiceMap[inv.client_id].total += inv.total || 0;
      if (inv.status === 'paid') invoiceMap[inv.client_id].paid += inv.total || 0;
    }

    // Enrich clients
    const enriched = clientList.map((c) => ({
      ...c,
      tags: tagsMap[c.id] || [],
      projects_count: projectCountMap[c.company] || 0,
      invoices_total: invoiceMap[c.id]?.total || 0,
      invoices_paid: invoiceMap[c.id]?.paid || 0,
    }));

    return apiSuccess(enriched, { total: count ?? 0 });
  } catch (err) {
    console.error('GET /api/clients error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/clients
 * Create a new client.
 * Admin only.
 *
 * Body: { name, email, phone?, company, password, address?, source? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('clients.create');
    if (isApiError(auth)) return auth;

    const body = await request.json();
    const { name, email, phone, company, password, address, source } = body;

    // ── Validation ───────────────────────────────────
    if (!name?.trim()) return apiValidationError('الاسم مطلوب');
    if (!email?.trim()) return apiValidationError('البريد الإلكتروني مطلوب');
    if (!company?.trim()) return apiValidationError('اسم الشركة مطلوب');
    if (!password || password.length < 6) {
      return apiValidationError('كلمة المرور مطلوبة (6 أحرف على الأقل)');
    }

    const supabase = createServiceRoleClient();

    // ── Check for duplicate email ────────────────────
    const { data: existing, error: checkError } = await supabase
      .from('pyra_clients')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (checkError) {
      console.error('Client check error:', checkError);
    }

    if (existing) {
      return apiValidationError('البريد الإلكتروني مسجل مسبقاً');
    }

    // ── Create Supabase Auth user ────────────────────
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        role: 'client',
        company: company.trim(),
        display_name: name.trim(),
      },
    });

    if (authError) {
      console.error('Auth user creation error:', authError.message, authError);
      // If user already exists in Auth but not in pyra_clients, provide clear message
      if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
        return apiValidationError('البريد الإلكتروني مسجل مسبقاً في نظام المصادقة');
      }
      return apiValidationError(`فشل إنشاء الحساب: ${authError.message}`);
    }

    // ── Insert into pyra_clients ─────────────────────
    const clientId = generateId('cl');

    const { data: client, error: insertError } = await supabase
      .from('pyra_clients')
      .insert({
        id: clientId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        company: company.trim(),
        address: address?.trim() || null,
        source: source || 'manual',
        auth_user_id: authUser.user.id,
        password_hash: 'supabase_auth_managed',
        role: 'client',
        status: 'active',
        language: 'ar',
        created_by: auth.pyraUser.username,
        is_active: true,
      })
      .select(CLIENT_FIELDS)
      .single();

    if (insertError) {
      console.error('Client insert error:', insertError.message, insertError);
      // Rollback: delete the auth user we just created
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return apiValidationError(`فشل حفظ بيانات العميل: ${insertError.message}`);
    }

    // ── Create company folder in storage ─────────────
    // Slug must match the convention used by POST /api/projects:
    // projects/{company-slug}/{project-slug}
    const companySlug = sanitizeFileName(company.trim())
      .replace(/\s+/g, '-')
      .toLowerCase();
    const companyFolder = `projects/${companySlug}`;

    // Create company root folder placeholder (fire-and-forget)
    void supabase.storage
      .from(BUCKET)
      .upload(`${companyFolder}/.emptyFolderPlaceholder`, new Uint8Array(0), {
        contentType: 'application/x-empty',
        upsert: true,
      })
      .then(() => {
        // Index the company folder
        void supabase.from('pyra_file_index').upsert(
          {
            id: generateId('fi'),
            file_path: companyFolder,
            file_name: companySlug,
            file_name_lower: companySlug.toLowerCase(),
            file_size: 0,
            mime_type: 'folder',
            is_folder: true,
            parent_path: 'projects',
            indexed_at: new Date().toISOString(),
          },
          { onConflict: 'file_path' }
        );
      });

    // ── Log activity (fire-and-forget) ────────────────
    void supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'client_created',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/clients/${clientId}`,
      details: {
        client_id: clientId,
        client_name: name.trim(),
        client_email: email.trim().toLowerCase(),
        company: company.trim(),
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(client, undefined, 201);
  } catch (err) {
    console.error('POST /api/clients error:', err);
    return apiServerError();
  }
}
