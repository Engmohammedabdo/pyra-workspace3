import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ────────────────────────────────────────────────

export interface SlaPolicy {
  id: string;
  name: string;
  name_ar: string | null;
  first_response_minutes: number;
  resolution_minutes: number;
  priority: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export type SlaStatus = 'ok' | 'warning' | 'breached';

// ── Snooze Helper ───────────────────────────────────────

/** Check whether a conversation is currently snoozed. */
export function isCurrentlySnoozed(snoozedUntil: string | null | undefined): boolean {
  return !!snoozedUntil && new Date(snoozedUntil) > new Date();
}

// ── Apply SLA Policy to a Conversation ───────────────────

/**
 * Find matching active SLA policy by priority, calculate due times,
 * and update the conversation with SLA fields.
 */
export async function applySlaPolicy(
  supabase: SupabaseClient,
  conversationId: string,
  priority: string
): Promise<void> {
  try {
    // Find active SLA policy matching priority (exact match, fallback to 'normal')
    let { data: policy } = await supabase
      .from('pyra_sla_policies')
      .select('*')
      .eq('is_active', true)
      .eq('priority', priority)
      .limit(1)
      .maybeSingle();

    // Fallback to 'normal' priority policy if exact match not found
    if (!policy && priority !== 'normal') {
      const { data: fallback } = await supabase
        .from('pyra_sla_policies')
        .select('*')
        .eq('is_active', true)
        .eq('priority', 'normal')
        .limit(1)
        .maybeSingle();
      policy = fallback;
    }

    if (!policy) return;

    const now = new Date();
    const firstResponseDue = new Date(now.getTime() + policy.first_response_minutes * 60 * 1000);
    const resolutionDue = new Date(now.getTime() + policy.resolution_minutes * 60 * 1000);

    await supabase
      .from('pyra_whatsapp_conversations')
      .update({
        sla_policy_id: policy.id,
        sla_first_response_due: firstResponseDue.toISOString(),
        sla_resolution_due: resolutionDue.toISOString(),
        sla_first_response_breached: false,
        sla_resolution_breached: false,
      })
      .eq('id', conversationId);
  } catch (err) {
    console.error('[SLA] Failed to apply policy:', err);
  }
}

// ── Get SLA Status ───────────────────────────────────────

/**
 * Calculate current SLA status based on due times.
 * Returns 'ok', 'warning' (within 80% of time), or 'breached'.
 */
export function getSlaStatus(conversation: {
  sla_first_response_due?: string | null;
  sla_resolution_due?: string | null;
  sla_first_response_breached?: boolean;
  sla_resolution_breached?: boolean;
  first_reply_at?: string | null;
  resolved_at?: string | null;
  created_at?: string | null;
}): SlaStatus {
  // If already breached
  if (conversation.sla_first_response_breached || conversation.sla_resolution_breached) {
    return 'breached';
  }

  const now = Date.now();
  // Use created_at as the start time; fallback to 1 hour before due if unknown
  const created = conversation.created_at
    ? new Date(conversation.created_at).getTime()
    : 0;

  // Check first response SLA (only if not yet replied)
  if (!conversation.first_reply_at && conversation.sla_first_response_due) {
    const due = new Date(conversation.sla_first_response_due).getTime();
    if (now > due) return 'breached';
    // Warning when 80% of the total SLA time has elapsed
    const total = due - (created || due - 30 * 60 * 1000);
    const elapsed = now - (created || due - 30 * 60 * 1000);
    if (total > 0 && elapsed >= total * 0.8) return 'warning';
  }

  // Check resolution SLA (only if not yet resolved)
  if (!conversation.resolved_at && conversation.sla_resolution_due) {
    const due = new Date(conversation.sla_resolution_due).getTime();
    if (now > due) return 'breached';
    const total = due - (created || due - 480 * 60 * 1000);
    const elapsed = now - (created || due - 480 * 60 * 1000);
    if (total > 0 && elapsed >= total * 0.8) return 'warning';
  }

  return 'ok';
}

// ── Get Time Remaining ───────────────────────────────────

/**
 * Calculate remaining time until SLA due and format in Arabic.
 * Returns negative minutes if breached.
 */
export function getSlaTimeRemaining(dueAt: string | null | undefined): {
  minutes: number;
  label: string;
  isOverdue: boolean;
} {
  if (!dueAt) return { minutes: 0, label: '', isOverdue: false };

  const now = Date.now();
  const due = new Date(dueAt).getTime();
  const diffMs = due - now;
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins <= 0) {
    const overdueMins = Math.abs(diffMins);
    if (overdueMins < 60) {
      return { minutes: diffMins, label: `متأخر ${overdueMins} دقيقة`, isOverdue: true };
    }
    const hours = Math.floor(overdueMins / 60);
    const mins = overdueMins % 60;
    return {
      minutes: diffMins,
      label: mins > 0 ? `متأخر ${hours} ساعة و ${mins} دقيقة` : `متأخر ${hours} ساعة`,
      isOverdue: true,
    };
  }

  if (diffMins < 60) {
    return { minutes: diffMins, label: `باقي ${diffMins} دقيقة`, isOverdue: false };
  }

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return {
    minutes: diffMins,
    label: mins > 0 ? `باقي ${hours} ساعة و ${mins} دقيقة` : `باقي ${hours} ساعة`,
    isOverdue: false,
  };
}

/**
 * Get the most urgent SLA due time for a conversation.
 * Returns the first response due if not yet replied, else resolution due.
 */
export function getActiveSlaDeadline(conversation: {
  sla_first_response_due?: string | null;
  sla_resolution_due?: string | null;
  first_reply_at?: string | null;
  resolved_at?: string | null;
}): string | null {
  // If not yet replied, use first response deadline
  if (!conversation.first_reply_at && conversation.sla_first_response_due) {
    return conversation.sla_first_response_due;
  }
  // If not yet resolved, use resolution deadline
  if (!conversation.resolved_at && conversation.sla_resolution_due) {
    return conversation.sla_resolution_due;
  }
  return null;
}
