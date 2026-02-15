'use client';

import { FileIcon } from './file-icon';
import { formatFileSize, formatRelativeDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { FileListItem } from '@/types/database';

interface FileListProps {
  files: FileListItem[];
  onNavigate: (file: FileListItem) => void;
  onContextMenu?: (e: React.MouseEvent, file: FileListItem) => void;
  selectedFiles: Set<string>;
  onSelect: (path: string, multi: boolean) => void;
}

export function FileList({
  files,
  onNavigate,
  selectedFiles,
  onSelect,
}: FileListProps) {
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
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_120px_160px] gap-4 px-4 py-2.5 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
        <span>الاسم</span>
        <span className="text-end">الحجم</span>
        <span className="text-end">آخر تعديل</span>
      </div>

      {/* File rows */}
      <div className="divide-y divide-border">
        {files.map((file) => {
          const isSelected = selectedFiles.has(file.path);

          return (
            <div
              key={file.path}
              role="button"
              tabIndex={0}
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
                'grid grid-cols-[1fr_120px_160px] gap-4 px-4 py-3 transition-colors cursor-pointer',
                'hover:bg-accent/50',
                isSelected && 'bg-primary/5'
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
              </div>

              {/* Size */}
              <div className="text-end text-sm text-muted-foreground">
                {file.isFolder ? '—' : formatFileSize(file.size)}
              </div>

              {/* Last modified */}
              <div className="text-end text-sm text-muted-foreground">
                {file.updatedAt ? formatRelativeDate(file.updatedAt) : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
