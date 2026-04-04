'use client';

import { useState, useEffect } from 'react';
import { fetchAPI } from '@/hooks/api-helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import Link from 'next/link';

export function LeadMessagesTab({ leadId }: { leadId: string }) {
  const [messages, setMessages] = useState<{ id: string; direction: string; content: string | null; message_type: string; contact_name: string | null; timestamp: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch_() {
      try {
        const data = await fetchAPI<any[]>(`/api/dashboard/sales/whatsapp/messages?lead_id=${leadId}&limit=50`);
        setMessages(data.reverse());
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetch_();
  }, [leadId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className={cn('h-8 rounded-xl', i % 2 === 0 ? 'w-48 ms-auto' : 'w-56')} />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (messages.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <EmptyState
            icon={MessageSquare}
            title="لا توجد رسائل"
            description="لم يتم العثور على رسائل واتساب مرتبطة بهذا العميل المحتمل"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-emerald-500" />
            محادثات واتساب ({messages.length})
          </CardTitle>
          <Button variant="outline" size="sm" asChild className="rounded-xl text-xs">
            <Link href="/dashboard/sales/chat">فتح الشات</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {messages.map(msg => (
            <div key={msg.id} className={cn('flex', msg.direction === 'outgoing' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[80%] rounded-xl px-3 py-2 text-sm',
                msg.direction === 'outgoing'
                  ? 'bg-emerald-600 text-white rounded-ee-sm'
                  : 'bg-muted/50 text-foreground rounded-es-sm'
              )}>
                {msg.content ? (
                  <p className="whitespace-pre-wrap break-words text-[13px]">{msg.content}</p>
                ) : (
                  <p className={cn('text-xs italic', msg.direction === 'outgoing' ? 'text-white/70' : 'text-muted-foreground/60')}>
                    {msg.message_type === 'image' ? '📷 صورة' : msg.message_type === 'audio' ? '🎤 صوت' : msg.message_type === 'video' ? '🎬 فيديو' : '📎 ملف'}
                  </p>
                )}
                <p className={cn('text-[10px] mt-0.5 text-end', msg.direction === 'outgoing' ? 'text-white/50' : 'text-muted-foreground/40')}>
                  {new Date(msg.timestamp).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
