'use client';

import { useState } from 'react';
import { FileIcon } from './file-icon';
import { FileActionButton } from './file-context-menu';
import { FileTagsBadges } from './file-tags';
import { formatFileSize } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { FileListItem } from '@/types/database';

// Custom MIME type for internal drag operations
const PYRA_DND_TYPE = 'application/x-pyra-file-path';

interface FileGridProps {
  files: FileListItem[];
  onNavigate: (file: FileListItem) => void;
  selectedFiles: Set<string>;
  onSelect: (path: string, multi: boolean) => void;
  onPreview: (file: FileListItem) => void;
  onDownload: (file: FileListItem) => void;
  onRename: (file: FileListItem, newName: string) => void;
  onDelete: (file: FileListItem) => void;
  onCopyPath: (file: FileListItem) => void;
  onMoveFile?: (sourcePath: string, destinationFolder: string) => void;
  onPermissions?: (file: FileListItem) => void;
  isAdmin?: boolean;
}

export function FileGrid({
  files,
  onNavigate,
  selectedFiles,
  onSelect,
  onPreview,
  onDownload,
  onRename,
  onDelete,
  onCopyPath,
  onMoveFile,
  onPermissions,
  isAdmin,
}: FileGridProps) {
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <p className="text-base font-medium mb-1">لا توجد ملفات</p>
        <p className="text-sm">قم برفع ملفات أو إنشاء مجلد جديد للبدء</p>
      </div>
    );
  }

  const handleDragStart = (e: React.DragEvent, file: FileListItem) => {
    e.dataTransfer.setData(PYRA_DND_TYPE, file.path);
    e.dataTransfer.setData('text/plain', file.path);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingPath(file.path);
  };

  const handleDragEnd = () => {
    setDraggingPath(null);
    setDragOverFolder(null);
  };

  const handleDragOver = (e: React.DragEvent, file: FileListItem) => {
    // Only allow dropping on folders that aren't the source
    if (!file.isFolder) return;
    if (!e.dataTransfer.types.includes(PYRA_DND_TYPE)) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolder(file.path);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);
  };

  const handleDrop = (e: React.DragEvent, targetFolder: FileListItem) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);
    setDraggingPath(null);

    if (!targetFolder.isFolder) return;

    const sourcePath = e.dataTransfer.getData(PYRA_DND_TYPE);
    if (!sourcePath || sourcePath === targetFolder.path) return;

    // Don't allow dropping a folder into itself
    if (targetFolder.path.startsWith(sourcePath + '/')) return;

    onMoveFile?.(sourcePath, targetFolder.path);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {files.map((file) => {
        const isSelected = selectedFiles.has(file.path);
        const isDragTarget = dragOverFolder === file.path;
        const isDragging = draggingPath === file.path;

        return (
          <div
            key={file.path}
            draggable
            onDragStart={(e) => handleDragStart(e, file)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, file)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, file)}
            className={cn(
              'group relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all',
              'text-start hover:shadow-md cursor-pointer',
              isSelected
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-transparent hover:border-border bg-card hover:bg-accent/30',
              isDragTarget && 'border-2 border-dashed border-pyra-orange bg-pyra-orange/5 shadow-lg scale-105',
              isDragging && 'opacity-40 scale-95'
            )}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey) {
                onSelect(file.path, true);
              } else {
                onSelect(file.path, false);
              }
            }}
            onDoubleClick={() => onNavigate(file)}
          >
            {/* Action menu */}
            <div className="absolute top-2 end-2 z-10" onClick={(e) => e.stopPropagation()}>
              <FileActionButton
                file={file}
                onPreview={onPreview}
                onDownload={onDownload}
                onRename={onRename}
                onDelete={onDelete}
                onCopyPath={onCopyPath}
                onPermissions={onPermissions}
                isAdmin={isAdmin}
              />
            </div>

            {/* Icon */}
            <div
              className={cn(
                'w-12 h-12 rounded-lg flex items-center justify-center transition-colors',
                file.isFolder
                  ? 'bg-pyra-orange/10'
                  : 'bg-muted/50',
                isDragTarget && 'bg-pyra-orange/20'
              )}
            >
              <FileIcon
                mimeType={file.mimeType}
                isFolder={file.isFolder}
                size={28}
              />
            </div>

            {/* Name */}
            <span className="text-xs font-medium text-center line-clamp-2 w-full">
              {decodeURIComponent(file.name)}
            </span>

            {/* Size (files only) */}
            {!file.isFolder && file.size > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {formatFileSize(file.size)}
              </span>
            )}

            {/* Tags */}
            <FileTagsBadges filePath={file.path} />

            {/* Drop indicator for folders */}
            {isDragTarget && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl pointer-events-none">
                <span className="text-xs font-semibold text-pyra-orange bg-background/80 px-2 py-1 rounded">
                  انقل هنا
                </span>
              </div>
            )}

            {/* Selection indicator */}
            {isSelected && !isDragTarget && (
              <div className="absolute top-2 start-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
