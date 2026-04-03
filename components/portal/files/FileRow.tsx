'use client';

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
  File as FileIconLucide,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  FileSpreadsheet,
} from 'lucide-react';
import { type FileWithProject } from './types';

// Helper functions (kept as they depend on local imports)
function isNewFile(addedAt: string): boolean {
  const added = new Date(addedAt).getTime();
  return Date.now() - added < 48 * 60 * 60 * 1000;
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

interface FileRowProps {
  file: FileWithProject;
  onPreview: () => void;
  onDownload: () => void;
  onApprove: () => void;
  onRevision: () => void;
  approveLoading: boolean;
}

export function FileRow({
  file,
  onPreview,
  onDownload,
  onApprove,
  onRevision,
  approveLoading,
}: FileRowProps) {
  const FileTypeIcon = getFileIcon(file.file_type);
  const approval = file.approval;
  const approvalStatus = approval ? approvalStatusConfig[approval.status] : null;
  const canAct = !approval || approval.status === 'pending';

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors border-b last:border-b-0">
      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
        <FileTypeIcon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-sm truncate cursor-pointer hover:text-portal transition-colors"
            onClick={onPreview}
          >
            {file.file_name}
          </span>
          {isNewFile(file.added_at) && (
            <Badge className="text-[9px] px-1.5 py-0 bg-portal text-white border-0 shrink-0">
              جديد
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
          {file.file_size != null && <span>{formatFileSize(file.file_size)}</span>}
          <span>&middot;</span>
          <span>{formatDate(file.added_at)}</span>
          {approvalStatus && (
            <>
              <span>&middot;</span>
              <Badge className={cn('text-[9px] px-1.5 py-0', approvalStatus.className)}>
                {approvalStatus.label}
              </Badge>
            </>
          )}
          {file.tags && file.tags.length > 0 && (
            <>
              <span>&middot;</span>
              {file.tags.slice(0, 2).map((tag) => (
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
              {file.tags.length > 2 && (
                <span className="text-[9px] text-muted-foreground">+{file.tags.length - 2}</span>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="sm" onClick={onPreview} className="h-8 w-8 p-0 text-portal hover:text-portal-secondary hover:bg-portal/10" title="معاينة">
          <Eye className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDownload} className="h-8 w-8 p-0" title="تحميل">
          <Download className="h-4 w-4" />
        </Button>
        {canAct && (
          <>
            <Button
              variant="ghost" size="sm" onClick={onApprove} disabled={approveLoading}
              className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-500/10" title="موافقة"
            >
              {approveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost" size="sm" onClick={onRevision}
              className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10" title="طلب تعديل"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
