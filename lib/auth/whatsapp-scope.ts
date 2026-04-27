import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns true if the user is allowed to act on a specific WhatsApp message.
 *
 * Rule (CRM/ERP standard for shared inbox):
 *   - Admin (role === 'admin' OR has '*' permission): always.
 *   - Agent: must be assigned to the conversation that holds the message.
 *
 * Used by message-level mutation endpoints (react, forward, save-to-files,
 * etc.) which previously took a raw `messageId` and let any sales agent
 * touch any customer's messages by guessing/iterating IDs.
 *
 * Returns false if:
 *   - The message doesn't exist
 *   - The conversation doesn't exist
 *   - The agent isn't assigned and isn't admin
 *
 * Caller should treat false as "not found" (apiNotFound) to avoid leaking
 * the existence of the message ID.
 */
export async function canAccessWhatsAppMessage(
  supabase: SupabaseClient,
  username: string,
  isAdmin: boolean,
  messageId: string,
): Promise<boolean> {
  if (!messageId || !username) return false;
  if (isAdmin) return true;

  const { data: msg } = await supabase
    .from('pyra_whatsapp_messages')
    .select('conversation_id')
    .eq('id', messageId)
    .maybeSingle();

  if (!msg?.conversation_id) return false;

  const { data: conv } = await supabase
    .from('pyra_whatsapp_conversations')
    .select('assigned_to')
    .eq('id', msg.conversation_id)
    .maybeSingle();

  return !!conv && conv.assigned_to === username;
}
