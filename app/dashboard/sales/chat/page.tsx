'use client';

import { useState, useEffect, useCallback } from 'react';
import { ConversationList, type Conversation } from '@/components/sales/chat/conversation-list';
import { ChatWindow } from '@/components/sales/chat/chat-window';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, RefreshCw, ArrowRight, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { isSuperAdmin } from '@/lib/auth/rbac';

export default function ChatInboxPage() {
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser ? isSuperAdmin(currentUser.rolePermissions) : false;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [syncPercent, setSyncPercent] = useState(0);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [hasAutoSynced, setHasAutoSynced] = useState(false);

  // Mobile: show list or chat (not both)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

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

  const handleSelectConversation = useCallback((conv: Conversation) => {
    setSelectedConv(conv);
    setMobileView('chat');
  }, []);

  const handleBackToList = useCallback(() => {
    setMobileView('list');
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncProgress('جاري بدء المزامنة...');
    setSyncPercent(0);
    let nextPage = 1;
    let totalInserted = 0;
    let done = false;

    try {
      while (!done) {
        const res = await fetch('/api/dashboard/sales/whatsapp/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startPage: nextPage, pagesToSync: 10 }),
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
        done = data.sync.done;
        nextPage = data.sync.nextPage || nextPage;

        const totalPages = data.sync.totalPages || 0;
        const progress = totalPages > 0
          ? Math.round((data.sync.lastProcessedPage / totalPages) * 100)
          : 0;
        setSyncPercent(progress);
        setSyncProgress(`${totalInserted} رسالة جديدة`);

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
      setSyncPercent(0);
      await fetchConversations();
    }
  }, [fetchConversations]);

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // Auto-sync on first load if zero conversations
  useEffect(() => {
    if (!loading && conversations.length === 0 && !syncing && !hasAutoSynced) {
      setHasAutoSynced(true);
      handleSync();
    }
  }, [loading, conversations.length, syncing, hasAutoSynced, handleSync]);

  // ─── Loading State ───
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div
          className="grid grid-cols-1 md:grid-cols-[340px_1fr] border border-border/60 rounded-2xl overflow-hidden shadow-xl shadow-black/5 dark:shadow-black/20"
          style={{ height: 'calc(100vh - 180px)' }}
        >
          <div className="border-e border-border/60 p-3 space-y-2 bg-card/50 hidden md:block">
            <Skeleton className="h-10 w-full rounded-xl mb-3" />
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
            ))}
          </div>
          <div className="p-6 flex items-center justify-center">
            <div className="text-center space-y-3">
              <Skeleton className="h-16 w-16 rounded-2xl mx-auto" />
              <Skeleton className="h-4 w-28 mx-auto" />
              <Skeleton className="h-3 w-44 mx-auto" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <MessageCircle className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">محادثات واتساب</h1>
            <p className="text-xs text-muted-foreground/60">
              {conversations.length > 0 ? `${conversations.length} محادثة` : 'لا توجد محادثات'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Sync Progress */}
          {syncing && (
            <div className="flex items-center gap-2.5 bg-orange-50 dark:bg-orange-950/20 border border-orange-200/60 dark:border-orange-800/30 rounded-xl px-3 py-1.5">
              <div className="relative w-20 h-1.5 bg-orange-200/60 dark:bg-orange-800/30 rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 start-0 bg-gradient-to-e from-orange-500 to-amber-500 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${syncPercent}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <span className="text-[11px] font-medium text-orange-700 dark:text-orange-400 whitespace-nowrap">
                {syncProgress}
              </span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="gap-2 rounded-xl"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
            <span className="hidden sm:inline">{syncing ? 'جاري المزامنة...' : 'مزامنة'}</span>
          </Button>
        </div>
      </div>

      {/* Main Chat Container */}
      <div
        className="border border-border/60 rounded-2xl overflow-hidden bg-card/30 backdrop-blur shadow-xl shadow-black/5 dark:shadow-black/20"
        style={{ height: 'calc(100vh - 170px)' }}
      >
        <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] h-full">

          {/* Conversation List — hidden on mobile when chat is open */}
          <div className={cn(
            'h-full md:block',
            mobileView === 'chat' ? 'hidden' : 'block'
          )}>
            <ConversationList
              conversations={conversations}
              selectedJid={selectedConv?.remote_jid || null}
              onSelect={handleSelectConversation}
            />
          </div>

          {/* Chat Window — hidden on mobile when list is showing */}
          <div className={cn(
            'h-full flex flex-col bg-background/50 md:block',
            mobileView === 'list' ? 'hidden' : 'block'
          )}>
            {selectedConv ? (
              <ChatWindow
                remoteJid={selectedConv.remote_jid}
                instanceName={selectedConv.instance_name}
                contactName={selectedConv.contact_name}
                leadId={selectedConv.lead_id}
                phone={selectedConv.phone}
                assignedTo={selectedConv.assigned_to}
                isAdmin={isAdmin}
                onBack={handleBackToList}
                onConversationUpdated={fetchConversations}
              />
            ) : (
              <div className="flex-1 h-full flex items-center justify-center">
                <div className="text-center px-6">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-100 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 flex items-center justify-center mx-auto mb-5">
                    <Wifi className="h-9 w-9 text-emerald-500/50 dark:text-emerald-400/40" />
                  </div>
                  <p className="font-semibold text-foreground/70 text-base">اختر محادثة</p>
                  <p className="text-sm text-muted-foreground/50 mt-1.5 max-w-[240px] mx-auto leading-relaxed">
                    اختر محادثة من القائمة لعرض الرسائل والرد عليها
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
