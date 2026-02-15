'use client';

import { useState, useEffect } from 'react';
import { X, Download, ExternalLink, FileText, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { FileIcon } from './file-icon';
import { formatFileSize, formatRelativeDate } from '@/lib/utils/format';
import { useFileUrl } from '@/hooks/useFiles';
import type { FileListItem } from '@/types/database';

interface FilePreviewProps {
  file: FileListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function isImage(mime: string) {
  return mime.startsWith('image/');
}
function isVideo(mime: string) {
  return mime.startsWith('video/');
}
function isAudio(mime: string) {
  return mime.startsWith('audio/');
}
function isPdf(mime: string) {
  return mime === 'application/pdf';
}
function isText(mime: string) {
  return (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/javascript' ||
    mime === 'application/xml'
  );
}

export function FilePreview({ file, open, onOpenChange }: FilePreviewProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const getUrl = useFileUrl();

  // Get signed URL when file changes
  useEffect(() => {
    if (!file || file.isFolder) {
      setSignedUrl(null);
      return;
    }

    setLoading(true);
    getUrl.mutateAsync({ path: file.path }).then((url) => {
      setSignedUrl(url);
      setLoading(false);
    }).catch(() => {
      setSignedUrl(null);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.path]);

  if (!file) return null;

  const decodedName = decodeURIComponent(file.name);

  const handleDownload = () => {
    if (signedUrl) {
      const a = document.createElement('a');
      a.href = signedUrl;
      a.download = decodedName;
      a.click();
    }
  };

  const handleOpenNewTab = () => {
    if (signedUrl) {
      window.open(signedUrl, '_blank');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-lg p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="p-4 border-b space-y-0">
          <div className="flex items-center gap-3">
            <FileIcon mimeType={file.mimeType} isFolder={file.isFolder} size={24} />
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base truncate">{decodedName}</SheetTitle>
              <SheetDescription className="text-xs">
                {file.isFolder ? 'مجلد' : formatFileSize(file.size)}
                {file.updatedAt && ` · ${formatRelativeDate(file.updatedAt)}`}
              </SheetDescription>
            </div>
          </div>
          {!file.isFolder && (
            <div className="flex items-center gap-2 mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!signedUrl}
              >
                <Download className="h-3.5 w-3.5 me-1" />
                تحميل
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenNewTab}
                disabled={!signedUrl}
              >
                <ExternalLink className="h-3.5 w-3.5 me-1" />
                فتح
              </Button>
            </div>
          )}
        </SheetHeader>

        {/* Preview content */}
        <div className="flex-1 overflow-auto p-4">
          {file.isFolder ? (
            <FolderPreview />
          ) : loading ? (
            <PreviewLoading />
          ) : !signedUrl ? (
            <PreviewError />
          ) : isImage(file.mimeType) ? (
            <ImagePreview url={signedUrl} name={decodedName} />
          ) : isVideo(file.mimeType) ? (
            <VideoPreview url={signedUrl} />
          ) : isAudio(file.mimeType) ? (
            <AudioPreview url={signedUrl} name={decodedName} />
          ) : isPdf(file.mimeType) ? (
            <PdfPreview url={signedUrl} />
          ) : isText(file.mimeType) ? (
            <TextPreview url={signedUrl} />
          ) : (
            <GenericPreview file={file} />
          )}
        </div>

        {/* Metadata footer */}
        {!file.isFolder && (
          <div className="border-t p-4 space-y-2 text-xs text-muted-foreground">
            <MetaRow label="النوع" value={file.mimeType} />
            <MetaRow label="الحجم" value={formatFileSize(file.size)} />
            <MetaRow label="المسار" value={file.path} />
            {file.updatedAt && (
              <MetaRow label="آخر تعديل" value={formatRelativeDate(file.updatedAt)} />
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ----- Sub-components -----

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="font-medium min-w-16 shrink-0">{label}:</span>
      <span className="break-all">{value}</span>
    </div>
  );
}

function PreviewLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-sm text-muted-foreground">جاري التحميل...</div>
    </div>
  );
}

function PreviewError() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
      <Eye className="h-8 w-8 mb-2 opacity-50" />
      <p className="text-sm">فشل في تحميل المعاينة</p>
    </div>
  );
}

function FolderPreview() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
      <FileIcon mimeType="folder" isFolder size={48} />
      <p className="text-sm mt-4">مجلد — انقر مرتين لفتحه</p>
    </div>
  );
}

function ImagePreview({ url, name }: { url: string; name: string }) {
  return (
    <div className="flex items-center justify-center bg-muted/30 rounded-lg min-h-48">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name}
        className="max-w-full max-h-[60vh] object-contain rounded"
        loading="lazy"
      />
    </div>
  );
}

function VideoPreview({ url }: { url: string }) {
  return (
    <div className="bg-black rounded-lg overflow-hidden">
      <video
        src={url}
        controls
        className="w-full max-h-[60vh]"
        preload="metadata"
      />
    </div>
  );
}

function AudioPreview({ url, name }: { url: string; name: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      <FileIcon mimeType="audio/mpeg" isFolder={false} size={48} />
      <p className="text-sm font-medium">{name}</p>
      <audio src={url} controls className="w-full max-w-sm" preload="metadata" />
    </div>
  );
}

function PdfPreview({ url }: { url: string }) {
  return (
    <div className="rounded-lg overflow-hidden border bg-white">
      <iframe
        src={url}
        className="w-full h-[60vh]"
        title="PDF Preview"
      />
    </div>
  );
}

function TextPreview({ url }: { url: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(url)
      .then((res) => res.text())
      .then((text) => setContent(text.slice(0, 50000)))
      .catch(() => setError(true));
  }, [url]);

  if (error) return <PreviewError />;
  if (content === null) return <PreviewLoading />;

  return (
    <div className="rounded-lg border bg-muted/30 overflow-auto max-h-[60vh]">
      <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed" dir="ltr">
        {content}
      </pre>
    </div>
  );
}

function GenericPreview({ file }: { file: FileListItem }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
      <FileIcon mimeType={file.mimeType} isFolder={false} size={48} />
      <p className="text-sm mt-4">لا تتوفر معاينة لهذا النوع من الملفات</p>
      <p className="text-xs mt-1">{file.mimeType}</p>
    </div>
  );
}
