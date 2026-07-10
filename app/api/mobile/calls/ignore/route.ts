import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../../_lib/device-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
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
    if (!deviceCallKey) return apiError('device_call_key مطلوب', 422);

    const supabase = createServiceRoleClient();
    const { data: call } = await supabase
      .from('pyra_agent_calls')
      .select('id, phone_normalized, lead_id')
      .eq('agent_username', agentUsername)
      .eq('device_call_key', deviceCallKey)
      .maybeSingle();
    if (!call) return apiError('المكالمة غير موجودة', 404);
    if (call.lead_id) return apiError('المكالمة مرتبطة بعميل بالفعل', 409);

    await supabase.from('pyra_ignored_numbers').upsert(
      {
        id: generateId('ign'),
        agent_username: agentUsername,
        phone_normalized: call.phone_normalized,
      },
      { onConflict: 'agent_username,phone_normalized', ignoreDuplicates: true },
    );

    const { data: updated } = await supabase
      .from('pyra_agent_calls')
      .update({ match_status: 'ignored' })
      .eq('agent_username', agentUsername)
      .eq('phone_normalized', call.phone_normalized)
      .is('lead_id', null)
      .select('id');

    return apiSuccess({ ignored: true, updated_calls: (updated ?? []).length });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_call_ignore' } });
    return apiServerError();
  }
}
