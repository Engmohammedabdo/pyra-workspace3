import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../_lib/device-auth';
import { apiSuccess, apiError, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { buildLeadPhoneIndex, matchLeadByPhone, isConnectedCall } from '@/lib/calls/match';
import { notify } from '@/lib/notifications/notify';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';
import { getStageDefaultWinProbability } from '@/lib/crm/pipeline-stages';
import { logError } from '@/lib/observability/log-error';
import type { SupabaseClient } from '@supabase/supabase-js';

// CRM-aligned lead source whitelist (v1.3) — the 6 canonical CRM values
// (`components/crm/add-lead-modal/add-lead-modal.tsx` SOURCE_VALUES) plus the
// mobile-only `phone_call` default. Invalid/absent → 'phone_call' (backwards
// compatible: pre-v1.3 app builds never send this field). No CHECK constraint
// on `pyra_sales_leads.source` — this whitelist is app-layer only.
const LEAD_SOURCE_WHITELIST = [
  'phone_call', 'whatsapp', 'referral', 'manual', 'ad', 'social', 'website',
] as const;
type MobileLeadSource = (typeof LEAD_SOURCE_WHITELIST)[number];

function resolveLeadSource(raw: unknown): MobileLeadSource {
  if (typeof raw === 'string' && (LEAD_SOURCE_WHITELIST as readonly string[]).includes(raw)) {
    return raw as MobileLeadSource;
  }
  return 'phone_call';
}

/**
 * "The number is already registered — but NOT to you."
 *
 * The read-side twin of /api/mobile/calls/sync's ownership gate: this route
 * must never hand the caller a lead they don't own (id, name, or dashboard
 * URL). What it CAN'T do is drop the keys, and that is a hard constraint set by
 * the two live handsets, not a style choice:
 *
 *   `QuickAddData` (pyra-calls-app/.../core/Payloads.kt) declares
 *   `lead_id: String`, `lead_name: String`, `lead_url: String` — NON-nullable,
 *   with NO default values. kotlinx.serialization throws MissingFieldException
 *   on an absent required field and (no `coerceInputValues` on `PyraJson`)
 *   also throws on an explicit `null` for a non-nullable one; `ignoreUnknownKeys`
 *   only forgives EXTRA keys and `explicitNulls = false` only affects ENCODING.
 *   ApiClient wraps the decode in `runCatching{}.getOrNull()`, so the failure
 *   is not a crash — it degrades to `ApiResult.Err(200, "خطأ غير متوقع (200)")`,
 *   which on BOTH live versions (versionCode 7 and 8) shows the rep a red
 *   error, enqueues a `quick_add_failed` warning, and skips
 *   `Notifier.cancel(...)` so the «رقم غير مسجل» notification stays and the rep
 *   retries a request that already succeeded, forever.
 *
 * Empty strings decode cleanly and are inert: QuickAddActivity reads
 * `lead_name`/`lead_id` ONLY in the `already_existed == false` branch, and
 * `lead_url` is not read anywhere in the app. With `already_existed: true` the
 * rep gets the existing «الرقم مسجل بالفعل — تم ربط المكالمة» toast, which is
 * true (the call was linked at sync time — `pyra_agent_calls.lead_id` stays
 * set on an unowned match by design) and reveals nothing.
 *
 * Do NOT "clean this up" by making the Kotlin fields nullable: the live fleet
 * is what decodes this response, and a future build being tolerant does not
 * make v7/v8 tolerant. The non-nullable declaration is also load-bearing on the
 * lead-CREATED path, where a missing id SHOULD fail loudly.
 */
const WITHHELD_EXISTING_LEAD = {
  lead_id: '',
  lead_name: '',
  lead_url: '',
  already_existed: true,
} as const;

/**
 * Retro-link every unlinked call for this number to the lead + write
 * `call_logged` activities for connected ones and `call_attempt` activities
 * for matched-but-unanswered ones (mirrors /api/mobile/calls/sync). A
 * `call_attempt` is visible on the timeline as effort but is NOT contact —
 * it never bumps `last_contact_at`, and every "last touched" consumer
 * (lead-idle-check, deals-at-risk, ai-insights, the customer dossier health
 * score) excludes activity_type='call_attempt'. Missed calls get neither.
 *
 * OWNERSHIP GATE — the third path to this boundary, after
 * /api/mobile/calls/sync's gate and the two withheld-identity branches in
 * this file's POST handler (see WITHHELD_EXISTING_LEAD above). The SELECT
 * below stays system-wide with no `agent_username` filter ON PURPOSE — a
 * colleague's earlier unmatched dial to this number must still get linked,
 * or it re-fires the app's «رقم غير مسجل» prompt forever AND (nulled
 * `lead_id`) lets `/api/mobile/calls/ignore` mark a customer number as
 * ignored out from under its real owner. So EVERY selected call is still
 * LINKED (`pyra_agent_calls.lead_id` set) regardless of who dialled it. But a
 * lead's contact timestamp and timeline must never be sourced from a dial its
 * owner did not make — so the `call_logged` / `call_attempt` activity write
 * AND the `last_contact_at` bump below run ONLY for calls whose
 * `agent_username` equals `leadOwner`. A foreign agent's call is linked
 * silently: no activity, no timestamp movement, same as if it had never been
 * selected — filtered at the WRITE, not at the READ.
 *
 * Persistence ordering mirrors /api/mobile/calls/sync: the calls already
 * exist as durable rows, so writing the activity first and the call-row
 * update second cannot orphan anything — worst case on an update failure is
 * a `pyra_lead_activities` row with no back-linked `pyra_agent_calls.activity_id`,
 * which is the same "non-fatal, logged" shape the sync route already accepts.
 *
 * last_contact_at: after linking, if any retro-linked call made BY THE OWNER
 * was CONNECTED, advance the lead's last_contact_at to the newest such call's
 * called_at — but only FORWARD, never backward. Unlike the live sync path
 * (where the bumped call just happened), a retro-link batch can carry old
 * historical calls, and the lead may already carry a newer last_contact_at
 * from another source (e.g. it was just created, or touched since) — an
 * unconditional overwrite here would regress it into the past.
 *
 * Returns the number of calls LINKED for this phone number (rows found and
 * relinked), NOT the number that wrote an activity — those two counts
 * diverge exactly when the batch contains a foreign agent's call, and every
 * consumer of this return value (the `linked_calls` activity-log metadata
 * below) is answering "how many of this number's calls are now tied to this
 * lead", not "how many touched its timeline". Nothing downstream currently
 * shows this number to the rep on the phone; if that ever changes, keep this
 * meaning — do not silently switch it to an activity-written count.
 */
async function retroLinkCalls(
  supabase: SupabaseClient,
  leadId: string,
  phoneNormalized: string,
  leadOwner: string | null,
): Promise<number> {
  // `match_status = 'ignored'` is excluded on purpose: an ignored number is
  // the company's own line or one the agent marked "not a customer", and its
  // calls carry lead_id NULL — without this filter, creating a lead on that
  // number would retro-link every internal call onto the new card and stamp
  // last_contact_at from it, re-creating the exact mess the ignore list exists
  // to prevent.
  const { data: unlinked, error: selErr } = await supabase
    .from('pyra_agent_calls')
    .select('id, agent_username, direction, duration_seconds, called_at')
    .eq('phone_normalized', phoneNormalized)
    .neq('match_status', 'ignored')
    .is('lead_id', null);
  if (selErr) {
    // non-fatal for the caller (the lead itself is fine) but MUST be
    // logged — a silent zero here would leave the number's other calls
    // unlinked with no trace of why.
    console.error('[retroLinkCalls] select failed:', selErr.message);
    return 0;
  }
  if (!unlinked || unlinked.length === 0) return 0;

  // Newest CONNECTED call's called_at across this batch — used for the
  // forward-only last_contact_at bump below.
  let newestConnectedCalledAt: string | null = null;

  for (const call of unlinked) {
    // Same predicate as /api/mobile/calls/sync's `isOwnedByAgent`
    // (lead.assigned_to === agentUsername): `leadOwner` null fails closed, so
    // an unassigned lead never attributes a foreign call as its own contact.
    const ownedByLeadOwner = leadOwner != null && call.agent_username === leadOwner;

    let activityId: string | null = null;
    if (ownedByLeadOwner) {
      if (isConnectedCall(call)) {
        activityId = generateId('la');
        const { error: actErr } = await supabase.from('pyra_lead_activities').insert({
          id: activityId,
          lead_id: leadId,
          activity_type: 'call_logged',
          description: null,
          metadata: {
            duration_minutes: Math.round((call.duration_seconds / 60) * 10) / 10,
            duration_seconds: call.duration_seconds,
            direction: call.direction === 'incoming' ? 'inbound' : 'outbound',
            auto: true,
            source: 'device_sync_retro',
            called_at: call.called_at,
          },
          created_by: call.agent_username,
        });
        if (actErr) {
          console.error('[quick-add retro-link] call_logged activity insert failed:', actErr.message);
          activityId = null;
        }
        if (!newestConnectedCalledAt || call.called_at > newestConnectedCalledAt) {
          newestConnectedCalledAt = call.called_at;
        }
      } else if (call.direction !== 'missed') {
        // Matched but unanswered (0-second dial) — visible on the timeline as
        // effort, but NOT contact. Mirrors the live-sync path's call_attempt
        // branch; missed inbound calls stay excluded entirely.
        activityId = generateId('la');
        const { error: actErr } = await supabase.from('pyra_lead_activities').insert({
          id: activityId,
          lead_id: leadId,
          activity_type: 'call_attempt',
          description: null,
          metadata: {
            direction: call.direction === 'incoming' ? 'inbound' : 'outbound',
            duration_seconds: 0,
            auto: true,
            source: 'device_sync_retro',
            called_at: call.called_at,
          },
          created_by: call.agent_username,
        });
        if (actErr) {
          console.error('[quick-add retro-link] call_attempt activity insert failed:', actErr.message);
          activityId = null;
        }
      }
    }
    // LINK unconditionally — ownership gates the activity/timestamp above,
    // never the link itself (see the OWNERSHIP GATE doc comment).
    const { error: updErr } = await supabase
      .from('pyra_agent_calls')
      .update({ lead_id: leadId, match_status: 'matched', activity_id: activityId })
      .eq('id', call.id);
    if (updErr) {
      console.error('[quick-add retro-link] call row update failed:', updErr.message, { call_id: call.id });
    }
  }

  if (newestConnectedCalledAt) {
    const { data: leadRow, error: leadSelErr } = await supabase
      .from('pyra_sales_leads')
      .select('last_contact_at')
      .eq('id', leadId)
      .maybeSingle();
    if (leadSelErr) {
      console.error('[quick-add retro-link] last_contact_at read failed:', leadSelErr.message);
    } else {
      const current = (leadRow as { last_contact_at: string | null } | null)?.last_contact_at ?? null;
      if (!current || new Date(newestConnectedCalledAt).getTime() > new Date(current).getTime()) {
        const { error: bumpErr } = await supabase
          .from('pyra_sales_leads')
          .update({ last_contact_at: newestConnectedCalledAt })
          .eq('id', leadId);
        if (bumpErr) {
          console.error('[quick-add retro-link] last_contact_at bump failed:', bumpErr.message);
        }
      }
    }
  }

  return unlinked.length;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { agentUsername, displayName } = auth;

    const body = await request.json().catch(() => null);
    const deviceCallKey = typeof body?.device_call_key === 'string' ? body.device_call_key.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const leadType = body?.lead_type === 'b2c' ? 'b2c' : body?.lead_type === 'b2b' ? 'b2b' : null;
    const company = typeof body?.company === 'string' ? body.company.trim() : '';
    const source = resolveLeadSource(body?.source);
    if (!deviceCallKey) return apiValidationError('device_call_key مطلوب');
    if (!name) return apiValidationError('اسم العميل مطلوب');
    if (!leadType) return apiValidationError('نوع العميل (شركة/فرد) مطلوب');
    if (leadType === 'b2b' && !company) return apiValidationError('اسم الشركة مطلوب لعميل شركة');

    const supabase = createServiceRoleClient();
    const { data: call } = await supabase
      .from('pyra_agent_calls')
      .select('id, phone_raw, phone_normalized, called_at, lead_id, direction, duration_seconds')
      .eq('agent_username', agentUsername)
      .eq('device_call_key', deviceCallKey)
      .maybeSingle();
    if (!call) return apiError('المكالمة غير موجودة', 404);

    // Race guard: the number may have been registered since the sync — OR the
    // sync may have linked this call to a COLLEAGUE's lead. "This
    // device_call_key is mine and its row carries a lead_id" is NOT evidence
    // the caller owns that lead: /api/mobile/calls/sync deliberately KEEPS
    // `pyra_agent_calls.lead_id` set on an unowned match (nulling it would hand
    // the row back to retroLinkCalls and to calls/ignore — see that route's doc
    // comment), so without the ownership check below an agent could POST the
    // key of a wrong-number dial and receive the colleague's lead id, name and
    // dashboard URL in a 200 — the exact datum the sync gate withholds.
    //
    // `assigned_to === agentUsername` is the same predicate as
    // `isOwnedByAgent` and /api/mobile/call-outcome's gate, so an unassigned
    // lead fails closed.
    if (call.lead_id) {
      // maybeSingle, not single: a dangling lead_id (lead deleted since the
      // sync) used to reach `l!.id` and throw → 500. It is not an ownership
      // match either, so it takes the withheld branch.
      const { data: l } = await supabase
        .from('pyra_sales_leads')
        .select('id, name, assigned_to')
        .eq('id', call.lead_id)
        .maybeSingle();
      const ownedLead = l && l.assigned_to === agentUsername ? l : null;
      return apiSuccess(
        ownedLead
          ? {
              lead_id: ownedLead.id,
              lead_name: ownedLead.name,
              lead_url: `/dashboard/crm/leads/${ownedLead.id}`,
              already_existed: true,
            }
          : WITHHELD_EXISTING_LEAD,
      );
    }
    // A failed SELECT here MUST abort (throw → logError + 500 → phone
    // retries): building the index from an empty set would make
    // matchLeadByPhone return null and create a DUPLICATE lead.
    //
    // `assigned_to` is selected + passed as the duplicate-key PREFERENCE for
    // the same two reasons the sync route does it: this branch is the SECOND
    // way this route can hand back a lead the caller doesn't own (a colleague
    // registered the number between the sync and this quick-add), and where a
    // number carries duplicate lead cards (18 such phone keys in prod) the
    // caller's OWN card must win the tie — otherwise an agent who does own a
    // lead on that number gets the withheld "already registered" toast because
    // an arbitrary colleague's duplicate won an unordered read.
    const { data: leads, error: leadsErr } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, phone, assigned_to')
      .not('phone', 'is', null);
    if (leadsErr) throw leadsErr;
    const match = matchLeadByPhone(
      buildLeadPhoneIndex(leads ?? [], agentUsername),
      call.phone_raw,
    );
    if (match) {
      // retroLinkCalls still runs for an unowned match: the calls ARE on that
      // lead's number, and leaving them unlinked would re-fire the app's «رقم
      // غير مسجل» prompt on every future call to it. Only the IDENTITY is
      // withheld — see WITHHELD_EXISTING_LEAD. `match.assigned_to` (from the
      // phone index, may be null for an unassigned lead) is the lead's ACTUAL
      // owner — retroLinkCalls uses it to keep the activity write and the
      // last_contact_at bump scoped to that owner's own calls only.
      await retroLinkCalls(supabase, match.id, call.phone_normalized, match.assigned_to);
      return apiSuccess(
        match.assigned_to === agentUsername
          ? {
              lead_id: match.id,
              lead_name: match.name,
              lead_url: `/dashboard/crm/leads/${match.id}`,
              already_existed: true,
            }
          : WITHHELD_EXISTING_LEAD,
      );
    }

    // create the lead — mirrors /api/crm/leads POST defaults
    const leadId = generateId('sl');
    const { error: insertErr } = await supabase.from('pyra_sales_leads').insert({
      id: leadId,
      name,
      phone: call.phone_raw,
      email: null,
      company: leadType === 'b2b' ? company : null,
      source,
      stage_id: PIPELINE_STAGE_IDS.NEW_INQUIRY,
      assigned_to: agentUsername,
      notes: null,
      priority: 'medium',
      lead_type: leadType,
      expected_value: 0,
      expected_value_currency: 'AED',
      billing_cycle: 'one_time',
      win_probability: getStageDefaultWinProbability(PIPELINE_STAGE_IDS.NEW_INQUIRY) ?? 0,
      win_probability_overridden: false,
      created_by: agentUsername,
      is_converted: false,
      // A dial nobody answered is not contact. This line previously stamped
      // last_contact_at unconditionally, so a lead created from the
      // unknown-number prompt after two unanswered dials was born looking
      // "freshly contacted" — 41 real leads were mis-stamped this way between
      // 2026-07-25 and 2026-07-29. The sync path was fixed earlier; this is
      // the same rule, at the path the earlier fix missed.
      last_contact_at: isConnectedCall(call) ? call.called_at : null,
    });
    if (insertErr) throw insertErr;

    const { error: createdActErr } = await supabase.from('pyra_lead_activities').insert({
      id: generateId('la'),
      lead_id: leadId,
      activity_type: 'lead_created',
      description: null,
      metadata: { source: 'phone_call', created_by: agentUsername },
      created_by: agentUsername,
    });
    if (createdActErr) {
      // non-fatal — the lead row is durable; the timeline just misses its
      // lead_created entry.
      console.error('[mobile quick-add] lead_created activity insert failed:', createdActErr.message);
    }

    // The lead row inserted above carries `assigned_to: agentUsername` — that
    // IS its owner, read from the same fact just written rather than assumed
    // out of context, so retroLinkCalls scopes the activity write and the
    // last_contact_at bump to agentUsername's own calls only.
    const leadOwner = agentUsername;
    const linked = await retroLinkCalls(supabase, leadId, call.phone_normalized, leadOwner);

    // feedback reminder — bell notification. NO `from`: the recipient IS the
    // actor; notify() skips self-notifications when from.username === to.
    await notify(supabase, {
      to: agentUsername,
      type: 'call_feedback_required',
      title: 'مطلوب: إضافة فيدباك',
      message: `تم إنشاء عميل جديد (${name}) من مكالمة — ادخل وسجّل نتيجة المكالمة`,
      link: `/dashboard/crm/leads/${leadId}`,
      entity: { type: ENTITY_TYPES.LEAD, id: leadId },
    });

    logActivity(
      agentUsername,
      displayName,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.CREATE}`,
      `/dashboard/crm/leads/${leadId}`,
      { lead_id: leadId, source: 'mobile_quick_add', linked_calls: linked },
    );

    return apiSuccess({
      lead_id: leadId, lead_name: name,
      lead_url: `/dashboard/crm/leads/${leadId}`, already_existed: false,
    }, undefined, 201);
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_quick_add_lead' } });
    return apiServerError();
  }
}
