'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Download,
  ZoomIn,
  ZoomOut,
  FileText,
  FileImage,
  Film,
  Music,
  FileType,
  Loader2,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatFileSize } from '@/lib/utils/format';

// ── Types ──

interface PreviewFile {
  id: string;
  file_name: string;
  file_type: string; // mime_type
  file_size?: number;
}

interface PortalFilePreviewProps {
  file: PreviewFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── MIME type helpers ──

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
function isTextLike(mime: string) {
  return (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript'
  );
}
function isDocx(mime: string) {
  return mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

function getFileTypeInfo(mime: string) {
  if (isPdf(mime))
    return { icon: FileType, color: 'text-red-500', bg: 'bg-red-500/10', label: 'PDF' };
  if (isImage(mime))
    return { icon: FileImage, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'صورة' };
  if (isVideo(mime))
    return { icon: Film, color: 'text-purple-500', bg: 'bg-purple-500/10', label: 'فيديو' };
  if (isAudio(mime))
    return { icon: Music, color: 'text-pink-500', bg: 'bg-pink-500/10', label: 'صوت' };
  if (isTextLike(mime))
    return { icon: FileText, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'نص' };
  if (isDocx(mime))
    return { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-600/10', label: 'Word' };
  return { icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted', label: 'ملف' };
}

function canPreview(mime: string) {
  return isImage(mime) || isVideo(mime) || isAudio(mime) || isPdf(mime) || isTextLike(mime) || isDocx(mime);
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

// ── Main Component ──

export function PortalFilePreview({ file, open, onOpenChange }: PortalFilePreviewProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Fetch signed URL from preview endpoint
  useEffect(() => {
    if (!file || !open) {
      setSignedUrl(null);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);

    fetch(`/api/portal/files/${file.id}/preview`)
      .then((res) => res.json())
      .then((json) => {
        if (json.data?.url) {
          setSignedUrl(json.data.url);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [file?.id, open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onOpenChange]);

  const handleDownload = useCallback(() => {
    if (file) {
      window.open(`/api/portal/files/${file.id}/download`, '_blank');
    }
  }, [file]);

  if (!file) return null;

  const decodedName = decodeURIComponent(file.file_name);
  const typeInfo = getFileTypeInfo(file.file_type);
  const TypeIcon = typeInfo.icon;
  const previewable = canPreview(file.file_type);

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
            {/* File Info */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className={`w-10 h-10 rounded-xl ${typeInfo.bg} flex items-center justify-center shrink-0`}
              >
                <TypeIcon className={`h-5 w-5 ${typeInfo.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold truncate">{decodedName}</h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${typeInfo.color} border-current/20`}
                  >
                    {typeInfo.label}
                  </Badge>
                  {file.file_size != null && file.file_size > 0 && (
                    <span>{formatFileSize(file.file_size)}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
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
              <GenericPreview name={decodedName} typeInfo={typeInfo} onDownload={handleDownload} />
            ) : isImage(file.file_type) ? (
              <ImagePreview url={signedUrl} name={decodedName} />
            ) : isVideo(file.file_type) ? (
              <VideoPreview url={signedUrl} />
            ) : isPdf(file.file_type) ? (
              <PdfPreview url={signedUrl} />
            ) : isAudio(file.file_type) ? (
              <AudioPreview url={signedUrl} name={decodedName} />
            ) : isTextLike(file.file_type) ? (
              <TextPreview url={signedUrl} name={decodedName} mime={file.file_type} />
            ) : isDocx(file.file_type) ? (
              <DocxPreview url={signedUrl} name={decodedName} onDownload={handleDownload} />
            ) : (
              <GenericPreview name={decodedName} typeInfo={typeInfo} onDownload={handleDownload} />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Sub-components ──

function PreviewLoading() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 15 }}
        className="relative"
      >
        <div className="absolute inset-0 rounded-2xl bg-orange-500/20 animate-ping" />
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
        </div>
      </motion.div>
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
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 15 }}
      >
        <div className="w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <Eye className="h-10 w-10 text-destructive/50" />
        </div>
      </motion.div>
      <div className="text-center">
        <p className="text-sm font-medium text-destructive">فشل في تحميل المعاينة</p>
        <p className="text-xs text-muted-foreground mt-2 max-w-xs">
          تأكد من وجود الملف وصلاحيتك للوصول إليه
        </p>
      </div>
    </div>
  );
}

function GenericPreview({
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
        <p className="text-xs text-muted-foreground mt-1">
          لا تتوفر معاينة لهذا النوع من الملفات
        </p>
      </div>
      <Button onClick={onDownload} className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
        <Download className="h-4 w-4" />
        تحميل الملف
      </Button>
    </div>
  );
}

// ── Image Preview with Zoom ──

function ImagePreview({ url, name }: { url: string; name: string }) {
  const [imgZoom, setImgZoom] = useState(1);
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="flex flex-col h-full relative">
      {/* Zoom Controls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-background/80 backdrop-blur-sm border rounded-full px-3 py-1.5 shadow-lg"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setImgZoom((z) => Math.max(0.25, z - 0.25))}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-mono min-w-[40px] text-center">
          {Math.round(imgZoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setImgZoom((z) => Math.min(4, z + 0.25))}
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
      </motion.div>

      <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-[repeating-conic-gradient(#0001_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#fff1_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        )}
        <motion.img
          src={url}
          alt={name}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: loaded ? 1 : 0, scale: loaded ? 1 : 0.9 }}
          transition={{ duration: 0.3 }}
          className="rounded-lg shadow-2xl max-w-none transition-transform duration-200"
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

// ── Video Preview ──

function VideoPreview({ url }: { url: string }) {
  return (
    <div className="flex items-center justify-center h-full bg-black/90 p-4">
      <motion.video
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        src={url}
        controls
        autoPlay={false}
        className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
        preload="metadata"
      />
    </div>
  );
}

// ── PDF Preview ──

function PdfPreview({ url }: { url: string }) {
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

// ── Audio Preview ──

function AudioPreview({ url, name }: { url: string; name: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 p-8">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 15 }}
        className="relative"
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-500 to-violet-500 blur-3xl opacity-20 animate-pulse" />
        <div className="relative w-40 h-40 rounded-full bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 flex items-center justify-center shadow-2xl shadow-orange-500/20">
          <div className="w-32 h-32 rounded-full bg-background/90 backdrop-blur-sm flex items-center justify-center">
            <Music className="h-12 w-12 text-orange-500" />
          </div>
        </div>
      </motion.div>
      <div className="text-center">
        <p className="text-base font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground mt-1">ملف صوتي</p>
      </div>
      <audio src={url} controls className="w-full max-w-md" preload="metadata" />
    </div>
  );
}

// ── Text/Markdown Preview ──

function TextPreview({ url, name, mime }: { url: string; name: string; mime: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(true);
  const [textError, setTextError] = useState(false);
  const isMarkdown = mime === 'text/markdown' || name.endsWith('.md');

  useEffect(() => {
    setTextLoading(true);
    setTextError(false);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.text();
      })
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
        {isMarkdown ? (
          <>
            {/* Elegant document header */}
            <div className="relative mb-8 pb-6 border-b border-gradient">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-medium">
                      Markdown
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {content.split('\n').length} سطر
                    </span>
                  </div>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-l from-transparent via-emerald-500/30 to-transparent" />
            </div>

            {/* Beautiful rendered markdown */}
            <div className="md-preview space-y-0">
              <MarkdownRenderer content={content} />
            </div>
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

// ── Enhanced Markdown Renderer ──

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
      <Tag
        key={`list-${elements.length}`}
        className={
          isOrdered
            ? 'list-decimal ps-6 my-3 space-y-1.5'
            : 'ps-5 my-3 space-y-1.5'
        }
      >
        {listBuffer.map((item, idx) => (
          <li
            key={idx}
            className={
              isOrdered
                ? 'text-sm leading-relaxed text-foreground/80 marker:text-orange-500 marker:font-semibold'
                : 'text-sm leading-relaxed text-foreground/80 relative ps-4 before:content-[""] before:absolute before:start-0 before:top-[9px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-gradient-to-br before:from-orange-400 before:to-amber-500'
            }
          >
            <InlineMarkdown text={item.text} />
          </li>
        ))}
      </Tag>
    );
    listBuffer = [];
  }

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith('```')) {
      flushList();
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
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

    // Table detection
    if (line.includes('|') && line.trim().startsWith('|')) {
      flushList();
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
        tableRows.push(lines[i]);
        i++;
      }
      if (tableRows.length >= 2) {
        const headerCells = tableRows[0].split('|').filter(c => c.trim()).map(c => c.trim());
        const isSeparator = (row: string) => /^\|[\s\-:|]+\|$/.test(row.trim());
        const dataStartIdx = isSeparator(tableRows[1]) ? 2 : 1;
        const bodyRows = tableRows.slice(dataStartIdx).map(row =>
          row.split('|').filter(c => c.trim()).map(c => c.trim())
        );

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

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
      const styles: Record<number, string> = {
        1: 'text-2xl font-bold mt-8 mb-4 pb-3 border-b border-border/40 bg-gradient-to-l from-foreground to-foreground/70 bg-clip-text',
        2: 'text-xl font-bold mt-7 mb-3 flex items-center gap-2 before:content-[""] before:w-1 before:h-6 before:rounded-full before:bg-gradient-to-b before:from-orange-500 before:to-amber-500',
        3: 'text-lg font-semibold mt-5 mb-2.5 text-foreground/90',
        4: 'text-base font-semibold mt-4 mb-2 text-foreground/85',
        5: 'text-sm font-semibold mt-3 mb-1.5 text-foreground/80 uppercase tracking-wide',
        6: 'text-sm font-medium mt-3 mb-1.5 text-muted-foreground uppercase tracking-wide',
      };
      elements.push(
        <Tag key={`h-${elements.length}`} className={styles[level]}>
          <InlineMarkdown text={text} />
        </Tag>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
      flushList();
      elements.push(
        <div key={`hr-${elements.length}`} className="my-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-gradient-to-l from-transparent via-border to-transparent" />
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400/40" />
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400/60" />
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400/40" />
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      flushList();
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      elements.push(
        <blockquote
          key={`bq-${elements.length}`}
          className="my-4 relative rounded-lg bg-gradient-to-l from-amber-500/5 to-orange-500/5 border border-orange-500/10"
        >
          <div className="absolute top-0 bottom-0 start-0 w-1 rounded-s-lg bg-gradient-to-b from-orange-500 to-amber-400" />
          <div className="ps-5 pe-4 py-3">
            <div className="text-orange-500/60 text-2xl leading-none mb-1">&ldquo;</div>
            {quoteLines.map((ql, qi) => (
              <p key={qi} className="text-sm leading-relaxed text-foreground/70 italic">
                <InlineMarkdown text={ql} />
              </p>
            ))}
          </div>
        </blockquote>
      );
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)/);
    if (ulMatch) {
      listBuffer.push({ level: ulMatch[1].length, text: ulMatch[2], ordered: false });
      i++;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)(\d+)[.)]\s+(.+)/);
    if (olMatch) {
      listBuffer.push({ level: olMatch[1].length, text: olMatch[3], ordered: true, num: parseInt(olMatch[2]) });
      i++;
      continue;
    }

    // Flush list if we hit a non-list line
    flushList();

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${elements.length}`} className="my-2.5 text-sm leading-[1.8] text-foreground/75">
        <InlineMarkdown text={line} />
      </p>
    );
    i++;
  }

  flushList();
  return <>{elements}</>;
}

// ── Inline Markdown (bold, italic, code, links, strikethrough) ──

function InlineMarkdown({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  // Combined regex: **bold**, *italic*, ~~strikethrough~~, `code`, [link](url)
  const regex = /(\*\*(.+?)\*\*)|(~~(.+?)~~)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      parts.push(<strong key={match.index} className="font-semibold text-foreground">{match[2]}</strong>);
    } else if (match[3]) {
      // ~~strikethrough~~
      parts.push(<del key={match.index} className="text-muted-foreground/60 line-through">{match[4]}</del>);
    } else if (match[5]) {
      // *italic*
      parts.push(<em key={match.index} className="italic text-foreground/80">{match[6]}</em>);
    } else if (match[7]) {
      // `code`
      parts.push(
        <code
          key={match.index}
          className="text-[13px] font-mono text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-1.5 py-0.5 rounded-md border border-orange-200/30 dark:border-orange-800/30"
        >
          {match[8]}
        </code>
      );
    } else if (match[9]) {
      // [link](url)
      parts.push(
        <a
          key={match.index}
          href={match[11]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-orange-500 hover:text-orange-600 underline underline-offset-2 decoration-orange-500/30 hover:decoration-orange-500/60 transition-colors"
        >
          {match[10]}
        </a>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

// ── DOCX Preview ──

function DocxPreview({ url, name, onDownload }: { url: string; name: string; onDownload: () => void }) {
  // DOCX files can be previewed using Microsoft Office Online viewer
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
        {/* Fallback overlay in case Office viewer doesn't load */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
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
