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

function getFileTypeInfo(mime: string) {
  if (isPdf(mime))
    return { icon: FileType, color: 'text-red-500', bg: 'bg-red-500/10', label: 'PDF' };
  if (isImage(mime))
    return { icon: FileImage, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'صورة' };
  if (isVideo(mime))
    return { icon: Film, color: 'text-purple-500', bg: 'bg-purple-500/10', label: 'فيديو' };
  if (isAudio(mime))
    return { icon: Music, color: 'text-pink-500', bg: 'bg-pink-500/10', label: 'صوت' };
  return { icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted', label: 'ملف' };
}

function canPreview(mime: string) {
  return isImage(mime) || isVideo(mime) || isAudio(mime) || isPdf(mime);
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
