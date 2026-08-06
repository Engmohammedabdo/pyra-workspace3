/**
 * MoveStageConfirmModal — the reopen variant added alongside contract_signed
 * and closed_lost.
 *
 * The reopen path is the one the product had no screen for at all, so this
 * pins its two load-bearing properties: the destructive side effects are
 * disclosed before confirming, and the emitted payload carries the field the
 * route demands (`reopen_reason`, not `lost_reason` — both variants share one
 * textarea, so a mis-wired branch would silently send the wrong key).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import crmMessages from '@/messages/en/crm.json';
import type { PyraSalesLead } from '@/types/database';

vi.mock('@/lib/i18n/status-labels', () => ({
  useStatusLabels: () => (value: string) => value,
}));

import {
  MoveStageConfirmModal,
  type MoveStageConfirmMode,
} from '@/components/crm/pipeline/move-stage-confirm-modal';

const LEAD = { id: 'sl_1', name: 'Acme Co', client_id: null } as unknown as PyraSalesLead;

function renderModal(mode: MoveStageConfirmMode) {
  const onConfirm = vi.fn();
  // The contract/invoice pickers mount their useQuery unconditionally (the
  // `enabled` gate only suppresses the fetch), so a client is always needed.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={crmMessages}>
        <MoveStageConfirmModal
          open
          onOpenChange={vi.fn()}
          lead={LEAD}
          mode={mode}
          onConfirm={onConfirm}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onConfirm };
}

afterEach(cleanup);

describe('MoveStageConfirmModal — reopen mode', () => {
  it('warns that reopening undoes the conversion before anything is confirmed', () => {
    renderModal('reopen');
    expect(screen.getByText('Reopen a closed deal')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Reopening removes the deal from the customers list and resets its win probability.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps confirm disabled until the reason is long enough', () => {
    renderModal('reopen');
    const confirm = screen.getByRole('button', { name: 'Reopen' });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'oops' } });
    expect(confirm).toBeDisabled();
  });

  it('emits reopen_reason — not lost_reason — once the reason is given', () => {
    const { onConfirm } = renderModal('reopen');
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'client came back with a new budget' },
    });

    const confirm = screen.getByRole('button', { name: 'Reopen' });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith({
      mode: 'reopen',
      reopen_reason: 'client came back with a new budget',
    });
  });
});

describe('MoveStageConfirmModal — closed_lost mode still intact', () => {
  it('emits lost_reason from the shared textarea', () => {
    const { onConfirm } = renderModal('closed_lost');
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'price was too high' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move to "Lost"' }));

    expect(onConfirm).toHaveBeenCalledWith({
      mode: 'closed_lost',
      lost_reason: 'price was too high',
    });
  });

  it('does not show the reopen warning', () => {
    renderModal('closed_lost');
    expect(screen.queryByText(/Reopening removes the deal/)).toBeNull();
  });
});
