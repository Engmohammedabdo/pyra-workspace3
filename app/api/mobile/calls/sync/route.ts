import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../../_lib/device-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { phoneMatchKey } from '@/lib/utils/phone';
import { buildLeadPhoneIndex, matchLeadByPhone, isConnectedCall } from '@/lib/calls/match';
import { logError } from '@/lib/observability/log-error';

const MAX_BATCH = 100;
const DIRECTIONS = new Set(['outgoing', 'incoming', 'missed']);

interface IncomingCall {
  device_call_key: string;
  phone: string;
  direction: 'outgoing' | 'incoming' | 'missed';
  duration_seconds: number;
  called_at: string;
}

function parseCalls(raw: unknown): IncomingCall[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BATCH) return null;
  const out: IncomingCall[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null;
    const c = item as Record<string, unknown>;
    if (typeof c.device_call_key !== 'string' || !c.device_call_key.trim()) return null;
    if (typeof c.phone !== 'string' || !c.phone.trim()) return null;
    if (typeof c.direction !== 'string' || !DIRECTIONS.has(c.direction)) return null;
    const dur = Number(c.duration_seconds);
    if (!Number.isFinite(dur) || dur < 0) return null;
    if (typeof c.called_at !== 'string' || Number.isNaN(Date.parse(c.called_at))) return null;
    out.push({
      device_call_key: c.device_call_key.trim(),
      phone: c.phone.trim(),
      direction: c.direction as IncomingCall['direction'],
      duration_seconds: Math.round(dur),
      called_at: c.called_at,
    });
  }
  return out;
}

/**
 * POST /api/mobile/calls/sync
 *
 * Ingests a batch of SIM call-log rows from the Android call-tracking app.
 * Auth: device x-api-key (`calls:device`) via `requireDeviceAuth`.
 *
 * Per-call outcome, echoed back so the device drives its local
 * notifications (every 'unmatched' fires the «رقم غير مسجل» prompt):
 *   - 'duplicate' — device_call_key already synced for this agent (seen in
 *     the pre-check SELECT, repeated within the SAME batch, or caught via
 *     the unique-constraint race on insert — double-sync safe either way)
 *   - 'matched'   — phone matched an existing lead. If the call was
 *     CONNECTED (`isConnectedCall`: direction != 'missed' AND
 *     duration_seconds > 0) this ALSO writes a `call_logged`
 *     pyra_lead_activities row + bumps the lead's last_contact_at. A
 *     matched but UNANSWERED dial (direction != 'missed' AND
 *     duration_seconds === 0) writes a `call_attempt` activity instead —
 *     visible on the timeline as effort, but it does NOT bump
 *     last_contact_at and every "last touched" consumer (lead-idle-check,
 *     deals-at-risk, ai-insights, the customer dossier health score)
 *     excludes activity_type='call_attempt' so an unanswered dial can never
 *     look like contact. Missed calls get NO timeline activity and NO
 *     last_contact_at bump at all (design lock — see call-tracking spec).
 *   - 'ignored'   — phone matched a row in this agent's pyra_ignored_numbers
 *   - 'unmatched' — no lead, not ignored
 *   - 'error'     — the pyra_agent_calls insert failed for a NON-unique-
 *     violation reason (DB hiccup). Nothing was persisted for this call;
 *     the phone keeps it queued locally and retries on the next sync.
 *
 * A 'matched' result also carries `owned: boolean` (whole-wave review Gap 2,
 * 2026-07-25). The lead index above is system-wide (no assigned_to filter,
 * first-match wins), so a call to a COLLEAGUE's lead still returns
 * 'matched' + that lead's name — `owned` tells the caller whether the
 * calling agent is actually `assigned_to` that lead. Additive field: a
 * pre-v1.4 phone decodes with ignoreUnknownKeys and never sees it.
 *
 * Persistence ordering: the pyra_agent_calls row is inserted FIRST (with
 * activity_id null); the call_logged/call_attempt activity (+ last_contact_at
 * bump for call_logged only) run only AFTER the row is durable, then the
 * row's activity_id is back-filled. A failed/raced row insert therefore
 * never leaves an orphan timeline activity or a phantom last_contact_at
 * bump behind.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { agentUsername } = auth;

    const body = await request.json().catch(() => null);
    const calls = parseCalls(body?.calls);
    if (!calls) return apiError(`calls مطلوبة (حد أقصى ${MAX_BATCH})`, 422);

    const supabase = createServiceRoleClient();

    // 1. duplicates: already-synced device_call_keys are echoed back as 'duplicate'
    const keys = calls.map((c) => c.device_call_key);
    const { data: existing } = await supabase
      .from('pyra_agent_calls')
      .select('device_call_key')
      .eq('agent_username', agentUsername)
      .in('device_call_key', keys);
    const existingKeys = new Set((existing ?? []).map((r) => r.device_call_key));

    // 2. lead index + ignore list
    // `assigned_to` is selected so each matched result can carry an `owned`
    // flag — this index is system-wide (no assigned_to filter, first-match
    // wins), so a call to a COLLEAGUE's lead still matches; the app needs
    // ownership to decide whether it's safe to offer the outcome-logging
    // action (see the `owned` field docs below).
    const { data: leads, error: leadsErr } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, phone, assigned_to')
      .not('phone', 'is', null);
    if (leadsErr) throw leadsErr;
    const index = buildLeadPhoneIndex(leads ?? []);

    // `agent_username = '*'` is a FLEET-WIDE ignore (the company's own lines,
    // the owner's mobile) — same wildcard convention the cron scopes use. Any
    // other value is that one agent's personal ignore list. A per-agent row is
    // deliberately NOT required for the company numbers: a newly provisioned
    // agent must inherit them on day one, not after someone remembers to add
    // four rows.
    const { data: ignoredRows, error: ignoredErr } = await supabase
      .from('pyra_ignored_numbers')
      .select('phone_normalized')
      .in('agent_username', [agentUsername, '*']);
    // a read failure here would misclassify every ignored number as
    // 'unmatched' and persist that wrong status permanently — abort instead.
    if (ignoredErr) throw ignoredErr;
    const ignoredSet = new Set((ignoredRows ?? []).map((r) => r.phone_normalized));

    // processedKeys grows as the batch is processed — catches the same
    // device_call_key repeated WITHIN one batch (existingKeys alone only
    // covers keys already in the DB before this request).
    // Known edge: a key whose FIRST occurrence in the batch results in
    // status 'error' (insert failed) is still added to processedKeys below,
    // so a second in-batch occurrence of that same key would report
    // 'duplicate' even though nothing was actually persisted. Our
    // cursor-based Android app never re-sends the same device_call_key
    // twice within one batch, so this can't happen in practice — accepted
    // for v1.
    const processedKeys = new Set(existingKeys);
    interface SyncResultOut {
      device_call_key: string;
      status: string;
      lead_id?: string;
      lead_name?: string;
      owned?: boolean;
      // Additive (wave C): the agent's earliest OPEN follow-up on the matched
      // lead, so the phone's notification can open the outcome sheet with the
      // follow-up already attached. An older app ignores unknown keys.
      open_follow_up_id?: string | null;
    }
    const results: SyncResultOut[] = [];
    for (const call of calls) {
      if (processedKeys.has(call.device_call_key)) {
        results.push({ device_call_key: call.device_call_key, status: 'duplicate' });
        continue;
      }
      processedKeys.add(call.device_call_key);

      const normalized = phoneMatchKey(call.phone);
      const connected = isConnectedCall(call);
      // IGNORE BEATS THE LEAD MATCH — order is load-bearing. The old order
      // (`lead ? 'matched' : ignored…`) meant the ignore list was skipped
      // entirely whenever a lead happened to carry that phone, and the owner's
      // own two numbers WERE saved as leads ("boss", "mohamed abdou"), so 24
      // internal calls were filed as customer contact and 13 activities were
      // written onto those cards. Ignoring first also nulls `lead`, so an
      // ignored call writes no timeline row and never moves last_contact_at,
      // even if someone re-creates a lead on that number tomorrow.
      const isIgnored = ignoredSet.has(normalized);
      const lead = isIgnored ? null : matchLeadByPhone(index, call.phone);
      const matchStatus = isIgnored ? 'ignored' : lead ? 'matched' : 'unmatched';

      // Persist the call row FIRST (activity_id back-filled below) so a
      // failed insert never leaves an orphan activity / phantom
      // last_contact_at bump behind.
      const callId = generateId('ac');
      const { error: insErr } = await supabase.from('pyra_agent_calls').insert({
        id: callId,
        agent_username: agentUsername,
        phone_raw: call.phone,
        phone_normalized: normalized,
        direction: call.direction,
        duration_seconds: call.duration_seconds,
        called_at: call.called_at,
        device_call_key: call.device_call_key,
        lead_id: lead?.id ?? null,
        activity_id: null,
        match_status: matchStatus,
      });
      if (insErr) {
        if (insErr.code === '23505') {
          // unique-violation race (double sync) → report as duplicate
          results.push({ device_call_key: call.device_call_key, status: 'duplicate' });
        } else {
          // real DB failure — nothing persisted; 'error' tells the phone to
          // keep the call queued and retry it on the next sync
          logError({
            error: insErr,
            request,
            metadata: { action: 'mobile_calls_sync_insert', device_call_key: call.device_call_key },
          });
          console.error('[calls/sync] call insert failed:', insErr.message);
          results.push({ device_call_key: call.device_call_key, status: 'error' });
        }
        continue;
      }

      // Side effects AFTER the call row is durable: timeline activity +
      // last_contact_at bump (matched CONNECTED calls only).
      if (lead && connected) {
        const activityId = generateId('la');
        const { error: actErr } = await supabase.from('pyra_lead_activities').insert({
          id: activityId,
          lead_id: lead.id,
          activity_type: 'call_logged',
          description: null,
          metadata: {
            duration_minutes: Math.round((call.duration_seconds / 60) * 10) / 10,
            duration_seconds: call.duration_seconds,
            direction: call.direction === 'incoming' ? 'inbound' : 'outbound',
            auto: true,
            source: 'device_sync',
            called_at: call.called_at,
          },
          created_by: agentUsername,
        });
        if (actErr) {
          // non-fatal — the call row stays with activity_id null
          console.error('[calls/sync] activity insert failed:', actErr.message);
        } else {
          const { error: linkErr } = await supabase
            .from('pyra_agent_calls')
            .update({ activity_id: activityId })
            .eq('id', callId);
          if (linkErr) {
            console.error('[calls/sync] activity_id back-fill failed:', linkErr.message);
          }
          const { error: bumpErr } = await supabase
            .from('pyra_sales_leads')
            .update({ last_contact_at: call.called_at })
            .eq('id', lead.id);
          if (bumpErr) {
            console.error('[calls/sync] last_contact_at bump failed:', bumpErr.message);
          }
        }
      } else if (lead && call.direction !== 'missed') {
        // Matched but unanswered (0-second outgoing/incoming dial): visible on
        // the timeline as effort, but NOT contact — no last_contact_at bump,
        // and every "last touched" consumer excludes activity_type=call_attempt
        // (lead-idle-check, deals-at-risk, ai-insights, dossier health score).
        // Missed inbound calls stay excluded entirely — they are not the
        // agent's attempt.
        const activityId = generateId('la');
        const { error: actErr } = await supabase.from('pyra_lead_activities').insert({
          id: activityId,
          lead_id: lead.id,
          activity_type: 'call_attempt',
          description: null,
          metadata: {
            direction: call.direction === 'incoming' ? 'inbound' : 'outbound',
            duration_seconds: 0,
            auto: true,
            source: 'device_sync',
            called_at: call.called_at,
          },
          created_by: agentUsername,
        });
        if (actErr) {
          // non-fatal — the call row stays with activity_id null
          console.error('[calls/sync] call_attempt activity insert failed:', actErr.message);
        } else {
          const { error: linkErr } = await supabase
            .from('pyra_agent_calls')
            .update({ activity_id: activityId })
            .eq('id', callId);
          if (linkErr) {
            console.error('[calls/sync] call_attempt activity_id back-fill failed:', linkErr.message);
          }
        }
      }

      results.push({
        device_call_key: call.device_call_key,
        status: matchStatus,
        // `owned` is additive (v1.4+) — a pre-v1.4 phone (its JSON decoder
        // uses ignoreUnknownKeys) simply never sees the field. Only
        // meaningful when a lead matched: true = the calling agent is this
        // lead's assigned_to, false = the call matched a COLLEAGUE's lead
        // (the system-wide index has no assigned_to filter, first-match
        // wins). The app uses this to skip the outcome-logging notification
        // action for a lead it doesn't own — that POST would 403 every time
        // (the ownership gate on /api/mobile/call-outcome).
        ...(lead ? { lead_id: lead.id, lead_name: lead.name, owned: lead.assigned_to === agentUsername } : {}),
      });
    }

    // ── Attach each matched lead's earliest OPEN follow-up ────────────────
    // ONE query for the whole batch, not one per call. Only leads the calling
    // agent OWNS are queried (`assigned_to`), so this can never surface a
    // colleague's follow-up id to a device.
    //
    // The `.in()` list is bounded by the batch size (100 calls, deduped to
    // distinct leads), so it is nowhere near the URL-length class that killed
    // the idle-check cron — no chunk() needed.
    //
    // Best-effort: a failure here leaves the field absent, which the app reads
    // as "no follow-up attached". It must never fail a sync that already
    // persisted calls.
    const matchedLeadIds = Array.from(
      new Set(results.map((r) => r.lead_id).filter((x): x is string => !!x)),
    );
    if (matchedLeadIds.length > 0) {
      const { data: openFollowUps, error: fuErr } = await supabase
        .from('pyra_sales_follow_ups')
        .select('id, lead_id, due_at')
        .eq('assigned_to', agentUsername)
        .in('lead_id', matchedLeadIds)
        .in('status', ['pending', 'overdue'])
        .order('due_at', { ascending: true });
      if (fuErr) {
        console.error('[calls/sync] open follow-up lookup failed:', fuErr.message);
      } else {
        // Ordered due_at ASC, so the FIRST row seen per lead is the earliest.
        const earliestByLead = new Map<string, string>();
        for (const fu of openFollowUps ?? []) {
          const leadId = fu.lead_id as string | null;
          if (leadId && !earliestByLead.has(leadId)) {
            earliestByLead.set(leadId, fu.id as string);
          }
        }
        for (const r of results) {
          if (r.lead_id) r.open_follow_up_id = earliestByLead.get(r.lead_id) ?? null;
        }
      }
    }

    return apiSuccess({ results });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_calls_sync' } });
    return apiServerError();
  }
}
