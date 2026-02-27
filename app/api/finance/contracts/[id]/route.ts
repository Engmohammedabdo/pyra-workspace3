import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { CONTRACT_FIELDS } from '@/lib/supabase/fields';

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
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();
    body.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('pyra_contracts')
      .update(body)
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
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

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
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/finance/contracts/${id}`,
      details: { contract_id: id },
    }).then(null, (e: unknown) => console.error('Activity log error:', e));

    return apiSuccess({ deleted: true });
  } catch {
    return apiServerError();
  }
}
