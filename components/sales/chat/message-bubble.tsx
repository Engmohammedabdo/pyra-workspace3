'use client';

import { cn } from '@/lib/utils/cn';
import { Check, CheckCheck, Clock, FileText, Image, Mic, Video } from 'lucide-react';

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
  image: <Image className="h-4 w-4" />,
  document: <FileText className="h-4 w-4" />,
  audio: <Mic className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
};

export function MessageBubble({ content, direction, messageType, mediaUrl, fileName, status, timestamp }: MessageBubbleProps) {
  const isOutgoing = direction === 'outgoing';
  const time = new Date(timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={cn('flex', isOutgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2.5 space-y-1 relative',
          isOutgoing
            ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/15 rounded-ee-md'
            : 'bg-card border border-border/60 text-foreground shadow-sm rounded-es-md'
        )}
      >
        {/* Media preview */}
        {messageType !== 'text' && (
          <div className={cn(
            'flex items-center gap-2 text-sm',
            isOutgoing ? 'text-white/80' : 'text-muted-foreground'
          )}>
            {MEDIA_ICONS[messageType] || null}
            {fileName && <span className="truncate text-xs">{fileName}</span>}
            {mediaUrl && !fileName && (
              <span className="text-xs">{messageType === 'image' ? 'صورة' : messageType === 'audio' ? 'صوت' : messageType === 'video' ? 'فيديو' : 'ملف'}</span>
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
  );
}
