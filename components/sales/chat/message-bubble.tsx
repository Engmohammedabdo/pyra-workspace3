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

  // Status icons — WhatsApp Web style: gray checks, blue for read, red for failed
  const statusIcon = isOutgoing && status ? {
    sent: <Check className="h-3 w-3 text-[#667781] dark:text-[#8696a0]" />,
    delivered: <CheckCheck className="h-3 w-3 text-[#667781] dark:text-[#8696a0]" />,
    read: <CheckCheck className="h-3 w-3 text-[#53bdeb]" />,
    received: null,
    failed: <X className="h-3 w-3 text-red-500" />,
  }[status] || null : null;

  return (
    <>
      <div
        className={cn('flex group/msg relative', isOutgoing ? 'justify-end' : 'justify-start')}
        onMouseEnter={() => setShowReactions(false)}
      >
        {/* Hover action buttons — compact row, WhatsApp style */}
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
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-[#667781] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-[#e9edef] transition-colors"
              aria-label="رد"
              title="رد"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
          )}
          {onReact && (
            <button
              onClick={() => setShowReactions(!showReactions)}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-[#667781] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-[#e9edef] transition-colors"
              aria-label="تفاعل"
              title="تفاعل"
            >
              <SmilePlus className="h-3.5 w-3.5" />
            </button>
          )}
          {onSaveToFiles && ['image', 'document', 'video', 'audio'].includes(messageType) && (
            <button
              onClick={() => onSaveToFiles(id)}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-[#667781] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-[#e9edef] transition-colors"
              aria-label="حفظ"
              title="حفظ"
            >
              <HardDrive className="h-3.5 w-3.5" />
            </button>
          )}
          {onForward && (
            <button
              onClick={() => onForward(id)}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-[#667781] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-[#e9edef] transition-colors"
              aria-label="تحويل"
              title="تحويل"
            >
              <Forward className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Quick reactions picker — WhatsApp style pill */}
        {showReactions && onReact && (
          <div className={cn(
            'absolute -top-9 flex items-center gap-0.5 bg-white dark:bg-[#233138] rounded-full px-1.5 py-1 shadow-lg z-20 border border-gray-200/60 dark:border-gray-700/40',
            isOutgoing ? 'end-0' : 'start-0'
          )}>
            {QUICK_REACTIONS.map(emoji => (
              <button
                key={emoji}
                onClick={() => {
                  onReact(id, emoji);
                  setShowReactions(false);
                }}
                className="w-7 h-7 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center text-sm transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div
          className={cn(
            'max-w-[65%] rounded-lg px-2 py-1 space-y-0.5 relative shadow-sm',
            isOutgoing
              ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-ee-none'
              : 'bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-es-none'
          )}
        >
          {/* ── Quoted Reply Preview — WhatsApp style side bar ── */}
          {replyPreview && (
            <div className={cn(
              'rounded px-2 py-1.5 mb-0.5 border-s-3 text-xs cursor-pointer',
              isOutgoing
                ? 'bg-[#c3eebb] dark:bg-[#025144] border-s-[#06cf9c]'
                : 'bg-gray-100 dark:bg-[#1d282f] border-s-[#667781] dark:border-s-[#8696a0]'
            )}>
              {replyPreview.sender && (
                <span className="text-[11px] font-medium block text-[#06cf9c]">
                  {replyPreview.sender}
                </span>
              )}
              <span className={cn(
                'line-clamp-1 text-[#667781] dark:text-[#8696a0]'
              )}>
                {replyPreview.text || '...'}
              </span>
            </div>
          )}
          {/* ── Image Preview — WhatsApp style (no inner rounding) ── */}
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

          {/* ── Audio Player — WhatsApp style waveform ── */}
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
                className="w-8 h-8 rounded-full bg-[#00a884] text-white flex items-center justify-center shrink-0 transition-transform hover:scale-105"
              >
                {audioPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ms-0.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <div
                  className={cn('h-[3px] rounded-full cursor-pointer', isOutgoing ? 'bg-[#005c4b]/30 dark:bg-white/15' : 'bg-gray-300 dark:bg-gray-600')}
                  onClick={(e) => {
                    const el = audioRef.current;
                    if (!el || !el.duration) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    el.currentTime = (x / rect.width) * el.duration;
                  }}
                >
                  <div
                    className="h-full rounded-full bg-[#00a884] transition-all"
                    style={{ width: `${audioProgress}%` }}
                  />
                </div>
                <p className="text-[10px] mt-0.5 text-[#667781] dark:text-[#8696a0]">
                  رسالة صوتية
                </p>
              </div>
            </div>
          )}

          {/* ── Video — WhatsApp style ── */}
          {messageType === 'video' && resolvedMediaUrl && (
            <div className="overflow-hidden -mx-2 -mt-1">
              <video
                src={resolvedMediaUrl!}
                controls
                preload="metadata"
                className="w-full max-h-72"
              />
              {fileName && (
                <p className="text-[10px] mt-0.5 px-1 text-[#667781] dark:text-[#8696a0]">
                  {fileName}
                </p>
              )}
            </div>
          )}

          {/* ── Document — WhatsApp style card ── */}
          {messageType === 'document' && resolvedMediaUrl && (
            <a
              href={resolvedMediaUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors',
                isOutgoing
                  ? 'bg-[#c3eebb] dark:bg-[#025144] hover:bg-[#b8e6ae] dark:hover:bg-[#034a3f]'
                  : 'bg-gray-100 dark:bg-[#1d282f] hover:bg-gray-200/70 dark:hover:bg-[#233138]'
              )}
            >
              <div className="w-8 h-10 rounded flex items-center justify-center shrink-0 bg-gray-400/20 dark:bg-gray-500/20 text-[#667781] dark:text-[#8696a0]">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-normal truncate text-[#111b21] dark:text-[#e9edef]">
                  {fileName || 'مستند'}
                </p>
                <p className="text-[10px] text-[#667781] dark:text-[#8696a0]">
                  اضغط للتحميل
                </p>
              </div>
              <Download className="h-4 w-4 shrink-0 text-[#667781] dark:text-[#8696a0]" />
            </a>
          )}

          {/* ── Poll Message ── */}
          {messageType === 'poll' && content && (
            <div className={cn(
              'rounded-md px-2.5 py-2',
              isOutgoing
                ? 'bg-[#c3eebb] dark:bg-[#025144]'
                : 'bg-gray-100 dark:bg-[#1d282f]'
            )}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Vote className="h-3.5 w-3.5 text-[#00a884]" />
                <span className="text-[11px] font-medium text-[#00a884]">
                  استطلاع
                </span>
              </div>
              <p className="text-[13px] font-semibold mb-0.5 text-[#111b21] dark:text-[#e9edef]">
                {content}
              </p>
            </div>
          )}

          {/* ── Location Message ── */}
          {messageType === 'location' && (
            <div className={cn(
              'rounded-md px-2.5 py-2',
              isOutgoing
                ? 'bg-[#c3eebb] dark:bg-[#025144]'
                : 'bg-gray-100 dark:bg-[#1d282f]'
            )}>
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-red-500" />
                <span className="text-[11px] font-medium text-red-500">
                  موقع
                </span>
              </div>
              {content && (
                <p className="text-[13px] mt-0.5 text-[#111b21] dark:text-[#e9edef]">
                  {content}
                </p>
              )}
            </div>
          )}

          {/* ── Contact Card ── */}
          {messageType === 'contact' && (
            <div className={cn(
              'rounded-md px-2.5 py-2',
              isOutgoing
                ? 'bg-[#c3eebb] dark:bg-[#025144]'
                : 'bg-gray-100 dark:bg-[#1d282f]'
            )}>
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-[#00a884]" />
                <span className="text-[11px] font-medium text-[#00a884]">
                  جهة اتصال
                </span>
              </div>
              {content && (
                <p className="text-[13px] mt-0.5 font-medium text-[#111b21] dark:text-[#e9edef]">
                  {content}
                </p>
              )}
            </div>
          )}

          {/* ── Fallback media badge (no URL) ── */}
          {messageType !== 'text' && !resolvedMediaUrl && !['poll', 'location', 'contact'].includes(messageType) && (
            <div className="flex items-center gap-1.5 text-[13px] text-[#667781] dark:text-[#8696a0]">
              {MEDIA_ICONS[messageType] || null}
              <span className="text-xs">
                {fileName || (messageType === 'image' ? 'صورة' : messageType === 'audio' ? 'صوت' : messageType === 'video' ? 'فيديو' : 'ملف')}
              </span>
            </div>
          )}

          {/* Text content + inline timestamp (WhatsApp style) */}
          {content && (
            <p className="text-[13.6px] whitespace-pre-wrap break-words leading-[19px] text-[#111b21] dark:text-[#e9edef]">
              {content}
              {/* Invisible spacer so timestamp floats at end of text */}
              <span className="inline-block w-[70px]" />
            </p>
          )}

          {/* Time + Status — floated inside bubble, bottom-end */}
          <span className={cn(
            'text-[11px] float-end ms-2 -mt-4 flex items-center gap-0.5 relative z-[1]',
            'text-[#667781] dark:text-[#8696a0]'
          )}>
            <span className="tabular-nums">{time}</span>
            {statusIcon}
          </span>

          {/* ── Reaction Pills — WhatsApp style (below bubble, slight overlap) ── */}
          {reactions && reactions.length > 0 && (
            <div className="flex gap-0.5 -mb-3 mt-0.5 ms-1 flex-wrap relative z-[2]">
              {reactions.map((r, i) => (
                <span
                  key={i}
                  className="bg-white dark:bg-[#233138] rounded-full px-1.5 py-0.5 text-sm shadow-sm border border-gray-200/60 dark:border-gray-700/40"
                >
                  {r.emoji}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Fullscreen Image Lightbox — WhatsApp style dark overlay ── */}
      {imagePreview && resolvedMediaUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b141a]/90 animate-in fade-in duration-200"
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
            className="absolute bottom-6 w-10 h-10 rounded-full bg-[#00a884] hover:bg-[#00a884]/80 flex items-center justify-center text-white transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <Download className="h-5 w-5" />
          </a>
        </div>
      )}
    </>
  );
}
