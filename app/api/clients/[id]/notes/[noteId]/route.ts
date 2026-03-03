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

/**
 * PATCH /api/clients/[id]/notes/[noteId]
 * Update a specific note for a client.
 *
 * Body: { content?: string, is_pinned?: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const auth = await requireApiPermission('clients.edit');
    if (isApiError(auth)) return auth;

    const { id, noteId } = await params;
    const body = await request.json();
    const supabase = createServiceRoleClient();

    // ── Verify note exists and belongs to this client ─
    const { data: existing } = await supabase
      .from('pyra_client_notes')
      .select('id, client_id')
      .eq('id', noteId)
      .eq('client_id', id)
      .maybeSingle();

    if (!existing) {
      return apiNotFound('الملاحظة غير موجودة');
    }

    // ── Build update payload ─────────────────────────
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.content !== undefined) {
      if (!body.content?.trim()) {
        return apiValidationError('محتوى الملاحظة لا يمكن أن يكون فارغاً');
      }
      updates.content = body.content.trim();
    }

    if (body.is_pinned !== undefined) {
      updates.is_pinned = Boolean(body.is_pinned);
    }

    // Only updated_at — nothing meaningful to update
    if (Object.keys(updates).length === 1) {
      return apiValidationError('لا توجد بيانات للتحديث');
    }

    // ── Update note ──────────────────────────────────
    const { data: note, error } = await supabase
      .from('pyra_client_notes')
      .update(updates)
      .eq('id', noteId)
      .eq('client_id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Client note update error:', error);
      return apiServerError();
    }

    return apiSuccess(note);
  } catch (err) {
    console.error('PATCH /api/clients/[id]/notes/[noteId] error:', err);
    return apiServerError();
  }
}

/**
 * DELETE /api/clients/[id]/notes/[noteId]
 * Delete a specific note for a client.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const auth = await requireApiPermission('clients.edit');
    if (isApiError(auth)) return auth;

    const { id, noteId } = await params;
    const supabase = createServiceRoleClient();

    // ── Verify note exists and belongs to this client ─
    const { data: existing } = await supabase
      .from('pyra_client_notes')
      .select('id, client_id')
      .eq('id', noteId)
      .eq('client_id', id)
      .maybeSingle();

    if (!existing) {
      return apiNotFound('الملاحظة غير موجودة');
    }

    // ── Delete note ──────────────────────────────────
    const { error } = await supabase
      .from('pyra_client_notes')
      .delete()
      .eq('id', noteId)
      .eq('client_id', id);

    if (error) {
      console.error('Client note delete error:', error);
      return apiServerError();
    }

    // ── Log activity (fire-and-forget) ───────────────
    void supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'client_note_deleted',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/clients/${id}`,
      details: {
        client_id: id,
        note_id: noteId,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/clients/[id]/notes/[noteId] error:', err);
    return apiServerError();
  }
}
