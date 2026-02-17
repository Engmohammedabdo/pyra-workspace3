'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, FolderOpen, FileText, Trash2, ExternalLink } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import { useFavorites, useToggleFavorite } from '@/hooks/useFavorites';
import type { FavoriteItem } from '@/hooks/useFavorites';

export default function FavoritesPage() {
  const router = useRouter();
  const { data: favorites = [], isLoading } = useFavorites();
  const toggleFavorite = useToggleFavorite();

  const handleNavigate = useCallback(
    (fav: FavoriteItem) => {
      if (fav.item_type === 'folder') {
        const encodedPath = fav.file_path
          .split('/')
          .map(encodeURIComponent)
          .join('/');
        router.push(`/dashboard/files/${encodedPath}`);
      } else {
        // Navigate to the parent folder
        const parts = fav.file_path.split('/');
        parts.pop(); // Remove file name
        const parentPath = parts.map(encodeURIComponent).join('/');
        router.push(`/dashboard/files/${parentPath}`);
      }
    },
    [router]
  );

  const handleRemove = useCallback(
    (fav: FavoriteItem) => {
      toggleFavorite.mutate({
        filePath: fav.file_path,
        itemType: fav.item_type,
        displayName: fav.display_name,
      });
    },
    [toggleFavorite]
  );

  const folders = favorites.filter((f) => f.item_type === 'folder');
  const files = favorites.filter((f) => f.item_type !== 'folder');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Star className="h-6 w-6 fill-yellow-400 text-yellow-500" /> المفضلة
        </h1>
        <p className="text-muted-foreground">
          الملفات والمجلدات المفضلة لديك ({favorites.length})
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <Card>
          <CardContent className="p-12 flex flex-col items-center justify-center text-muted-foreground">
            <Star className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-base font-medium mb-1">لا توجد عناصر مفضلة</p>
            <p className="text-sm">
              أضف الملفات والمجلدات للمفضلة من قائمة الملفات بالنقر على ⋮ ثم &quot;إضافة للمفضلة&quot;
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Favorite Folders */}
          {folders.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <FolderOpen className="h-4 w-4" /> المجلدات ({folders.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {folders.map((fav) => (
                  <FavoriteCard
                    key={fav.id}
                    favorite={fav}
                    onNavigate={handleNavigate}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Favorite Files */}
          {files.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4" /> الملفات ({files.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {files.map((fav) => (
                  <FavoriteCard
                    key={fav.id}
                    favorite={fav}
                    onNavigate={handleNavigate}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FavoriteCard({
  favorite,
  onNavigate,
  onRemove,
}: {
  favorite: FavoriteItem;
  onNavigate: (fav: FavoriteItem) => void;
  onRemove: (fav: FavoriteItem) => void;
}) {
  const isFolder = favorite.item_type === 'folder';

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              isFolder
                ? 'bg-orange-100 dark:bg-orange-900/30'
                : 'bg-blue-100 dark:bg-blue-900/30'
            }`}
          >
            {isFolder ? (
              <FolderOpen className="h-5 w-5 text-orange-500" />
            ) : (
              <FileText className="h-5 w-5 text-blue-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">
                {decodeURIComponent(favorite.display_name)}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                {isFolder ? 'مجلد' : 'ملف'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-1" title={favorite.file_path}>
              {favorite.file_path}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {formatRelativeDate(favorite.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={() => onNavigate(favorite)}
          >
            <ExternalLink className="h-3 w-3 me-1" />
            فتح
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={() => onRemove(favorite)}
          >
            <Trash2 className="h-3 w-3 me-1" />
            إزالة
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
