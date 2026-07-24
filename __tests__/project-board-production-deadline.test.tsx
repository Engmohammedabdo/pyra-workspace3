import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import boardsMessages from '@/messages/en/boards.json';

const mocks = vi.hoisted(() => ({
  mutateAPI: vi.fn(),
  setQueryData: vi.fn(),
  tasks: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/useBoards', () => ({
  useBoards: () => ({
    data: [{
      id: 'bd_production',
      name: 'Production',
      template: 'production',
      pyra_board_columns: [{
        id: 'col_prod_new',
        name: 'New',
        color: 'gray',
        position: 0,
        is_done_column: false,
      }],
    }],
    isLoading: false,
    refetch: vi.fn(),
  }),
  useCreateBoard: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: () => ({ data: mocks.tasks, refetch: vi.fn() }),
    useQueryClient: () => ({ setQueryData: mocks.setQueryData }),
  };
});

vi.mock('@/hooks/api-helpers', () => ({
  fetchAPI: vi.fn(async () => []),
  mutateAPI: mocks.mutateAPI,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ProjectBoardEmbed } from '@/app/dashboard/projects/[id]/project-board-embed';

describe('project production board exact deadline', () => {
  afterEach(() => {
    cleanup();
    mocks.mutateAPI.mockReset();
    mocks.setQueryData.mockReset();
    mocks.tasks = [];
  });

  it('requires and submits the UAE date and time instead of title-only create', async () => {
    mocks.mutateAPI.mockResolvedValue({ id: 'task-1' });
    render(
      <NextIntlClientProvider locale="en" messages={boardsMessages}>
        <ProjectBoardEmbed projectId="project-1" />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'إضافة مهمة' }));
    fireEvent.change(screen.getByPlaceholderText('عنوان المهمة...'), {
      target: { value: 'Production task' },
    });

    expect(screen.getByRole('button', { name: 'إضافة' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Delivery date (UAE)'), {
      target: { value: '2026-07-23' },
    });
    fireEvent.change(screen.getByLabelText('Delivery time (UAE)'), {
      target: { value: '18:45' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(mocks.mutateAPI).toHaveBeenCalledWith(
      '/api/boards/bd_production/tasks',
      'POST',
      {
        title: 'Production task',
        column_id: 'col_prod_new',
        due_date: '2026-07-23',
        due_time: '18:45',
      },
    ));
  });

  it('shows an explicit warning for a null-date unverified legacy task', async () => {
    mocks.tasks = [{
      id: 'task-unverified',
      title: 'Legacy production task',
      column_id: 'col_prod_new',
      position: 0,
      priority: 'medium',
      due_date: null,
      due_at: null,
      production_deadline_exempt: true,
      is_archived: false,
      pyra_task_assignees: [],
      pyra_task_labels: [],
      pyra_task_checklist: [],
      pyra_task_comments: [],
    }];

    render(
      <NextIntlClientProvider locale="en" messages={boardsMessages}>
        <ProjectBoardEmbed projectId="project-1" />
      </NextIntlClientProvider>,
    );

    const warning = await screen.findByText('Unverified deadline — set exact date and time');
    expect(warning).toHaveClass('text-amber-700');
    expect(warning).not.toHaveClass('text-red-500');
  });
});
