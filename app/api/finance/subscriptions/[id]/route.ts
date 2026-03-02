import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { SUBSCRIPTION_FIELDS } from '@/lib/supabase/fields';

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
      .from('pyra_subscriptions')
      .select(SUBSCRIPTION_FIELDS)
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
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();
    body.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('pyra_subscriptions')
      .update(body)
      .eq('id', id)
      .select(SUBSCRIPTION_FIELDS)
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
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const { error } = await supabase
      .from('pyra_subscriptions')
      .delete()
      .eq('id', id);

    if (error) throw error;

    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'delete_subscription',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/finance/subscriptions/${id}`,
      details: { subscription_id: id },
    }).then(null, (e: unknown) => console.error('Activity log error:', e));

    return apiSuccess({ deleted: true });
  } catch {
    return apiServerError();
  }
}
