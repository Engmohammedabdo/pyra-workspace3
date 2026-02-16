'use client';

import { useState } from 'react';
import { FileIcon } from './file-icon';
import { FileActionButton } from './file-context-menu';
import { formatFileSize, formatRelativeDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { FileListItem } from '@/types/database';

// Custom MIME type for internal drag operations
const PYRA_DND_TYPE = 'application/x-pyra-file-path';

interface FileListProps {
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

export function FileList({
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
}: FileListProps) {
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
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_100px_140px_40px] gap-4 px-4 py-2.5 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
        <span>الاسم</span>
        <span className="text-end">الحجم</span>
        <span className="text-end">آخر تعديل</span>
        <span />
      </div>

      {/* File rows */}
      <div className="divide-y divide-border">
        {files.map((file) => {
          const isSelected = selectedFiles.has(file.path);
          const isDragTarget = dragOverFolder === file.path;
          const isDragging = draggingPath === file.path;

          return (
            <div
              key={file.path}
              role="button"
              tabIndex={0}
              draggable
              onDragStart={(e) => handleDragStart(e, file)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, file)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, file)}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  onSelect(file.path, true);
                } else {
                  onSelect(file.path, false);
                }
              }}
              onDoubleClick={() => onNavigate(file)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onNavigate(file);
              }}
              className={cn(
                'group grid grid-cols-[1fr_100px_140px_40px] gap-4 px-4 py-3 transition-all cursor-pointer',
                'hover:bg-accent/50',
                isSelected && 'bg-primary/5',
                isDragTarget && 'bg-pyra-orange/10 border-2 border-dashed border-pyra-orange -my-px',
                isDragging && 'opacity-40'
              )}
            >
              {/* Name + Icon */}
              <div className="flex items-center gap-3 min-w-0">
                <FileIcon
                  mimeType={file.mimeType}
                  isFolder={file.isFolder}
                  size={20}
                />
                <span className="text-sm font-medium truncate">
                  {decodeURIComponent(file.name)}
                </span>
                {isDragTarget && (
                  <span className="text-xs text-pyra-orange font-semibold shrink-0">
                    ← انقل هنا
                  </span>
                )}
              </div>

              {/* Size */}
              <div className="text-end text-sm text-muted-foreground">
                {file.isFolder ? '—' : formatFileSize(file.size)}
              </div>

              {/* Last modified */}
              <div className="text-end text-sm text-muted-foreground">
                {file.updatedAt ? formatRelativeDate(file.updatedAt) : '—'}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
