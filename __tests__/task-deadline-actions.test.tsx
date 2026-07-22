import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarClock } from 'lucide-react';
import boardsMessages from '@/messages/en/boards.json';
import commonMessages from '@/messages/en/common.json';
import statusMessages from '@/messages/en/statuses.json';
import { PRODUCTION_BOARD_ID } from '@/lib/constants/production';

const mocks = vi.hoisted(() => ({
  duplicate: vi.fn(),
  fetchAPI: vi.fn(async () => []),
  update: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  taskQuery: {
    data: null as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(async () => undefined),
  },
  usersQuery: {
    data: [] as Array<{ username: string; display_name: string }>,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(async () => undefined),
  },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: (options: { queryFn: () => unknown }) => {
      void options.queryFn();
      return mocks.usersQuery;
    },
  };
});

vi.mock('@/hooks/api-helpers', () => ({
  fetchAPI: mocks.fetchAPI,
  mutateAPI: vi.fn(async () => undefined),
}));

vi.mock('@/hooks/useBoardTasks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBoardTasks')>();
  return {
    ...actual,
    useBoardTask: () => mocks.taskQuery,
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: mocks.success,
    error: mocks.error,
  },
}));

vi.mock('@/hooks/useBoardTaskMutations', () => ({
  useDuplicateBoardTask: () => ({
    mutateAsync: mocks.duplicate,
    isPending: false,
  }),
  useUpdateBoardTask: () => ({ mutateAsync: mocks.update }),
  useMoveBoardTask: () => ({ mutateAsync: vi.fn() }),
  useAdvanceBoardTask: () => ({ mutateAsync: vi.fn() }),
  useReviewBoardTask: () => ({ mutateAsync: vi.fn() }),
}));

type DeadlineButtonProps = {
  dueDate: string;
  dueAt: string | null;
  deadlineExempt?: boolean;
  locked: boolean;
  canManage: boolean;
  onSave: (date: string, time: string) => Promise<boolean>;
  saving: boolean;
};

type DateButtonProps = {
  icon: typeof CalendarClock;
  label: string;
  value: string;
  onChange: (value: string) => void;
  locked?: boolean;
  readOnly?: boolean;
};

type DuplicateActionProps = {
  task: {
    id: string;
    due_date?: string | null;
    due_at?: string | null;
    production_deadline_exempt?: boolean;
  };
  boardId: string;
  compact?: boolean;
  onDuplicated: () => void;
};

type TaskSheetComponentProps = {
  taskId: string;
  board: {
    id: string;
    is_pipeline: boolean;
    pyra_board_columns: Array<{
      id: string;
      name: string;
      color: string;
      position: number;
      is_done_column: boolean;
      requires_approval: boolean;
      column_type: string | null;
    }>;
    pyra_board_labels: Array<{ id: string; name: string; color: string }>;
  };
  onClose: () => void;
  onUpdate: () => void;
  session: {
    pyraUser: {
      username: string;
      rolePermissions: string[];
    };
  };
  currentInstant: string;
};

type TaskSheetModule = {
  ProductionDeadlineBtn?: React.ComponentType<DeadlineButtonProps>;
  SidebarDateBtn?: React.ComponentType<DateButtonProps>;
  TaskDuplicateAction?: React.ComponentType<DuplicateActionProps>;
  TaskSheet?: React.ComponentType<TaskSheetComponentProps>;
};

let loadedTaskSheet: TaskSheetModule;

async function taskSheetExports() {
  return loadedTaskSheet;
}

function renderWithMessages(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={{
      ...boardsMessages,
      ...commonMessages,
      ...statusMessages,
    }}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe('task deadline actions', () => {
  beforeAll(async () => {
    // OXC's first TSX transform can be slow under the full parallel suite.
    // Import once with a file-local budget instead of timing out each test.
    loadedTaskSheet = await import('@/components/boards/task-sheet') as unknown as TaskSheetModule;
  }, 30_000);

  beforeEach(() => {
    mocks.duplicate.mockReset().mockResolvedValue({ id: 'copy-1' });
    mocks.success.mockClear();
    mocks.error.mockClear();
    mocks.fetchAPI.mockReset().mockResolvedValue([]);
    mocks.update.mockReset().mockResolvedValue(undefined);
    mocks.taskQuery.data = null;
    mocks.taskQuery.isLoading = false;
    mocks.taskQuery.isError = false;
    mocks.taskQuery.refetch.mockClear();
    mocks.usersQuery.data = [];
    mocks.usersQuery.isLoading = false;
    mocks.usersQuery.isError = false;
    mocks.usersQuery.isFetching = false;
    mocks.usersQuery.refetch.mockClear();
  });

  afterEach(cleanup);

  it('shows an exact production deadline as read-only without tasks.manage', async () => {
    const { ProductionDeadlineBtn } = await taskSheetExports();
    expect(ProductionDeadlineBtn).toBeTypeOf('function');
    if (!ProductionDeadlineBtn) return;

    const onSave = vi.fn(async () => true);
    renderWithMessages(
      <ProductionDeadlineBtn
        dueDate="2026-07-21"
        dueAt="2026-07-21T14:30:00.000Z"
        locked={false}
        canManage={false}
        onSave={onSave}
        saving={false}
      />,
    );

    const button = screen.getByRole('button', { name: /Exact deadline/ });
    expect(button).toBeDisabled();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    fireEvent.click(button);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('never displays or prefills the migration-generated synthetic time', async () => {
    const { ProductionDeadlineBtn } = await taskSheetExports();
    expect(ProductionDeadlineBtn).toBeTypeOf('function');
    if (!ProductionDeadlineBtn) return;

    renderWithMessages(
      <ProductionDeadlineBtn
        dueDate="2026-07-21"
        dueAt="2026-07-21T19:59:59.999Z"
        deadlineExempt
        locked={false}
        canManage
        onSave={vi.fn(async () => true)}
        saving={false}
      />,
    );

    expect(screen.queryByText(/23:59/)).not.toBeInTheDocument();
    expect(screen.getByText('Exact time required')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Exact deadline/ }));
    expect(screen.getByLabelText('Delivery date (UAE)')).toHaveValue('2026-07-21');
    expect(screen.getByLabelText('Delivery time (UAE)')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save exact deadline' })).toBeDisabled();
  });

  it('keeps a persistent production lock read-only after the task moves to a generic board', async () => {
    const { SidebarDateBtn } = await taskSheetExports();
    expect(SidebarDateBtn).toBeTypeOf('function');
    if (!SidebarDateBtn) return;

    const onChange = vi.fn();
    renderWithMessages(
      <SidebarDateBtn
        icon={CalendarClock}
        label="Due date"
        value="2026-07-21"
        onChange={onChange}
        locked
        readOnly={false}
      />,
    );

    const button = screen.getByRole('button', { name: /Due date/ });
    expect(button).toBeDisabled();
    expect(screen.getByText('Locked after review')).toBeInTheDocument();
    fireEvent.click(button);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('prompts for the exact UAE pair before duplicating a historical production task without a deadline', async () => {
    const { TaskDuplicateAction } = await taskSheetExports();
    expect(TaskDuplicateAction).toBeTypeOf('function');
    if (!TaskDuplicateAction) return;

    const onDuplicated = vi.fn();
    renderWithMessages(
      <TaskDuplicateAction
        task={{ id: 'legacy-task', due_date: null, due_at: null }}
        boardId={PRODUCTION_BOARD_ID}
        onDuplicated={onDuplicated}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate task' }));
    expect(mocks.duplicate).not.toHaveBeenCalled();

    const submit = screen.getByRole('button', { name: 'Create duplicate' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Delivery date (UAE)'), {
      target: { value: '2026-07-23' },
    });
    fireEvent.change(screen.getByLabelText('Delivery time (UAE)'), {
      target: { value: '18:45' },
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(mocks.duplicate).toHaveBeenCalledWith({
        taskId: 'legacy-task',
        boardId: PRODUCTION_BOARD_ID,
        data: {
          due_date: '2026-07-23',
          due_time: '18:45',
        },
      });
      expect(onDuplicated).toHaveBeenCalledTimes(1);
    });
  });

  it('prompts before duplicating an exempt production task even when it carries a synthetic instant', async () => {
    const { TaskDuplicateAction } = await taskSheetExports();
    expect(TaskDuplicateAction).toBeTypeOf('function');
    if (!TaskDuplicateAction) return;

    renderWithMessages(
      <TaskDuplicateAction
        task={{
          id: 'legacy-synthetic-task',
          due_date: '2026-07-21',
          due_at: '2026-07-21T19:59:59.999Z',
          production_deadline_exempt: true,
        }}
        boardId={PRODUCTION_BOARD_ID}
        onDuplicated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate task' }));

    expect(mocks.duplicate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create duplicate' })).toBeDisabled();
    expect(screen.getByLabelText('Delivery date (UAE)')).toBeInTheDocument();
    expect(screen.getByLabelText('Delivery time (UAE)')).toBeInTheDocument();
  });

  it('prompts for a fresh exact deadline before duplicating an already exact production task', async () => {
    const { TaskDuplicateAction } = await taskSheetExports();
    expect(TaskDuplicateAction).toBeTypeOf('function');
    if (!TaskDuplicateAction) return;

    renderWithMessages(
      <TaskDuplicateAction
        task={{
          id: 'exact-production-task',
          due_date: '2026-07-21',
          due_at: '2026-07-21T14:30:00.000Z',
          production_deadline_exempt: false,
        }}
        boardId={PRODUCTION_BOARD_ID}
        onDuplicated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate task' }));

    expect(mocks.duplicate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create duplicate' })).toBeDisabled();
    expect(screen.getByLabelText('Delivery date (UAE)')).toBeInTheDocument();
    expect(screen.getByLabelText('Delivery time (UAE)')).toBeInTheDocument();
  });

  it('keeps task properties read-only while tasks.create actions remain available', async () => {
    const { TaskSheet } = await taskSheetExports();
    expect(TaskSheet).toBeTypeOf('function');
    if (!TaskSheet) return;

    mocks.taskQuery.data = {
      id: 'task-1',
      title: 'Employee task',
      description: 'Read-only description',
      board_id: 'board-1',
      column_id: 'column-1',
      position: 0,
      priority: 'high',
      due_date: '2026-07-31',
      due_at: null,
      deadline_locked: false,
      start_date: '2026-07-21',
      estimated_hours: 8,
      actual_hours: 2,
      cover_image: 'https://example.com/cover.jpg',
      is_archived: false,
      pyra_task_assignees: [{ id: 'assignment-1', username: 'employee' }],
      pyra_task_labels: [{
        label_id: 'label-1',
        pyra_board_labels: { id: 'label-1', name: 'Urgent', color: 'red' },
      }],
      pyra_task_checklist: [{ id: 'check-1', title: 'Do work', is_checked: false, position: 0 }],
      pyra_task_comments: [],
      pyra_task_attachments: [{
        id: 'attachment-1',
        file_name: 'cover.jpg',
        file_url: 'https://example.com/cover.jpg',
        file_size: 10,
        created_at: '2026-07-21T00:00:00.000Z',
      }],
      pyra_task_activity: [],
    };

    renderWithMessages(
      <TaskSheet
        taskId="task-1"
        board={{
          id: 'board-1',
          is_pipeline: false,
          pyra_board_columns: [{
            id: 'column-1',
            name: 'Working',
            color: 'orange',
            position: 0,
            is_done_column: false,
            requires_approval: false,
            column_type: null,
          }],
          pyra_board_labels: [{ id: 'label-1', name: 'Urgent', color: 'red' }],
        }}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
        session={{
          pyraUser: {
            username: 'employee',
            rolePermissions: ['tasks.view', 'tasks.create'],
          },
        }}
        currentInstant="2026-07-21T10:00:00.000Z"
      />,
    );

    fireEvent.click(screen.getByRole('heading', { name: 'Employee task' }));
    fireEvent.click(screen.getByText('Read-only description'));
    expect(screen.queryByDisplayValue('Employee task')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Read-only description')).not.toBeInTheDocument();

    for (const name of [/Labels/, /Start date/, /Due date/, /Priority/, /Hours/]) {
      const controls = screen.getAllByRole('button', { name });
      expect(controls.length).toBeGreaterThan(0);
      expect(controls.every((control) => control.hasAttribute('disabled'))).toBe(true);
    }
    expect(screen.queryByRole('button', { name: 'Cover image' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();

    for (const name of [/Members \/ Assign/, /Add attachment/, /Move to list/, /Move to another board/, /Duplicate task/]) {
      const controls = screen.getAllByRole('button', { name });
      expect(controls.length).toBeGreaterThan(0);
      expect(controls.some((control) => !control.hasAttribute('disabled'))).toBe(true);
    }

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('loads task assignees from the authenticated employee-safe lite endpoint', async () => {
    const { TaskSheet } = await taskSheetExports();
    expect(TaskSheet).toBeTypeOf('function');
    if (!TaskSheet) return;

    renderWithMessages(
      <TaskSheet
        taskId="task-1"
        board={{ id: 'board-1', is_pipeline: false, pyra_board_columns: [], pyra_board_labels: [] }}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
        session={{ pyraUser: { username: 'employee', rolePermissions: ['tasks.view', 'tasks.create'] } }}
        currentInstant="2026-07-21T10:00:00.000Z"
      />,
    );

    await waitFor(() => expect(mocks.fetchAPI).toHaveBeenCalledWith('/api/users/lite'));
    expect(mocks.fetchAPI).not.toHaveBeenCalledWith('/api/users');
  });

  it('shows a visible retry state when the task query fails instead of spinning forever', async () => {
    const { TaskSheet } = await taskSheetExports();
    expect(TaskSheet).toBeTypeOf('function');
    if (!TaskSheet) return;

    mocks.taskQuery.isError = true;
    renderWithMessages(
      <TaskSheet
        taskId="task-1"
        board={{ id: 'board-1', is_pipeline: false, pyra_board_columns: [], pyra_board_labels: [] }}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
        session={{ pyraUser: { username: 'employee', rolePermissions: ['tasks.view'] } }}
        currentInstant="2026-07-21T10:00:00.000Z"
      />,
    );

    expect(screen.getByText('Failed to load task')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(mocks.taskQuery.refetch).toHaveBeenCalledTimes(1);
  });

  it('distinguishes an assignee query failure from a genuinely empty user list', async () => {
    const { TaskSheet } = await taskSheetExports();
    expect(TaskSheet).toBeTypeOf('function');
    if (!TaskSheet) return;

    mocks.taskQuery.data = {
      id: 'task-1',
      title: 'Employee task',
      description: null,
      board_id: 'board-1',
      column_id: 'column-1',
      position: 0,
      priority: 'medium',
      created_by: 'admin',
      pyra_task_assignees: [],
      pyra_task_labels: [],
      pyra_task_checklist: [],
      pyra_task_comments: [],
      pyra_task_attachments: [],
      pyra_task_activity: [],
    };
    mocks.usersQuery.isError = true;

    renderWithMessages(
      <TaskSheet
        taskId="task-1"
        board={{
          id: 'board-1',
          is_pipeline: false,
          pyra_board_columns: [{
            id: 'column-1',
            name: 'Working',
            color: 'orange',
            position: 0,
            is_done_column: false,
            requires_approval: false,
            column_type: null,
          }],
          pyra_board_labels: [],
        }}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
        session={{ pyraUser: { username: 'employee', rolePermissions: ['tasks.view', 'tasks.create'] } }}
        currentInstant="2026-07-21T10:00:00.000Z"
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Members \/ Assign/ })[0]);
    expect(screen.getByText("Couldn't load members")).toBeInTheDocument();
    expect(screen.queryByText('No users found')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(mocks.usersQuery.refetch).toHaveBeenCalledTimes(1);
  });
});
