'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatFileSize } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  CheckCircle,
  RotateCcw,
  Eye,
  Loader2,
  Star,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  File as FileIconLucide,
  FileText,
} from 'lucide-react';
import { PdfThumbnail } from '@/components/portal/pdf-thumbnail';
import { type FileWithProject } from './types';

// Helper functions (kept as they depend on local imports)
function isNewFile(addedAt: string): boolean {
  const added = new Date(addedAt).getTime();
  return Date.now() - added < 48 * 60 * 60 * 1000;
}

function isImageType(fileType: string): boolean {
  return fileType.toLowerCase().startsWith('image/');
}

function isPdfType(fileType: string): boolean {
  return fileType.toLowerCase() === 'application/pdf';
}

function getFileIcon(fileType: string) {
  const type = fileType.toLowerCase();
  if (type.startsWith('image/')) return FileImage;
  if (type.startsWith('video/')) return FileVideo;
  if (type.startsWith('audio/')) return FileAudio;
  if (type.includes('zip') || type.includes('rar') || type.includes('archive'))
    return FileArchive;
  if (type.includes('pdf') || type.includes('document') || type.includes('word'))
    return FileText;
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv'))
    return FileSpreadsheet;
  if (type.includes('html') || type.includes('javascript') || type.includes('json') || type.includes('css') || type.includes('markdown'))
    return FileCode;
  return FileIconLucide;
}

function getFileColorBg(fileType: string): string {
  const type = fileType.toLowerCase();
  if (type.startsWith('image/')) return 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 dark:text-emerald-400';
  if (type.startsWith('video/')) return 'bg-purple-50 dark:bg-purple-950/30 text-purple-500 dark:text-purple-400';
  if (type.startsWith('audio/')) return 'bg-pink-50 dark:bg-pink-950/30 text-pink-500 dark:text-pink-400';
  if (type.includes('zip') || type.includes('rar') || type.includes('archive'))
    return 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400';
  if (type.includes('pdf'))
    return 'bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400';
  if (type.includes('document') || type.includes('word'))
    return 'bg-blue-50 dark:bg-blue-950/30 text-blue-500 dark:text-blue-400';
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv'))
    return 'bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400';
  if (type.includes('html') || type.includes('javascript') || type.includes('json') || type.includes('css') || type.includes('markdown'))
    return 'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-500 dark:text-cyan-400';
  return 'bg-gray-50 dark:bg-gray-950/30 text-gray-400';
}

const approvalStatusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: 'بانتظار المراجعة',
    className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  },
  approved: {
    label: 'تمت الموافقة',
    className: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  },
  revision_requested: {
    label: 'مطلوب تعديل',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
};

interface FileCardProps {
  file: FileWithProject;
  onPreview: () => void;
  onDownload: () => void;
  onApprove: () => void;
  onRevision: () => void;
  approveLoading: boolean;
  onToggleFavorite: () => void;
  favorited: boolean;
}

export function FileCard({
  file,
  onPreview,
  onDownload,
  onApprove,
  onRevision,
  approveLoading,
  onToggleFavorite,
  favorited,
}: FileCardProps) {
  const FileTypeIcon = getFileIcon(file.file_type);
  const colorBg = getFileColorBg(file.file_type);
  const approval = file.approval;
  const approvalStatus = approval ? approvalStatusConfig[approval.status] : null;
  const isImage = isImageType(file.file_type);
  const isPdf = isPdfType(file.file_type);
  const [imgError, setImgError] = useState(false);
  const canAct = !approval || approval.status === 'pending';

  return (
    <div
      className="group relative rounded-xl border bg-card overflow-hidden hover:shadow-lg hover:border-portal/20 transition-all duration-200 cursor-pointer"
      onClick={onPreview}
    >
      <div className="aspect-[4/3] relative overflow-hidden bg-muted/20">
        {isImage && !imgError ? (
          <img
            src={`/api/portal/files/${file.id}/thumbnail`}
            alt={file.file_name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : isPdf ? (
          <PdfThumbnail
            url={`/api/portal/files/${file.id}/view`}
            fileName={file.file_name}
            className="w-full h-full"
          />
        ) : (
          <div className={cn('w-full h-full flex items-center justify-center', colorBg)}>
            <FileTypeIcon className="h-12 w-12 opacity-80" />
          </div>
        )}

        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); onPreview(); }}
            className="w-9 h-9 rounded-full bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 flex items-center justify-center shadow-lg transition-transform hover:scale-110"
            title="معاينة"
          >
            <Eye className="h-4 w-4 text-gray-700 dark:text-gray-200" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            className="w-9 h-9 rounded-full bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 flex items-center justify-center shadow-lg transition-transform hover:scale-110"
            title="تحميل"
          >
            <Download className="h-4 w-4 text-gray-700 dark:text-gray-200" />
          </button>
          {canAct && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onApprove(); }}
                disabled={approveLoading}
                className="w-9 h-9 rounded-full bg-green-500/90 hover:bg-green-500 flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                title="موافقة"
              >
                {approveLoading ? (
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-white" />
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRevision(); }}
                className="w-9 h-9 rounded-full bg-amber-500/90 hover:bg-amber-500 flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                title="طلب تعديل"
              >
                <RotateCcw className="h-4 w-4 text-white" />
              </button>
            </>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={cn(
            'absolute top-2 end-2 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all',
            favorited
              ? 'bg-amber-100 text-amber-500'
              : 'bg-black/20 text-white opacity-0 group-hover:opacity-100'
          )}
        >
          <Star className={cn('h-4 w-4', favorited && 'fill-amber-500')} />
        </button>

        <div className="absolute top-2 start-2 flex items-center gap-1">
          {isNewFile(file.added_at) && (
            <Badge className="text-[9px] px-1.5 py-0 bg-portal text-white border-0 shadow-sm">
              جديد
            </Badge>
          )}
          {approvalStatus && (
            <Badge className={cn('text-[9px] px-1.5 py-0 shadow-sm', approvalStatus.className)}>
              {approvalStatus.label}
            </Badge>
          )}
        </div>
      </div>

      <div className="p-3">
        <p className="text-sm font-medium line-clamp-2 leading-tight mb-1" title={file.file_name}>
          {file.file_name}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {file.file_size != null && (
            <span>{formatFileSize(file.file_size)}</span>
          )}
          {file.file_size != null && <span>·</span>}
          <span>{formatDate(file.added_at)}</span>
        </div>
        {file.tags && file.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {file.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.tag_name}
                className="inline-flex items-center px-1.5 py-0 rounded text-[9px] font-medium border"
                style={{
                  backgroundColor: `${tag.color}15`,
                  color: tag.color,
                  borderColor: `${tag.color}30`,
                }}
              >
                {tag.tag_name}
              </span>
            ))}
            {file.tags.length > 3 && (
              <span className="text-[9px] text-muted-foreground">+{file.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
