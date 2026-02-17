'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Download, ExternalLink, FileText, Eye, Send, MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

// Detect if text is predominantly RTL (Arabic, Hebrew, etc.)
function detectDirection(text: string): 'rtl' | 'ltr' {
  const rtlChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\uFE70-\uFEFF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  return rtlChars > latinChars ? 'rtl' : 'ltr';
}

export function FilePreview({ file, open, onOpenChange, projectId, fileId }: FilePreviewProps) {
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

  // Determine if this file is markdown by name
  const isMarkdownFile = !file.isFolder && isMarkdown(decodedName);

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
          ) : isMarkdownFile ? (
            <MarkdownPreview url={signedUrl} />
          ) : isText(file.mimeType) ? (
            <TextPreview url={signedUrl} fileName={decodedName} />
          ) : (
            <GenericPreview file={file} />
          )}
        </div>

        {/* Comments section (only when projectId + fileId are provided) */}
        {!file.isFolder && projectId && fileId && (
          <FileCommentsSection projectId={projectId} fileId={fileId} />
        )}

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

// ============================================================
// Markdown Preview - renders .md files with proper formatting
// ============================================================
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
      className="rounded-lg border bg-card overflow-auto max-h-[60vh] p-6"
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

// ============================================================
// Text Preview - for plain text, code, JSON, etc.
// ============================================================
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

  return (
    <div className="rounded-lg border bg-muted/30 overflow-auto max-h-[60vh]">
      <pre className={`p-4 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed ${isCode ? 'text-foreground' : ''}`} dir="ltr">
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

// ============================================================
// File Comments Section — inline in file preview
// ============================================================
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
    <div className="border-t">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">التعليقات</span>
        {comments.length > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {comments.length}
          </Badge>
        )}
      </div>

      {/* Comments list */}
      <div className="px-4 space-y-2 max-h-48 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-muted-foreground py-2">جاري التحميل...</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">لا توجد تعليقات. كن أول من يعلّق!</p>
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
      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-4 pt-2">
        <textarea
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="اكتب تعليق... (استخدم @ لذكر شخص)"
          rows={2}
          className="flex-1 min-h-[56px] max-h-24 rounded-lg border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
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
