import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';

// =============================================================
// GET /api/hr/document-types
// List all active document types, sorted by sort_order.
// =============================================================
export async function GET() {
  try {
    const auth = await requireApiPermission('documents.manage');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_document_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) return apiServerError(error.message);
    return apiSuccess(data);
  } catch (err) {
    console.error('GET /api/hr/document-types error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/hr/document-types
// Create a new document type.
// =============================================================
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('documents.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json();
    const { name, name_ar, requires_expiry, sort_order } = body;

    if (!name || !name_ar) {
      return apiValidationError('الاسم والاسم العربي مطلوبان');
    }

    const supabase = createServiceRoleClient();

    const id = generateId('dt');

    const { data, error } = await supabase
      .from('pyra_document_types')
      .insert({
        id,
        name,
        name_ar,
        requires_expiry: requires_expiry ?? false,
        is_active: true,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();

    if (error) return apiServerError(error.message);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.DOCUMENT}_${ACTIVITY_ACTIONS.CREATE}`,
      '/dashboard/hr/documents',
      { source: 'document_type_created', name },
    );

    return apiSuccess(data, undefined, 201);
  } catch (err) {
    console.error('POST /api/hr/document-types error:', err);
    return apiServerError();
  }
}
