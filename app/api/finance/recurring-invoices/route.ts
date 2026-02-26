import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiError, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { RECURRING_INVOICE_FIELDS } from '@/lib/supabase/fields';

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
      .from('pyra_recurring_invoices')
      .select(RECURRING_INVOICE_FIELDS, { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (search) query = query.ilike('title', `%${search}%`);

    const { data, error, count } = await query
      .order('next_generation_date', { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) throw error;

    // Join client names
    const clientIds = [...new Set((data || []).map((r: { client_id: string | null }) => r.client_id).filter(Boolean))];
    let clients: Record<string, { name: string; company: string }> = {};
    if (clientIds.length > 0) {
      const { data: clientData } = await supabase
        .from('pyra_clients')
        .select('id, name, company')
        .in('id', clientIds);
      if (clientData) {
        clients = Object.fromEntries(clientData.map((c: { id: string; name: string; company: string }) => [c.id, c]));
      }
    }

    // Join contract titles
    const contractIds = [...new Set((data || []).map((r: { contract_id: string | null }) => r.contract_id).filter(Boolean))];
    let contracts: Record<string, { title: string }> = {};
    if (contractIds.length > 0) {
      const { data: contractData } = await supabase
        .from('pyra_contracts')
        .select('id, title')
        .in('id', contractIds);
      if (contractData) {
        contracts = Object.fromEntries(contractData.map((c: { id: string; title: string }) => [c.id, c]));
      }
    }

    const enriched = (data || []).map((r: Record<string, unknown>) => ({
      ...r,
      client_name: r.client_id ? clients[r.client_id as string]?.name : null,
      client_company: r.client_id ? clients[r.client_id as string]?.company : null,
      contract_title: r.contract_id ? contracts[r.contract_id as string]?.title : null,
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
      contract_id, client_id, title, items, currency,
      billing_cycle, next_generation_date, auto_send,
    } = body;

    if (!title) return apiError('عنوان الفاتورة المتكررة مطلوب', 422);
    if (!items || !Array.isArray(items) || items.length === 0) {
      return apiError('يجب إضافة بند واحد على الأقل', 422);
    }
    if (!next_generation_date) return apiError('تاريخ التوليد القادم مطلوب', 422);

    const { data, error } = await supabase
      .from('pyra_recurring_invoices')
      .insert({
        id: generateId('ri'),
        contract_id: contract_id || null,
        client_id: client_id || null,
        title,
        items,
        currency: currency || 'AED',
        billing_cycle: billing_cycle || 'monthly',
        next_generation_date,
        status: 'active',
        auto_send: auto_send || false,
        created_by: admin.pyraUser.username,
      })
      .select(RECURRING_INVOICE_FIELDS)
      .single();

    if (error) throw error;

    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'create_recurring_invoice',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/finance/recurring/${data.id}`,
      details: { title, billing_cycle, client_id },
    }).then();

    return apiSuccess(data, undefined, 201);
  } catch {
    return apiServerError();
  }
}
