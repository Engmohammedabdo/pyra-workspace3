import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import boardsMessages from '@/messages/en/boards.json';
import navMessages from '@/messages/en/nav.json';

const messages = { ...boardsMessages, ...navMessages };

const mocks = vi.hoisted(() => ({
  board: {
    id: 'bd_production',
    name: 'Production',
    description: null,
    view_mode: 'kanban',
    is_pipeline: false,
    pyra_board_columns: [{
      id: 'col-working',
      name: 'Working',
      color: 'blue',
      position: 0,
      is_done_column: false,
    }],
    pyra_board_labels: [],
  },
  tasks: [{
    id: 'task-unverified',
    title: 'Legacy production task',
    column_id: 'col-working',
    position: 0,
    priority: 'medium',
    due_date: null,
    due_at: null,
    production_deadline_exempt: true,
    pyra_task_assignees: [],
    pyra_task_labels: [],
    pyra_task_checklist: [],
    pyra_task_comments: [],
  }],
}));

vi.mock('@/hooks/useBoardTasks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBoardTasks')>();
  return {
    ...actual,
    useBoardDetails: () => ({
      data: mocks.board,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useBoardTasks: () => ({
      data: mocks.tasks,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
  };
});

vi.mock('@/hooks/useBoardTaskMutations', () => ({
  useCreateBoardTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMoveBoardTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: () => ({ data: [], isLoading: false, isError: false }),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useRealtime', () => ({ useRealtimeBoardTasks: vi.fn() }));
vi.mock('@/hooks/useDeadlineClock', () => ({
  useDeadlineClock: () => '2026-07-22T10:00:00.000Z',
}));
vi.mock('@/hooks/api-helpers', () => ({ fetchAPI: vi.fn(), mutateAPI: vi.fn() }));
vi.mock('@/lib/i18n/status-labels', () => ({
  useStatusLabels: () => (value: string) => value,
}));
vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: vi.fn(),
  }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import BoardViewClient from '@/app/dashboard/boards/[id]/board-view-client';

describe('board kanban unverified deadline', () => {
  beforeEach(() => {
    mocks.board.view_mode = 'kanban';
    mocks.board.is_pipeline = false;
  });

  afterEach(() => cleanup());

  it('shows an amber explicit warning instead of a normal or overdue deadline badge', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BoardViewClient
          boardId="bd_production"
          session={{ pyraUser: { rolePermissions: ['*'] } } as never}
        />
      </NextIntlClientProvider>,
    );

    const warning = await screen.findByText('Unverified deadline — set exact date and time');
    expect(warning.closest('span')).toHaveClass('text-amber-700');
    expect(warning.closest('span')).not.toHaveClass('text-orange-600');
    expect(warning.closest('span')).not.toHaveClass('text-red-600');
  });

  it('keeps the same explicit amber warning in pipeline view', async () => {
    mocks.board.view_mode = 'pipeline';
    mocks.board.is_pipeline = true;

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BoardViewClient
          boardId="bd_production"
          session={{ pyraUser: { rolePermissions: ['*'] } } as never}
        />
      </NextIntlClientProvider>,
    );

    const warning = await screen.findByText('Unverified deadline — set exact date and time');
    expect(warning.parentElement).toHaveClass('text-amber-700');
    expect(warning.parentElement).not.toHaveClass('text-orange-600');
    expect(warning.parentElement).not.toHaveClass('text-red-600');
  });
});
