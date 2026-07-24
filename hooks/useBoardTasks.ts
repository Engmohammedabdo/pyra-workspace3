'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';
import { CALENDAR_TIMEZONE } from '@/lib/constants/statuses';
import { PRODUCTION_BOARD_ID } from '@/lib/constants/production';
import { dubaiDayKey } from '@/lib/utils/format';
import {
  compareIsoInstants,
  isUnverifiedProductionDeadline,
  isValidIsoInstant,
  isoToDubaiDateTime,
  legacyDubaiDayEndToIso,
} from '@/lib/production/deadlines';

export interface BoardDeadlineTask {
  due_date?: string | null;
  due_at?: string | null;
  deadline_locked?: boolean;
  production_deadline_exempt?: boolean;
}

export interface BoardTaskDeadline {
  date: string | null;
  time: string | null;
  exact: boolean;
  instant: string | null;
  unverified?: boolean;
}

export interface FormattedBoardTaskDeadline {
  date: string | null;
  time: string | null;
  unverified: boolean;
}

export interface BoardTaskCreateDraft {
  columnId: string;
  title: string;
  priority: string;
  dueDate: string;
  dueTime: string;
  assignees: string[];
}

export const boardTaskQueryKeys = {
  board: (boardId: string) => ['boards', boardId] as const,
  tasks: (boardId: string) => ['board-tasks', boardId] as const,
  task: (taskId: string) => ['board-task', taskId] as const,
};

export function buildBoardTaskCreateDraft(
  columnId: string,
  title = '',
  dueDate = '',
): BoardTaskCreateDraft {
  return {
    columnId,
    title,
    priority: 'medium',
    dueDate,
    dueTime: '',
    assignees: [],
  };
}

export function canSubmitBoardTaskCreateDraft(
  draft: BoardTaskCreateDraft,
  isProductionBoard: boolean,
): boolean {
  if (!draft.title.trim()) return false;
  return !isProductionBoard || Boolean(draft.dueDate && draft.dueTime);
}

export function useBoardDetails<T>(boardId: string) {
  return useQuery<T>({
    queryKey: boardTaskQueryKeys.board(boardId),
    queryFn: () => fetchAPI<T>(`/api/boards/${boardId}`),
    enabled: Boolean(boardId),
    staleTime: 30_000,
  });
}

export function useBoardTasks<T extends BoardDeadlineTask>(boardId: string) {
  return useQuery<T[]>({
    queryKey: boardTaskQueryKeys.tasks(boardId),
    queryFn: () => fetchAPI<T[]>(`/api/boards/${boardId}/tasks`),
    enabled: Boolean(boardId),
    staleTime: 30_000,
  });
}

export function useBoardTask<T extends BoardDeadlineTask>(taskId: string) {
  return useQuery<T>({
    queryKey: boardTaskQueryKeys.task(taskId),
    queryFn: () => fetchAPI<T>(`/api/tasks/${taskId}`),
    enabled: Boolean(taskId),
    staleTime: 15_000,
  });
}

/** Exact production instant first; legacy board dates remain day-only. */
export function getBoardTaskDeadline(task: BoardDeadlineTask): BoardTaskDeadline | null {
  if (isUnverifiedBoardTaskDeadline(task)) {
    return {
      date: task.due_date ?? null,
      time: null,
      exact: false,
      instant: null,
      unverified: true,
    };
  }

  if (task.due_at != null) {
    if (!isValidIsoInstant(task.due_at)) return null;
    const dubai = isoToDubaiDateTime(task.due_at);
    return dubai ? { ...dubai, exact: true, instant: task.due_at } : null;
  }

  if (task.due_date) {
    return {
      date: task.due_date,
      time: null,
      exact: false,
      instant: legacyDubaiDayEndToIso(task.due_date),
    };
  }

  return null;
}

/** A transferable exact deadline must carry its matching Dubai compatibility date. */
export function hasMatchingExactBoardTaskDeadline(task: BoardDeadlineTask): boolean {
  if (isUnverifiedBoardTaskDeadline(task)) return false;
  if (!task.due_date || task.due_at == null || !isValidIsoInstant(task.due_at)) return false;
  return isoToDubaiDateTime(task.due_at)?.date === task.due_date;
}

export function isUnverifiedBoardTaskDeadline(task: BoardDeadlineTask): boolean {
  return isUnverifiedProductionDeadline({
    dueDate: task.due_date,
    dueAt: task.due_at,
    deadlineExempt: task.production_deadline_exempt,
  });
}

export function canSubmitProductionDeadlineUpdate(
  task: Pick<BoardDeadlineTask, 'deadline_locked'>,
  date: string,
  time: string,
): boolean {
  return task.deadline_locked !== true && Boolean(date && time);
}

export function needsProductionDeadlineOnTransfer(
  targetBoardId: string,
  task: BoardDeadlineTask,
): boolean {
  return targetBoardId === PRODUCTION_BOARD_ID && !hasMatchingExactBoardTaskDeadline(task);
}

export function isBoardTaskDeadlineOverdue(
  task: BoardDeadlineTask,
  now: Date = new Date(),
  isDoneColumn = false,
): boolean {
  if (isDoneColumn) return false;
  const deadline = getBoardTaskDeadline(task);
  if (!deadline) return false;
  if (deadline.unverified) return false;
  if (deadline.exact && deadline.instant) return now.getTime() > Date.parse(deadline.instant);
  if (!deadline.date) return false;
  return deadline.date < dubaiDayKey(now);
}

export function compareBoardTaskDeadlines(
  left: BoardDeadlineTask,
  right: BoardDeadlineTask,
): number {
  const leftInstant = getBoardTaskDeadline(left)?.instant ?? null;
  const rightInstant = getBoardTaskDeadline(right)?.instant ?? null;

  if (leftInstant !== null && rightInstant !== null) {
    return compareIsoInstants(leftInstant, rightInstant) ?? 0;
  }
  if (leftInstant !== null) return -1;
  if (rightInstant !== null) return 1;
  return 0;
}

export function formatBoardTaskDeadline(
  task: BoardDeadlineTask,
  locale: string,
): FormattedBoardTaskDeadline | null {
  const deadline = getBoardTaskDeadline(task);
  if (!deadline) return null;

  if (!deadline.date) {
    return {
      date: null,
      time: null,
      unverified: deadline.unverified === true,
    };
  }

  const intlLocale = locale === 'ar' ? 'ar-EG' : 'en-GB';
  if (deadline.exact && deadline.instant) {
    const parsed = new Date(deadline.instant);
    return {
      date: parsed.toLocaleDateString(intlLocale, {
        timeZone: CALENDAR_TIMEZONE,
        day: 'numeric',
        month: 'short',
      }),
      time: parsed.toLocaleTimeString(intlLocale, {
        timeZone: CALENDAR_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
      }),
      unverified: false,
    };
  }

  return {
    date: new Date(`${deadline.date}T12:00:00.000Z`).toLocaleDateString(intlLocale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }),
    time: null,
    unverified: deadline.unverified === true,
  };
}
