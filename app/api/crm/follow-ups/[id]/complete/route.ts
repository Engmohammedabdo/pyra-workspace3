import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiForbidden,
  apiServerError,
  apiValidationError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { canAccessLead } from '@/lib/auth/lead-scope';
import { generateId } from '@/lib/utils/id';
import { logActivity, ACTIVITY_ACTIONS } from '@/lib/api/activity';

/**
 * POST /api/crm/follow-ups/[id]/complete
 *
 * Permission: follow_ups.complete
 * Ownership: caller must be either the assigned_to OR an admin (admins
 *   bypass via canAccessLead's admin shortcut).
 *
 * Body: { outcome_note?: string } — optional note appended as an inline
 * `follow_up_completed` activity on the parent lead.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('follow_ups.complete');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const { data: followUp, error: fetchErr } = await supabase
      .from('pyra_sales_follow_ups')
      .select('id, lead_id, assigned_to, status, title, due_at')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) {
      console.error('POST follow-up complete fetch error:', fetchErr.message);
      return apiServerError();
    }
    if (!followUp) return apiNotFound('المتابعة غير موجودة');
    if (followUp.status !== 'pending') {
      return apiValidationError('المتابعة ليست قيد الانتظار');
    }

    // Caller must own the follow-up OR have access to the parent lead
    // (admin satisfies both via canAccessLead's admin shortcut).
    const isAssignee = followUp.assigned_to === auth.pyraUser.username;
    const canAccess = await canAccessLead(
      supabase,
      auth.pyraUser.username,
      auth.pyraUser.role,
      followUp.lead_id,
    );
    if (!isAssignee && !canAccess) {
      return apiForbidden('فقط المسؤول عن المتابعة أو الـ admin يمكنه إكمالها');
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const outcome = typeof body.outcome_note === 'string' ? body.outcome_note.trim() : '';

    const completedAt = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase
      .from('pyra_sales_follow_ups')
      .update({ status: 'completed', completed_at: completedAt })
      .eq('id', id)
      .select('*')
      .single();
    if (updErr || !updated) {
      console.error('POST follow-up complete update error:', updErr?.message);
      return apiServerError();
    }

    // .then() required — Supabase query builder is lazy; bare `void <builder>`
    // never triggers execution.
    void supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: followUp.lead_id,
        activity_type: 'follow_up_completed',
        description: outcome || null,
        metadata: { follow_up_id: id, title: followUp.title, completed_at: completedAt },
        created_by: auth.pyraUser.username,
      })
      .then(({ error: e }) => {
        if (e) console.error('[follow_up_completed activity] insert failed:', e.message);
      });

    // Recalculate parent lead's next_follow_up to the earliest remaining pending one.
    const { data: nextPending } = await supabase
      .from('pyra_sales_follow_ups')
      .select('due_at')
      .eq('lead_id', followUp.lead_id)
      .eq('status', 'pending')
      .order('due_at', { ascending: true })
      .limit(1);
    void supabase
      .from('pyra_sales_leads')
      .update({ next_follow_up: nextPending && nextPending.length > 0 ? nextPending[0].due_at : null })
      .eq('id', followUp.lead_id)
      .then(({ error: e }) => {
        if (e) console.error('[lead next_follow_up update] failed:', e.message);
      });

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `follow_up_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/crm/leads/${followUp.lead_id}`,
      { lead_id: followUp.lead_id, follow_up_id: id, action: 'completed' },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({ follow_up: updated });
  } catch (err) {
    console.error('POST /api/crm/follow-ups/[id]/complete threw:', err);
    return apiServerError();
  }
}
