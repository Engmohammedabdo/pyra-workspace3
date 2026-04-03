'use client';

import { Folder } from 'lucide-react';
import { formatFileSize } from '@/lib/utils/format';
import { type TreeFolder } from './types';

interface FolderCardProps {
  folder: TreeFolder;
  onClick: () => void;
}

export function FolderCard({ folder, onClick }: FolderCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/40 hover:shadow-md transition-all duration-200 text-start min-w-[180px] max-w-[240px] shrink-0 group"
    >
      <div className="w-10 h-10 rounded-lg bg-portal/10 flex items-center justify-center shrink-0 group-hover:bg-portal/20 transition-colors">
        <Folder className="h-5 w-5 text-portal" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{folder.label}</p>
        <p className="text-[11px] text-muted-foreground">
          {folder.fileCount} ملف
          {folder.totalSize > 0 && <> · {formatFileSize(folder.totalSize)}</>}
        </p>
      </div>
    </button>
  );
}
