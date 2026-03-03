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
 * GET /api/clients/[id]/notes
 * Fetch all notes for a client.
 * Pinned notes appear first, then by newest.
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

    // ── Fetch notes ──────────────────────────────────
    const { data: notes, error } = await supabase
      .from('pyra_client_notes')
      .select('*')
      .eq('client_id', id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Client notes fetch error:', error);
      return apiServerError();
    }

    return apiSuccess(notes || []);
  } catch (err) {
    console.error('GET /api/clients/[id]/notes error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/clients/[id]/notes
 * Create a new note for a client.
 *
 * Body: { content: string, is_pinned?: boolean }
 */
export async function POST(
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
    const { data: client } = await supabase
      .from('pyra_clients')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (!client) {
      return apiNotFound('العميل غير موجود');
    }

    // ── Validation ───────────────────────────────────
    if (!body.content?.trim()) {
      return apiValidationError('محتوى الملاحظة مطلوب');
    }

    // ── Insert note ──────────────────────────────────
    const noteId = generateId('cn');

    const { data: note, error } = await supabase
      .from('pyra_client_notes')
      .insert({
        id: noteId,
        client_id: id,
        content: body.content.trim(),
        is_pinned: body.is_pinned === true,
        created_by: auth.pyraUser.username,
      })
      .select('*')
      .single();

    if (error) {
      console.error('Client note insert error:', error);
      return apiServerError();
    }

    // ── Log activity (fire-and-forget) ───────────────
    void supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'client_note_added',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/clients/${id}`,
      details: {
        client_id: id,
        note_id: noteId,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(note, undefined, 201);
  } catch (err) {
    console.error('POST /api/clients/[id]/notes error:', err);
    return apiServerError();
  }
}
