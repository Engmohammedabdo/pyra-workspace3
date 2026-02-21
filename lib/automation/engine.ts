import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { evaluateConditions } from './conditions';
import { executeAction } from './actions';

export interface AutomationEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Fire-and-forget: process an automation event.
 * Finds all enabled rules matching the trigger_event,
 * evaluates conditions, executes actions, and logs results.
 */
export function processEvent(event: AutomationEvent): void {
  _processEventAsync(event).catch((err) => {
    console.error('[automation] processEvent error:', err);
  });
}

async function _processEventAsync(event: AutomationEvent): Promise<void> {
  const supabase = createServiceRoleClient();

  // Find matching enabled rules
  const { data: rules } = await supabase
    .from('pyra_automation_rules')
    .select('id, name, trigger_event, conditions, actions')
    .eq('trigger_event', event.type)
    .eq('is_enabled', true);

  if (!rules || rules.length === 0) return;

  for (const rule of rules) {
    const logId = generateId('al');
    const actionsExecuted: Array<{
      type: string;
      success: boolean;
      error?: string;
    }> = [];
    let status = 'success';
    let errorMessage = '';

    try {
      // Evaluate conditions
      const conditionsMet = evaluateConditions(
        rule.conditions as Array<{
          field: string;
          operator: string;
          value: unknown;
        }>,
        event.data
      );

      if (!conditionsMet) continue;

      // Execute each action
      for (const action of rule.actions as Array<{
        type: string;
        config: Record<string, unknown>;
      }>) {
        try {
          await executeAction(action, event.data, supabase);
          actionsExecuted.push({ type: action.type, success: true });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          actionsExecuted.push({ type: action.type, success: false, error: msg });
          status = 'partial_failure';
          errorMessage += `${action.type}: ${msg}; `;
        }
      }
    } catch (err: unknown) {
      status = 'failed';
      errorMessage = err instanceof Error ? err.message : 'Unknown error';
    }

    // Log execution
    await supabase.from('pyra_automation_log').insert({
      id: logId,
      rule_id: rule.id,
      rule_name: rule.name,
      trigger_event: event.type,
      trigger_data: event.data,
      actions_executed: actionsExecuted,
      status,
      error_message: errorMessage || null,
    });
  }
}
