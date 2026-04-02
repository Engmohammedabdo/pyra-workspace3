'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Download, MessageSquare, CheckCircle, RotateCcw } from 'lucide-react';
import { formatDate, formatFileSize } from '@/lib/utils/format';
import { EmptyState } from '@/components/ui/empty-state';

interface ProjectFile {
  id: string;
  file_name: string;
  file_type: string;
  file_size?: number;
  added_at: string;
  approval?: { status: 'pending' | 'approved' | 'revision_requested'; comment: string | null };
}

interface ProjectFilesListProps {
  files: ProjectFile[];
  isNewFile: (addedAt: string) => boolean;
  getFileIcon: (type: string) => React.ElementType;
  approvalStatusConfig: Record<string, { label: string; className: string }>;
  onComment: (id: string, name: string) => void;
  onPreview: (file: ProjectFile) => void;
  onDownload: (id: string) => void;
  onApprove: (id: string) => void;
  onRevision: (id: string) => void;
}

export function ProjectFilesList({
  files,
  isNewFile,
  getFileIcon,
  approvalStatusConfig,
  onComment,
  onPreview,
  onDownload,
  onApprove,
  onRevision,
}: ProjectFilesListProps) {
  if (files.length === 0) {
    return (
      <EmptyState
        icon={require('lucide-react').File}
        title="لا توجد ملفات"
        description="لا توجد ملفات في هذا المشروع"
      />
    );
  }

  return (
    <div className="space-y-3">
      {files.map((file) => {
        const FileTypeIcon = getFileIcon(file.file_type);
        const approval = file.approval;
        const approvalStatus = approval ? approvalStatusConfig[approval.status] : null;

        return (
          <Card key={file.id}>
            <CardContent className="flex items-center gap-4 py-4">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <FileTypeIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p
                    className="text-sm font-medium truncate cursor-pointer hover:text-portal transition-colors"
                    onClick={() => onPreview(file)}
                  >
                    {file.file_name}
                  </p>
                  {isNewFile(file.added_at) && (
                    <Badge className="text-[9px] px-1.5 py-0 bg-portal text-white border-0 animate-pulse">
                      جديد
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  {file.file_size != null && <span>{formatFileSize(file.file_size)}</span>}
                  <span>{formatDate(file.added_at)}</span>
                  {approvalStatus && (
                    <Badge className={cn('text-[10px] px-2 py-0', approvalStatus.className)}>
                      {approvalStatus.label}
                    </Badge>
                  )}
                  {approval?.comment && (
                    <span className="text-muted-foreground italic truncate max-w-48" title={approval.comment}>
                      &ldquo;{approval.comment}&rdquo;
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => onComment(file.id, file.file_name)} className="gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">تعليق</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => onPreview(file)} className="gap-1.5 text-portal border-portal/30 hover:bg-portal/10">
                  <Eye className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">معاينة</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => onDownload(file.id)} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">تحميل</span>
                </Button>
                {(!approval || approval.status === 'pending') && (
                  <>
                    <Button size="sm" onClick={() => onApprove(file.id)} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
                      <CheckCircle className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">موافقة</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onRevision(file.id)} className="gap-1.5 border-amber-500/30 text-amber-600 hover:bg-amber-500/10">
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">تعديل</span>
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
