// ============================================================
// Centralized Chart Color Palette — Single source of truth
// Use these in ALL Recharts/chart components instead of hardcoded hex.
// ============================================================

/** Primary chart palette — use for pie charts, bar series, and multi-line charts */
export const CHART_COLORS = [
  'hsl(24, 95%, 53%)',    // orange-500
  'hsl(217, 91%, 60%)',   // blue-500
  'hsl(142, 71%, 45%)',   // green-500
  'hsl(48, 96%, 53%)',    // yellow-500
  'hsl(271, 91%, 65%)',   // purple-500
  'hsl(330, 81%, 60%)',   // pink-500
  'hsl(189, 94%, 43%)',   // cyan-500
  'hsl(0, 84%, 60%)',     // red-500
] as const;

/** Brand primary color for single-series charts */
export const CHART_PRIMARY = 'hsl(24, 95%, 53%)'; // orange-500

/** Status-semantic colors for status-based charts */
export const CHART_STATUS_COLORS = {
  active: 'hsl(142, 71%, 45%)',     // green-500
  in_progress: 'hsl(217, 91%, 60%)', // blue-500
  completed: 'hsl(142, 76%, 36%)',   // green-600
  pending: 'hsl(48, 96%, 53%)',      // yellow-500
  cancelled: 'hsl(0, 84%, 60%)',     // red-500
  draft: 'hsl(220, 9%, 46%)',        // gray-500
  overdue: 'hsl(0, 72%, 51%)',       // red-600
  paused: 'hsl(25, 95%, 53%)',       // orange-500
} as const;

/** Tooltip styling for Recharts — auto-adapts to theme */
export const CHART_TOOLTIP_STYLE = {
  borderRadius: '8px',
  border: '1px solid hsl(var(--border))',
  backgroundColor: 'hsl(var(--card))',
  color: 'hsl(var(--card-foreground))',
  fontSize: '13px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
} as const;

/** Grid/Axis styling */
export const CHART_GRID_STYLE = {
  strokeDasharray: '3 3',
  stroke: 'hsl(var(--border))',
  opacity: 0.3,
} as const;
