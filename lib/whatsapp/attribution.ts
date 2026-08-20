/**
 * The single WhatsApp attribution rule. An outgoing message is credited to:
 *   1. the explicit actor when it was sent THROUGH the system (send route), else
 *   2. the line holder — a colour line (one agent's phone) IS that agent, else
 *   3. the conversation assignee — the shared company line's per-conversation owner, else
 *   4. null — unassigned shared-line activity (the "company/unassigned" bucket).
 * Empty strings are treated as absent.
 */
export function resolveOutgoingAgent(input: {
  actorUsername?: string | null;
  lineHolder?: string | null;
  conversationAssignee?: string | null;
}): string | null {
  return (
    (input.actorUsername || null) ??
    (input.lineHolder || null) ??
    (input.conversationAssignee || null) ??
    null
  );
}
