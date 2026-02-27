import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiError, apiForbidden, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { CARD_FIELDS } from '@/lib/supabase/fields';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

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
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();

    // If setting as default, unset other defaults
    if (body.is_default) {
      await supabase
        .from('pyra_cards')
        .update({ is_default: false })
        .neq('id', id);
    }

    body.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('pyra_cards')
      .update(body)
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
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    // Check if card has subscriptions
    const { count } = await supabase
      .from('pyra_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('card_id', id);

    if (count && count > 0) {
      return apiError('لا يمكن حذف بطاقة مرتبطة باشتراكات', 422);
    }

    const { error } = await supabase
      .from('pyra_cards')
      .delete()
      .eq('id', id);

    if (error) throw error;

    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'delete_card',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/finance/cards/${id}`,
      details: { card_id: id },
    }).then(null, (e: unknown) => console.error('Activity log error:', e));

    return apiSuccess({ deleted: true });
  } catch {
    return apiServerError();
  }
}
