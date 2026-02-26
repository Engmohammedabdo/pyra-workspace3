import { NextRequest } from 'next/server';
import { getExternalAuth, hasPermission } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { SUBSCRIPTION_FIELDS } from '@/lib/supabase/fields';
import { dispatchWebhookEvent } from '@/lib/webhooks/dispatcher';

/**
 * GET /api/external/subscriptions
 * List/search subscriptions. Supports fuzzy search by name/provider.
 * Auth: API key with 'subscriptions:read' permission
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getExternalAuth(req);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    if (!hasPermission(ctx, 'subscriptions:read')) return apiError('لا تملك صلاحية قراءة الاشتراكات', 403);

    const supabase = createServiceRoleClient();
    const sp = req.nextUrl.searchParams;

    const search = sp.get('search')?.trim() || '';
    const status = sp.get('status')?.trim() || '';
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') || '20')));
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('pyra_subscriptions')
      .select(SUBSCRIPTION_FIELDS, { count: 'exact' });

    // Fuzzy search: case-insensitive partial match on name and provider
    if (search) {
      query = query.or(`name.ilike.%${search}%,provider.ilike.%${search}%`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    query = query.order('next_renewal_date', { ascending: true }).range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;

    if (error) throw error;

    return apiSuccess(data || [], { total: count ?? 0, page, pageSize });
  } catch {
    return apiServerError();
  }
}

/**
 * POST /api/external/subscriptions
 * Create a new subscription from external source.
 * Auth: API key with 'subscriptions:create' permission
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getExternalAuth(req);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    if (!hasPermission(ctx, 'subscriptions:create')) return apiError('لا تملك صلاحية إنشاء الاشتراكات', 403);

    const supabase = createServiceRoleClient();
    const body = await req.json();

    const { name, provider, cost, currency, billing_cycle, next_renewal_date, category, url, notes, source } = body;

    if (!name || !name.trim()) {
      return apiError('اسم الاشتراك مطلوب', 422);
    }
    if (!cost || cost <= 0) {
      return apiError('التكلفة مطلوبة ويجب أن تكون أكبر من صفر', 422);
    }

    const { data, error } = await supabase
      .from('pyra_subscriptions')
      .insert({
        id: generateId('sub'),
        name: name.trim(),
        provider: provider || null,
        cost,
        currency: currency || 'AED',
        billing_cycle: billing_cycle || 'monthly',
        next_renewal_date: next_renewal_date || null,
        category: category || null,
        status: 'active',
        url: url || null,
        notes: notes ? `${notes}${source ? ` [${source}]` : ''}` : (source ? `[${source}]` : null),
        auto_renew: true,
      })
      .select(SUBSCRIPTION_FIELDS)
      .single();

    if (error) throw error;

    // Activity log
    supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'create_subscription',
      username: 'api',
      display_name: ctx.apiKey.name,
      target_path: `/finance/subscriptions/${data.id}`,
      details: { name, provider, cost, billing_cycle, source: source || 'api' },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    }).then();

    dispatchWebhookEvent('subscription_created', {
      subscription_id: data.id,
      name,
      provider,
      cost,
      billing_cycle: billing_cycle || 'monthly',
      source: source || 'api',
    });

    return apiSuccess(data, undefined, 201);
  } catch {
    return apiServerError();
  }
}
