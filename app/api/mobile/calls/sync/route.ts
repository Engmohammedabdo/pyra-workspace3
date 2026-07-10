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
 *   - 'duplicate' — device_call_key already synced for this agent (either
 *     seen in the pre-check SELECT or caught via the unique-constraint
 *     race on insert — double-sync safe either way)
 *   - 'matched'   — phone matched an existing lead. If the call was
 *     CONNECTED (direction != 'missed') this ALSO writes a `call_logged`
 *     pyra_lead_activities row + bumps the lead's last_contact_at. Missed
 *     calls are still stored + counted but get NO timeline activity and
 *     NO last_contact_at bump (design lock — see call-tracking spec).
 *   - 'ignored'   — phone matched a row in this agent's pyra_ignored_numbers
 *   - 'unmatched' — no lead, not ignored
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

    const { data: ignoredRows } = await supabase
      .from('pyra_ignored_numbers')
      .select('phone_normalized')
      .eq('agent_username', agentUsername);
    const ignoredSet = new Set((ignoredRows ?? []).map((r) => r.phone_normalized));

    const results: Array<Record<string, unknown>> = [];
    for (const call of calls) {
      if (existingKeys.has(call.device_call_key)) {
        results.push({ device_call_key: call.device_call_key, status: 'duplicate' });
        continue;
      }
      const normalized = phoneMatchKey(call.phone);
      const lead = matchLeadByPhone(index, call.phone);
      const connected = call.direction !== 'missed';
      let activityId: string | null = null;

      if (lead && connected) {
        activityId = generateId('la');
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
          console.error('[calls/sync] activity insert failed:', actErr.message);
          activityId = null;
        }
        await supabase
          .from('pyra_sales_leads')
          .update({ last_contact_at: call.called_at })
          .eq('id', lead.id);
      }

      const matchStatus = lead ? 'matched' : ignoredSet.has(normalized) ? 'ignored' : 'unmatched';
      const { error: insErr } = await supabase.from('pyra_agent_calls').insert({
        id: generateId('ac'),
        agent_username: agentUsername,
        phone_raw: call.phone,
        phone_normalized: normalized,
        direction: call.direction,
        duration_seconds: call.duration_seconds,
        called_at: call.called_at,
        device_call_key: call.device_call_key,
        lead_id: lead?.id ?? null,
        activity_id: activityId,
        match_status: matchStatus,
      });
      if (insErr) {
        // unique-violation race (double sync) → report as duplicate, else surface
        results.push({ device_call_key: call.device_call_key, status: 'duplicate' });
        continue;
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
