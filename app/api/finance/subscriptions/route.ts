import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiError, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { SUBSCRIPTION_FIELDS } from '@/lib/supabase/fields';

export async function GET(req: NextRequest) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const supabase = createServiceRoleClient();
  const url = req.nextUrl.searchParams;
  const page = parseInt(url.get('page') || '1');
  const pageSize = parseInt(url.get('pageSize') || '20');
  const status = url.get('status') || '';
  const search = url.get('search') || '';

  try {
    let query = supabase
      .from('pyra_subscriptions')
      .select(SUBSCRIPTION_FIELDS, { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (search) query = query.or(`name.ilike.%${search}%,provider.ilike.%${search}%`);

    const { data, error, count } = await query
      .order('next_renewal_date', { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) throw error;

    // Join card info
    const cardIds = [...new Set((data || []).map((s: { card_id: string | null }) => s.card_id).filter(Boolean))];
    let cards: Record<string, { card_name: string; last_four: string }> = {};
    if (cardIds.length > 0) {
      const { data: cardData } = await supabase
        .from('pyra_cards')
        .select('id, card_name, last_four')
        .in('id', cardIds);
      if (cardData) {
        cards = Object.fromEntries(cardData.map((c: { id: string; card_name: string; last_four: string }) => [c.id, c]));
      }
    }

    const enriched = (data || []).map((s: Record<string, unknown>) => ({
      ...s,
      card_name: s.card_id ? cards[s.card_id as string]?.card_name : null,
      card_last_four: s.card_id ? cards[s.card_id as string]?.last_four : null,
    }));

    // Monthly total for active subscriptions
    const activeData = (data || []).filter((s: { status: string }) => s.status === 'active');
    const monthlyTotal = activeData.reduce((sum: number, s: { cost: number; billing_cycle: string }) => {
      const cost = Number(s.cost);
      if (s.billing_cycle === 'yearly') return sum + cost / 12;
      if (s.billing_cycle === 'quarterly') return sum + cost / 3;
      return sum + cost;
    }, 0);

    return apiSuccess(enriched, {
      total: count ?? 0,
      page,
      pageSize,
      hasMore: (count ?? 0) > page * pageSize,
      monthly_total: Math.round(monthlyTotal * 100) / 100,
    });
  } catch {
    return apiServerError();
  }
}

export async function POST(req: NextRequest) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();
    const { name, provider, cost, currency, billing_cycle, next_renewal_date, card_id, category, url, notes, auto_renew } = body;

    if (!name) return apiError('اسم الاشتراك مطلوب', 422);
    if (!cost || cost <= 0) return apiError('التكلفة مطلوبة', 422);

    const { data, error } = await supabase
      .from('pyra_subscriptions')
      .insert({
        id: generateId('sub'),
        name,
        provider,
        cost,
        currency: currency || 'AED',
        billing_cycle,
        next_renewal_date,
        card_id: card_id || null,
        category,
        status: 'active',
        url,
        notes,
        auto_renew: auto_renew !== false,
      })
      .select(SUBSCRIPTION_FIELDS)
      .single();

    if (error) throw error;

    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'create_subscription',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/finance/subscriptions/${data.id}`,
      details: { name, provider, cost },
    }).then();

    return apiSuccess(data, undefined, 201);
  } catch {
    return apiServerError();
  }
}
