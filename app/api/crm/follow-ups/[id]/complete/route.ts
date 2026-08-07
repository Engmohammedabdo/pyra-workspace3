import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
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
import { logActivity, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { loadFollowUpForClose, closeFollowUp } from '@/lib/crm/close-follow-up';

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
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('follow_ups.complete');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const loaded = await loadFollowUpForClose(supabase, id);
    if (!loaded.ok) {
      if (loaded.reason === 'db_error') return apiServerError();
      if (loaded.reason === 'not_found') return apiNotFound(t('crm.followUpNotFound'));
      return apiValidationError(t('crm.followUpAlreadyDone'));
    }
    const followUp = loaded.followUp;

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
      return apiForbidden(t('crm.followUpOwnerOrAdminOnly'));
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const outcome = typeof body.outcome_note === 'string' ? body.outcome_note.trim() : '';

    const closed = await closeFollowUp(supabase, {
      followUp,
      actor: auth.pyraUser.username,
      note: outcome,
    });
    if (!closed.ok) {
      if (closed.reason === 'db_error') return apiServerError();
      return apiValidationError(t('crm.followUpAlreadyCompleted'));
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `follow_up_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/crm/leads/${followUp.lead_id}`,
      { lead_id: followUp.lead_id, follow_up_id: id, action: 'completed' },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({ follow_up: closed.row });
  } catch (err) {
    console.error('POST /api/crm/follow-ups/[id]/complete threw:', err);
    return apiServerError();
  }
}
