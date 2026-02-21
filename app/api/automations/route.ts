import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// GET /api/automations
// List all automation rules with pagination.
// Returns rules ordered by created_at DESC with execution counts.
// Admin only.
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;

    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '20')));
    const offset = (page - 1) * limit;

    // Fetch rules
    const { data: rules, count, error } = await supabase
      .from('pyra_automation_rules')
      .select(
        'id, name, description, trigger_event, conditions, actions, is_enabled, created_by, created_at, updated_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Automation rules list error:', error);
      return apiServerError();
    }

    // Fetch execution counts per rule
    const ruleIds = (rules || []).map((r) => r.id);
    let executionCounts: Record<string, number> = {};

    if (ruleIds.length > 0) {
      const { data: logCounts } = await supabase
        .from('pyra_automation_log')
        .select('rule_id')
        .in('rule_id', ruleIds);

      if (logCounts) {
        executionCounts = logCounts.reduce(
          (acc: Record<string, number>, log) => {
            acc[log.rule_id] = (acc[log.rule_id] || 0) + 1;
            return acc;
          },
          {}
        );
      }
    }

    // Merge execution counts into rules
    const enrichedRules = (rules || []).map((rule) => ({
      ...rule,
      execution_count: executionCounts[rule.id] || 0,
    }));

    return apiSuccess(enrichedRules, {
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error('GET /api/automations error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/automations
// Create a new automation rule. Admin only.
// Body: { name, description?, trigger_event, conditions, actions, is_enabled? }
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const body = await request.json();
    const { name, description, trigger_event, conditions, actions, is_enabled } =
      body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return apiValidationError('\u0627\u0633\u0645 \u0627\u0644\u0642\u0627\u0639\u062F\u0629 \u0645\u0637\u0644\u0648\u0628');
    }

    if (
      !trigger_event ||
      typeof trigger_event !== 'string' ||
      trigger_event.trim().length === 0
    ) {
      return apiValidationError('\u062D\u062F\u062B \u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0645\u0637\u0644\u0648\u0628');
    }

    if (!actions || !Array.isArray(actions) || actions.length === 0) {
      return apiValidationError('\u064A\u062C\u0628 \u062A\u062D\u062F\u064A\u062F \u0625\u062C\u0631\u0627\u0621 \u0648\u0627\u062D\u062F \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644');
    }

    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();
    const ruleId = generateId('ar');

    const newRule = {
      id: ruleId,
      name: name.trim(),
      description: description?.trim() || null,
      trigger_event: trigger_event.trim(),
      conditions: Array.isArray(conditions) ? conditions : [],
      actions,
      is_enabled: is_enabled !== undefined ? Boolean(is_enabled) : true,
      created_by: admin.pyraUser.username,
      created_at: now,
      updated_at: now,
    };

    const { data: rule, error } = await supabase
      .from('pyra_automation_rules')
      .insert(newRule)
      .select(
        'id, name, description, trigger_event, conditions, actions, is_enabled, created_by, created_at, updated_at'
      )
      .single();

    if (error) {
      console.error('Automation rule create error:', error);
      return apiServerError();
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'automation_rule_created',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: ruleId,
      details: { rule_name: name.trim(), trigger_event: trigger_event.trim() },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(rule, undefined, 201);
  } catch (err) {
    console.error('POST /api/automations error:', err);
    return apiServerError();
  }
}
