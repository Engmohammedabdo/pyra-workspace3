'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mutateAPI } from '@/hooks/api-helpers';
import { boardTaskQueryKeys } from '@/hooks/useBoardTasks';

export type BoardTaskPayload = Record<string, unknown>;

interface TaskMutationVariables {
  taskId: string;
  boardId: string;
  data: BoardTaskPayload;
}

interface MoveTaskVariables extends TaskMutationVariables {
  targetBoardId?: string;
}

interface DuplicateTaskVariables {
  taskId: string;
  boardId: string;
  data?: BoardTaskPayload;
}

function invalidateTaskQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  boardId: string,
  taskId?: string,
  targetBoardId?: string,
) {
  void queryClient.invalidateQueries({ queryKey: boardTaskQueryKeys.board(boardId) });
  void queryClient.invalidateQueries({ queryKey: boardTaskQueryKeys.tasks(boardId) });
  if (taskId) void queryClient.invalidateQueries({ queryKey: boardTaskQueryKeys.task(taskId) });
  if (targetBoardId && targetBoardId !== boardId) {
    void queryClient.invalidateQueries({ queryKey: boardTaskQueryKeys.board(targetBoardId) });
    void queryClient.invalidateQueries({ queryKey: boardTaskQueryKeys.tasks(targetBoardId) });
  }
}

export function useCreateBoardTask(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, BoardTaskPayload>({
    mutationFn: (data) => mutateAPI(`/api/boards/${boardId}/tasks`, 'POST', data),
    onSuccess: () => invalidateTaskQueries(queryClient, boardId),
  });
}

export function useUpdateBoardTask() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, TaskMutationVariables>({
    mutationFn: ({ taskId, data }) => mutateAPI(`/api/tasks/${taskId}`, 'PATCH', data),
    onSuccess: (_, { boardId, taskId }) => invalidateTaskQueries(queryClient, boardId, taskId),
  });
}

export function useMoveBoardTask() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, MoveTaskVariables>({
    mutationFn: ({ taskId, data }) => mutateAPI(`/api/tasks/${taskId}/move`, 'POST', data),
    onSuccess: (_, { boardId, taskId, targetBoardId }) => {
      invalidateTaskQueries(queryClient, boardId, taskId, targetBoardId);
    },
  });
}

export function useDuplicateBoardTask() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, DuplicateTaskVariables>({
    mutationFn: ({ taskId, data = {} }) => mutateAPI(`/api/tasks/${taskId}/duplicate`, 'POST', data),
    onSuccess: (_, { boardId, taskId }) => invalidateTaskQueries(queryClient, boardId, taskId),
  });
}

export function useAdvanceBoardTask() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, TaskMutationVariables>({
    mutationFn: ({ boardId, taskId, data }) => (
      mutateAPI(`/api/boards/${boardId}/tasks/${taskId}/advance`, 'POST', data)
    ),
    onSuccess: (_, { boardId, taskId }) => invalidateTaskQueries(queryClient, boardId, taskId),
  });
}

export function useReviewBoardTask() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, TaskMutationVariables>({
    mutationFn: ({ boardId, taskId, data }) => (
      mutateAPI(`/api/boards/${boardId}/tasks/${taskId}/approve`, 'POST', data)
    ),
    onSuccess: (_, { boardId, taskId }) => invalidateTaskQueries(queryClient, boardId, taskId),
  });
}
