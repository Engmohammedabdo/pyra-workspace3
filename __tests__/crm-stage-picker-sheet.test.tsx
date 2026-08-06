/**
 * StagePickerSheet — the one stage list shared by the pipeline card and the
 * lead detail page.
 *
 * Covers the access-control surface that would otherwise only be verifiable by
 * clicking through as each role: a refused stage stays visible with its reason
 * and cannot be selected, while an offered stage fires the callback.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import crmMessages from '@/messages/en/crm.json';
import { buildStageOptions } from '@/lib/crm/stage-options';
import StagePickerSheet from '@/components/crm/pipeline/stage-picker-sheet';
import type { PipelineStage } from '@/hooks/usePipelineStages';

const STAGES: PipelineStage[] = [
  { id: 'stg_new_inquiry', name: 'New inquiry', name_ar: 'استفسار جديد', color: 'sky', sort_order: 1, is_default: true },
  { id: 'stg_discovery_call', name: 'Discovery call', name_ar: 'مكالمة استكشافية', color: 'indigo', sort_order: 2, is_default: false },
  { id: 'stg_contract_signed', name: 'Contract signed', name_ar: 'تم توقيع العقد', color: 'violet', sort_order: 3, is_default: false },
  { id: 'stg_closed_won', name: 'Closed won', name_ar: 'فوز بالصفقة', color: 'emerald', sort_order: 4, is_default: false },
  { id: 'stg_closed_lost', name: 'Closed lost', name_ar: 'خسارة', color: 'stone', sort_order: 5, is_default: false },
];

function renderSheet(over: { canAttachFinance?: boolean; isArchived?: boolean } = {}) {
  const onSelectStage = vi.fn();
  const options = buildStageOptions({
    stages: STAGES,
    currentStageId: 'stg_new_inquiry',
    canAttachFinance: over.canAttachFinance ?? true,
    isArchived: over.isArchived ?? false,
  });
  render(
    <NextIntlClientProvider locale="en" messages={crmMessages}>
      <StagePickerSheet
        open
        onOpenChange={vi.fn()}
        leadName="Acme Co"
        stages={STAGES}
        options={options}
        onSelectStage={onSelectStage}
      />
    </NextIntlClientProvider>,
  );
  return { onSelectStage };
}

/** The sheet's row <button> whose accessible name targets this stage. */
function row(stageLabel: string) {
  return screen.getByRole('button', { name: `Move to ${stageLabel}` });
}

afterEach(cleanup);

describe('StagePickerSheet', () => {
  it('does not list the stage the lead is already in', () => {
    renderSheet();
    expect(screen.queryByRole('button', { name: 'Move to New inquiry' })).toBeNull();
  });

  it('moves the lead when an offered stage is chosen', () => {
    const { onSelectStage } = renderSheet();
    fireEvent.click(row('Discovery call'));
    expect(onSelectStage).toHaveBeenCalledWith('stg_discovery_call');
  });

  it('refuses closed-won and says the approval flow owns it', () => {
    const { onSelectStage } = renderSheet();
    const won = row('Closed won');
    expect(won).toBeDisabled();
    fireEvent.click(won);
    expect(onSelectStage).not.toHaveBeenCalled();
    expect(
      screen.getByText('Done from the approvals page after the contract is signed'),
    ).toBeInTheDocument();
  });

  it('refuses contract-signed for a user without finance access, and explains why', () => {
    const { onSelectStage } = renderSheet({ canAttachFinance: false });
    const signed = row('Contract signed');
    expect(signed).toBeDisabled();
    fireEvent.click(signed);
    expect(onSelectStage).not.toHaveBeenCalled();
    expect(screen.getByText('An admin attaches the contract')).toBeInTheDocument();
  });

  it('offers contract-signed to a user who can attach one', () => {
    const { onSelectStage } = renderSheet({ canAttachFinance: true });
    expect(row('Contract signed')).not.toBeDisabled();
    fireEvent.click(row('Contract signed'));
    expect(onSelectStage).toHaveBeenCalledWith('stg_contract_signed');
  });

  it('offers nothing on an archived lead', () => {
    const { onSelectStage } = renderSheet({ isArchived: true });
    for (const label of ['Discovery call', 'Contract signed', 'Closed won', 'Closed lost']) {
      expect(row(label)).toBeDisabled();
    }
    fireEvent.click(row('Discovery call'));
    expect(onSelectStage).not.toHaveBeenCalled();
  });
});
