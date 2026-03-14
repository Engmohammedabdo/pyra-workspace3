import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { LEAD_FIELDS } from '@/lib/supabase/fields';
import { generateId } from '@/lib/utils/id';
import { isSuperAdmin } from '@/lib/auth/rbac';
import { calculateLeadScore } from '@/lib/sales/lead-scoring';
import { notifyLeadAssigned } from '@/lib/email/notify';

export async function GET(request: NextRequest) {
  const auth = await requireApiPermission('sales_leads.view');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view'); // 'kanban' or default list
  const stageId = searchParams.get('stage_id');
  const assignedTo = searchParams.get('assigned_to');
  const priority = searchParams.get('priority');
  const source = searchParams.get('source');
  const search = searchParams.get('search');
  const isConverted = searchParams.get('is_converted');

  let query = supabase
    .from('pyra_sales_leads')
    .select(LEAD_FIELDS)
    .order('created_at', { ascending: false });

  // Agent scoping: non-admin agents only see their own leads
  const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
  if (!isAdmin) {
    query = query.eq('assigned_to', auth.pyraUser.username);
  }

  if (stageId) query = query.eq('stage_id', stageId);
  if (assignedTo && isAdmin) query = query.eq('assigned_to', assignedTo);
  if (priority) query = query.eq('priority', priority);
  if (source) query = query.eq('source', source);
  if (isConverted !== null && isConverted !== undefined) {
    query = query.eq('is_converted', isConverted === 'true');
  }
  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) return apiServerError(error.message);

  // If kanban view, group by stage
  if (view === 'kanban') {
    const { data: stages } = await supabase
      .from('pyra_sales_pipeline_stages')
      .select('id, name, name_ar, color, sort_order')
      .order('sort_order');

    const kanban = (stages || []).map(stage => ({
      ...stage,
      leads: (data || []).filter(lead => lead.stage_id === stage.id),
    }));

    return apiSuccess(kanban);
  }

  return apiSuccess(data);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission('sales_leads.create');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();
  const body = await request.json();

  const { name, phone, email, company, source, stage_id, assigned_to, notes, priority } = body;
  if (!name) return apiError('اسم العميل المحتمل مطلوب');

  // If no stage_id, use default stage
  let finalStageId = stage_id;
  if (!finalStageId) {
    const { data: defaultStage } = await supabase
      .from('pyra_sales_pipeline_stages')
      .select('id')
      .eq('is_default', true)
      .single();
    finalStageId = defaultStage?.id || 'stage_new';
  }

  const leadId = generateId('sl');
  const now = new Date().toISOString();

  // Calculate initial score
  const { data: allStages } = await supabase
    .from('pyra_sales_pipeline_stages')
    .select('id, sort_order')
    .order('sort_order');

  const stagesArr = allStages || [];
  const stageSortOrder = stagesArr.findIndex(s => s.id === finalStageId);
  const initialScore = calculateLeadScore(
    {
      source: source || 'manual',
      phone: phone || null,
      email: email || null,
      company: company || null,
      stage_id: finalStageId,
      is_converted: false,
      last_contact_at: null,
      created_at: now,
    },
    {
      activityCount: 0,
      quoteCount: 0,
      stageSortOrder: Math.max(0, stageSortOrder),
      totalStages: stagesArr.length,
    }
  );

  const { data, error } = await supabase
    .from('pyra_sales_leads')
    .insert({
      id: leadId,
      name,
      phone: phone || null,
      email: email || null,
      company: company || null,
      source: source || 'manual',
      stage_id: finalStageId,
      assigned_to: assigned_to || auth.pyraUser.username,
      notes: notes || null,
      priority: priority || 'medium',
      score: initialScore.total,
      is_converted: false,
      created_by: auth.pyraUser.username,
      created_at: now,
      updated_at: now,
    })
    .select(LEAD_FIELDS)
    .single();

  if (error) return apiServerError(error.message);

  // Create activity entry
  void supabase.from('pyra_lead_activities').insert({
    id: generateId('la'),
    lead_id: leadId,
    activity_type: 'note',
    description: `تم إنشاء العميل المحتمل`,
    metadata: { source: source || 'manual' },
    created_by: auth.pyraUser.username,
  });

  // Log activity
  void supabase.from('pyra_activity_log').insert({
    id: generateId('al'),
    action_type: 'lead_created',
    username: auth.pyraUser.username,
    display_name: auth.pyraUser.display_name,
    target_path: `/dashboard/sales/leads/${leadId}`,
    details: { lead_name: name, source: source || 'manual' },
    ip_address: request.headers.get('x-forwarded-for') || 'unknown',
  });

  // Notify assigned agent if different from creator
  const finalAssignedTo = assigned_to || auth.pyraUser.username;
  if (finalAssignedTo !== auth.pyraUser.username) {
    void supabase.from('pyra_notifications').insert({
      id: generateId('nt'),
      recipient_username: finalAssignedTo,
      type: 'lead_assigned',
      title: 'تم تعيين عميل محتمل جديد لك',
      message: `تم تعيين العميل المحتمل "${name}" لك`,
      source_username: auth.pyraUser.username,
      source_display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/sales/leads/${leadId}`,
      is_read: false,
    });

    // Email notification (fire-and-forget)
    notifyLeadAssigned({
      agentUsername: finalAssignedTo,
      leadName: name,
      assignedBy: auth.pyraUser.display_name || auth.pyraUser.username,
      leadId: leadId,
    });
  }

  return apiSuccess(data, undefined, 201);
}
