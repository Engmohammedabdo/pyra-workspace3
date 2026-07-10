import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../../_lib/device-auth';
import { apiSuccess, apiError, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logError } from '@/lib/observability/log-error';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { agentUsername } = auth;

    const body = await request.json().catch(() => null);
    const deviceCallKey = typeof body?.device_call_key === 'string' ? body.device_call_key.trim() : '';
    if (!deviceCallKey) return apiValidationError('device_call_key مطلوب');

    const supabase = createServiceRoleClient();
    const { data: call } = await supabase
      .from('pyra_agent_calls')
      .select('id, phone_normalized, lead_id')
      .eq('agent_username', agentUsername)
      .eq('device_call_key', deviceCallKey)
      .maybeSingle();
    if (!call) return apiError('المكالمة غير موجودة', 404);
    if (call.lead_id) return apiError('المكالمة مرتبطة بعميل بالفعل', 409);

    // The ignore-list row is the load-bearing write (future syncs read it) —
    // a failed upsert MUST NOT return ignored:true, or the phone stops
    // re-prompting while nothing was persisted. Throw → logError + 500 so
    // the app retries the ignore.
    const { error: upsertErr } = await supabase.from('pyra_ignored_numbers').upsert(
      {
        id: generateId('ign'),
        agent_username: agentUsername,
        phone_normalized: call.phone_normalized,
      },
      { onConflict: 'agent_username,phone_normalized', ignoreDuplicates: true },
    );
    if (upsertErr) throw upsertErr;

    const { data: updated, error: flipErr } = await supabase
      .from('pyra_agent_calls')
      .update({ match_status: 'ignored' })
      .eq('agent_username', agentUsername)
      .eq('phone_normalized', call.phone_normalized)
      .is('lead_id', null)
      .select('id');
    if (flipErr) {
      // non-fatal — the ignore-list row is what future syncs consult; the
      // historical rows just keep match_status='unmatched'.
      console.error('[calls/ignore] match_status flip failed:', flipErr.message);
    }

    return apiSuccess({ ignored: true, updated_calls: (updated ?? []).length });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_call_ignore' } });
    return apiServerError();
  }
}
