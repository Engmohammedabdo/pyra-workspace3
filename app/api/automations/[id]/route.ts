import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// GET /api/automations/[id]
// Get single automation rule detail. Admin only.
// =============================================================
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: rule, error } = await supabase
      .from('pyra_automation_rules')
      .select(
        'id, name, description, trigger_event, conditions, actions, is_enabled, created_by, created_at, updated_at'
      )
      .eq('id', id)
      .single();

    if (error || !rule) {
      return apiNotFound('\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0623\u062A\u0645\u062A\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629');
    }

    // Include execution count
    const { count } = await supabase
      .from('pyra_automation_log')
      .select('id', { count: 'exact', head: true })
      .eq('rule_id', id);

    return apiSuccess({
      ...rule,
      execution_count: count ?? 0,
    });
  } catch (err) {
    console.error('GET /api/automations/[id] error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/automations/[id]
// Update automation rule. Admin only.
// Body: { name?, description?, trigger_event?, conditions?, actions?, is_enabled? }
// =============================================================
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await context.params;
    const body = await request.json();
    const { name, description, trigger_event, conditions, actions, is_enabled } =
      body;

    const supabase = createServiceRoleClient();

    // Verify rule exists
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_automation_rules')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0623\u062A\u0645\u062A\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629');
    }

    // Build update payload - only include provided fields
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return apiValidationError('\u0627\u0633\u0645 \u0627\u0644\u0642\u0627\u0639\u062F\u0629 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0641\u0627\u0631\u063A\u064B\u0627');
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }

    if (trigger_event !== undefined) {
      if (
        typeof trigger_event !== 'string' ||
        trigger_event.trim().length === 0
      ) {
        return apiValidationError('\u062D\u062F\u062B \u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0641\u0627\u0631\u063A\u064B\u0627');
      }
      updates.trigger_event = trigger_event.trim();
    }

    if (conditions !== undefined) {
      updates.conditions = Array.isArray(conditions) ? conditions : [];
    }

    if (actions !== undefined) {
      if (!Array.isArray(actions) || actions.length === 0) {
        return apiValidationError('\u064A\u062C\u0628 \u062A\u062D\u062F\u064A\u062F \u0625\u062C\u0631\u0627\u0621 \u0648\u0627\u062D\u062F \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644');
      }
      updates.actions = actions;
    }

    if (is_enabled !== undefined) {
      updates.is_enabled = Boolean(is_enabled);
    }

    const { data: rule, error } = await supabase
      .from('pyra_automation_rules')
      .update(updates)
      .eq('id', id)
      .select(
        'id, name, description, trigger_event, conditions, actions, is_enabled, created_by, created_at, updated_at'
      )
      .single();

    if (error) {
      console.error('Automation rule update error:', error);
      return apiServerError();
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'automation_rule_updated',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: id,
      details: {
        updated_fields: Object.keys(updates).filter((k) => k !== 'updated_at'),
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(rule);
  } catch (err) {
    console.error('PATCH /api/automations/[id] error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/automations/[id]
// Delete automation rule and its logs. Admin only.
// =============================================================
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // Verify rule exists
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_automation_rules')
      .select('id, name')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0623\u062A\u0645\u062A\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629');
    }

    // Cascade: delete associated logs
    await supabase
      .from('pyra_automation_log')
      .delete()
      .eq('rule_id', id);

    // Delete the rule itself
    const { error } = await supabase
      .from('pyra_automation_rules')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Automation rule delete error:', error);
      return apiServerError();
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'automation_rule_deleted',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: id,
      details: { rule_name: existing.name },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/automations/[id] error:', err);
    return apiServerError();
  }
}
