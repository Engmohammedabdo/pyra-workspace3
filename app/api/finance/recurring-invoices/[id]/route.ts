import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiNotFound, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { RECURRING_INVOICE_FIELDS } from '@/lib/supabase/fields';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _req: NextRequest,
  context: RouteContext
) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const { id } = await context.params;
  const supabase = createServiceRoleClient();

  try {
    const { data, error } = await supabase
      .from('pyra_recurring_invoices')
      .select(RECURRING_INVOICE_FIELDS)
      .eq('id', id)
      .single();

    if (error || !data) return apiNotFound();

    // Join client and contract names
    let client_name = null;
    let client_company = null;
    let contract_title = null;

    if (data.client_id) {
      const { data: client } = await supabase
        .from('pyra_clients')
        .select('name, company')
        .eq('id', data.client_id)
        .single();
      if (client) {
        client_name = client.name;
        client_company = client.company;
      }
    }

    if (data.contract_id) {
      const { data: contract } = await supabase
        .from('pyra_contracts')
        .select('title')
        .eq('id', data.contract_id)
        .single();
      if (contract) contract_title = contract.title;
    }

    return apiSuccess({ ...data, client_name, client_company, contract_title });
  } catch {
    return apiServerError();
  }
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext
) {
  const t = await getTranslations('api');
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await context.params;
  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();

    // Whitelist allowed fields (billing-engine inputs stay controlled;
    // contract_id/client_id/created_by/id are immutable)
    const ALLOWED_FIELDS = ['title', 'items', 'currency', 'billing_cycle', 'next_generation_date', 'status', 'auto_send'];
    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) updates[key] = body[key];
    }
    if (Object.keys(updates).length === 0) {
      return apiValidationError(t('finance.noFieldsToUpdate'));
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('pyra_recurring_invoices')
      .update(updates)
      .eq('id', id)
      .select(RECURRING_INVOICE_FIELDS)
      .single();

    if (error || !data) return apiNotFound();
    return apiSuccess(data);
  } catch {
    return apiServerError();
  }
}

export async function DELETE(
  _req: NextRequest,
  context: RouteContext
) {
  const t = await getTranslations('api');
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await context.params;
  const supabase = createServiceRoleClient();

  try {
    // Check current status
    const { data: existing } = await supabase
      .from('pyra_recurring_invoices')
      .select('status')
      .eq('id', id)
      .single();

    if (!existing) return apiNotFound();

    if (existing.status === 'active') {
      return apiError(t('finance.recurringActiveNotDeletable'), 422);
    }

    const { error } = await supabase
      .from('pyra_recurring_invoices')
      .delete()
      .eq('id', id);

    if (error) throw error;

    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'delete_recurring_invoice',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/finance/recurring/${id}`,
      details: { recurring_invoice_id: id },
    }).then(null, (e: unknown) => console.error('Activity log error:', e));

    return apiSuccess({ deleted: true });
  } catch {
    return apiServerError();
  }
}
