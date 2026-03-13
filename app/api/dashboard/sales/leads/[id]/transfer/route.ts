import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiNotFound, apiServerError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('sales_leads.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const { to_agent, reason } = body;

  if (!to_agent) return apiError('يجب تحديد الموظف المحوّل إليه');

  // Get current lead
  const { data: lead, error: fetchError } = await supabase
    .from('pyra_sales_leads')
    .select('id, assigned_to, name')
    .eq('id', id)
    .single();

  if (fetchError || !lead) return apiNotFound('العميل المحتمل غير موجود');

  const fromAgent = lead.assigned_to;

  // Update lead assignment
  const { error: updateError } = await supabase
    .from('pyra_sales_leads')
    .update({ assigned_to: to_agent, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updateError) return apiServerError(updateError.message);

  // Create transfer record
  const transferId = generateId('lt');
  await supabase.from('pyra_lead_transfers').insert({
    id: transferId,
    lead_id: id,
    from_agent: fromAgent,
    to_agent,
    reason: reason || null,
    created_by: auth.pyraUser.username,
  });

  // Create activity
  void supabase.from('pyra_lead_activities').insert({
    id: generateId('la'),
    lead_id: id,
    activity_type: 'transfer',
    description: `تم تحويل العميل المحتمل من ${fromAgent} إلى ${to_agent}`,
    metadata: { from: fromAgent, to: to_agent, reason },
    created_by: auth.pyraUser.username,
  });

  // Activity log
  void supabase.from('pyra_activity_log').insert({
    id: generateId('al'),
    action_type: 'lead_transferred',
    username: auth.pyraUser.username,
    display_name: auth.pyraUser.display_name,
    target_path: `/dashboard/sales/leads/${id}`,
    details: { lead_name: lead.name, from: fromAgent, to: to_agent },
    ip_address: request.headers.get('x-forwarded-for') || 'unknown',
  });

  return apiSuccess({ transferred: true, from: fromAgent, to: to_agent });
}
