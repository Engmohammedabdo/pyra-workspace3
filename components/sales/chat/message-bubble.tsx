'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';
import {
  Check,
  CheckCheck,
  Download,
  FileText,
  Forward,
  HardDrive,
  Image as ImageIcon,
  MapPin,
  Mic,
  Pause,
  Phone,
  Play,
  Reply,
  SmilePlus,
  Video,
  Vote,
  X,
  ZoomIn,
} from 'lucide-react';

export interface QuotedMessage {
  id: string;
  messageId: string;
  content: string;
  sender?: string;
}

interface MessageBubbleProps {
  id: string;
  content: string | null;
  direction: 'incoming' | 'outgoing';
  messageType: string;
  mediaUrl?: string | null;
  fileName?: string | null;
  status?: string;
  timestamp: string;
  messageId?: string | null;
  contactName?: string | null;
  replyPreview?: { text: string; sender?: string } | null;
  reactions?: Array<{ emoji: string; from: string }>;
  onReply?: (quote: QuotedMessage) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onSaveToFiles?: (messageId: string) => void;
  onForward?: (messageId: string) => void;
}

const MEDIA_ICONS: Record<string, React.ReactNode> = {
  image: <ImageIcon className="h-4 w-4" />,
  document: <FileText className="h-4 w-4" />,
  audio: <Mic className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
};

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏'];

export function MessageBubble({ id, content, direction, messageType, mediaUrl, fileName, status, timestamp, messageId, contactName, replyPreview, reactions, onReply, onReact, onSaveToFiles, onForward }: MessageBubbleProps) {
  const [imagePreview, setImagePreview] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [showReactions, setShowReactions] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  const isOutgoing = direction === 'outgoing';
  const time = new Date(timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  // Proxy media through our API to avoid expired WhatsApp CDN URLs
  const resolvedMediaUrl = mediaUrl && id
    ? (mediaUrl.includes('mmg.whatsapp.net') || mediaUrl.includes('whatsapp.net'))
      ? `/api/dashboard/sales/whatsapp/media/${id}`
      : mediaUrl
    : null;

  // Status icons — gray checks, blue for read, red for failed
  const statusIcon = isOutgoing && status ? {
    sent: <Check className="h-3 w-3 text-muted-foreground" />,
    delivered: <CheckCheck className="h-3 w-3 text-muted-foreground" />,
    read: <CheckCheck className="h-3 w-3 text-blue-500 dark:text-blue-400" />,
    received: null,
    failed: <X className="h-3 w-3 text-red-500" />,
  }[status] || null : null;

  return (
    <>
      <div
        className={cn('flex group/msg relative', isOutgoing ? 'justify-end' : 'justify-start')}
        onMouseEnter={() => setShowReactions(false)}
      >
        {/* Hover action buttons — compact row */}
        <div className={cn(
          'absolute top-1 flex items-center gap-px opacity-0 group-hover/msg:opacity-100 transition-opacity z-10',
          isOutgoing ? 'start-0 -translate-x-full pe-1' : 'end-0 translate-x-full ps-1'
        )}>
          {onReply && (
            <button
              onClick={() => onReply({
                id,
                messageId: messageId || id,
                content: content || '',
                sender: direction === 'incoming' ? (contactName || undefined) : 'أنت',
              })}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="رد"
              title="رد"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
          )}
          {onReact && (
            <button
              onClick={() => setShowReactions(!showReactions)}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="تفاعل"
              title="تفاعل"
            >
              <SmilePlus className="h-3.5 w-3.5" />
            </button>
          )}
          {onSaveToFiles && ['image', 'document', 'video', 'audio'].includes(messageType) && (
            <button
              onClick={() => onSaveToFiles(id)}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="حفظ"
              title="حفظ"
            >
              <HardDrive className="h-3.5 w-3.5" />
            </button>
          )}
          {onForward && (
            <button
              onClick={() => onForward(id)}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="تحويل"
              title="تحويل"
            >
              <Forward className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Quick reactions picker */}
        {showReactions && onReact && (
          <div className={cn(
            'absolute -top-9 flex items-center gap-0.5 bg-card rounded-full px-1.5 py-1 shadow-lg z-20 border border-border',
            isOutgoing ? 'end-0' : 'start-0'
          )}>
            {QUICK_REACTIONS.map(emoji => (
              <button
                key={emoji}
                onClick={() => {
                  onReact(id, emoji);
                  setShowReactions(false);
                }}
                className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center text-sm transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div
          className={cn(
            'max-w-[65%] rounded-lg px-2 py-1 space-y-0.5 relative shadow-sm border',
            isOutgoing
              ? 'bg-orange-500/10 dark:bg-orange-400/[0.14] border-orange-500/20 dark:border-orange-400/30 text-foreground rounded-ee-none'
              : 'bg-card border-border text-foreground rounded-es-none'
          )}
        >
          {/* ── Quoted Reply Preview ── */}
          {replyPreview && (
            <div className={cn(
              'rounded px-2 py-1.5 mb-0.5 border-s-3 text-xs cursor-pointer',
              isOutgoing
                ? 'bg-orange-500/15 border-s-orange-500'
                : 'bg-muted border-s-muted-foreground'
            )}>
              {replyPreview.sender && (
                <span className="text-[11px] font-medium block text-orange-600 dark:text-orange-400">
                  {replyPreview.sender}
                </span>
              )}
              <span className="line-clamp-1 text-muted-foreground">
                {replyPreview.text || '...'}
              </span>
            </div>
          )}
          {/* ── Image Preview ── */}
          {messageType === 'image' && resolvedMediaUrl && (
            <div
              className="relative overflow-hidden cursor-pointer group/img -mx-2 -mt-1"
              onClick={() => setImagePreview(true)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolvedMediaUrl!}
                alt={fileName || 'صورة'}
                className="w-full max-h-72 object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors duration-200 flex items-center justify-center">
                <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover/img:opacity-100 transition-opacity duration-200 drop-shadow-lg" />
              </div>
            </div>
          )}

          {/* ── Audio Player ── */}
          {messageType === 'audio' && resolvedMediaUrl && (
            <div className="flex items-center gap-2.5 min-w-[220px] py-1">
              {/* Hidden audio element */}
              <audio
                ref={audioRef}
                src={resolvedMediaUrl!}
                onTimeUpdate={() => {
                  const el = audioRef.current;
                  if (el && el.duration) setAudioProgress((el.currentTime / el.duration) * 100);
                }}
                onEnded={() => { setAudioPlaying(false); setAudioProgress(0); }}
              />
              <button
                onClick={() => {
                  const el = audioRef.current;
                  if (!el) return;
                  if (audioPlaying) { el.pause(); setAudioPlaying(false); }
                  else { el.play(); setAudioPlaying(true); }
                }}
                className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0 transition-transform hover:scale-105"
              >
                {audioPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ms-0.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <div
                  className={cn('h-[3px] rounded-full cursor-pointer', isOutgoing ? 'bg-orange-500/20' : 'bg-muted')}
                  onClick={(e) => {
                    const el = audioRef.current;
                    if (!el || !el.duration) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    el.currentTime = (x / rect.width) * el.duration;
                  }}
                >
                  <div
                    className="h-full rounded-full bg-orange-500 transition-all"
                    style={{ width: `${audioProgress}%` }}
                  />
                </div>
                <p className="text-[10px] mt-0.5 text-muted-foreground">
                  رسالة صوتية
                </p>
              </div>
            </div>
          )}

          {/* ── Video ── */}
          {messageType === 'video' && resolvedMediaUrl && (
            <div className="overflow-hidden -mx-2 -mt-1">
              <video
                src={resolvedMediaUrl!}
                controls
                preload="metadata"
                className="w-full max-h-72"
              />
              {fileName && (
                <p className="text-[10px] mt-0.5 px-1 text-muted-foreground">
                  {fileName}
                </p>
              )}
            </div>
          )}

          {/* ── Document ── */}
          {messageType === 'document' && resolvedMediaUrl && (
            <a
              href={resolvedMediaUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors',
                isOutgoing
                  ? 'bg-orange-500/15 hover:bg-orange-500/25'
                  : 'bg-muted hover:bg-muted/70'
              )}
            >
              <div className="w-8 h-10 rounded flex items-center justify-center shrink-0 bg-muted-foreground/10 text-muted-foreground">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-normal truncate text-foreground">
                  {fileName || 'مستند'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  اضغط للتحميل
                </p>
              </div>
              <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
            </a>
          )}

          {/* ── Poll Message ── */}
          {messageType === 'poll' && content && (
            <div className={cn(
              'rounded-md px-2.5 py-2',
              isOutgoing ? 'bg-orange-500/15' : 'bg-muted'
            )}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Vote className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                <span className="text-[11px] font-medium text-orange-600 dark:text-orange-400">
                  استطلاع
                </span>
              </div>
              <p className="text-[13px] font-semibold mb-0.5 text-foreground">
                {content}
              </p>
            </div>
          )}

          {/* ── Location Message ── */}
          {messageType === 'location' && (
            <div className={cn(
              'rounded-md px-2.5 py-2',
              isOutgoing ? 'bg-orange-500/15' : 'bg-muted'
            )}>
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-red-500" />
                <span className="text-[11px] font-medium text-red-500">
                  موقع
                </span>
              </div>
              {content && (
                <p className="text-[13px] mt-0.5 text-foreground">
                  {content}
                </p>
              )}
            </div>
          )}

          {/* ── Contact Card ── */}
          {messageType === 'contact' && (
            <div className={cn(
              'rounded-md px-2.5 py-2',
              isOutgoing ? 'bg-orange-500/15' : 'bg-muted'
            )}>
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                <span className="text-[11px] font-medium text-orange-600 dark:text-orange-400">
                  جهة اتصال
                </span>
              </div>
              {content && (
                <p className="text-[13px] mt-0.5 font-medium text-foreground">
                  {content}
                </p>
              )}
            </div>
          )}

          {/* ── Fallback media badge (no URL) ── */}
          {messageType !== 'text' && !resolvedMediaUrl && !['poll', 'location', 'contact'].includes(messageType) && (
            <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              {MEDIA_ICONS[messageType] || null}
              <span className="text-xs">
                {fileName || (messageType === 'image' ? 'صورة' : messageType === 'audio' ? 'صوت' : messageType === 'video' ? 'فيديو' : 'ملف')}
              </span>
            </div>
          )}

          {/* Text content + inline timestamp */}
          {content && (
            <p className="text-[13.6px] whitespace-pre-wrap break-words leading-[19px] text-foreground">
              {content}
              {/* Invisible spacer so timestamp floats at end of text */}
              <span className="inline-block w-[70px]" />
            </p>
          )}

          {/* Time + Status — floated inside bubble, bottom-end */}
          <span className="text-[11px] float-end ms-2 -mt-4 flex items-center gap-0.5 relative z-[1] text-muted-foreground">
            <span className="tabular-nums">{time}</span>
            {statusIcon}
          </span>

          {/* ── Reaction Pills (below bubble, slight overlap) ── */}
          {reactions && reactions.length > 0 && (
            <div className="flex gap-0.5 -mb-3 mt-0.5 ms-1 flex-wrap relative z-[2]">
              {reactions.map((r, i) => (
                <span
                  key={i}
                  className="bg-card rounded-full px-1.5 py-0.5 text-sm shadow-sm border border-border"
                >
                  {r.emoji}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Fullscreen Image Lightbox ── */}
      {imagePreview && resolvedMediaUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 animate-in fade-in duration-200"
          onClick={() => setImagePreview(false)}
        >
          <button
            className="absolute top-4 end-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
            onClick={() => setImagePreview(false)}
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolvedMediaUrl!}
            alt={fileName || 'صورة'}
            className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl object-contain animate-in zoom-in-95 duration-300"
            onClick={e => e.stopPropagation()}
          />
          <a
            href={resolvedMediaUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-6 w-10 h-10 rounded-full bg-orange-500 hover:bg-orange-500/80 flex items-center justify-center text-white transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <Download className="h-5 w-5" />
          </a>
        </div>
      )}
    </>
  );
}

export interface NoteBubbleProps {
  content: string;
  authorName?: string | null;
  timestamp: string;
}

/**
 * Internal-note bubble (CR-T6) — amber dashed border + a lock tag, so it
 * reads as unmistakably NOT an outgoing WhatsApp message. Notes never carry
 * media/reactions/statuses, so this stays a small, separate component
 * instead of a MessageBubble "variant" prop with mostly-unused fields.
 */
export function NoteBubble({ content, authorName, timestamp }: NoteBubbleProps) {
  const time = new Date(timestamp).toLocaleString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
  return (
    <div className="flex justify-center px-4 py-0.5">
      <div className="max-w-[80%] rounded-lg border border-dashed border-amber-500/40 dark:border-amber-400/30 bg-amber-500/10 dark:bg-amber-400/[0.14] px-2.5 py-1.5">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[10px]">🔒</span>
          <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">ملاحظة داخلية</span>
          {authorName && (
            <span className="text-[10px] text-muted-foreground">-- {authorName}</span>
          )}
        </div>
        <p className="text-[13px] text-amber-900 dark:text-amber-200 whitespace-pre-wrap leading-snug">{content}</p>
        <span className="text-[10px] text-muted-foreground mt-0.5 block">{time}</span>
      </div>
    </div>
  );
}
