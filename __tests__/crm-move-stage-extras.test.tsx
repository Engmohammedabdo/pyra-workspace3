/**
 * runMoveStage forwards every extras field the route can require.
 *
 * Guards the defect this feature closed: MoveStageInput has always declared
 * `reopen_reason`, but the toast-wrapped runner only spread `attachment` and
 * `lost_reason`. The route rejects a move out of stg_closed_won without a
 * reason, so a won deal was immovable in every surface — the board's drag
 * came back 422 and no screen could satisfy it.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import crmMessages from '@/messages/en/crm.json';

const mutateAPI = vi.fn();

vi.mock('@/hooks/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/api-helpers')>();
  return { ...actual, mutateAPI: (...args: unknown[]) => mutateAPI(...args) };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/usePipelineStages', () => ({
  usePipelineStages: () => ({ data: [] }),
}));

vi.mock('@/lib/i18n/status-labels', () => ({
  useStatusLabels: () => (value: string) => value,
}));

import { useMoveLeadStageWithToasts } from '@/hooks/useLeads';

function renderRunner() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderHook(() => useMoveLeadStageWithToasts(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={crmMessages}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    ),
  });
}

/** The body POSTed to /api/crm/leads/[id]/move-stage on the last call. */
function lastBody() {
  return mutateAPI.mock.calls.at(-1)?.[2] as Record<string, unknown>;
}

describe('runMoveStage extras forwarding', () => {
  beforeEach(() => {
    mutateAPI.mockReset();
    mutateAPI.mockResolvedValue({ lead: { id: 'sl_1', name: 'Acme' } });
  });

  it('sends reopen_reason when a won deal is reopened', async () => {
    const { result } = renderRunner();

    await result.current.runMoveStage('sl_1', 'stg_negotiation', 'stg_closed_won', {
      reopen_reason: 'client came back with a new budget',
    });

    await waitFor(() => expect(mutateAPI).toHaveBeenCalledTimes(1));
    expect(mutateAPI.mock.calls[0][0]).toBe('/api/crm/leads/sl_1/move-stage');
    expect(mutateAPI.mock.calls[0][1]).toBe('POST');
    expect(lastBody()).toEqual({
      to_stage_id: 'stg_negotiation',
      reopen_reason: 'client came back with a new budget',
    });
  });

  it('sends lost_reason when a deal is marked lost', async () => {
    const { result } = renderRunner();

    await result.current.runMoveStage('sl_2', 'stg_closed_lost', 'stg_negotiation', {
      lost_reason: 'price was too high',
    });

    await waitFor(() => expect(mutateAPI).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({
      to_stage_id: 'stg_closed_lost',
      lost_reason: 'price was too high',
    });
  });

  it('sends the attachment when a contract is signed', async () => {
    const { result } = renderRunner();

    await result.current.runMoveStage('sl_3', 'stg_contract_signed', 'stg_negotiation', {
      attachment: { type: 'contract', id: 'ct_9' },
    });

    await waitFor(() => expect(mutateAPI).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({
      to_stage_id: 'stg_contract_signed',
      attachment: { type: 'contract', id: 'ct_9' },
    });
  });

  it('sends nothing extra on a routine move', async () => {
    const { result } = renderRunner();

    await result.current.runMoveStage('sl_4', 'stg_discovery_call', 'stg_new_inquiry');

    await waitFor(() => expect(mutateAPI).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ to_stage_id: 'stg_discovery_call' });
  });
});
