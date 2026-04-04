'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { toast } from 'sonner';

export interface FavoriteItem {
  id: string;
  username: string;
  file_path: string;
  item_type: 'file' | 'folder';
  display_name: string;
  created_at: string;
}

// ============================================================
// Hook: Get all favorites for current user
// ============================================================
export function useFavorites() {
  return useQuery<FavoriteItem[]>({
    queryKey: ['favorites'],
    queryFn: async () => {
      try {
        return await fetchAPI<FavoriteItem[]>('/api/favorites');
      } catch {
        return [];
      }
    },
    staleTime: 60_000, // 1 minute
  });
}

// ============================================================
// Hook: Check if a specific path is favorited
// ============================================================
export function useIsFavorite(filePath: string) {
  const { data: favorites = [] } = useFavorites();
  return favorites.some((f) => f.file_path === filePath);
}

// ============================================================
// Hook: Toggle favorite (add/remove)
// ============================================================
export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      filePath,
      itemType,
      displayName,
    }: {
      filePath: string;
      itemType?: 'file' | 'folder';
      displayName?: string;
    }) => {
      return mutateAPI<{ action: string }>('/api/favorites', 'POST', {
        file_path: filePath,
        item_type: itemType || 'file',
        display_name: displayName,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      const action = result?.action;
      if (action === 'added') {
        toast.success('تمت الإضافة للمفضلة ⭐');
      } else if (action === 'removed') {
        toast.success('تمت الإزالة من المفضلة');
      }
    },
    onError: () => {
      toast.error('فشل تحديث المفضلة');
    },
  });
}
