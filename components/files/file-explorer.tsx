'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileToolbar, type ViewMode, type SortField, type SortOrder, type FileTypeFilter } from './file-toolbar';
import { FileBreadcrumbs } from './file-breadcrumbs';
import { FileGrid } from './file-grid';
import { FileList } from './file-list';
import { FilePreview } from './file-preview';
import { FileDropZone } from './file-drop-zone';
import { UploadProgressBar } from './upload-progress';
import { useFiles, useCreateFolder, useUploadFiles, useDeleteFiles, useFileUrl, useMoveFiles } from '@/hooks/useFiles';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { FilePermissionsDialog } from './file-permissions-dialog';
import type { FileListItem } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';

interface FileExplorerProps {
  initialPath?: string;
}

// Sort helper
function sortFiles(files: FileListItem[], field: SortField, order: SortOrder): FileListItem[] {
  const sorted = [...files].sort((a, b) => {
    // Folders always first
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;

    let cmp = 0;
    switch (field) {
      case 'name':
        cmp = decodeURIComponent(a.name).localeCompare(decodeURIComponent(b.name), 'ar');
        break;
      case 'size':
        cmp = (a.size || 0) - (b.size || 0);
        break;
      case 'date':
        cmp = (a.updatedAt || '').localeCompare(b.updatedAt || '');
        break;
      case 'type':
        cmp = (a.mimeType || '').localeCompare(b.mimeType || '');
        break;
    }
    return order === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

// Type filter helper
function filterByType(files: FileListItem[], filter: FileTypeFilter): FileListItem[] {
  if (filter === 'all') return files;
  return files.filter((f) => {
    if (f.isFolder) return true; // Always show folders
    const m = f.mimeType;
    switch (filter) {
      case 'image': return m.startsWith('image/');
      case 'video': return m.startsWith('video/');
      case 'audio': return m.startsWith('audio/');
      case 'document': return m === 'application/pdf' || m.includes('word') || m === 'text/plain' || m.includes('presentation') || m.includes('powerpoint');
      case 'archive': return m.includes('zip') || m.includes('rar') || m.includes('7z') || m.includes('tar') || m.includes('gzip');
      case 'code': return m.includes('javascript') || m.includes('json') || m.includes('html') || m.includes('css') || m.includes('xml') || m.includes('typescript');
      default: return true;
    }
  });
}

export function FileExplorer({ initialPath = '' }: FileExplorerProps) {
  const router = useRouter();
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>('all');
  const [previewFile, setPreviewFile] = useState<FileListItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [permissionsFile, setPermissionsFile] = useState<FileListItem | null>(null);
  const [permissionsOpen, setPermissionsOpen] = useState(false);

  // Data hooks
  const { data: files = [], isLoading, refetch } = useFiles(currentPath);
  const createFolder = useCreateFolder();
  const uploadFiles = useUploadFiles();
  const deleteFiles = useDeleteFiles();
  const getUrl = useFileUrl();
  const moveFiles = useMoveFiles();
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  // Processed files: search → type filter → sort
  const processedFiles = useMemo(() => {
    let result = files;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((f) =>
        decodeURIComponent(f.name).toLowerCase().includes(query)
      );
    }

    // Type filter
    result = filterByType(result, typeFilter);

    // Sort
    result = sortFiles(result, sortField, sortOrder);

    return result;
  }, [files, searchQuery, typeFilter, sortField, sortOrder]);

  // Navigation
  const handleNavigate = useCallback(
    (file: FileListItem) => {
      if (file.isFolder) {
        const newPath = file.path;
        setCurrentPath(newPath);
        setSelectedFiles(new Set());
        setSearchQuery('');
        const encodedPath = newPath
          .split('/')
          .map(encodeURIComponent)
          .join('/');
        router.push(`/dashboard/files/${encodedPath}`, { scroll: false });
      } else {
        // Open preview for files
        setPreviewFile(file);
        setPreviewOpen(true);
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
          onSuccess: (result) => {
            const uploaded = result?.uploaded?.length || fileList.length;
            const errCount = result?.errors?.length || 0;
            if (errCount > 0) {
              toast.warning(`تم رفع ${uploaded} ملف(ات) مع ${errCount} خطأ`);
            } else {
              toast.success(`تم رفع ${uploaded} ملف(ات) بنجاح`);
            }
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

  // Preview
  const handlePreview = useCallback((file: FileListItem) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  }, []);

  // Download
  const handleDownload = useCallback(
    (file: FileListItem) => {
      getUrl.mutateAsync({ path: file.path }).then((url) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = decodeURIComponent(file.name);
        a.click();
        toast.success('جاري تحميل الملف...');
      }).catch(() => {
        toast.error('فشل في تحميل الملف');
      });
    },
    [getUrl]
  );

  // Rename
  const handleRename = useCallback(
    (file: FileListItem, newName: string) => {
      fetch(`/api/files/${encodeURIComponent(file.path)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', newName }),
      })
        .then((res) => res.json())
        .then((json) => {
          if (json.error) {
            toast.error(json.error);
          } else {
            toast.success(`تم إعادة التسمية إلى "${newName}"`);
            refetch();
          }
        })
        .catch(() => toast.error('فشل في إعادة التسمية'));
    },
    [refetch]
  );

  // Delete single file
  const handleDeleteFile = useCallback(
    (file: FileListItem) => {
      fetch(`/api/files/${encodeURIComponent(file.path)}`, {
        method: 'DELETE',
      })
        .then((res) => res.json())
        .then((json) => {
          if (json.error) {
            toast.error(json.error);
          } else {
            toast.success(`تم حذف "${decodeURIComponent(file.name)}"`);
            refetch();
            setSelectedFiles((prev) => {
              const next = new Set(prev);
              next.delete(file.path);
              return next;
            });
          }
        })
        .catch(() => toast.error('فشل في الحذف'));
    },
    [refetch]
  );

  // Delete selected (bulk)
  const handleDeleteSelected = useCallback(() => {
    if (selectedFiles.size === 0) return;
    const paths = Array.from(selectedFiles);
    deleteFiles.mutate(
      { paths },
      {
        onSuccess: () => {
          toast.success(`تم حذف ${paths.length} عنصر(ات)`);
          setSelectedFiles(new Set());
        },
        onError: (err) => {
          toast.error(err.message);
        },
      }
    );
  }, [selectedFiles, deleteFiles]);

  // Copy path
  const handleCopyPath = useCallback((file: FileListItem) => {
    navigator.clipboard.writeText(file.path).then(
      () => toast.success('تم نسخ المسار'),
      () => toast.error('فشل في نسخ المسار')
    );
  }, []);

  // Move file(s) (drag & drop) — supports multiple selected files
  const handleMoveFile = useCallback(
    (sourcePath: string, destinationFolder: string) => {
      // If the dragged file is part of a multi-selection, move all selected
      const pathsToMove = selectedFiles.has(sourcePath) && selectedFiles.size > 1
        ? Array.from(selectedFiles)
        : [sourcePath];

      const label = pathsToMove.length > 1
        ? `${pathsToMove.length} عنصر(ات)`
        : `"${decodeURIComponent(sourcePath.split('/').pop() || '')}"`;

      moveFiles.mutate(
        { sourcePaths: pathsToMove, destinationFolder },
        {
          onSuccess: () => {
            toast.success(`تم نقل ${label} بنجاح`);
            setSelectedFiles(new Set());
          },
          onError: (err) => {
            toast.error(`فشل في النقل: ${err.message}`);
          },
        }
      );
    },
    [moveFiles, selectedFiles]
  );

  // Permissions dialog
  const handlePermissions = useCallback((file: FileListItem) => {
    setPermissionsFile(file);
    setPermissionsOpen(true);
  }, []);

  // Sort change
  const handleSortChange = useCallback((field: SortField, order: SortOrder) => {
    setSortField(field);
    setSortOrder(order);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Ctrl+A — select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedFiles(new Set(processedFiles.map((f) => f.path)));
      }

      // Delete — delete selected
      if (e.key === 'Delete' && selectedFiles.size > 0) {
        e.preventDefault();
        handleDeleteSelected();
      }

      // Escape — deselect all / close preview
      if (e.key === 'Escape') {
        if (previewOpen) {
          setPreviewOpen(false);
        } else {
          setSelectedFiles(new Set());
        }
      }

      // Space — preview selected
      if (e.key === ' ' && selectedFiles.size === 1) {
        e.preventDefault();
        const path = Array.from(selectedFiles)[0];
        const file = processedFiles.find((f) => f.path === path);
        if (file && !file.isFolder) {
          handlePreview(file);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [processedFiles, selectedFiles, handleDeleteSelected, handlePreview, previewOpen]);

  // File action props shared between grid and list
  const fileActions = {
    onPreview: handlePreview,
    onDownload: handleDownload,
    onRename: handleRename,
    onDelete: handleDeleteFile,
    onCopyPath: handleCopyPath,
    onMoveFile: handleMoveFile,
    onPermissions: isAdmin ? handlePermissions : undefined,
    isAdmin,
  };

  return (
    <FileDropZone onDrop={handleUploadFiles} disabled={uploadFiles.isPending}>
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
          sortField={sortField}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          selectedCount={selectedFiles.size}
          onDeleteSelected={handleDeleteSelected}
        />

        {/* Upload Progress Bar */}
        <UploadProgressBar progress={uploadFiles.uploadProgress} />

        {/* File count + filter indicators */}
        {!isLoading && files.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
            <span>
              {processedFiles.length} عنصر
              {(searchQuery || typeFilter !== 'all') && ` (من ${files.length})`}
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
            files={processedFiles}
            onNavigate={handleNavigate}
            selectedFiles={selectedFiles}
            onSelect={handleSelect}
            {...fileActions}
          />
        ) : (
          <FileList
            files={processedFiles}
            onNavigate={handleNavigate}
            selectedFiles={selectedFiles}
            onSelect={handleSelect}
            {...fileActions}
          />
        )}
      </div>

      {/* File Preview Sheet */}
      <FilePreview
        file={previewFile}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />

      {/* File Permissions Dialog (admin only) */}
      {isAdmin && (
        <FilePermissionsDialog
          file={permissionsFile}
          open={permissionsOpen}
          onOpenChange={setPermissionsOpen}
        />
      )}
    </FileDropZone>
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
