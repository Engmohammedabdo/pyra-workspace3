/**
 * lib/constants/pipeline-colors.ts
 *
 * Visual constants for pipeline stage rendering. Single source of truth
 * for the small palette of accent colors that stage rows / column headers
 * / mobile sheet rows use to communicate stage identity. Phase 10 Commit 1
 * relocated this here from `components/crm/pipeline/pipeline-board.tsx`
 * during the Reviewer's "stop silent-drift across consumers" fix —
 * follows the project convention that constants live in `lib/constants/`
 * (cf. `lib/constants/statuses.ts` for entity statuses, activity actions,
 * etc.) so UI components import constants, not the other way around.
 *
 * Adding a new accent: define the Tailwind class once here, then any
 * stage row referencing that color key automatically renders consistently
 * across desktop kanban columns and the mobile <MobileStageSheet>.
 */

/**
 * Tailwind class for the colored dot rendered next to a stage label.
 * Keys must match the `color` field on `PipelineStage` rows in
 * `pyra_sales_pipeline_stages`. Unknown keys fall back to `bg-current`
 * at the call site.
 */
export const ACCENT_DOT: Record<string, string> = {
  sky:     'bg-sky-500',
  indigo:  'bg-indigo-500',
  amber:   'bg-amber-500',
  orange:  'bg-orange-500',
  emerald: 'bg-emerald-500',
  gold:    'bg-yellow-500',
  stone:   'bg-stone-400',
};
