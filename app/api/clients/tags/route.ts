import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

/** Allowed tag colors */
const TAG_COLORS = [
  'orange',
  'red',
  'green',
  'blue',
  'purple',
  'pink',
  'teal',
  'amber',
  'gray',
] as const;

/**
 * GET /api/clients/tags
 * List all global client tags, ordered alphabetically.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('clients.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();

    const { data: tags, error } = await supabase
      .from('pyra_client_tags')
      .select('id, name, color')
      .order('name', { ascending: true });

    if (error) {
      console.error('Tags list error:', error);
      return apiServerError();
    }

    return apiSuccess(tags || []);
  } catch (err) {
    console.error('GET /api/clients/tags error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/clients/tags
 * Create a new global client tag.
 *
 * Body: { name: string, color?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('clients.edit');
    if (isApiError(auth)) return auth;

    const body = await request.json();
    const supabase = createServiceRoleClient();

    // ── Validation ───────────────────────────────────
    if (!body.name?.trim()) {
      return apiValidationError('اسم الوسم مطلوب');
    }

    const color = body.color || 'blue';
    if (!TAG_COLORS.includes(color)) {
      return apiValidationError(
        `لون غير صالح. الألوان المتاحة: ${TAG_COLORS.join(', ')}`
      );
    }

    // ── Check for duplicate name (case-insensitive) ──
    const { data: existing } = await supabase
      .from('pyra_client_tags')
      .select('id')
      .ilike('name', body.name.trim())
      .maybeSingle();

    if (existing) {
      return apiValidationError('يوجد وسم بنفس الاسم بالفعل');
    }

    // ── Insert tag ───────────────────────────────────
    const tagId = generateId('ct');

    const { data: tag, error } = await supabase
      .from('pyra_client_tags')
      .insert({
        id: tagId,
        name: body.name.trim(),
        color,
      })
      .select('id, name, color')
      .single();

    if (error) {
      console.error('Tag insert error:', error);
      return apiServerError();
    }

    return apiSuccess(tag, undefined, 201);
  } catch (err) {
    console.error('POST /api/clients/tags error:', err);
    return apiServerError();
  }
}

/**
 * DELETE /api/clients/tags?id=tagId
 * Delete a global client tag.
 * CASCADE will automatically remove all tag assignments.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiPermission('clients.edit');
    if (isApiError(auth)) return auth;

    const tagId = request.nextUrl.searchParams.get('id');

    if (!tagId) {
      return apiValidationError('معرف الوسم مطلوب');
    }

    const supabase = createServiceRoleClient();

    // ── Delete tag (CASCADE removes assignments) ─────
    const { error } = await supabase
      .from('pyra_client_tags')
      .delete()
      .eq('id', tagId);

    if (error) {
      console.error('Tag delete error:', error);
      return apiServerError();
    }

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/clients/tags error:', err);
    return apiServerError();
  }
}
