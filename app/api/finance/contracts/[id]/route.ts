import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { CONTRACT_FIELDS } from '@/lib/supabase/fields';

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
      .from('pyra_contracts')
      .select(CONTRACT_FIELDS)
      .eq('id', id)
      .single();

    if (error || !data) return apiNotFound();

    // Join client and project names
    let client_name = null;
    let client_company = null;
    let project_name = null;

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

    if (data.project_id) {
      const { data: project } = await supabase
        .from('pyra_projects')
        .select('name')
        .eq('id', data.project_id)
        .single();
      if (project) project_name = project.name;
    }

    return apiSuccess({ ...data, client_name, client_company, project_name });
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

    // Allowlist fields to prevent mass assignment
    const allowedFields = [
      'title', 'description', 'client_id', 'project_id', 'status',
      'start_date', 'end_date', 'total_value', 'currency', 'payment_terms',
      'auto_invoice', 'notes', 'type', 'retainer_amount', 'retainer_cycle',
    ];
    const update: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) update[field] = body[field];
    }
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('pyra_contracts')
      .update(update)
      .eq('id', id)
      .select(CONTRACT_FIELDS)
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
      .from('pyra_contracts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'delete_contract',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/finance/contracts/${id}`,
      details: { contract_id: id },
    }).then(null, (e: unknown) => console.error('Activity log error:', e));

    return apiSuccess({ deleted: true });
  } catch {
    return apiServerError();
  }
}
