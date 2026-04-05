'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';
import {
  Check,
  CheckCheck,
  Clock,
  Download,
  FileText,
  Image as ImageIcon,
  Mic,
  Pause,
  Play,
  Video,
  X,
  ZoomIn,
} from 'lucide-react';

interface MessageBubbleProps {
  id: string;
  content: string | null;
  direction: 'incoming' | 'outgoing';
  messageType: string;
  mediaUrl?: string | null;
  fileName?: string | null;
  status?: string;
  timestamp: string;
}

const MEDIA_ICONS: Record<string, React.ReactNode> = {
  image: <ImageIcon className="h-4 w-4" />,
  document: <FileText className="h-4 w-4" />,
  audio: <Mic className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
};

export function MessageBubble({ id, content, direction, messageType, mediaUrl, fileName, status, timestamp }: MessageBubbleProps) {
  const [imagePreview, setImagePreview] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
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

  // Status icons — different colors for outgoing
  const statusIcon = isOutgoing && status ? {
    sent: <Check className="h-3 w-3 text-white/50" />,
    delivered: <CheckCheck className="h-3 w-3 text-white/50" />,
    read: <CheckCheck className="h-3 w-3 text-sky-200" />,
    received: null,
    failed: <Clock className="h-3 w-3 text-red-300" />,
  }[status] || null : null;

  return (
    <>
      <div className={cn('flex', isOutgoing ? 'justify-end' : 'justify-start')}>
        <div
          className={cn(
            'max-w-[75%] rounded-2xl px-3.5 py-2 space-y-1 relative',
            isOutgoing
              ? 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-600/10 rounded-ee-sm'
              : 'bg-card border border-border/50 text-foreground shadow-sm rounded-es-sm'
          )}
        >
          {/* ── Image Preview ── */}
          {messageType === 'image' && resolvedMediaUrl && (
            <div
              className="relative rounded-xl overflow-hidden cursor-pointer group/img -mx-0.5 -mt-0.5"
              onClick={() => setImagePreview(true)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolvedMediaUrl!}
                alt={fileName || 'صورة'}
                className="w-full max-h-60 object-cover rounded-xl transition-transform duration-300 group-hover/img:scale-[1.02]"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/15 transition-colors duration-200 flex items-center justify-center">
                <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover/img:opacity-100 transition-opacity duration-200 drop-shadow-lg" />
              </div>
            </div>
          )}

          {/* ── Audio Player ── */}
          {messageType === 'audio' && resolvedMediaUrl && (
            <div className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2 min-w-[200px]',
              isOutgoing ? 'bg-white/10' : 'bg-muted/40'
            )}>
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
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform hover:scale-105',
                  isOutgoing ? 'bg-white/20 text-white' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                )}
              >
                {audioPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ms-0.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <div
                  className={cn('h-1.5 rounded-full cursor-pointer', isOutgoing ? 'bg-white/20' : 'bg-muted-foreground/15')}
                  onClick={(e) => {
                    const el = audioRef.current;
                    if (!el || !el.duration) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    el.currentTime = (x / rect.width) * el.duration;
                  }}
                >
                  <div
                    className={cn('h-full rounded-full transition-all', isOutgoing ? 'bg-white/60' : 'bg-emerald-500')}
                    style={{ width: `${audioProgress}%` }}
                  />
                </div>
                <p className={cn('text-[10px] mt-1', isOutgoing ? 'text-white/50' : 'text-muted-foreground/50')}>
                  رسالة صوتية
                </p>
              </div>
            </div>
          )}

          {/* ── Video ── */}
          {messageType === 'video' && resolvedMediaUrl && (
            <div className="rounded-xl overflow-hidden -mx-0.5 -mt-0.5">
              <video
                src={resolvedMediaUrl!}
                controls
                preload="metadata"
                className="w-full max-h-60 rounded-xl"
              />
              {fileName && (
                <p className={cn('text-[10px] mt-1 px-1', isOutgoing ? 'text-white/50' : 'text-muted-foreground/50')}>
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
                'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                isOutgoing ? 'bg-white/10 hover:bg-white/15' : 'bg-muted/40 hover:bg-muted/60'
              )}
            >
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                isOutgoing ? 'bg-white/20 text-white' : 'bg-red-500/10 text-red-600 dark:text-red-400'
              )}>
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium truncate', isOutgoing ? 'text-white' : 'text-foreground')}>
                  {fileName || 'مستند'}
                </p>
                <p className={cn('text-[10px]', isOutgoing ? 'text-white/50' : 'text-muted-foreground/50')}>
                  اضغط للتحميل
                </p>
              </div>
              <Download className={cn('h-3.5 w-3.5 shrink-0', isOutgoing ? 'text-white/30' : 'text-muted-foreground/30')} />
            </a>
          )}

          {/* ── Fallback media badge (no URL) ── */}
          {messageType !== 'text' && !resolvedMediaUrl && (
            <div className={cn(
              'flex items-center gap-2 text-sm',
              isOutgoing ? 'text-white/70' : 'text-muted-foreground/70'
            )}>
              {MEDIA_ICONS[messageType] || null}
              <span className="text-xs">
                {fileName || (messageType === 'image' ? 'صورة' : messageType === 'audio' ? 'صوت' : messageType === 'video' ? 'فيديو' : 'ملف')}
              </span>
            </div>
          )}

          {/* Text content */}
          {content && (
            <p className="text-[13.5px] whitespace-pre-wrap break-words leading-relaxed">{content}</p>
          )}

          {/* Time + Status */}
          <div className={cn(
            'flex items-center gap-1 justify-end -mb-0.5',
            isOutgoing ? 'text-white/50' : 'text-muted-foreground/40'
          )}>
            <span className="text-[10px] tabular-nums">{time}</span>
            {statusIcon}
          </div>
        </div>
      </div>

      {/* ── Fullscreen Image Lightbox ── */}
      {imagePreview && resolvedMediaUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
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
            className="max-w-[90vw] max-h-[90vh] rounded-2xl shadow-2xl dark:shadow-black/25 object-contain animate-in zoom-in-95 duration-300"
            onClick={e => e.stopPropagation()}
          />
          <a
            href={resolvedMediaUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-6 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <Download className="h-5 w-5" />
          </a>
        </div>
      )}
    </>
  );
}
