import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiNotFound, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { CARD_FIELDS } from '@/lib/supabase/fields';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const { data, error } = await supabase
      .from('pyra_cards')
      .select(CARD_FIELDS)
      .eq('id', id)
      .single();

    if (error || !data) return apiNotFound();
    return apiSuccess(data);
  } catch {
    return apiServerError();
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();

    // Whitelist allowed fields
    const ALLOWED_FIELDS = ['card_name', 'bank_name', 'last_four', 'card_type', 'expiry_month', 'expiry_year', 'is_default', 'notes'];
    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) updates[key] = body[key];
    }
    if (Object.keys(updates).length === 0) {
      return apiValidationError(t('finance.noFieldsToUpdate'));
    }

    // If setting as default, unset other defaults
    if (updates.is_default) {
      await supabase
        .from('pyra_cards')
        .update({ is_default: false })
        .neq('id', id);
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('pyra_cards')
      .update(updates)
      .eq('id', id)
      .select(CARD_FIELDS)
      .single();

    if (error || !data) return apiNotFound();
    return apiSuccess(data);
  } catch {
    return apiServerError();
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    // Check if card has subscriptions
    const { count } = await supabase
      .from('pyra_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('card_id', id);

    if (count && count > 0) {
      return apiError(t('finance.cardHasSubscriptions'), 422);
    }

    const { error } = await supabase
      .from('pyra_cards')
      .delete()
      .eq('id', id);

    if (error) throw error;

    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'delete_card',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/finance/cards/${id}`,
      details: { card_id: id },
    }).then(null, (e: unknown) => console.error('Activity log error:', e));

    return apiSuccess({ deleted: true });
  } catch {
    return apiServerError();
  }
}
