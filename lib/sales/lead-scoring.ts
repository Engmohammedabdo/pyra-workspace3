/**
 * Lead Scoring Algorithm
 *
 * Calculates a score (0-100) for a sales lead based on multiple criteria.
 * Higher scores indicate leads more likely to convert.
 */

interface LeadData {
  source: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  stage_id: string;
  is_converted: boolean;
  last_contact_at?: string | null;
  created_at: string;
}

interface ScoringContext {
  activityCount: number;
  quoteCount: number;
  stageSortOrder: number; // 0-based index in pipeline
  totalStages: number;
}

interface ScoreBreakdown {
  total: number;
  source: number;
  contactInfo: number;
  engagement: number;
  pipeline: number;
  recency: number;
}

/**
 * Calculate lead score based on multiple weighted criteria.
 */
export function calculateLeadScore(
  lead: LeadData,
  ctx: ScoringContext
): ScoreBreakdown {
  let source = 0;
  let contactInfo = 0;
  let engagement = 0;
  let pipeline = 0;
  let recency = 0;

  // ── 1. Source quality (max 15) ──
  const sourceScores: Record<string, number> = {
    website: 15,
    whatsapp: 12,
    referral: 10,
    social: 8,
    ad: 8,
    manual: 3,
  };
  source = sourceScores[lead.source] || 5;

  // ── 2. Contact information completeness (max 15) ──
  if (lead.email) contactInfo += 5;
  if (lead.phone) contactInfo += 5;
  if (lead.company) contactInfo += 5;

  // ── 3. Engagement — activities & quotes (max 30) ──
  // Activities: +3 per activity, max 15
  engagement += Math.min(15, ctx.activityCount * 3);
  // Quotes: +8 per quote, max 15
  engagement += Math.min(15, ctx.quoteCount * 8);

  // ── 4. Pipeline progress (max 25) ──
  if (lead.is_converted) {
    pipeline = 25;
  } else if (ctx.totalStages > 1) {
    // Score proportionally to stage position
    pipeline = Math.round((ctx.stageSortOrder / (ctx.totalStages - 1)) * 25);
  }

  // ── 5. Recency — days since last contact (max 15, can be negative) ──
  const now = Date.now();
  const lastContact = lead.last_contact_at
    ? new Date(lead.last_contact_at).getTime()
    : new Date(lead.created_at).getTime();
  const daysSinceContact = Math.floor((now - lastContact) / 86400000);

  if (daysSinceContact <= 1) recency = 15;
  else if (daysSinceContact <= 3) recency = 12;
  else if (daysSinceContact <= 7) recency = 10;
  else if (daysSinceContact <= 14) recency = 5;
  else if (daysSinceContact <= 30) recency = 0;
  else recency = -5; // Penalty for stale leads

  const total = Math.max(0, Math.min(100, source + contactInfo + engagement + pipeline + recency));

  return { total, source, contactInfo, engagement, pipeline, recency };
}

/**
 * Get score color/label for UI display.
 */
export function getScoreColor(score: number): { color: string; label: string; bgClass: string } {
  if (score >= 70) return { color: 'text-green-600', label: 'ساخن', bgClass: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' };
  if (score >= 40) return { color: 'text-orange-600', label: 'دافئ', bgClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' };
  return { color: 'text-red-600', label: 'بارد', bgClass: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' };
}
