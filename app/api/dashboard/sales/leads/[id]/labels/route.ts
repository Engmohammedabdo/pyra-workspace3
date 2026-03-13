import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';

/**
 * PUT — Replace all labels for a lead (full replace approach)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('sales_leads.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const { label_ids } = body;

  if (!Array.isArray(label_ids)) return apiError('label_ids مطلوب كمصفوفة');

  // Backup existing
  const { data: backup } = await supabase
    .from('pyra_lead_labels')
    .select('*')
    .eq('lead_id', id);

  // Delete all existing
  await supabase.from('pyra_lead_labels').delete().eq('lead_id', id);

  // Insert new if any
  if (label_ids.length > 0) {
    const rows = label_ids.map((labelId: string) => ({
      lead_id: id,
      label_id: labelId,
    }));

    const { error } = await supabase.from('pyra_lead_labels').insert(rows);

    if (error) {
      // Rollback
      if (backup?.length) {
        await supabase.from('pyra_lead_labels').insert(backup);
      }
      return apiServerError(error.message);
    }
  }

  // Log activity
  void supabase.from('pyra_lead_activities').insert({
    id: generateId('la'),
    lead_id: id,
    activity_type: 'label_change',
    description: 'تم تحديث التصنيفات',
    metadata: { label_ids },
    created_by: auth.pyraUser.username,
  });

  return apiSuccess({ lead_id: id, label_ids });
}
