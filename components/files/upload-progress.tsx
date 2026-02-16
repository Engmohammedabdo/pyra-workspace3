'use client';

import { Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { UploadProgress } from '@/hooks/useFiles';

interface UploadProgressBarProps {
  progress: UploadProgress | null;
}

export function UploadProgressBar({ progress }: UploadProgressBarProps) {
  if (!progress) return null;

  const { totalFiles, currentFile, currentFileName, percentage, overallPercentage } = progress;

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3 animate-in slide-in-from-top-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium min-w-0">
          <div className="w-8 h-8 rounded-full bg-pyra-orange/10 flex items-center justify-center shrink-0">
            <Upload className="h-4 w-4 text-pyra-orange animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="truncate">
              جاري رفع: <span className="text-muted-foreground">{currentFileName}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              ملف {currentFile} من {totalFiles}
            </p>
          </div>
        </div>
        <span className="text-lg font-bold text-pyra-orange tabular-nums shrink-0">
          {overallPercentage}%
        </span>
      </div>

      {/* Overall progress bar */}
      <div className="space-y-1.5">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-pyra-orange rounded-full transition-all duration-300 ease-out"
            style={{ width: `${overallPercentage}%` }}
          />
        </div>

        {/* Per-file progress (only for multi-file uploads) */}
        {totalFiles > 1 && (
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-pyra-orange/50 rounded-full transition-all duration-200 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
