import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../_lib/device-auth';
import { apiSuccess, apiValidationError, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';

const NOTE_MAX_LENGTH = 2000;

const OUTCOMES = ['interested', 'not_interested', 'call_again'] as const;
type Outcome = (typeof OUTCOMES)[number];

// Persisted lead-timeline / follow-up content — stays Arabic per the codebase
// convention (CLAUDE.md i18n rules: DB-data strings are exempt until Phase 8).
const OUTCOME_LABELS: Record<Outcome, string> = {
  interested: 'مهتم', // i18n-exempt: persisted lead-activity content (Phase 8)
  not_interested: 'غير مهتم', // i18n-exempt: persisted lead-activity content (Phase 8)
  call_again: 'يحتاج إعادة اتصال', // i18n-exempt: persisted lead-activity content (Phase 8)
};

function isOutcome(value: unknown): value is Outcome {
  return typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value);
}

/**
 * POST /api/mobile/call-outcome
 *
 * Lets a sales agent log the result of a call from the Android app: tap
 * interested / not_interested / call_again, optionally add a note and a
 * next follow-up date. Auth: device x-api-key (`calls:device`) via
 * `requireDeviceAuth`.
 *
 * **`requireDeviceAuth` carries NO RBAC scope** — it returns an agent
 * username, not a lead-access scope. This route WRITES to lead data, so the
 * ownership re-check below (`lead.assigned_to === agentUsername`) is
 * mandatory — without it any device could write to any lead in the system.
 *
 * Side effects:
 *   - INSERT pyra_lead_activities (activity_type='note') — the call outcome
 *     entry on the lead timeline.
 *   - UPDATE pyra_sales_leads.last_contact_at = now() — a genuine human
 *     touch (unlike the 0-second-dial sync bug, this is always a real call
 *     the agent is actively wrapping up).
 *   - If `next_follow_up_at` is present: INSERT pyra_sales_follow_ups +
 *     a `follow_up_created` timeline activity + sync leads.next_follow_up,
 *     mirroring `POST /api/crm/follow-ups` field-for-field.
 *   - logActivity() audit row (`lead_update`, metadata.source =
 *     'mobile_call_outcome').
 *
 * No `notify()` call — the agent is acting on their own lead, so there is
 * no one else to notify (assigned_to is always the caller here).
 *
 * Rollback: if the last_contact_at bump fails after the note activity was
 * inserted, the activity row is deleted so a half-write never reports
 * success. A failure in the OPTIONAL follow-up insert (after the note +
 * bump already succeeded) is NOT rolled back — the call outcome itself is
 * a real, already-true fact regardless of whether scheduling a reminder for
 * it later also succeeded. See docs/CALL-TRACKING.md for the full contract.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { agentUsername } = auth;

    const body = await request.json().catch(() => null);
    const leadId = typeof body?.lead_id === 'string' ? body.lead_id.trim() : '';
    const outcome = body?.outcome;
    const noteRaw = typeof body?.note === 'string' ? body.note.trim() : '';
    const nextFollowUpAtRaw = typeof body?.next_follow_up_at === 'string' ? body.next_follow_up_at : '';

    if (!leadId) return apiValidationError('lead_id مطلوب');
    if (!isOutcome(outcome)) {
      return apiValidationError('outcome غير صالح — القيم المسموحة: interested, not_interested, call_again');
    }
    if (noteRaw.length > NOTE_MAX_LENGTH) {
      return apiValidationError(`الملاحظة طويلة جدًا (الحد الأقصى ${NOTE_MAX_LENGTH} حرف)`);
    }
    let nextFollowUpAtIso: string | null = null;
    if (nextFollowUpAtRaw) {
      const parsed = new Date(nextFollowUpAtRaw);
      if (isNaN(parsed.getTime())) return apiValidationError('next_follow_up_at غير صالح');
      nextFollowUpAtIso = parsed.toISOString();
    }

    const supabase = createServiceRoleClient();

    // ── Ownership re-check (mandatory) ──────────────────────────────────
    // requireDeviceAuth gives us an agent, not a scope. Load the lead and
    // reject unless it is actually assigned to the calling agent — a
    // missing lead and a not-owned lead both resolve to the same generic
    // 403 (never leak whether a given lead_id exists to a caller who
    // doesn't own it).
    const { data: lead, error: leadErr } = await supabase
      .from('pyra_sales_leads')
      .select('assigned_to')
      .eq('id', leadId)
      .maybeSingle();
    if (leadErr) {
      logError({ error: leadErr, request, metadata: { action: 'mobile_call_outcome_lead_lookup', agentUsername, leadId } });
      return apiServerError();
    }
    if (!lead || lead.assigned_to !== agentUsername) {
      return apiForbidden('لا تملك صلاحية الوصول لهذا الليد');
    }

    const nowIso = new Date().toISOString();
    const description = noteRaw || `نتيجة المكالمة: ${OUTCOME_LABELS[outcome]}`; // i18n-exempt: persisted lead-activity content (Phase 8)

    // ── 1. Note activity on the lead timeline ───────────────────────────
    const activityId = generateId('la');
    const { error: actErr } = await supabase.from('pyra_lead_activities').insert({
      id: activityId,
      lead_id: leadId,
      activity_type: 'note',
      description,
      metadata: { source: 'mobile_call_outcome', outcome, auto: false },
      created_by: agentUsername,
    });
    if (actErr) {
      logError({ error: actErr, request, metadata: { action: 'mobile_call_outcome_activity_insert', agentUsername, leadId } });
      return apiServerError();
    }

    // ── 2. Bump last_contact_at — roll back the activity if this fails ──
    const { error: bumpErr } = await supabase
      .from('pyra_sales_leads')
      .update({ last_contact_at: nowIso })
      .eq('id', leadId);
    if (bumpErr) {
      const { error: rollbackErr } = await supabase.from('pyra_lead_activities').delete().eq('id', activityId);
      if (rollbackErr) {
        console.error('[mobile/call-outcome] rollback delete failed:', rollbackErr.message);
      }
      logError({ error: bumpErr, request, metadata: { action: 'mobile_call_outcome_last_contact_bump', agentUsername, leadId, activityId } });
      return apiServerError('فشل تسجيل نتيجة المكالمة');
    }

    // ── 3. Optional follow-up — mirrors POST /api/crm/follow-ups ───────
    let followUpId: string | null = null;
    if (nextFollowUpAtIso) {
      followUpId = generateId('fu');
      const reminderAt = new Date(new Date(nextFollowUpAtIso).getTime() - 30 * 60 * 1000).toISOString();
      const followUpTitle = `متابعة مكالمة (${OUTCOME_LABELS[outcome]})`; // i18n-exempt: persisted follow-up content (Phase 8)

      const { error: fuErr } = await supabase.from('pyra_sales_follow_ups').insert({
        id: followUpId,
        lead_id: leadId,
        assigned_to: agentUsername,
        due_at: nextFollowUpAtIso,
        reminder_at: reminderAt,
        send_whatsapp_reminder: true,
        title: followUpTitle,
        notes: noteRaw || null,
        status: 'pending',
        created_by: agentUsername,
      });
      if (fuErr) {
        // Deliberately NOT rolled back: the note activity + last_contact_at
        // bump above already committed a real, true fact (the call
        // happened, the agent logged an outcome). Failing to schedule the
        // optional follow-up on top of that does not un-happen the call.
        logError({ error: fuErr, request, metadata: { action: 'mobile_call_outcome_follow_up_insert', agentUsername, leadId, activityId } });
        console.error('[mobile/call-outcome] follow-up insert failed:', fuErr.message);
        return apiServerError('تم تسجيل نتيجة المكالمة لكن فشل جدولة المتابعة');
      }

      // Timeline entry — fire-and-forget, mirrors the CRM follow-ups route.
      void supabase
        .from('pyra_lead_activities')
        .insert({
          id: generateId('la'),
          lead_id: leadId,
          activity_type: 'follow_up_created',
          description: followUpTitle,
          metadata: { follow_up_id: followUpId, due_at: nextFollowUpAtIso, assigned_to: agentUsername },
          created_by: agentUsername,
        })
        .then(({ error: e }) => {
          if (e) console.error('[follow_up_created activity] insert failed:', e.message);
        });

      // Sync leads.next_follow_up to the earliest pending/overdue due_at —
      // fire-and-forget, mirrors the CRM follow-ups route.
      const { data: pending } = await supabase
        .from('pyra_sales_follow_ups')
        .select('due_at')
        .eq('lead_id', leadId)
        .in('status', ['pending', 'overdue'])
        .order('due_at', { ascending: true })
        .limit(1);
      if (pending && pending.length > 0) {
        void supabase
          .from('pyra_sales_leads')
          .update({ next_follow_up: pending[0].due_at })
          .eq('id', leadId)
          .then(({ error: e }) => {
            if (e) console.error('[lead next_follow_up update] failed:', e.message);
          });
      }
    }

    logActivity(
      agentUsername,
      auth.displayName,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/crm/leads/${leadId}`,
      { lead_id: leadId, outcome, follow_up_id: followUpId, source: 'mobile_call_outcome' },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({ activity_id: activityId, follow_up_id: followUpId });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_call_outcome' } });
    return apiServerError();
  }
}
