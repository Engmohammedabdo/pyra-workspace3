import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { LEAD_ACTIVITY_FIELDS } from '@/lib/supabase/fields';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('sales_leads.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('pyra_lead_activities')
      .select(LEAD_ACTIVITY_FIELDS)
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return apiServerError(error.message);
    return apiSuccess(data);

  } catch (err) {
    console.error('[GET /api/dashboard/sales/leads/[id]/activities] error:', err);
    return apiServerError();
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('sales_leads.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const { activity_type, description, metadata } = body;
    if (!activity_type) return apiError('نوع النشاط مطلوب');

    const { data, error } = await supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: id,
        activity_type,
        description: description || null,
        metadata: metadata || null,
        created_by: auth.pyraUser.username,
      })
      .select(LEAD_ACTIVITY_FIELDS)
      .single();

    if (error) return apiServerError(error.message);

    // Update last_contact_at
    void supabase
      .from('pyra_sales_leads')
      .update({ last_contact_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);

  
    logActivity(auth.pyraUser.username, auth.pyraUser.display_name, 'lead_activity_added', `/dashboard/sales/leads/${id}`, { lead_id: id });

  return apiSuccess(data, undefined, 201);

  } catch (err) {
    console.error('[POST /api/dashboard/sales/leads/[id]/activities] error:', err);
    return apiServerError();
  }
}
