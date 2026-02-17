'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
      const res = await fetch('/api/favorites');
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data || []) as FavoriteItem[];
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
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: filePath,
          item_type: itemType || 'file',
          display_name: displayName,
        }),
      });

      if (!res.ok) {
        throw new Error('فشل تحديث المفضلة');
      }

      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      const action = result?.data?.action;
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
