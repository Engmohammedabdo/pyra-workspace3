'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import {
  Check,
  CheckCheck,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Mic,
  Play,
  Video,
  X,
  ZoomIn,
} from 'lucide-react';

interface MessageBubbleProps {
  content: string | null;
  direction: 'incoming' | 'outgoing';
  messageType: string;
  mediaUrl?: string | null;
  fileName?: string | null;
  status?: string;
  timestamp: string;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  sent: <Check className="h-3 w-3 text-white/50" />,
  delivered: <CheckCheck className="h-3 w-3 text-white/50" />,
  read: <CheckCheck className="h-3 w-3 text-sky-300" />,
  failed: <Clock className="h-3 w-3 text-red-300" />,
};

const MEDIA_ICONS: Record<string, React.ReactNode> = {
  image: <ImageIcon className="h-4 w-4" />,
  document: <FileText className="h-4 w-4" />,
  audio: <Mic className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
};

export function MessageBubble({ content, direction, messageType, mediaUrl, fileName, status, timestamp }: MessageBubbleProps) {
  const [imagePreview, setImagePreview] = useState(false);
  const isOutgoing = direction === 'outgoing';
  const time = new Date(timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div className={cn('flex', isOutgoing ? 'justify-end' : 'justify-start')}>
        <div
          className={cn(
            'max-w-[75%] rounded-2xl px-4 py-2.5 space-y-1.5 relative group',
            isOutgoing
              ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/15 rounded-ee-md'
              : 'bg-card border border-border/60 text-foreground shadow-sm rounded-es-md'
          )}
        >
          {/* ── Image Preview ── */}
          {messageType === 'image' && mediaUrl && (
            <div
              className="relative rounded-xl overflow-hidden cursor-pointer group/img -mx-1 -mt-0.5"
              onClick={() => setImagePreview(true)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl}
                alt={fileName || 'صورة'}
                className="w-full max-h-64 object-cover rounded-xl transition-transform duration-300 group-hover/img:scale-[1.02]"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors duration-200 flex items-center justify-center">
                <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover/img:opacity-100 transition-opacity duration-200 drop-shadow-lg" />
              </div>
            </div>
          )}

          {/* ── Audio Player ── */}
          {messageType === 'audio' && mediaUrl && (
            <div className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2 min-w-[200px]',
              isOutgoing ? 'bg-white/10' : 'bg-muted/50'
            )}>
              <a
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform hover:scale-105',
                  isOutgoing ? 'bg-white/20 text-white' : 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                )}
              >
                <Play className="h-4 w-4 ms-0.5" />
              </a>
              <div className="flex-1 min-w-0">
                <div className={cn(
                  'h-1 rounded-full',
                  isOutgoing ? 'bg-white/30' : 'bg-muted-foreground/20'
                )}>
                  <div className={cn(
                    'h-full w-1/3 rounded-full',
                    isOutgoing ? 'bg-white/70' : 'bg-orange-500'
                  )} />
                </div>
                <p className={cn(
                  'text-[10px] mt-1',
                  isOutgoing ? 'text-white/50' : 'text-muted-foreground/60'
                )}>
                  رسالة صوتية
                </p>
              </div>
            </div>
          )}

          {/* ── Video ── */}
          {messageType === 'video' && mediaUrl && (
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                isOutgoing ? 'bg-white/10 hover:bg-white/15' : 'bg-muted/50 hover:bg-muted/70'
              )}
            >
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                isOutgoing ? 'bg-white/20 text-white' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
              )}>
                <Video className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-medium truncate',
                  isOutgoing ? 'text-white' : 'text-foreground'
                )}>
                  {fileName || 'فيديو'}
                </p>
                <p className={cn(
                  'text-[10px]',
                  isOutgoing ? 'text-white/50' : 'text-muted-foreground/60'
                )}>
                  اضغط للعرض
                </p>
              </div>
              <ExternalLink className={cn(
                'h-3.5 w-3.5 shrink-0',
                isOutgoing ? 'text-white/40' : 'text-muted-foreground/40'
              )} />
            </a>
          )}

          {/* ── Document ── */}
          {messageType === 'document' && mediaUrl && (
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                isOutgoing ? 'bg-white/10 hover:bg-white/15' : 'bg-muted/50 hover:bg-muted/70'
              )}
            >
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                isOutgoing ? 'bg-white/20 text-white' : 'bg-red-500/10 text-red-600 dark:text-red-400'
              )}>
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-medium truncate',
                  isOutgoing ? 'text-white' : 'text-foreground'
                )}>
                  {fileName || 'مستند'}
                </p>
                <p className={cn(
                  'text-[10px]',
                  isOutgoing ? 'text-white/50' : 'text-muted-foreground/60'
                )}>
                  اضغط للتحميل
                </p>
              </div>
              <Download className={cn(
                'h-3.5 w-3.5 shrink-0',
                isOutgoing ? 'text-white/40' : 'text-muted-foreground/40'
              )} />
            </a>
          )}

          {/* ── Fallback media badge (no URL) ── */}
          {messageType !== 'text' && !mediaUrl && (
            <div className={cn(
              'flex items-center gap-2 text-sm',
              isOutgoing ? 'text-white/80' : 'text-muted-foreground'
            )}>
              {MEDIA_ICONS[messageType] || null}
              {fileName && <span className="truncate text-xs">{fileName}</span>}
              {!fileName && (
                <span className="text-xs">
                  {messageType === 'image' ? 'صورة' : messageType === 'audio' ? 'صوت' : messageType === 'video' ? 'فيديو' : 'ملف'}
                </span>
              )}
            </div>
          )}

          {/* Text content */}
          {content && (
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{content}</p>
          )}

          {/* Time + Status */}
          <div className={cn(
            'flex items-center gap-1.5 justify-end',
            isOutgoing ? 'text-white/60' : 'text-muted-foreground/60'
          )}>
            <span className="text-[10px]">{time}</span>
            {isOutgoing && status && STATUS_ICONS[status]}
          </div>
        </div>
      </div>

      {/* ── Fullscreen Image Lightbox ── */}
      {imagePreview && mediaUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setImagePreview(false)}
        >
          <button
            className="absolute top-4 end-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            onClick={() => setImagePreview(false)}
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt={fileName || 'صورة'}
            className="max-w-[90vw] max-h-[90vh] rounded-2xl shadow-2xl object-contain animate-in zoom-in-95 duration-300"
            onClick={e => e.stopPropagation()}
          />
          <a
            href={mediaUrl}
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
