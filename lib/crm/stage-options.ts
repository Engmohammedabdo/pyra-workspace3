import { PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';

/**
 * Why a stage is not offered. Each value maps to a message key under
 * `crm.pipeline.stagePicker.disabledReasons.*`.
 */
export type StageDisabledReason =
  | 'closedWonViaApproval'
  | 'contractNeedsAdmin'
  | 'leadArchived';

export interface StageOption {
  id: string;
  disabled: boolean;
  reason: StageDisabledReason | null;
}

export interface BuildStageOptionsInput {
  /** Stage rows from usePipelineStages(). Only `id` is read. */
  stages: Array<{ id: string }>;
  /** The lead's current stage — omitted from the result. */
  currentStageId: string | null;
  /** finance.view OR invoices.view — the attachment picker needs one of them. */
  canAttachFinance: boolean;
  /** An archived lead is out of the pipeline; nothing is offered. */
  isArchived?: boolean;
}

/**
 * Decide which stages a lead can be moved to, and why one is refused.
 *
 * Mirrors the server's validation matrix in
 * app/api/crm/leads/[id]/move-stage/route.ts so the UI never offers a move
 * the API will reject:
 *
 *   - stg_closed_won is ALWAYS rejected by the route — the approval flow
 *     (/dashboard/crm/approvals) owns that transition.
 *   - stg_contract_signed requires an attachment, and the picker that supplies
 *     it reads /api/finance/contracts + /api/invoices. A sales_agent has
 *     neither finance.view nor invoices.view (lib/auth/rbac.ts ROLE_EXTRAS),
 *     so offering the stage would only produce a load error.
 *
 * Reopening (moving a lead OUT of stg_closed_won) is gated at the button, not
 * here: an admin reopening a deal may send it to any offered stage.
 */
export function buildStageOptions({
  stages,
  currentStageId,
  canAttachFinance,
  isArchived = false,
}: BuildStageOptionsInput): StageOption[] {
  return stages
    .filter((stage) => stage.id !== currentStageId)
    .map<StageOption>((stage) => {
      if (isArchived) {
        return { id: stage.id, disabled: true, reason: 'leadArchived' };
      }
      if (stage.id === PIPELINE_STAGE_IDS.CLOSED_WON) {
        return { id: stage.id, disabled: true, reason: 'closedWonViaApproval' };
      }
      if (stage.id === PIPELINE_STAGE_IDS.CONTRACT_SIGNED && !canAttachFinance) {
        return { id: stage.id, disabled: true, reason: 'contractNeedsAdmin' };
      }
      return { id: stage.id, disabled: false, reason: null };
    });
}
