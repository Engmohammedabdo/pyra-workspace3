import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../../_lib/device-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { phoneMatchKey } from '@/lib/utils/phone';
import { buildLeadPhoneIndex, matchLeadByPhone } from '@/lib/calls/match';
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
 *     CONNECTED (direction != 'missed') this ALSO writes a `call_logged`
 *     pyra_lead_activities row + bumps the lead's last_contact_at. Missed
 *     calls are still stored + counted but get NO timeline activity and
 *     NO last_contact_at bump (design lock — see call-tracking spec).
 *   - 'ignored'   — phone matched a row in this agent's pyra_ignored_numbers
 *   - 'unmatched' — no lead, not ignored
 *   - 'error'     — the pyra_agent_calls insert failed for a NON-unique-
 *     violation reason (DB hiccup). Nothing was persisted for this call;
 *     the phone keeps it queued locally and retries on the next sync.
 *
 * Persistence ordering: the pyra_agent_calls row is inserted FIRST (with
 * activity_id null); the call_logged activity + last_contact_at bump run
 * only AFTER the row is durable, then the row's activity_id is
 * back-filled. A failed/raced row insert therefore never leaves an orphan
 * timeline activity or a phantom last_contact_at bump behind.
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
    const { data: leads, error: leadsErr } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, phone')
      .not('phone', 'is', null);
    if (leadsErr) throw leadsErr;
    const index = buildLeadPhoneIndex(leads ?? []);

    const { data: ignoredRows, error: ignoredErr } = await supabase
      .from('pyra_ignored_numbers')
      .select('phone_normalized')
      .eq('agent_username', agentUsername);
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
    const results: Array<Record<string, unknown>> = [];
    for (const call of calls) {
      if (processedKeys.has(call.device_call_key)) {
        results.push({ device_call_key: call.device_call_key, status: 'duplicate' });
        continue;
      }
      processedKeys.add(call.device_call_key);

      const normalized = phoneMatchKey(call.phone);
      const lead = matchLeadByPhone(index, call.phone);
      const connected = call.direction !== 'missed';
      const matchStatus = lead ? 'matched' : ignoredSet.has(normalized) ? 'ignored' : 'unmatched';

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
      }

      results.push({
        device_call_key: call.device_call_key,
        status: matchStatus,
        ...(lead ? { lead_id: lead.id, lead_name: lead.name } : {}),
      });
    }

    return apiSuccess({ results });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_calls_sync' } });
    return apiServerError();
  }
}
