import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { generateWebhookSecret } from '@/lib/webhooks/signature';

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// GET /api/webhooks/[id]
// Get single webhook detail. Admin only.
// =============================================================
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: webhook, error } = await supabase
      .from('pyra_webhooks')
      .select(
        'id, name, url, secret, events, is_enabled, created_by, created_at, updated_at'
      )
      .eq('id', id)
      .single();

    if (error || !webhook) {
      return apiNotFound('الـ Webhook غير موجود');
    }

    // Include delivery stats
    const { count: totalDeliveries } = await supabase
      .from('pyra_webhook_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('webhook_id', id);

    const { count: successDeliveries } = await supabase
      .from('pyra_webhook_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('webhook_id', id)
      .eq('status', 'success');

    return apiSuccess({
      ...webhook,
      total_deliveries: totalDeliveries ?? 0,
      success_deliveries: successDeliveries ?? 0,
      success_rate: (totalDeliveries ?? 0) > 0
        ? Math.round(((successDeliveries ?? 0) / (totalDeliveries ?? 1)) * 100)
        : null,
    });
  } catch (err) {
    console.error('GET /api/webhooks/[id] error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/webhooks/[id]
// Update webhook. Admin only.
// Body: { name?, url?, events?, is_enabled?, regenerate_secret? }
// =============================================================
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await context.params;
    const body = await request.json();
    const { name, url, events, is_enabled, regenerate_secret } = body;

    const supabase = createServiceRoleClient();

    // Verify webhook exists
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_webhooks')
      .select('id, name')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('الـ Webhook غير موجود');
    }

    // Build update payload
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return apiValidationError('اسم الـ Webhook لا يمكن أن يكون فارغًا');
      }
      updates.name = name.trim();
    }

    if (url !== undefined) {
      if (typeof url !== 'string' || url.trim().length === 0) {
        return apiValidationError('رابط الـ Webhook لا يمكن أن يكون فارغًا');
      }
      try {
        new URL(url.trim());
      } catch {
        return apiValidationError('رابط الـ Webhook غير صالح');
      }
      updates.url = url.trim();
    }

    if (events !== undefined) {
      if (!Array.isArray(events) || events.length === 0) {
        return apiValidationError('يجب اختيار حدث واحد على الأقل');
      }
      updates.events = events;
    }

    if (is_enabled !== undefined) {
      updates.is_enabled = Boolean(is_enabled);
    }

    if (regenerate_secret) {
      updates.secret = generateWebhookSecret();
    }

    const { data: webhook, error } = await supabase
      .from('pyra_webhooks')
      .update(updates)
      .eq('id', id)
      .select(
        'id, name, url, secret, events, is_enabled, created_by, created_at, updated_at'
      )
      .single();

    if (error) {
      console.error('Webhook update error:', error);
      return apiServerError();
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'webhook_updated',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: id,
      details: {
        updated_fields: Object.keys(updates).filter((k) => k !== 'updated_at'),
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(webhook);
  } catch (err) {
    console.error('PATCH /api/webhooks/[id] error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/webhooks/[id]
// Delete webhook (cascades deliveries). Admin only.
// =============================================================
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // Verify webhook exists
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_webhooks')
      .select('id, name')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('الـ Webhook غير موجود');
    }

    // Delete the webhook (deliveries cascade via FK)
    const { error } = await supabase
      .from('pyra_webhooks')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Webhook delete error:', error);
      return apiServerError();
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'webhook_deleted',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: id,
      details: { webhook_name: existing.name },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/webhooks/[id] error:', err);
    return apiServerError();
  }
}
