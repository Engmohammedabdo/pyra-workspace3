'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileIcon } from './file-icon';
import { VersionHistory } from './version-history';
import { DocxViewer } from './docx-viewer';
import { PdfViewer } from './pdf-viewer';
import { FileTagsPopover } from './file-tags';
import { formatFileSize, formatRelativeDate } from '@/lib/utils/format';
import { useFileUrl, useSignedUrl } from '@/hooks/useFiles';
import type { FileListItem } from '@/types/database';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

interface FilePreviewProps {
  file: FileListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional: if set, shows a comments section for this project + file */
  projectId?: string;
  /** Optional: file_id (from pyra_project_files) for file-level comments */
  fileId?: string;
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
function isMarkdown(name: string) {
  const lower = name.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdx');
}
function isDocx(name: string) {
  const lower = name.toLowerCase();
  return lower.endsWith('.docx') || lower.endsWith('.doc');
}

// Detect if text is predominantly RTL (Arabic, Hebrew, etc.)
function detectDirection(text: string): 'rtl' | 'ltr' {
  const rtlChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\uFE70-\uFEFF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  return rtlChars > latinChars ? 'rtl' : 'ltr';
}

// Get icon & color for file type
function getFileTypeInfo(mime: string, name: string) {
  if (isPdf(mime)) return { icon: FileType, color: 'text-red-500', bg: 'bg-red-500/10', label: 'PDF' };
  if (isImage(mime)) return { icon: FileImage, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'صورة' };
  if (isVideo(mime)) return { icon: Film, color: 'text-purple-500', bg: 'bg-purple-500/10', label: 'فيديو' };
  if (isAudio(mime)) return { icon: Music, color: 'text-pink-500', bg: 'bg-pink-500/10', label: 'صوت' };
  if (isDocx(name)) return { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-600/10', label: 'Word' };
  if (isMarkdown(name)) return { icon: FileText, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Markdown' };
  if (isText(mime)) return { icon: Code, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'نص' };
  return { icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted', label: 'ملف' };
}

export function FilePreview({ file, open, onOpenChange, projectId, fileId }: FilePreviewProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const getProxyUrl = useFileUrl();
  const getSignedUrl = useSignedUrl();

  // Get URL when file changes
  // For PDF & video: use direct signed URL (better for large files — streams from CDN)
  // For everything else: use proxy URL (streaming through our API)
  useEffect(() => {
    if (!file || file.isFolder) {
      setSignedUrl(null);
      return;
    }

    setLoading(true);

    const needsDirectUrl = isPdf(file.mimeType) || isVideo(file.mimeType) || file.size > 5_000_000;

    if (needsDirectUrl) {
      getSignedUrl.mutateAsync({ path: file.path }).then((url) => {
        setSignedUrl(url);
        setLoading(false);
      }).catch(() => {
        // Fallback to proxy URL
        getProxyUrl.mutateAsync({ path: file.path }).then((url) => {
          setSignedUrl(url);
          setLoading(false);
        }).catch(() => {
          setSignedUrl(null);
          setLoading(false);
        });
      });
    } else {
      getProxyUrl.mutateAsync({ path: file.path }).then((url) => {
        setSignedUrl(url);
        setLoading(false);
      }).catch(() => {
        setSignedUrl(null);
        setLoading(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.path]);

  // Close on Escape
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
    if (signedUrl) {
      window.open(signedUrl, '_blank');
    }
  };

  // Determine if this file is markdown or docx by name
  const isMarkdownFile = !file.isFolder && isMarkdown(decodedName);
  const isDocxFile = !file.isFolder && isDocx(decodedName);

  // Full-screen for media-heavy files (PDF, images, video)
  const isFullViewer = isPdf(file.mimeType) || isImage(file.mimeType) || isVideo(file.mimeType);

  return (
    <>
      {/* =================== FULLSCREEN OVERLAY =================== */}
      <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md animate-in fade-in duration-200">
        {/* ============ TOP BAR ============ */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background/80 backdrop-blur-sm shrink-0">
          {/* File Info (Right side - RTL) */}
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

          {/* Actions (Left side - RTL) */}
          <div className="flex items-center gap-1.5 shrink-0 ms-4">
            <FileTagsPopover filePath={file.path} />

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-orange-500"
              onClick={() => setShowVersions(true)}
              title="النسخ"
            >
              <History className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setShowInfo(!showInfo)}
              title="معلومات الملف"
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
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ============ MAIN CONTENT ============ */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Preview content */}
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

          {/* Info Side Panel (slides in) */}
          {showInfo && (
            <div className="w-72 border-s bg-card/50 backdrop-blur-sm p-4 space-y-4 overflow-y-auto shrink-0 animate-in slide-in-from-left duration-200">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
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

              {/* Comments section */}
              {projectId && fileId && (
                <div className="pt-4 border-t">
                  <FileCommentsSection projectId={projectId} fileId={fileId} />
                </div>
              )}
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
              const fetcher = (isPdf(file.mimeType) || isVideo(file.mimeType) || file.size > 5_000_000)
                ? getSignedUrl : getProxyUrl;
              fetcher.mutateAsync({ path: file.path }).then((url) => {
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

// ----- Sub-components -----

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
    <div className="flex flex-col h-full">
      {/* Image zoom controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-background/80 backdrop-blur-sm border rounded-full px-3 py-1.5 shadow-lg">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setImgZoom((z) => Math.max(0.25, z - 0.25))}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-mono min-w-[40px] text-center">{Math.round(imgZoom * 100)}%</span>
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
          className="transition-transform duration-200 rounded-lg shadow-2xl max-w-none"
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
        className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
        preload="metadata"
      />
    </div>
  );
}

// =================== AUDIO PREVIEW ===================
function AudioPreview({ url, name }: { url: string; name: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 p-8">
      {/* Beautiful audio visualization placeholder */}
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
      <audio
        src={url}
        controls
        className="w-full max-w-md"
        preload="metadata"
      />
    </div>
  );
}

// =================== MARKDOWN PREVIEW ===================
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
    <div
      className="rounded-xl border bg-card shadow-sm overflow-auto p-8"
      dir={direction}
    >
      <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:leading-relaxed prose-a:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-muted prose-pre:border prose-pre:rounded-lg prose-img:rounded-lg prose-table:text-sm prose-th:bg-muted/50 prose-td:border prose-th:border prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}

// =================== TEXT PREVIEW ===================
function TextPreview({ url, fileName }: { url: string; fileName?: string }) {
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

  const isCode = fileName && /\.(js|ts|jsx|tsx|css|html|xml|json|py|java|c|cpp|rs|go|rb|php|sh|yaml|yml|toml|sql)$/i.test(fileName);
  const lineCount = content.split('\n').length;

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* File header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Code className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{fileName}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{lineCount} سطر</span>
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <pre className={`p-4 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed ${isCode ? 'text-foreground' : ''}`} dir="ltr">
          {content}
        </pre>
      </div>
    </div>
  );
}

// =================== GENERIC PREVIEW ===================
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
      const res = await fetch(`/api/comments?project_id=${projectId}&file_id=${fileId}`);
      const json = await res.json();
      if (res.ok && json.data) {
        setComments(json.data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [projectId, fileId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          file_id: fileId,
          text: newText.trim(),
        }),
      });
      if (res.ok) {
        setNewText('');
        await fetchComments();
        toast.success('تم إرسال التعليق');
      } else {
        toast.error('فشل إرسال التعليق');
      }
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setSending(false);
    }
  };

  const displayComments = showAll ? comments : comments.slice(-3);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">التعليقات</span>
        {comments.length > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {comments.length}
          </Badge>
        )}
      </div>

      {/* Comments list */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-muted-foreground py-2">جاري التحميل...</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">لا توجد تعليقات</p>
        ) : (
          <>
            {!showAll && comments.length > 3 && (
              <button
                onClick={() => setShowAll(true)}
                className="text-xs text-orange-500 hover:underline"
              >
                عرض {comments.length - 3} تعليقات أقدم
              </button>
            )}
            {displayComments.map((c) => {
              const isTeam = c.author_type === 'team';
              return (
                <div
                  key={c.id}
                  className={`rounded-lg p-2.5 text-xs ${
                    isTeam ? 'bg-blue-500/5 border border-blue-500/10' : 'bg-orange-500/5 border border-orange-500/10'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-medium">{c.author_name}</span>
                    <Badge
                      className={`text-[9px] px-1 py-0 ${
                        isTeam
                          ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                          : 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                      }`}
                    >
                      {isTeam ? 'فريق' : 'عميل'}
                    </Badge>
                    <span className="text-muted-foreground ms-auto text-[10px]">
                      {formatRelativeDate(c.created_at)}
                    </span>
                  </div>
                  <p className="leading-relaxed text-foreground/80 whitespace-pre-line">
                    {renderTextWithMentions(c.text)}
                  </p>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* New comment form */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 pt-3">
        <textarea
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="اكتب تعليق..."
          rows={2}
          className="flex-1 min-h-[48px] max-h-24 rounded-lg border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
        <Button
          type="submit"
          size="sm"
          disabled={sending || !newText.trim()}
          className="h-9 w-9 p-0 shrink-0 bg-orange-500 hover:bg-orange-600"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}

/** Render text with @mentions highlighted */
function renderTextWithMentions(text: string) {
  const parts = text.split(/(@[\w\u0600-\u06FF]+)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="text-orange-500 font-medium">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}
