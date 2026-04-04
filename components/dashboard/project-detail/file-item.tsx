'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Eye, EyeOff, Download } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatFileSize, formatRelativeDate } from '@/lib/utils/format';

export function FileItem({ file, onToggleVisibility, onDownload, isUpdating }: { file: any, onToggleVisibility: (f: any) => void, onDownload: (f: any) => void, isUpdating: boolean }) {
  const Icon = ({ mimeType }: { mimeType: string }) => {
    const type = mimeType.toLowerCase();
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎥';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf')) return '📄';
    return '📁';
  };

  return (
    <div className={cn('flex items-center gap-3 py-2.5 px-3 ps-8 hover:bg-muted/30 transition-colors group', file.client_visible && 'bg-green-500/[0.02]')}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="shrink-0">
              <Checkbox checked={file.client_visible} disabled={isUpdating} onCheckedChange={() => onToggleVisibility(file)} className={cn('h-4 w-4 transition-colors', file.client_visible ? 'border-green-500 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500' : 'border-muted-foreground/40')} />
            </div>
          </TooltipTrigger>
          <TooltipContent>{file.client_visible ? 'إخفاء عن العميل' : 'إظهار للعميل'}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className={cn('p-1.5 rounded-lg shrink-0', file.client_visible ? 'bg-green-500/10' : 'bg-muted')}>
        <span className="text-[12px]">{Icon({ mimeType: file.mime_type })}</span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.file_name}</p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {file.file_size && <span>{formatFileSize(file.file_size)}</span>}
          {file.file_size && <span>·</span>}
          <span>{formatRelativeDate(file.created_at)}</span>
          <span>·</span>
          <span>{file.uploaded_by}</span>
        </div>
      </div>

      {isUpdating ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
      ) : (
        <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 border-opacity-30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0', file.client_visible ? 'border-green-500 text-green-600' : 'border-muted-foreground/20 text-muted-foreground/50')}>
          {file.client_visible ? <Eye className="h-2 w-2 me-0.5" /> : <EyeOff className="h-2 w-2 me-0.5" />}
          {file.client_visible ? 'مرئي' : 'مخفي'}
        </Badge>
      )}

      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={() => onDownload(file)} aria-label="تحميل">
        <Download className="h-3 w-3" />
      </Button>
    </div>
  );
}
