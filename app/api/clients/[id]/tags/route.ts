import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET /api/clients/[id]/tags
 * Get all tags assigned to a client.
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

    // ── Verify client exists ─────────────────────────
    const { data: client } = await supabase
      .from('pyra_clients')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (!client) {
      return apiNotFound('العميل غير موجود');
    }

    // ── Fetch assigned tags via junction table ────────
    const { data: assignments, error } = await supabase
      .from('pyra_client_tag_assignments')
      .select('tag_id, pyra_client_tags(id, name, color)')
      .eq('client_id', id);

    if (error) {
      console.error('Client tags fetch error:', error);
      return apiServerError();
    }

    // Extract the tag objects from the join result
    const tags = (assignments || [])
      .map((a) => a.pyra_client_tags)
      .filter(Boolean);

    return apiSuccess(tags);
  } catch (err) {
    console.error('GET /api/clients/[id]/tags error:', err);
    return apiServerError();
  }
}

/**
 * PUT /api/clients/[id]/tags
 * Replace all tag assignments for a client.
 *
 * Body: { tag_ids: string[] }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('clients.edit');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const body = await request.json();
    const supabase = createServiceRoleClient();

    // ── Validate tag_ids ─────────────────────────────
    if (!Array.isArray(body.tag_ids)) {
      return apiValidationError('tag_ids يجب أن يكون مصفوفة');
    }

    // ── Verify client exists ─────────────────────────
    const { data: client } = await supabase
      .from('pyra_clients')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (!client) {
      return apiNotFound('العميل غير موجود');
    }

    // ── Delete all existing assignments ──────────────
    const { error: deleteError } = await supabase
      .from('pyra_client_tag_assignments')
      .delete()
      .eq('client_id', id);

    if (deleteError) {
      console.error('Client tag assignments delete error:', deleteError);
      return apiServerError();
    }

    // ── Insert new assignments ───────────────────────
    if (body.tag_ids.length > 0) {
      const assignments = body.tag_ids.map((tagId: string) => ({
        client_id: id,
        tag_id: tagId,
      }));

      const { error: insertError } = await supabase
        .from('pyra_client_tag_assignments')
        .insert(assignments);

      if (insertError) {
        console.error('Client tag assignments insert error:', insertError);
        return apiServerError('فشل تحديث الوسوم');
      }
    }

    // ── Return updated tags ──────────────────────────
    const { data: updatedAssignments, error: fetchError } = await supabase
      .from('pyra_client_tag_assignments')
      .select('tag_id, pyra_client_tags(id, name, color)')
      .eq('client_id', id);

    if (fetchError) {
      console.error('Client tags re-fetch error:', fetchError);
      return apiServerError();
    }

    const tags = (updatedAssignments || [])
      .map((a) => a.pyra_client_tags)
      .filter(Boolean);

    return apiSuccess(tags);
  } catch (err) {
    console.error('PUT /api/clients/[id]/tags error:', err);
    return apiServerError();
  }
}
