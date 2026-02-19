import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { escapeLike, escapePostgrestValue, sanitizeFileName } from '@/lib/utils/path';

// Fields to select — everything EXCEPT auth_user_id
const CLIENT_FIELDS = 'id, name, email, phone, company, last_login_at, is_active, created_at';
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
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiUnauthorized();

    const supabase = createServiceRoleClient();
    const searchParams = request.nextUrl.searchParams;

    const search = searchParams.get('search')?.trim() || '';
    const company = searchParams.get('company')?.trim() || '';
    const active = searchParams.get('active')?.trim() || '';

    let query = supabase
      .from('pyra_clients')
      .select(CLIENT_FIELDS, { count: 'exact' });

    // Search filter — match name, email, or company
    // Use escapePostgrestValue to wrap the LIKE pattern and prevent filter injection
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

    // Order by newest first, with limit to prevent unbounded results
    query = query.order('created_at', { ascending: false }).limit(500);

    const { data: clients, count, error } = await query;

    if (error) {
      console.error('Clients list error:', error);
      return apiServerError();
    }

    return apiSuccess(clients || [], { total: count ?? 0 });
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
 * Body: { name, email, phone?, company, password }
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiUnauthorized();

    const body = await request.json();
    const { name, email, phone, company, password } = body;

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
        auth_user_id: authUser.user.id,
        password_hash: 'supabase_auth_managed',
        role: 'client',
        status: 'active',
        language: 'ar',
        created_by: admin.pyraUser.username,
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
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
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
