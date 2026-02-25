import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiError, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { CONTRACT_FIELDS } from '@/lib/supabase/fields';

export async function GET(req: NextRequest) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const supabase = createServiceRoleClient();
  const url = req.nextUrl.searchParams;
  const page = parseInt(url.get('page') || '1');
  const pageSize = parseInt(url.get('pageSize') || '20');
  const status = url.get('status') || '';
  const search = url.get('search') || '';
  const client_id = url.get('client_id') || '';

  try {
    let query = supabase
      .from('pyra_contracts')
      .select(CONTRACT_FIELDS, { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (client_id) query = query.eq('client_id', client_id);
    if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) throw error;

    // Join client and project info
    const clientIds = [...new Set((data || []).map((c: { client_id: string | null }) => c.client_id).filter(Boolean))];
    const projectIds = [...new Set((data || []).map((c: { project_id: string | null }) => c.project_id).filter(Boolean))];

    let clients: Record<string, { name: string; company: string }> = {};
    let projects: Record<string, { name: string }> = {};

    if (clientIds.length > 0) {
      const { data: clientData } = await supabase
        .from('pyra_clients')
        .select('id, name, company')
        .in('id', clientIds);
      if (clientData) {
        clients = Object.fromEntries(clientData.map((c: { id: string; name: string; company: string }) => [c.id, c]));
      }
    }

    if (projectIds.length > 0) {
      const { data: projectData } = await supabase
        .from('pyra_projects')
        .select('id, name')
        .in('id', projectIds);
      if (projectData) {
        projects = Object.fromEntries(projectData.map((p: { id: string; name: string }) => [p.id, p]));
      }
    }

    const enriched = (data || []).map((c: Record<string, unknown>) => ({
      ...c,
      client_name: c.client_id ? clients[c.client_id as string]?.name : null,
      client_company: c.client_id ? clients[c.client_id as string]?.company : null,
      project_name: c.project_id ? projects[c.project_id as string]?.name : null,
    }));

    return apiSuccess(enriched, {
      total: count ?? 0,
      page,
      pageSize,
      hasMore: (count ?? 0) > page * pageSize,
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
    const {
      client_id, project_id, title, description, contract_type,
      total_value, currency, vat_rate, billing_structure,
      start_date, end_date, notes
    } = body;

    if (!title) return apiError('عنوان العقد مطلوب', 422);

    const { data, error } = await supabase
      .from('pyra_contracts')
      .insert({
        id: generateId('ctr'),
        client_id: client_id || null,
        project_id: project_id || null,
        title,
        description,
        contract_type,
        total_value: total_value || 0,
        currency: currency || 'AED',
        vat_rate: vat_rate || 0,
        billing_structure: billing_structure || null,
        start_date,
        end_date,
        status: 'draft',
        amount_billed: 0,
        amount_collected: 0,
        notes,
        created_by: admin.pyraUser.username,
      })
      .select(CONTRACT_FIELDS)
      .single();

    if (error) throw error;

    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      action: 'create_contract',
      target_type: 'contract',
      target_id: data.id,
      details: { title, contract_type, total_value },
    }).then();

    return apiSuccess(data, undefined, 201);
  } catch {
    return apiServerError();
  }
}
