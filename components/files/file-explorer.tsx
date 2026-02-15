'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileToolbar, type ViewMode } from './file-toolbar';
import { FileBreadcrumbs } from './file-breadcrumbs';
import { FileGrid } from './file-grid';
import { FileList } from './file-list';
import { useFiles, useCreateFolder, useUploadFiles } from '@/hooks/useFiles';
import type { FileListItem } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';

interface FileExplorerProps {
  initialPath?: string;
}

export function FileExplorer({ initialPath = '' }: FileExplorerProps) {
  const router = useRouter();
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Data hooks
  const { data: files = [], isLoading, refetch } = useFiles(currentPath);
  const createFolder = useCreateFolder();
  const uploadFiles = useUploadFiles();

  // Filtered files based on search
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const query = searchQuery.toLowerCase();
    return files.filter((f) =>
      decodeURIComponent(f.name).toLowerCase().includes(query)
    );
  }, [files, searchQuery]);

  // Navigation
  const handleNavigate = useCallback(
    (file: FileListItem) => {
      if (file.isFolder) {
        const newPath = file.path;
        setCurrentPath(newPath);
        setSelectedFiles(new Set());
        setSearchQuery('');
        // Update URL without full page reload
        const encodedPath = newPath
          .split('/')
          .map(encodeURIComponent)
          .join('/');
        router.push(`/dashboard/files/${encodedPath}`, { scroll: false });
      } else {
        // For files, we could open a preview or download
        // Phase 1: just log the action
        toast.info(`الملف: ${decodeURIComponent(file.name)}`);
      }
    },
    [router]
  );

  const handleBreadcrumbNavigate = useCallback(
    (path: string) => {
      setCurrentPath(path);
      setSelectedFiles(new Set());
      setSearchQuery('');
      if (path) {
        const encodedPath = path
          .split('/')
          .map(encodeURIComponent)
          .join('/');
        router.push(`/dashboard/files/${encodedPath}`, { scroll: false });
      } else {
        router.push('/dashboard/files', { scroll: false });
      }
    },
    [router]
  );

  // Selection
  const handleSelect = useCallback((path: string, multi: boolean) => {
    setSelectedFiles((prev) => {
      const next = new Set(multi ? prev : []);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Create folder
  const handleCreateFolder = useCallback(
    (name: string) => {
      createFolder.mutate(
        { parentPath: currentPath, folderName: name },
        {
          onSuccess: () => {
            toast.success(`تم إنشاء المجلد "${name}"`);
          },
          onError: (err) => {
            toast.error(`فشل إنشاء المجلد: ${err.message}`);
          },
        }
      );
    },
    [currentPath, createFolder]
  );

  // Upload files
  const handleUploadFiles = useCallback(
    (fileList: File[]) => {
      uploadFiles.mutate(
        { parentPath: currentPath, files: fileList },
        {
          onSuccess: () => {
            toast.success(`تم رفع ${fileList.length} ملف(ات) بنجاح`);
          },
          onError: (err) => {
            toast.error(err.message);
          },
        }
      );
    },
    [currentPath, uploadFiles]
  );

  // Refresh
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      <FileBreadcrumbs path={currentPath} onNavigate={handleBreadcrumbNavigate} />

      {/* Toolbar */}
      <FileToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onCreateFolder={handleCreateFolder}
        onUploadFiles={handleUploadFiles}
        onRefresh={handleRefresh}
        onSearch={setSearchQuery}
        isLoading={isLoading}
        isUploading={uploadFiles.isPending}
        isCreating={createFolder.isPending}
      />

      {/* File count */}
      {!isLoading && files.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
          <span>
            {filteredFiles.length} عنصر
            {searchQuery && ` (من ${files.length})`}
          </span>
          {selectedFiles.size > 0 && (
            <span className="text-primary font-medium">
              {selectedFiles.size} محدد
            </span>
          )}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <FileExplorerSkeleton viewMode={viewMode} />
      ) : viewMode === 'grid' ? (
        <FileGrid
          files={filteredFiles}
          onNavigate={handleNavigate}
          selectedFiles={selectedFiles}
          onSelect={handleSelect}
        />
      ) : (
        <FileList
          files={filteredFiles}
          onNavigate={handleNavigate}
          selectedFiles={selectedFiles}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
}

// ============================================================
// Loading skeleton
// ============================================================
function FileExplorerSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 p-4">
            <Skeleton className="w-12 h-12 rounded-lg" />
            <Skeleton className="w-20 h-3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
        <Skeleton className="w-40 h-3" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="w-48 h-4" />
          <div className="flex-1" />
          <Skeleton className="w-16 h-3" />
          <Skeleton className="w-24 h-3" />
        </div>
      ))}
    </div>
  );
}
