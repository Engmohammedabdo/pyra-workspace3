'use client';

import { useState, useEffect, useCallback } from 'react';
import { ConversationList, type Conversation } from '@/components/sales/chat/conversation-list';
import { ChatWindow } from '@/components/sales/chat/chat-window';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function ChatInboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/sales/whatsapp/conversations');
      const data = await res.json();
      setConversations(data.data || []);
    } catch {
      console.error('Failed to fetch conversations');
    } finally {
      setLoading(false);
    }
  }, []);

  const [syncProgress, setSyncProgress] = useState('');

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncProgress('جاري بدء المزامنة...');
    let nextPage = 1;
    let totalInserted = 0;
    let totalSkipped = 0;
    let done = false;

    try {
      while (!done) {
        const res = await fetch('/api/dashboard/sales/whatsapp/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instanceName: 'pyraai', startPage: nextPage, pagesToSync: 10 }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error('[Sync Error]', errData);
          toast.error(errData.details || errData.error || 'فشل في المزامنة');
          break;
        }

        const data = await res.json();
        if (!data.sync) {
          toast.error('فشل في المزامنة');
          break;
        }

        totalInserted += data.sync.inserted;
        totalSkipped += data.sync.skipped;
        done = data.sync.done;
        nextPage = data.sync.nextPage || nextPage;

        const totalPages = data.sync.totalPages || 0;
        const progress = totalPages > 0
          ? Math.round((data.sync.lastProcessedPage / totalPages) * 100)
          : 0;
        setSyncProgress(`${progress}% — ${totalInserted} رسالة جديدة`);

        // Refresh conversations list after each batch
        if (totalInserted > 0) {
          await fetchConversations();
        }
      }

      if (totalInserted > 0) {
        toast.success(`تمت المزامنة: ${totalInserted} رسالة جديدة`);
      } else {
        toast.info('لا توجد رسائل جديدة للمزامنة');
      }
    } catch {
      toast.error('فشل في المزامنة — حاول مرة أخرى');
    } finally {
      setSyncing(false);
      setSyncProgress('');
      await fetchConversations();
    }
  }, [fetchConversations]);

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-7 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-border/60 rounded-2xl overflow-hidden shadow-xl shadow-black/5 dark:shadow-black/20" style={{ height: 'calc(100vh - 180px)' }}>
          <div className="border-e border-border/60 p-4 space-y-3 bg-card/50">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
          <div className="col-span-2 p-4">
            <Skeleton className="h-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <MessageCircle className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">محادثات واتساب</h1>
            <p className="text-xs text-muted-foreground/60">{conversations.length} محادثة</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {syncing && syncProgress && (
            <span className="text-xs text-muted-foreground animate-pulse">{syncProgress}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'جاري المزامنة...' : 'مزامنة الرسائل'}
          </Button>
        </div>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-3 border border-border/60 rounded-2xl overflow-hidden bg-card/30 backdrop-blur shadow-xl shadow-black/5 dark:shadow-black/20"
        style={{ height: 'calc(100vh - 180px)' }}
      >
        {/* Conversation List */}
        <ConversationList
          conversations={conversations}
          selectedJid={selectedConv?.remote_jid || null}
          onSelect={setSelectedConv}
        />

        {/* Chat Window */}
        <div className="col-span-2 flex flex-col bg-background/50">
          {selectedConv ? (
            <ChatWindow
              remoteJid={selectedConv.remote_jid}
              instanceName={selectedConv.instance_name}
              contactName={selectedConv.contact_name}
              leadId={selectedConv.lead_id}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-muted/60 to-muted/30 flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="h-10 w-10 text-muted-foreground/30" />
                </div>
                <p className="font-medium text-muted-foreground/60">اختر محادثة</p>
                <p className="text-xs text-muted-foreground/40 mt-1">اختر محادثة من القائمة لعرض الرسائل</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
