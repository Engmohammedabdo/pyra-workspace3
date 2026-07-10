/**
 * Pipeline card "next step" derivation (Pyra Pro redesign).
 *
 * The design shows a "التالي: …" (Next: …) line on every pipeline card, but
 * there is NO backing field for it in the schema (product decision: derive a
 * sensible default, no schema change — v2 may add a real free-text field).
 *
 * Rules (in priority order):
 *   1. An OVERDUE follow-up wins → 'overdue' (rendered in the at-risk color).
 *   2. Otherwise the step is derived from the lead's position in the pipeline:
 *      first stage → contact, then qualify, proposal, negotiate; the final
 *      stage → complete.
 *
 * Pure + deterministic (inject `nowMs` in tests). The returned `key` maps to
 * an i18n message under `crm.pipeline.nextStep.<key>`.
 */

export type NextStepKey =
  | 'overdue'
  | 'contact'
  | 'qualify'
  | 'proposal'
  | 'negotiate'
  | 'complete';

/** Stage-position ladder for the non-overdue case (index-clamped). */
const STAGE_LADDER: NextStepKey[] = ['contact', 'qualify', 'proposal', 'negotiate'];

export interface NextStepInput {
  /** 0-based position of the lead's stage in the ordered pipeline (-1 if unknown). */
  stageIndex: number;
  /** total number of pipeline stages. */
  stageCount: number;
  /** lead.next_follow_up (ISO) — may be null/undefined. */
  nextFollowUpIso?: string | null;
  /** injectable clock for tests; defaults to Date.now(). */
  nowMs?: number;
}

export interface NextStepResult {
  key: NextStepKey;
  /** true when an overdue follow-up drives the result (render in at-risk color). */
  overdue: boolean;
}

export function deriveNextStep({
  stageIndex,
  stageCount,
  nextFollowUpIso,
  nowMs,
}: NextStepInput): NextStepResult {
  const now = nowMs ?? Date.now();

  // 1. Overdue follow-up wins.
  if (nextFollowUpIso) {
    const due = Date.parse(nextFollowUpIso);
    if (!Number.isNaN(due) && due < now) {
      return { key: 'overdue', overdue: true };
    }
  }

  // 2. Final stage → complete.
  const last = Math.max(0, stageCount - 1);
  if (stageCount > 0 && stageIndex >= last) {
    return { key: 'complete', overdue: false };
  }

  // 3. Position ladder (unknown/negative index clamps to the first rung).
  const idx = Math.max(0, Math.min(stageIndex, STAGE_LADDER.length - 1));
  return { key: STAGE_LADDER[idx], overdue: false };
}
