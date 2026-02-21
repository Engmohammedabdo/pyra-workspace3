import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, apiForbidden, apiServerError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';
import { generateSlug } from '@/lib/utils/slug';

/**
 * GET /api/kb/categories
 * List all KB categories ordered by sort_order (admin).
 */
export async function GET() {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('pyra_kb_categories')
      .select('id, name, slug, description, icon, sort_order, is_public, created_by, created_at, updated_at')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('GET /api/kb/categories error:', error);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch {
    return apiServerError();
  }
}

/**
 * POST /api/kb/categories
 * Create a new KB category (admin).
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const body = await request.json();
    const { name, description, icon, sort_order, is_public } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return apiError('اسم التصنيف مطلوب');
    }

    const supabase = createServiceRoleClient();
    const id = generateId('kc');
    const slug = generateSlug(name.trim());

    const { data, error } = await supabase
      .from('pyra_kb_categories')
      .insert({
        id,
        name: name.trim(),
        slug,
        description: description?.trim() || null,
        icon: icon || null,
        sort_order: sort_order ?? 0,
        is_public: is_public ?? true,
        created_by: admin.pyraUser.username,
      })
      .select('id, name, slug, description, icon, sort_order, is_public, created_by, created_at, updated_at')
      .single();

    if (error) {
      console.error('POST /api/kb/categories error:', error);
      return apiServerError();
    }

    return apiSuccess(data, undefined, 201);
  } catch {
    return apiServerError();
  }
}
