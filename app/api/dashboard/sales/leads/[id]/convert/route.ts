import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/dashboard/sales/leads/[id]/convert
 * Convert a lead to a client.
 * Body: { create_portal_access?: boolean, password?: string }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireApiPermission('sales_leads.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const { create_portal_access, password } = body;

  // 1. Get the lead
  const { data: lead, error: leadError } = await supabase
    .from('pyra_sales_leads')
    .select('*')
    .eq('id', id)
    .single();

  if (leadError || !lead) return apiError('العميل المحتمل غير موجود', 404);
  if (lead.is_converted) return apiError('تم تحويل هذا العميل المحتمل بالفعل');

  // 2. Create client record
  const clientId = generateId('cl');
  const { error: clientError } = await supabase
    .from('pyra_clients')
    .insert({
      id: clientId,
      name: lead.name,
      email: lead.email || null,
      phone: lead.phone || null,
      company: lead.company || null,
      source: lead.source || 'sales',
      notes: lead.notes || null,
      created_by: auth.pyraUser.username,
    });

  if (clientError) return apiServerError(`فشل إنشاء العميل: ${clientError.message}`);

  // 3. Create portal access if requested
  if (create_portal_access && lead.email && password) {
    try {
      // Create Supabase Auth user for portal
      const { createClient } = await import('@supabase/supabase-js');
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      const { error: authError } = await adminClient.auth.admin.createUser({
        email: lead.email,
        password,
        email_confirm: true,
        user_metadata: {
          role: 'client',
          client_id: clientId,
          full_name: lead.name,
        },
      });

      if (authError) {
        console.error('Portal access creation failed:', authError);
        // Don't fail the conversion, just log the error
      }
    } catch (err) {
      console.error('Portal access error:', err);
    }
  }

  // 4. Find the "won" stage
  const { data: wonStage } = await supabase
    .from('pyra_sales_pipeline_stages')
    .select('id')
    .eq('name', 'Won')
    .maybeSingle();

  // 5. Update lead
  const { error: updateError } = await supabase
    .from('pyra_sales_leads')
    .update({
      client_id: clientId,
      is_converted: true,
      converted_at: new Date().toISOString(),
      stage_id: wonStage?.id || lead.stage_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) return apiServerError(updateError.message);

  // 6. Link existing WhatsApp messages to the new client
  if (lead.phone) {
    const phone = lead.phone.replace(/\D/g, '');
    await supabase
      .from('pyra_whatsapp_messages')
      .update({ client_id: clientId })
      .eq('lead_id', id);
  }

  // 7. Log activity
  await supabase.from('pyra_lead_activities').insert({
    id: generateId('la'),
    lead_id: id,
    activity_type: 'conversion',
    description: `تم تحويل العميل المحتمل إلى عميل فعلي`,
    metadata: { client_id: clientId, portal_access: !!create_portal_access },
    created_by: auth.pyraUser.username,
  });

  await supabase.from('pyra_activity_log').insert({
    id: generateId('log'),
    action_type: 'lead_converted',
    username: auth.pyraUser.username,
    display_name: auth.pyraUser.display_name,
    target_path: `/clients/${clientId}`,
    details: { lead_id: id, lead_name: lead.name, client_id: clientId },
    ip_address: request.headers.get('x-forwarded-for') || 'unknown',
  });

  return apiSuccess({ client_id: clientId, lead_id: id });
}
