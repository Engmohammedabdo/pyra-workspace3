import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// PATCH /api/automations/[id]/toggle
// Toggle is_enabled for an automation rule. Admin only.
// =============================================================
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('automations.manage');
    if (isApiError(auth)) return auth;

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // Fetch current state
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_automation_rules')
      .select('id, name, is_enabled')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0623\u062A\u0645\u062A\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629');
    }

    const newEnabled = !existing.is_enabled;

    const { data: rule, error } = await supabase
      .from('pyra_automation_rules')
      .update({
        is_enabled: newEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        'id, name, description, trigger_event, conditions, actions, is_enabled, created_by, created_at, updated_at'
      )
      .single();

    if (error) {
      console.error('Automation rule toggle error:', error);
      return apiServerError();
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: newEnabled
        ? 'automation_rule_enabled'
        : 'automation_rule_disabled',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: id,
      details: { rule_name: existing.name, is_enabled: newEnabled },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(rule);
  } catch (err) {
    console.error('PATCH /api/automations/[id]/toggle error:', err);
    return apiServerError();
  }
}
