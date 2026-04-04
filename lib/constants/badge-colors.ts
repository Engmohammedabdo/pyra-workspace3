// ============================================================
// Centralized Badge/Status Colors — Single source of truth
// Use getStatusBadgeClass() in ALL status badge renders.
// ============================================================

/** Base color mappings for status categories */
const STATUS_COLOR_MAP: Record<string, string> = {
  // ── Success / Active ──
  active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  signed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  connected: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  won: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  resolved: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  verified: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',

  // ── Warning / Pending ──
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  pending_approval: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  partially_paid: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  calculated: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  review: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',

  // ── Info / Sent / Viewed ──
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  viewed: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  invoiced: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  acknowledged: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  received: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  issued: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  applied: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  published: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  contacted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  qualified: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  proposal: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  negotiation: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',

  // ── Error / Danger ──
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  lost: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  revision_requested: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',

  // ── Neutral / Draft ──
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  new: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  disconnected: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

/**
 * Get the Tailwind classes for a status badge.
 * Uses a centralized mapping so all modules render status consistently.
 *
 * @param status - The status string (e.g., 'draft', 'paid', 'overdue')
 * @returns Tailwind className string for background + text colors with dark mode
 *
 * @example
 * <Badge className={getStatusBadgeClass('paid')}>مدفوعة</Badge>
 */
export function getStatusBadgeClass(status: string): string {
  return STATUS_COLOR_MAP[status] || STATUS_COLOR_MAP.draft;
}

/**
 * Get the dot/indicator color for status (for small dots, borders, etc.)
 */
export function getStatusDotColor(status: string): string {
  const dotMap: Record<string, string> = {
    active: 'bg-green-500',
    approved: 'bg-green-500',
    completed: 'bg-green-500',
    paid: 'bg-green-500',
    pending: 'bg-yellow-500',
    in_progress: 'bg-blue-500',
    sent: 'bg-blue-500',
    overdue: 'bg-red-500',
    rejected: 'bg-red-500',
    cancelled: 'bg-red-500',
    draft: 'bg-gray-400',
  };
  return dotMap[status] || 'bg-gray-400';
}
