import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiError, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { CARD_FIELDS } from '@/lib/supabase/fields';

export async function GET() {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const supabase = createServiceRoleClient();

  try {
    const { data, error } = await supabase
      .from('pyra_cards')
      .select(CARD_FIELDS)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Count subscriptions per card
    const { data: subs } = await supabase
      .from('pyra_subscriptions')
      .select('card_id');

    const subCounts: Record<string, number> = {};
    (subs || []).forEach((s: { card_id: string | null }) => {
      if (s.card_id) subCounts[s.card_id] = (subCounts[s.card_id] || 0) + 1;
    });

    const enriched = (data || []).map((c: Record<string, unknown>) => ({
      ...c,
      subscription_count: subCounts[c.id as string] || 0,
    }));

    return apiSuccess(enriched);
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
    const { card_name, bank_name, last_four, card_type, expiry_month, expiry_year, is_default, notes } = body;

    if (!card_name) return apiError('اسم البطاقة مطلوب', 422);

    // If setting as default, unset other defaults
    if (is_default) {
      await supabase
        .from('pyra_cards')
        .update({ is_default: false })
        .eq('is_default', true);
    }

    const { data, error } = await supabase
      .from('pyra_cards')
      .insert({
        id: generateId('card'),
        card_name,
        bank_name,
        last_four,
        card_type,
        expiry_month,
        expiry_year,
        is_default: is_default || false,
        notes,
      })
      .select(CARD_FIELDS)
      .single();

    if (error) throw error;
    return apiSuccess(data, undefined, 201);
  } catch {
    return apiServerError();
  }
}
