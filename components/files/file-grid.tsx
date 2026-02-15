'use client';

import { FileIcon } from './file-icon';
import { FileActionButton } from './file-context-menu';
import { formatFileSize } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { FileListItem } from '@/types/database';

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
}: FileGridProps) {
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

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {files.map((file) => {
        const isSelected = selectedFiles.has(file.path);

        return (
          <div
            key={file.path}
            className={cn(
              'group relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all',
              'text-start hover:shadow-md cursor-pointer',
              isSelected
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-transparent hover:border-border bg-card hover:bg-accent/30'
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
              />
            </div>

            {/* Icon */}
            <div
              className={cn(
                'w-12 h-12 rounded-lg flex items-center justify-center transition-colors',
                file.isFolder
                  ? 'bg-pyra-orange/10'
                  : 'bg-muted/50'
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

            {/* Selection indicator */}
            {isSelected && (
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
