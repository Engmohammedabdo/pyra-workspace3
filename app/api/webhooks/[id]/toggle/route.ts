import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// PATCH /api/webhooks/[id]/toggle
// Toggle is_enabled for a webhook. Admin only.
// =============================================================
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // Fetch current state
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_webhooks')
      .select('id, name, is_enabled')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('الـ Webhook غير موجود');
    }

    const newEnabled = !existing.is_enabled;

    const { data: webhook, error } = await supabase
      .from('pyra_webhooks')
      .update({
        is_enabled: newEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        'id, name, url, secret, events, is_enabled, created_by, created_at, updated_at'
      )
      .single();

    if (error) {
      console.error('Webhook toggle error:', error);
      return apiServerError();
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: newEnabled ? 'webhook_enabled' : 'webhook_disabled',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: id,
      details: { webhook_name: existing.name, is_enabled: newEnabled },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(webhook);
  } catch (err) {
    console.error('PATCH /api/webhooks/[id]/toggle error:', err);
    return apiServerError();
  }
}
