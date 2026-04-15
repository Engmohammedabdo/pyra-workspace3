'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Download,
  ExternalLink,
  FileText,
  Eye,
  Send,
  MessageSquare,
  Loader2,
  History,
  Info,
  Music,
  Code,
  FileImage,
  Film,
  FileType,
  ZoomIn,
  ZoomOut,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { FileIcon } from './file-icon';
import { VersionHistory } from './version-history';
import { DocxViewer } from './docx-viewer';
import { PdfViewer } from './pdf-viewer';
import { FileTagsPopover } from './file-tags';
import { formatFileSize, formatRelativeDate } from '@/lib/utils/format';
import { useFileUrl } from '@/hooks/useFiles';
import type { FileListItem } from '@/types/database';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { MentionTextarea } from '@/components/ui/mention-textarea';
import { renderTextWithMentions } from '@/lib/utils/mentions';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';

// ── Types ──

/**
 * For dashboard mode use `FileListItem` (full file object).
 * For portal mode use `PortalFile` (lightweight, id-based).
 */
export interface PortalFile {
  id: string;
  file_name: string;
  file_type: string; // mime_type
  file_size?: number;
}

export type FilePreviewMode = 'dashboard' | 'portal';

interface FilePreviewPropsBase {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: FilePreviewMode;
}

interface DashboardFilePreviewProps extends FilePreviewPropsBase {
  mode: 'dashboard';
  file: FileListItem | null;
  /** Optional: if set, shows a comments section for this project + file */
  projectId?: string;
  /** Optional: file_id (from pyra_project_files) for file-level comments */
  fileId?: string;
  portalFile?: never;
}

interface PortalFilePreviewProps extends FilePreviewPropsBase {
  mode: 'portal';
  portalFile: PortalFile | null;
  file?: never;
  projectId?: never;
  fileId?: never;
}

export type FilePreviewProps = DashboardFilePreviewProps | PortalFilePreviewProps;

// ── MIME type helpers ──

function isImage(mime: string) { return mime.startsWith('image/'); }
function isVideo(mime: string) { return mime.startsWith('video/'); }
function isAudio(mime: string) { return mime.startsWith('audio/'); }
function isPdf(mime: string) { return mime === 'application/pdf'; }
function isText(mime: string) {
  return (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/javascript' ||
    mime === 'application/xml'
  );
}
function isMarkdown(name: string) {
  const lower = name.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdx');
}
function isDocx(nameOrMime: string) {
  const lower = nameOrMime.toLowerCase();
  return (
    lower.endsWith('.docx') ||
    lower.endsWith('.doc') ||
    lower === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}
function isSpreadsheet(name: string) {
  const lower = name.toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv');
}
function isCsv(name: string) {
  return name.toLowerCase().endsWith('.csv');
}

// Detect if text is predominantly RTL (Arabic, Hebrew, etc.)
function detectDirection(text: string): 'rtl' | 'ltr' {
  const rtlChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\uFE70-\uFEFF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  return rtlChars > latinChars ? 'rtl' : 'ltr';
}

function getFileTypeInfo(mime: string, name: string) {
  if (isPdf(mime)) return { icon: FileType, color: 'text-red-500', bg: 'bg-red-500/10', label: 'PDF' };
  if (isImage(mime)) return { icon: FileImage, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'صورة' };
  if (isVideo(mime)) return { icon: Film, color: 'text-purple-500', bg: 'bg-purple-500/10', label: 'فيديو' };
  if (isAudio(mime)) return { icon: Music, color: 'text-pink-500', bg: 'bg-pink-500/10', label: 'صوت' };
  if (isSpreadsheet(name)) return { icon: FileText, color: 'text-green-600', bg: 'bg-green-600/10', label: 'جدول' };
  if (isDocx(name)) return { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-600/10', label: 'Word' };
  if (isMarkdown(name)) return { icon: FileText, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Markdown' };
  if (isText(mime)) return { icon: Code, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'نص' };
  return { icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted', label: 'ملف' };
}

// ── Animation variants ──

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const panelVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, damping: 25, stiffness: 300 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: { duration: 0.15 },
  },
};

// ── Main unified component ──

export function FilePreview(props: FilePreviewProps) {
  if (props.mode === 'portal') {
    return <PortalFilePreviewInner {...props} />;
  }
  return <DashboardFilePreviewInner {...props} />;
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD MODE
// ─────────────────────────────────────────────────────────────

function DashboardFilePreviewInner({ file, open, onOpenChange, projectId, fileId }: DashboardFilePreviewProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const getUrl = useFileUrl();

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

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onOpenChange]);

  if (!file || !open) return null;

  const decodedName = decodeURIComponent(file.name);
  const typeInfo = getFileTypeInfo(file.mimeType, decodedName);
  const TypeIcon = typeInfo.icon;

  const handleDownload = () => {
    if (signedUrl) {
      const a = document.createElement('a');
      a.href = signedUrl + (signedUrl.includes('?') ? '&' : '?') + 'download=true';
      a.download = decodedName;
      a.click();
    }
  };

  const handleOpenNewTab = () => {
    if (signedUrl) window.open(signedUrl, '_blank');
  };

  const isMarkdownFile = !file.isFolder && isMarkdown(decodedName);
  const isDocxFile = !file.isFolder && isDocx(decodedName);
  const isSpreadsheetFile = !file.isFolder && isSpreadsheet(decodedName);

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md animate-in fade-in duration-200">
        {/* TOP BAR */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-10 h-10 rounded-xl ${typeInfo.bg} flex items-center justify-center shrink-0`}>
              <TypeIcon className={`h-5 w-5 ${typeInfo.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold truncate">{decodedName}</h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${typeInfo.color} border-current/20`}>
                  {typeInfo.label}
                </Badge>
                <span>{formatFileSize(file.size)}</span>
                {file.updatedAt && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                    <span>{formatRelativeDate(file.updatedAt)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ms-4">
            <FileTagsPopover filePath={file.path} />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-orange-500"
              onClick={() => setShowVersions(true)}
              title="النسخ"
              aria-label="النسخ"
            >
              <History className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setShowInfo(!showInfo)}
              title="معلومات الملف"
              aria-label="معلومات الملف"
            >
              <Info className="h-4 w-4" />
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleDownload}
              disabled={!signedUrl}
            >
              <Download className="h-3.5 w-3.5" />
              تحميل
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleOpenNewTab}
              disabled={!signedUrl}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              فتح
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onOpenChange(false)}
              aria-label="إغلاق"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 overflow-auto">
            {file.isFolder ? (
              <FolderPreview />
            ) : loading ? (
              <PreviewLoading />
            ) : !signedUrl ? (
              <PreviewError />
            ) : isPdf(file.mimeType) ? (
              <PdfViewer url={signedUrl} />
            ) : isImage(file.mimeType) ? (
              <ImagePreview url={signedUrl} name={decodedName} />
            ) : isVideo(file.mimeType) ? (
              <VideoPreview url={signedUrl} />
            ) : isAudio(file.mimeType) ? (
              <AudioPreview url={signedUrl} name={decodedName} />
            ) : isSpreadsheetFile ? (
              <div className="max-w-6xl mx-auto p-6">
                <SpreadsheetPreview url={signedUrl} fileName={decodedName} />
              </div>
            ) : isDocxFile ? (
              <div className="max-w-4xl mx-auto p-6">
                <DocxViewer url={signedUrl} />
              </div>
            ) : isMarkdownFile ? (
              <div className="max-w-4xl mx-auto p-6">
                <MarkdownPreview url={signedUrl} />
              </div>
            ) : isText(file.mimeType) ? (
              <div className="max-w-4xl mx-auto p-6">
                <TextPreview url={signedUrl} fileName={decodedName} />
              </div>
            ) : (
              <GenericPreview file={file} />
            )}
          </div>

          {/* Info Side Panel */}
          {showInfo && (
            <div className="w-72 border-s bg-card/50 backdrop-blur-sm p-4 space-y-4 overflow-y-auto shrink-0 animate-in slide-in-from-left duration-200">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                معلومات الملف
              </h3>
              <div className="space-y-3">
                <InfoRow label="الاسم" value={decodedName} />
                <InfoRow label="النوع" value={file.mimeType} />
                <InfoRow label="الحجم" value={formatFileSize(file.size)} />
                <InfoRow label="المسار" value={file.path} mono />
                {file.updatedAt && (
                  <InfoRow label="آخر تعديل" value={formatRelativeDate(file.updatedAt)} />
                )}
              </div>
              {projectId && fileId && (
                <div className="pt-4 border-t">
                  <FileCommentsSection projectId={projectId} fileId={fileId} />
                </div>
              )}
              <div className="pt-4 border-t">
                <ActivityTimeline filePath={file.path} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Version History Sheet */}
      {showVersions && (
        <VersionHistory
          filePath={file?.path || null}
          open={showVersions}
          onOpenChange={setShowVersions}
          onRestored={() => {
            if (file && !file.isFolder) {
              setLoading(true);
              getUrl.mutateAsync({ path: file.path }).then((url) => {
                setSignedUrl(url);
                setLoading(false);
              }).catch(() => {
                setSignedUrl(null);
                setLoading(false);
              });
            }
          }}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// PORTAL MODE
// ─────────────────────────────────────────────────────────────

function PortalFilePreviewInner({ portalFile: file, open, onOpenChange }: PortalFilePreviewProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [resolvedMime, setResolvedMime] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !open) {
      setSignedUrl(null);
      setError(false);
      setResolvedMime(null);
      return;
    }
    setLoading(true);
    setError(false);
    fetchAPI<{ url?: string; mime_type?: string }>(`/api/portal/files/${file.id}/preview`)
      .then((data) => {
        if (data?.url) {
          setSignedUrl(data.url);
          if (data.mime_type) setResolvedMime(data.mime_type);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [file?.id, open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onOpenChange]);

  const handleDownload = useCallback(() => {
    if (file) window.open(`/api/portal/files/${file.id}/download`, '_blank');
  }, [file]);

  if (!file) return null;

  const decodedName = decodeURIComponent(file.file_name);
  const effectiveMime = resolvedMime || file.file_type;
  const typeInfo = getFileTypeInfo(effectiveMime, decodedName);
  const TypeIcon = typeInfo.icon;

  const previewable =
    isImage(effectiveMime) ||
    isVideo(effectiveMime) ||
    isAudio(effectiveMime) ||
    isPdf(effectiveMime) ||
    isText(effectiveMime) ||
    isDocx(effectiveMime);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md"
        >
          {/* Top Bar */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.2 }}
            className="flex items-center justify-between px-4 py-3 border-b bg-background/80 backdrop-blur-sm shrink-0"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={`w-10 h-10 rounded-xl ${typeInfo.bg} flex items-center justify-center shrink-0`}>
                <TypeIcon className={`h-5 w-5 ${typeInfo.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold truncate">{decodedName}</h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${typeInfo.color} border-current/20`}>
                    {typeInfo.label}
                  </Badge>
                  {file.file_size != null && file.file_size > 0 && (
                    <span>{formatFileSize(file.file_size)}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 ms-4">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={handleDownload}
              >
                <Download className="h-3.5 w-3.5" />
                تحميل
              </Button>
              <div className="w-px h-5 bg-border mx-1" />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onOpenChange(false)}
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>

          {/* Content Area */}
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex-1 overflow-hidden"
          >
            {loading ? (
              <PreviewLoading />
            ) : error || !signedUrl ? (
              <PreviewError />
            ) : !previewable ? (
              <PortalGenericPreview name={decodedName} typeInfo={typeInfo} onDownload={handleDownload} />
            ) : isImage(effectiveMime) ? (
              <ImagePreview url={signedUrl} name={decodedName} />
            ) : isVideo(effectiveMime) ? (
              <VideoPreview url={signedUrl} />
            ) : isPdf(effectiveMime) ? (
              <PortalPdfPreview url={`/api/portal/files/${file.id}/view`} />
            ) : isAudio(effectiveMime) ? (
              <AudioPreview url={signedUrl} name={decodedName} />
            ) : isText(effectiveMime) ? (
              <PortalTextPreview url={signedUrl} name={decodedName} mime={effectiveMime} />
            ) : isDocx(effectiveMime) ? (
              <PortalDocxPreview url={signedUrl} name={decodedName} onDownload={handleDownload} />
            ) : (
              <PortalGenericPreview name={decodedName} typeInfo={typeInfo} onDownload={handleDownload} />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ----- Shared Sub-components -----

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <p className={`text-xs break-all ${mono ? 'font-mono text-muted-foreground' : ''}`}>{value}</p>
    </div>
  );
}

function PreviewLoading() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl bg-orange-500/20 animate-ping" />
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">جاري تحميل المعاينة...</p>
        <p className="text-xs text-muted-foreground mt-1">يرجى الانتظار</p>
      </div>
    </div>
  );
}

function PreviewError() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
      <div className="w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <Eye className="h-10 w-10 text-destructive/50" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-destructive">فشل في تحميل المعاينة</p>
        <p className="text-xs text-muted-foreground mt-2 max-w-xs">
          تأكد من وجود الملف وصلاحيتك للوصول إليه
        </p>
      </div>
    </div>
  );
}

function FolderPreview() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground">
      <FileIcon mimeType="folder" isFolder size={64} />
      <p className="text-sm mt-6 font-medium">مجلد — انقر مرتين لفتحه</p>
    </div>
  );
}

// =================== IMAGE PREVIEW ===================
function ImagePreview({ url, name }: { url: string; name: string }) {
  const [imgZoom, setImgZoom] = useState(1);
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="flex flex-col h-full relative">
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-background/80 backdrop-blur-sm border rounded-full px-3 py-1.5 shadow-lg dark:shadow-black/20">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setImgZoom((z) => Math.max(0.25, z - 0.25))}
          aria-label="تصغير"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-mono min-w-[40px] text-center">{Math.round(imgZoom * 100)}%</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setImgZoom((z) => Math.min(4, z + 0.25))}
          aria-label="تكبير"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-4 bg-border" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[10px] px-2"
          onClick={() => setImgZoom(1)}
        >
          تصفير
        </Button>
      </div>

      <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-[repeating-conic-gradient(#0001_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#fff1_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          className="transition-transform duration-200 rounded-lg shadow-2xl dark:shadow-black/25 max-w-none"
          style={{
            transform: `scale(${imgZoom})`,
            maxWidth: imgZoom === 1 ? '100%' : 'none',
            maxHeight: imgZoom === 1 ? '80vh' : 'none',
          }}
          loading="lazy"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  );
}

// =================== VIDEO PREVIEW ===================
function VideoPreview({ url }: { url: string }) {
  return (
    <div className="flex items-center justify-center h-full bg-black/90 p-4">
      <video
        src={url}
        controls
        autoPlay={false}
        className="max-w-full max-h-[85vh] rounded-lg shadow-2xl dark:shadow-black/25"
        preload="metadata"
      />
    </div>
  );
}

// =================== AUDIO PREVIEW ===================
function AudioPreview({ url, name }: { url: string; name: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 p-8">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-500 to-violet-500 blur-3xl opacity-20 animate-pulse" />
        <div className="relative w-40 h-40 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-violet-600 flex items-center justify-center shadow-2xl shadow-purple-500/20">
          <div className="w-32 h-32 rounded-full bg-background/90 backdrop-blur-sm flex items-center justify-center">
            <Music className="h-12 w-12 text-purple-500" />
          </div>
        </div>
      </div>
      <div className="text-center">
        <p className="text-base font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground mt-1">ملف صوتي</p>
      </div>
      <audio src={url} controls className="w-full max-w-md" preload="metadata" />
    </div>
  );
}

// =================== MARKDOWN PREVIEW (dashboard) ===================
function MarkdownPreview({ url }: { url: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(url)
      .then((res) => res.text())
      .then((text) => setContent(text.slice(0, 100000)))
      .catch(() => setError(true));
  }, [url]);

  const direction = useMemo(() => {
    if (!content) return 'ltr';
    return detectDirection(content);
  }, [content]);

  if (error) return <PreviewError />;
  if (content === null) return <PreviewLoading />;

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-auto p-8" dir={direction}>
      <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:leading-relaxed prose-a:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-muted prose-pre:border prose-pre:rounded-lg prose-img:rounded-lg prose-table:text-sm prose-th:bg-muted/50 prose-td:border prose-th:border prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </article>
    </div>
  );
}

// =================== TEXT PREVIEW (dashboard) ===================
const MAX_CODE_CHARS = 20000;

function getShikiLang(fileName: string): string | null {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  const map: Record<string, string> = {
    '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.ts': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
    '.jsx': 'jsx', '.tsx': 'tsx',
    '.css': 'css', '.scss': 'scss', '.less': 'less',
    '.html': 'html', '.htm': 'html', '.vue': 'vue', '.svelte': 'svelte',
    '.xml': 'xml', '.svg': 'xml',
    '.json': 'json', '.jsonc': 'jsonc',
    '.py': 'python', '.pyw': 'python',
    '.java': 'java', '.kt': 'kotlin', '.kts': 'kotlin',
    '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp', '.cc': 'cpp',
    '.cs': 'csharp', '.rs': 'rust', '.go': 'go', '.rb': 'ruby', '.php': 'php',
    '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
    '.ps1': 'powershell',
    '.yaml': 'yaml', '.yml': 'yaml',
    '.toml': 'toml', '.sql': 'sql',
    '.md': 'markdown', '.mdx': 'mdx',
    '.graphql': 'graphql', '.gql': 'graphql',
    '.dockerfile': 'dockerfile',
    '.r': 'r', '.swift': 'swift', '.dart': 'dart', '.lua': 'lua',
    '.env': 'dotenv', '.ini': 'ini', '.cfg': 'ini', '.prisma': 'prisma',
  };
  return map[ext] || null;
}

function TextPreview({ url, fileName }: { url: string; fileName?: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    fetch(url)
      .then((res) => res.text())
      .then((text) => setContent(text.slice(0, 50000)))
      .catch(() => setError(true));
  }, [url]);

  useEffect(() => {
    if (!content || !fileName) return;
    const lang = getShikiLang(fileName);
    if (!lang) { setHighlighted(null); return; }
    const codeToHighlight = content.slice(0, MAX_CODE_CHARS);
    let cancelled = false;
    import('shiki')
      .then(({ codeToHtml }) =>
        codeToHtml(codeToHighlight, { lang, theme: theme === 'dark' ? 'github-dark' : 'github-light' })
      )
      .then((html) => { if (!cancelled) setHighlighted(html); })
      .catch(() => { if (!cancelled) setHighlighted(null); });
    return () => { cancelled = true; };
  }, [content, fileName, theme]);

  if (error) return <PreviewError />;
  if (content === null) return <PreviewLoading />;

  const lineCount = content.split('\n').length;
  const truncated = content.length > MAX_CODE_CHARS;

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Code className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{fileName}</span>
          {fileName && getShikiLang(fileName) && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {getShikiLang(fileName)}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {truncated && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">
              أول {MAX_CODE_CHARS.toLocaleString()} حرف
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">{lineCount} سطر</span>
        </div>
      </div>
      <div className="overflow-auto max-h-[70vh]">
        {highlighted ? (
          <div
            className="shiki-preview text-xs leading-relaxed [&_pre]:!p-4 [&_pre]:!m-0 [&_pre]:!bg-transparent [&_code]:!text-xs [&_code]:!leading-relaxed"
            dir="ltr"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed" dir="ltr">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}

// =================== GENERIC PREVIEW (dashboard) ===================
function GenericPreview({ file }: { file: FileListItem }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
      <div className="w-24 h-24 rounded-2xl bg-muted/50 flex items-center justify-center">
        <FileIcon mimeType={file.mimeType} isFolder={false} size={48} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">لا تتوفر معاينة لهذا النوع</p>
        <p className="text-xs text-muted-foreground mt-1">{file.mimeType}</p>
      </div>
      <p className="text-xs text-muted-foreground max-w-sm text-center">
        يمكنك تحميل الملف أو فتحه في تطبيق خارجي باستخدام الأزرار أعلاه
      </p>
    </div>
  );
}

// =================== SPREADSHEET PREVIEW ===================
const MAX_PREVIEW_ROWS = 500;

function SpreadsheetPreview({ url, fileName }: { url: string; fileName: string }) {
  const [sheets, setSheets] = useState<{ name: string; data: string[][] }[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [totalRows, setTotalRows] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(false);
    if (isCsv(fileName)) {
      fetch(url)
        .then((res) => res.text())
        .then((text) => {
          const rows = parseCsv(text);
          setTotalRows(rows.length);
          setSheets([{ name: 'Sheet1', data: rows.slice(0, MAX_PREVIEW_ROWS + 1) }]);
          setActiveSheet(0);
          setLoading(false);
        })
        .catch(() => { setError(true); setLoading(false); });
    } else {
      fetch(url)
        .then((res) => res.arrayBuffer())
        .then(async (buffer) => {
          const XLSX = (await import('xlsx')).default;
          const wb = XLSX.read(buffer, { type: 'array' });
          const parsed = wb.SheetNames.map((name) => {
            const sheet = wb.Sheets[name];
            const json: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            return { name, data: json };
          });
          if (parsed.length > 0) setTotalRows(parsed[0].data.length);
          setSheets(parsed.map((s) => ({ ...s, data: s.data.slice(0, MAX_PREVIEW_ROWS + 1) })));
          setActiveSheet(0);
          setLoading(false);
        })
        .catch(() => { setError(true); setLoading(false); });
    }
  }, [url, fileName]);

  if (loading) return <PreviewLoading />;
  if (error || sheets.length === 0) return <PreviewError />;

  const current = sheets[activeSheet];
  const headerRow = current.data[0] || [];
  const bodyRows = current.data.slice(1);

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {sheets.length > 1 && (
        <div className="flex items-center gap-1 px-4 py-2 border-b bg-muted/30 overflow-x-auto">
          {sheets.map((sheet, idx) => (
            <button
              key={sheet.name}
              onClick={() => { setActiveSheet(idx); setTotalRows(sheets[idx].data.length); }}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
                idx === activeSheet ? 'bg-pyra-orange text-white font-medium' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/20">
        <span className="text-xs text-muted-foreground">
          {bodyRows.length} صف{totalRows > MAX_PREVIEW_ROWS && ` (من أصل ${totalRows - 1})`} · {headerRow.length} عمود
        </span>
        {totalRows > MAX_PREVIEW_ROWS && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            يتم عرض أول {MAX_PREVIEW_ROWS} صف فقط
          </span>
        )}
      </div>
      <div className="overflow-auto max-h-[65vh]">
        <table className="w-full text-xs border-collapse" dir="auto">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/80 backdrop-blur-sm">
              <th className="px-3 py-2 text-center text-muted-foreground font-medium border-b border-e w-10">#</th>
              {headerRow.map((cell, i) => (
                <th key={i} className="px-3 py-2 text-start font-semibold border-b border-e whitespace-nowrap">
                  {String(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-accent/30 transition-colors">
                <td className="px-3 py-1.5 text-center text-muted-foreground border-e tabular-nums">{rowIdx + 1}</td>
                {headerRow.map((_, colIdx) => (
                  <td key={colIdx} className="px-3 py-1.5 border-e whitespace-nowrap max-w-[300px] truncate">
                    {String(row[colIdx] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { inQuote = false; }
      } else { cell += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',' || ch === '\t' || ch === ';') { current.push(cell); cell = ''; }
      else if (ch === '\n') {
        current.push(cell); cell = '';
        if (current.some((c) => c !== '')) rows.push(current);
        current = [];
      } else if (ch !== '\r') { cell += ch; }
    }
  }
  current.push(cell);
  if (current.some((c) => c !== '')) rows.push(current);
  return rows;
}

// =================== FILE COMMENTS SECTION ===================
interface CommentItem {
  id: string;
  author_type: 'client' | 'team';
  author_name: string;
  text: string;
  mentions: string[];
  created_at: string;
}

function FileCommentsSection({ projectId, fileId }: { projectId: string; fileId: string }) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState('');
  const [sending, setSending] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const data = await fetchAPI<CommentItem[]>(`/api/comments?project_id=${projectId}&file_id=${fileId}`);
      setComments(data);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [projectId, fileId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || sending) return;
    setSending(true);
    try {
      await mutateAPI('/api/comments', 'POST', { project_id: projectId, file_id: fileId, text: newText.trim() });
      setNewText(''); await fetchComments(); toast.success('تم إرسال التعليق');
    } catch { toast.error('حدث خطأ'); } finally { setSending(false); }
  };

  const displayComments = showAll ? comments : comments.slice(-3);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">التعليقات</span>
        {comments.length > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{comments.length}</Badge>
        )}
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-muted-foreground py-2">جاري التحميل...</p>
        ) : comments.length === 0 ? (
          <EmptyState icon={MessageSquare} title="لا توجد تعليقات" className="py-4" />
        ) : (
          <>
            {!showAll && comments.length > 3 && (
              <button onClick={() => setShowAll(true)} className="text-xs text-orange-500 hover:underline">
                عرض {comments.length - 3} تعليقات أقدم
              </button>
            )}
            {displayComments.map((c) => {
              const isTeam = c.author_type === 'team';
              return (
                <div key={c.id} className={`rounded-lg p-2.5 text-xs ${isTeam ? 'bg-blue-500/5 border border-blue-500/10' : 'bg-orange-500/5 border border-orange-500/10'}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-medium">{c.author_name}</span>
                    <Badge className={`text-[9px] px-1 py-0 ${isTeam ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-orange-500/10 text-orange-600 border-orange-500/20'}`}>
                      {isTeam ? 'فريق' : 'عميل'}
                    </Badge>
                    <span className="text-muted-foreground ms-auto text-[10px]">{formatRelativeDate(c.created_at)}</span>
                  </div>
                  <p className="leading-relaxed text-foreground/80 whitespace-pre-line">
                    {renderTextWithMentions(c.text, 'dashboard')}
                  </p>
                </div>
              );
            })}
          </>
        )}
      </div>
      <form onSubmit={handleSubmit} className="flex items-end gap-2 pt-3">
        <MentionTextarea
          value={newText}
          onChange={setNewText}
          projectId={projectId}
          variant="dashboard"
          placeholder="اكتب تعليق... (استخدم @ للإشارة)"
          rows={2}
          className="flex-1 min-h-[48px] max-h-24 text-xs"
        />
        <Button
          type="submit"
          size="sm"
          disabled={sending || !newText.trim()}
          className="h-9 w-9 p-0 shrink-0 bg-orange-500 hover:bg-orange-600"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}

// ── Activity Timeline ──

const ACTION_LABELS: Record<string, string> = {
  upload: 'رفع', download: 'تنزيل', rename: 'إعادة تسمية', move: 'نقل',
  delete: 'حذف', restore: 'استعادة', copy: 'نسخ', share: 'مشاركة', version: 'نسخة جديدة',
};

interface ActivityEvent {
  id: string;
  action_type: string;
  display_name: string;
  created_at: string;
  details?: Record<string, unknown>;
}

function ActivityTimeline({ filePath }: { filePath: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchAPI<ActivityEvent[]>(`/api/activity?target_path=${encodeURIComponent(filePath)}&limit=20`)
      .then((data) => setEvents(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filePath]);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-sm font-semibold hover:text-foreground transition-colors"
      >
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span>سجل النشاط</span>
        {events.length > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{events.length}</Badge>
        )}
        <span className="ms-auto text-xs text-muted-foreground">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-0">
          {loading ? (
            <p className="text-xs text-muted-foreground py-2">جاري التحميل...</p>
          ) : events.length === 0 ? (
            <EmptyState icon={Clock} title="لا يوجد نشاط مسجل" className="py-4" />
          ) : (
            <div className="relative">
              <div className="absolute start-[5px] top-2 bottom-2 w-px bg-orange-200 dark:bg-orange-900" />
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 relative">
                    <div className="w-[11px] h-[11px] rounded-full bg-orange-500 border-2 border-background shrink-0 mt-0.5 z-10" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-snug">
                        <span className="font-medium">{event.display_name}</span>{' '}
                        <span className="text-muted-foreground">{ACTION_LABELS[event.action_type] || event.action_type}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatRelativeDate(event.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Portal-only sub-components ──

function PortalGenericPreview({
  name,
  typeInfo,
  onDownload,
}: {
  name: string;
  typeInfo: { icon: React.ElementType; color: string; bg: string; label: string };
  onDownload: () => void;
}) {
  const TypeIcon = typeInfo.icon;
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 15, delay: 0.1 }}
        className={`w-24 h-24 rounded-2xl ${typeInfo.bg} flex items-center justify-center`}
      >
        <TypeIcon className={`h-12 w-12 ${typeInfo.color}`} />
      </motion.div>
      <div className="text-center">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground mt-1">لا تتوفر معاينة لهذا النوع من الملفات</p>
      </div>
      <Button onClick={onDownload} className="gap-2 bg-portal hover:bg-portal-secondary text-white">
        <Download className="h-4 w-4" />
        تحميل الملف
      </Button>
    </div>
  );
}

function PortalPdfPreview({ url }: { url: string }) {
  return (
    <div className="h-full p-4">
      <motion.iframe
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        src={url}
        className="w-full h-full rounded-lg border shadow-sm"
        title="PDF Preview"
      />
    </div>
  );
}

function PortalTextPreview({ url, name, mime }: { url: string; name: string; mime: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(true);
  const [textError, setTextError] = useState(false);
  const isMd = mime === 'text/markdown' || name.endsWith('.md');

  useEffect(() => {
    setTextLoading(true);
    setTextError(false);
    fetch(url)
      .then((res) => { if (!res.ok) throw new Error('Failed to fetch'); return res.text(); })
      .then((text) => setContent(text))
      .catch(() => setTextError(true))
      .finally(() => setTextLoading(false));
  }, [url]);

  if (textLoading) return <PreviewLoading />;
  if (textError || content === null) return <PreviewError />;

  return (
    <div className="h-full overflow-auto p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-4xl mx-auto"
      >
        {isMd ? (
          <>
            <div className="relative mb-8 pb-6 border-b">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-medium">Markdown</Badge>
                    <span className="text-[10px] text-muted-foreground">{content.split('\n').length} سطر</span>
                  </div>
                </div>
              </div>
            </div>
            <MarkdownRenderer content={content} />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b">
              <FileText className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium text-muted-foreground">{name}</span>
            </div>
            <pre className="whitespace-pre-wrap break-words text-sm font-mono leading-relaxed text-foreground/80 bg-muted/50 rounded-lg p-4 border overflow-auto">
              {content}
            </pre>
          </>
        )}
      </motion.div>
    </div>
  );
}

function PortalDocxPreview({ url, name, onDownload }: { url: string; name: string; onDownload: () => void }) {
  const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950/30 border-b shrink-0">
        <FileText className="h-4 w-4 text-blue-600" />
        <span className="text-xs text-blue-600 font-medium">{name}</span>
        <span className="text-[10px] text-muted-foreground">— معاينة عبر Microsoft Office Online</span>
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="flex-1 relative"
      >
        <iframe
          src={officeUrl}
          className="w-full h-full border-0"
          title="DOCX Preview"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
        <div className="absolute bottom-4 start-1/2 -translate-x-1/2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDownload}
            className="gap-2 text-xs bg-background/80 backdrop-blur-sm"
          >
            <Download className="h-3 w-3" />
            إذا لم تظهر المعاينة، حمّل الملف
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Enhanced Markdown Renderer (portal) ──

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let listBuffer: { level: number; text: string; ordered: boolean; num?: number }[] = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    const isOrdered = listBuffer[0].ordered;
    const Tag = isOrdered ? 'ol' : 'ul';
    elements.push(
      <Tag key={`list-${elements.length}`} className={isOrdered ? 'list-decimal ps-6 my-3 space-y-1.5' : 'ps-5 my-3 space-y-1.5'}>
        {listBuffer.map((item, idx) => (
          <li key={idx} className={isOrdered
            ? 'text-sm leading-relaxed text-foreground/80 marker:text-portal marker:font-semibold'
            : 'text-sm leading-relaxed text-foreground/80 relative ps-4 before:content-[""] before:absolute before:start-0 before:top-[9px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-gradient-to-br before:from-portal before:to-amber-500'
          }>
            <InlineMarkdown text={item.text} />
          </li>
        ))}
      </Tag>
    );
    listBuffer = [];
  }

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      flushList();
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      elements.push(
        <div key={`code-${elements.length}`} className="my-4 rounded-xl overflow-hidden border border-border/60 shadow-sm">
          {lang && (
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/80 border-b border-border/40">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
              </div>
              <span className="text-[10px] text-muted-foreground font-mono ms-2">{lang}</span>
            </div>
          )}
          <pre className="bg-muted/40 p-4 overflow-x-auto">
            <code className="text-[13px] font-mono leading-relaxed text-foreground/90">{codeLines.join('\n')}</code>
          </pre>
        </div>
      );
      i++;
      continue;
    }

    if (line.includes('|') && line.trim().startsWith('|')) {
      flushList();
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) { tableRows.push(lines[i]); i++; }
      if (tableRows.length >= 2) {
        const headerCells = tableRows[0].split('|').filter((c) => c.trim()).map((c) => c.trim());
        const isSeparator = (row: string) => /^\|[\s\-:|]+\|$/.test(row.trim());
        const dataStartIdx = isSeparator(tableRows[1]) ? 2 : 1;
        const bodyRows = tableRows.slice(dataStartIdx).map((row) => row.split('|').filter((c) => c.trim()).map((c) => c.trim()));
        elements.push(
          <div key={`table-${elements.length}`} className="my-5 overflow-x-auto rounded-xl border border-border/60 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/60 border-b border-border/40">
                  {headerCells.map((cell, ci) => (
                    <th key={ci} className="px-4 py-2.5 text-start font-semibold text-foreground/90 text-xs">
                      <InlineMarkdown text={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={ri} className="border-b border-border/20 last:border-0 hover:bg-muted/30 transition-colors">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-4 py-2.5 text-foreground/75 text-sm">
                        <InlineMarkdown text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
      const styles: Record<number, string> = {
        1: 'text-2xl font-bold mt-8 mb-4 pb-3 border-b border-border/40',
        2: 'text-xl font-bold mt-7 mb-3',
        3: 'text-lg font-semibold mt-5 mb-2.5 text-foreground/90',
        4: 'text-base font-semibold mt-4 mb-2 text-foreground/85',
        5: 'text-sm font-semibold mt-3 mb-1.5 text-foreground/80 uppercase tracking-wide',
        6: 'text-sm font-medium mt-3 mb-1.5 text-muted-foreground uppercase tracking-wide',
      };
      elements.push(<Tag key={`h-${elements.length}`} className={styles[level]}><InlineMarkdown text={text} /></Tag>);
      i++;
      continue;
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
      flushList();
      elements.push(<hr key={`hr-${elements.length}`} className="my-6 border-border/40" />);
      i++;
      continue;
    }

    if (line.startsWith('>')) {
      flushList();
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) { quoteLines.push(lines[i].replace(/^>\s?/, '')); i++; }
      elements.push(
        <blockquote key={`bq-${elements.length}`} className="my-4 ps-4 border-s-2 border-portal/40 text-muted-foreground italic">
          {quoteLines.map((ql, qi) => <p key={qi} className="text-sm leading-relaxed"><InlineMarkdown text={ql} /></p>)}
        </blockquote>
      );
      continue;
    }

    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)/);
    if (ulMatch) { listBuffer.push({ level: ulMatch[1].length, text: ulMatch[2], ordered: false }); i++; continue; }

    const olMatch = line.match(/^(\s*)(\d+)[.)]\s+(.+)/);
    if (olMatch) { listBuffer.push({ level: olMatch[1].length, text: olMatch[3], ordered: true, num: parseInt(olMatch[2]) }); i++; continue; }

    flushList();
    if (line.trim() === '') { i++; continue; }

    elements.push(<p key={`p-${elements.length}`} className="my-2.5 text-sm leading-[1.8] text-foreground/75"><InlineMarkdown text={line} /></p>);
    i++;
  }

  flushList();
  return <>{elements}</>;
}

function InlineMarkdown({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(~~(.+?)~~)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1]) parts.push(<strong key={match.index} className="font-semibold text-foreground">{match[2]}</strong>);
    else if (match[3]) parts.push(<del key={match.index} className="text-muted-foreground/60 line-through">{match[4]}</del>);
    else if (match[5]) parts.push(<em key={match.index} className="italic text-foreground/80">{match[6]}</em>);
    else if (match[7]) parts.push(<code key={match.index} className="text-[13px] font-mono text-portal bg-portal/5 px-1.5 py-0.5 rounded-md border border-portal/20">{match[8]}</code>);
    else if (match[9]) parts.push(<a key={match.index} href={match[11]} target="_blank" rel="noopener noreferrer" className="text-portal hover:underline">{match[10]}</a>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}
