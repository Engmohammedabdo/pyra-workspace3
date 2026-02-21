import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';

interface ActionConfig {
  type: string;
  config: Record<string, unknown>;
}

/**
 * Execute a single automation action.
 * Dispatches to the appropriate handler based on action.type.
 */
export async function executeAction(
  action: ActionConfig,
  eventData: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<void> {
  switch (action.type) {
    case 'create_notification':
      await handleCreateNotification(action.config, eventData, supabase);
      break;
    case 'change_project_status':
      await handleChangeProjectStatus(action.config, eventData, supabase);
      break;
    case 'create_invoice':
      await handleCreateInvoice(action.config, eventData, supabase);
      break;
    case 'log_activity':
      await handleLogActivity(action.config, eventData, supabase);
      break;
    case 'send_email':
      // Email sending - log as activity for now (email server may not be configured)
      await handleLogActivity(
        {
          action_type: 'automation_email',
          message: `Email action triggered: ${JSON.stringify(action.config)}`,
        },
        eventData,
        supabase
      );
      break;
    case 'fire_webhook':
      // Will be implemented with webhooks feature
      console.log(
        '[automation] fire_webhook action - will be implemented with webhooks feature'
      );
      break;
    default:
      console.warn(`[automation] Unknown action type: ${action.type}`);
  }
}

// ── Handlers ──────────────────────────────────────────────────

async function handleCreateNotification(
  config: Record<string, unknown>,
  eventData: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<void> {
  const recipient = String(config.recipient || eventData.username || '');
  if (!recipient) return;

  await supabase.from('pyra_notifications').insert({
    id: generateId('nt'),
    recipient_username: recipient,
    type: String(config.notification_type || 'automation'),
    title: interpolateTemplate(
      String(config.title || '\u0625\u0634\u0639\u0627\u0631 \u062A\u0644\u0642\u0627\u0626\u064A'),
      eventData
    ),
    message: interpolateTemplate(String(config.message || ''), eventData),
    source_username: 'system',
    source_display_name: '\u0627\u0644\u0646\u0638\u0627\u0645',
    target_path: String(eventData.target_path || eventData.file_path || ''),
    is_read: false,
  });
}

async function handleChangeProjectStatus(
  config: Record<string, unknown>,
  eventData: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<void> {
  const projectId = String(config.project_id || eventData.project_id || '');
  const newStatus = String(config.new_status || '');
  if (!projectId || !newStatus) return;

  await supabase
    .from('pyra_projects')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', projectId);
}

async function handleCreateInvoice(
  config: Record<string, unknown>,
  eventData: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<void> {
  // Simplified: log the intent. Full invoice creation is complex.
  await supabase.from('pyra_activity_log').insert({
    id: generateId('log'),
    action_type: 'automation_invoice_request',
    username: 'system',
    display_name: '\u0627\u0644\u0646\u0638\u0627\u0645',
    target_path: String(eventData.project_id || ''),
    details: { config, event: eventData },
    ip_address: '0.0.0.0',
  });
}

async function handleLogActivity(
  config: Record<string, unknown>,
  eventData: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<void> {
  await supabase.from('pyra_activity_log').insert({
    id: generateId('log'),
    action_type: String(config.action_type || 'automation'),
    username: String(eventData.username || 'system'),
    display_name: String(eventData.display_name || '\u0627\u0644\u0646\u0638\u0627\u0645'),
    target_path: String(eventData.target_path || eventData.file_path || ''),
    details: { message: config.message, event_type: eventData.type },
    ip_address: '0.0.0.0',
  });
}

// ── Template interpolation ───────────────────────────────────

/** Replace {{field}} and {{nested.field}} placeholders with event data values. */
function interpolateTemplate(
  template: string,
  data: Record<string, unknown>
): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key: string) => {
    const value = key.split('.').reduce((acc: unknown, k: string) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[k];
      return undefined;
    }, data);
    return value !== undefined ? String(value) : '';
  });
}
