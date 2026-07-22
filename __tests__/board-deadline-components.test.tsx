import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import boardsMessages from '@/messages/en/boards.json';
import calendarMessages from '@/messages/en/calendar.json';
import { BoardCalendarView } from '@/components/boards/board-calendar-view';
import { BoardListView } from '@/components/boards/board-list-view';

vi.mock('@/hooks/useBoardTaskMutations', () => ({
  useMoveBoardTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBoardTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/i18n/status-labels', () => ({
  useStatusLabels: () => (value: string) => value,
}));

const messages = { ...boardsMessages, ...calendarMessages };
type DeadlineTask = {
  id: string;
  title: string;
  column_id: string;
  position: number;
  priority: string;
  due_date: string | null;
  due_at: string | null;
  production_deadline_exempt?: boolean;
};

const deadlineTask: DeadlineTask = {
  id: 'task-1',
  title: 'Production video',
  column_id: 'col-working',
  position: 0,
  priority: 'high',
  due_date: '2026-07-21',
  due_at: '2026-07-21T10:00:00.000Z',
};

function renderCalendar({
  currentInstant,
  tasks = [deadlineTask],
  doneColumnIds = [],
  canCreate = true,
  onQuickAdd = vi.fn(),
}: {
  currentInstant: string;
  tasks?: DeadlineTask[];
  doneColumnIds?: string[];
  canCreate?: boolean;
  onQuickAdd?: (columnId: string, dueDate: string) => void;
}) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BoardCalendarView
        tasks={tasks}
        onTaskClick={vi.fn()}
        onQuickAdd={onQuickAdd}
        defaultColumnId="col-working"
        currentInstant={currentInstant}
        doneColumnIds={doneColumnIds}
        canCreate={canCreate}
      />
    </NextIntlClientProvider>,
  );
  return { onQuickAdd };
}

describe('board deadline calendar integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-21T09:59:59.500Z');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('uses the shared clock instant immediately after the exact boundary', () => {
    renderCalendar({ currentInstant: '2026-07-21T10:00:00.001Z' });
    expect(screen.getByRole('button', { name: /Production video/ })).toHaveClass('bg-red-50');
  });

  it('never styles a task from a done column as overdue', () => {
    vi.setSystemTime('2026-07-21T10:00:00.001Z');
    renderCalendar({
      currentInstant: '2026-07-21T10:00:00.001Z',
      doneColumnIds: ['col-working'],
    });
    expect(screen.getByRole('button', { name: /Production video/ })).not.toHaveClass('bg-red-50');
  });

  it('does not open calendar quick-add without create permission', () => {
    const onQuickAdd = vi.fn<(columnId: string, dueDate: string) => void>();
    renderCalendar({
      currentInstant: '2026-07-21T09:59:59.500Z',
      canCreate: false,
      onQuickAdd,
    });
    const dayCell = screen.getByText('21').closest('div')?.parentElement;
    expect(dayCell).not.toBeNull();
    fireEvent.click(dayCell!);
    expect(onQuickAdd).not.toHaveBeenCalled();
  });

  it('visibly marks a dated unverified deadline without overdue styling', () => {
    renderCalendar({
      currentInstant: '2026-07-22T10:00:00.000Z',
      tasks: [{
        ...deadlineTask,
        due_at: '2026-07-21T19:59:59.999Z',
        production_deadline_exempt: true,
      }],
    });

    const taskButton = screen.getByRole('button', { name: /Production video/ });
    expect(screen.getByText('Unverified deadline — set exact date and time')).toBeTruthy();
    expect(taskButton).toHaveClass('bg-amber-50');
    expect(taskButton).not.toHaveClass('bg-red-50');
    expect(taskButton).not.toHaveClass('bg-orange-50');
  });

  it('keeps a null-date unverified task in the sidebar with an explicit warning', () => {
    renderCalendar({
      currentInstant: '2026-07-22T10:00:00.000Z',
      tasks: [{
        ...deadlineTask,
        due_date: null,
        due_at: null,
        production_deadline_exempt: true,
      }],
    });

    expect(screen.getByText('Unverified deadline — set exact date and time')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Production video/ })).toHaveClass('border-amber-300');
  });

  it('marks an unverified deadline explicitly in list view and never as overdue', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BoardListView
          tasks={[{
            ...deadlineTask,
            due_at: '2026-07-21T19:59:59.999Z',
            production_deadline_exempt: true,
          }]}
          columns={[{ id: 'col-working', name: 'Working', color: 'blue', is_done_column: false }]}
          boardId="bd_production"
          onTaskClick={vi.fn()}
          onUpdate={vi.fn()}
          canEdit={false}
          currentInstant="2026-07-22T10:00:00.000Z"
        />
      </NextIntlClientProvider>,
    );

    const warning = screen.getByText('Unverified deadline — set exact date and time');
    expect(warning).toHaveClass('text-amber-700');
    expect(warning).not.toHaveClass('text-red-500');
  });
});
