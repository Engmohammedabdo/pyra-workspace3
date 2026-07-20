import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../_lib/device-auth';
import { apiSuccess, apiError, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { buildLeadPhoneIndex, matchLeadByPhone } from '@/lib/calls/match';
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
 * Retro-link every unlinked call for this number to the lead + write
 * `call_logged` activities for connected ones.
 *
 * Persistence ordering mirrors /api/mobile/calls/sync: the calls already
 * exist as durable rows, so writing the activity first and the call-row
 * update second cannot orphan anything — worst case on an update failure is
 * a `pyra_lead_activities` row with no back-linked `pyra_agent_calls.activity_id`,
 * which is the same "non-fatal, logged" shape the sync route already accepts.
 */
async function retroLinkCalls(
  supabase: SupabaseClient,
  leadId: string,
  phoneNormalized: string,
): Promise<number> {
  const { data: unlinked, error: selErr } = await supabase
    .from('pyra_agent_calls')
    .select('id, agent_username, direction, duration_seconds, called_at')
    .eq('phone_normalized', phoneNormalized)
    .is('lead_id', null);
  if (selErr) {
    // non-fatal for the caller (the lead itself is fine) but MUST be
    // logged — a silent zero here would leave the number's other calls
    // unlinked with no trace of why.
    console.error('[retroLinkCalls] select failed:', selErr.message);
    return 0;
  }
  if (!unlinked || unlinked.length === 0) return 0;
  for (const call of unlinked) {
    let activityId: string | null = null;
    if (call.direction !== 'missed') {
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
    }
    const { error: updErr } = await supabase
      .from('pyra_agent_calls')
      .update({ lead_id: leadId, match_status: 'matched', activity_id: activityId })
      .eq('id', call.id);
    if (updErr) {
      console.error('[quick-add retro-link] call row update failed:', updErr.message, { call_id: call.id });
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
      .select('id, phone_raw, phone_normalized, called_at, lead_id')
      .eq('agent_username', agentUsername)
      .eq('device_call_key', deviceCallKey)
      .maybeSingle();
    if (!call) return apiError('المكالمة غير موجودة', 404);

    // race guard: number may have been registered since the sync
    if (call.lead_id) {
      const { data: l } = await supabase.from('pyra_sales_leads').select('id, name').eq('id', call.lead_id).single();
      return apiSuccess({ lead_id: l!.id, lead_name: l!.name, lead_url: `/dashboard/crm/leads/${l!.id}`, already_existed: true });
    }
    // A failed SELECT here MUST abort (throw → logError + 500 → phone
    // retries): building the index from an empty set would make
    // matchLeadByPhone return null and create a DUPLICATE lead.
    const { data: leads, error: leadsErr } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, phone')
      .not('phone', 'is', null);
    if (leadsErr) throw leadsErr;
    const match = matchLeadByPhone(buildLeadPhoneIndex(leads ?? []), call.phone_raw);
    if (match) {
      await retroLinkCalls(supabase, match.id, call.phone_normalized);
      return apiSuccess({ lead_id: match.id, lead_name: match.name, lead_url: `/dashboard/crm/leads/${match.id}`, already_existed: true });
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
      last_contact_at: call.called_at,
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

    const linked = await retroLinkCalls(supabase, leadId, call.phone_normalized);

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
