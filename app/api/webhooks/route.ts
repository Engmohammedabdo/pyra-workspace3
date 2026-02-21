import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { generateWebhookSecret } from '@/lib/webhooks/signature';

// =============================================================
// GET /api/webhooks
// List all webhooks with delivery stats (success_rate, last_delivery).
// Admin only.
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;

    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '20')));
    const offset = (page - 1) * limit;

    // Fetch webhooks
    const { data: webhooks, count, error } = await supabase
      .from('pyra_webhooks')
      .select(
        'id, name, url, secret, events, is_enabled, created_by, created_at, updated_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Webhooks list error:', error);
      return apiServerError();
    }

    // Fetch delivery stats per webhook
    const webhookIds = (webhooks || []).map((w) => w.id);
    let deliveryStats: Record<string, { total: number; success: number; last_delivery: string | null }> = {};

    if (webhookIds.length > 0) {
      const { data: deliveries } = await supabase
        .from('pyra_webhook_deliveries')
        .select('webhook_id, status, created_at')
        .in('webhook_id', webhookIds)
        .order('created_at', { ascending: false });

      if (deliveries) {
        deliveryStats = deliveries.reduce(
          (acc: Record<string, { total: number; success: number; last_delivery: string | null }>, d) => {
            if (!acc[d.webhook_id]) {
              acc[d.webhook_id] = { total: 0, success: 0, last_delivery: null };
            }
            acc[d.webhook_id].total += 1;
            if (d.status === 'success') acc[d.webhook_id].success += 1;
            if (!acc[d.webhook_id].last_delivery) {
              acc[d.webhook_id].last_delivery = d.created_at;
            }
            return acc;
          },
          {}
        );
      }
    }

    // Merge stats into webhooks
    const enrichedWebhooks = (webhooks || []).map((webhook) => {
      const stats = deliveryStats[webhook.id] || { total: 0, success: 0, last_delivery: null };
      return {
        ...webhook,
        success_rate: stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : null,
        last_delivery: stats.last_delivery,
      };
    });

    return apiSuccess(enrichedWebhooks, {
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error('GET /api/webhooks error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/webhooks
// Create a new webhook. Admin only.
// Body: { name, url, events, is_enabled? }
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const body = await request.json();
    const { name, url, events, is_enabled } = body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return apiValidationError('اسم الـ Webhook مطلوب');
    }

    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      return apiValidationError('رابط الـ Webhook مطلوب');
    }

    // Basic URL validation
    try {
      new URL(url.trim());
    } catch {
      return apiValidationError('رابط الـ Webhook غير صالح');
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return apiValidationError('يجب اختيار حدث واحد على الأقل');
    }

    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();
    const webhookId = generateId('wh');
    const secret = generateWebhookSecret();

    const newWebhook = {
      id: webhookId,
      name: name.trim(),
      url: url.trim(),
      secret,
      events,
      is_enabled: is_enabled !== undefined ? Boolean(is_enabled) : true,
      created_by: admin.pyraUser.username,
      created_at: now,
      updated_at: now,
    };

    const { data: webhook, error } = await supabase
      .from('pyra_webhooks')
      .insert(newWebhook)
      .select(
        'id, name, url, secret, events, is_enabled, created_by, created_at, updated_at'
      )
      .single();

    if (error) {
      console.error('Webhook create error:', error);
      return apiServerError();
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'webhook_created',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: webhookId,
      details: { webhook_name: name.trim(), url: url.trim() },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(webhook, undefined, 201);
  } catch (err) {
    console.error('POST /api/webhooks error:', err);
    return apiServerError();
  }
}
