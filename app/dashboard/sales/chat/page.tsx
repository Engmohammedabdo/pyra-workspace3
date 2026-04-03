'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchAPI } from '@/hooks/api-helpers';
import { ConversationList, type Conversation } from '@/components/sales/chat/conversation-list';
import { ChatWindow } from '@/components/sales/chat/chat-window';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Wifi, Inbox, User, Clock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { motion } from 'framer-motion';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { isSuperAdmin } from '@/lib/auth/rbac';

type TabKey = 'all' | 'mine' | 'unassigned' | 'pending' | 'resolved';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status?: string;
  assigned?: string;
  adminOnly?: boolean;
}

const TABS: TabDef[] = [
  { key: 'all', label: 'الكل', icon: Inbox, status: 'all', assigned: 'all' },
  { key: 'mine', label: 'لي', icon: User, status: 'open', assigned: 'me' },
  { key: 'unassigned', label: 'غير مسند', icon: MessageCircle, status: 'open', assigned: 'unassigned' },
  { key: 'pending', label: 'معلّق', icon: Clock, status: 'pending', assigned: 'all' },
  { key: 'resolved', label: 'محلول', icon: CheckCircle2, status: 'resolved', assigned: 'all' },
];

export default function ChatInboxPage() {
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser ? isSuperAdmin(currentUser.rolePermissions) : false;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  const fetchConversations = useCallback(async () => {
    const tab = TABS.find(t => t.key === activeTab) || TABS[1];
    try {
      const result = await fetchAPI<any>(
        `/api/dashboard/sales/whatsapp/conversations?status=${tab.status || 'open'}&assigned=${tab.assigned || 'all'}`
      );
      // API returns data + meta.counts
      const data = Array.isArray(result) ? result : (result?.data || result || []);
      setConversations(Array.isArray(data) ? data : []);
      if (result?.meta?.counts) setCounts(result.meta.counts);
    } catch {
      console.error('Failed to fetch conversations');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  // Poll Evolution API for new messages, then refresh conversations
  const pollAndRefresh = useCallback(async () => {
    try {
      await fetch('/api/dashboard/sales/whatsapp/poll', { method: 'POST' });
    } catch { /* silent */ }
    await fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    setLoading(true);
    pollAndRefresh(); // First load: poll + fetch
    const interval = setInterval(pollAndRefresh, 15000); // Every 15s: poll + fetch
    return () => clearInterval(interval);
  }, [pollAndRefresh]);

  const handleSelectConversation = useCallback((conv: Conversation) => {
    setSelectedConv(conv);
    setMobileView('chat');
  }, []);

  // Tabs visible to agent: mine + unassigned. Admin sees all.
  const visibleTabs = isAdmin ? TABS : TABS.filter(t => t.key === 'mine' || t.key === 'unassigned');

  if (loading && conversations.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] border rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
          <div className="border-e p-3 space-y-2 hidden md:block">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
          <Skeleton className="h-full" />
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <MessageCircle className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">محادثات واتساب</h1>
          <p className="text-xs text-muted-foreground/60">Shared Inbox</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 overflow-x-auto">
        {visibleTabs.map(tab => {
          const count = tab.key === 'unassigned' ? counts.unassigned
            : tab.key === 'pending' ? counts.pending
            : tab.key === 'resolved' ? counts.resolved
            : tab.key === 'all' ? counts.open
            : undefined;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSelectedConv(null); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                activeTab === tab.key
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {count !== undefined && count > 0 && (
                <Badge variant="secondary" className="h-4 min-w-[16px] text-[10px] px-1">
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Chat Container */}
      <div
        className="border border-border/60 rounded-2xl overflow-hidden bg-card/30 backdrop-blur shadow-xl shadow-black/5 dark:shadow-black/20"
        style={{ height: 'calc(100vh - 210px)' }}
      >
        <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] h-full">
          {/* Conversation List */}
          <div className={cn('h-full min-h-0 overflow-hidden md:block', mobileView === 'chat' ? 'hidden' : 'block')}>
            <ConversationList
              conversations={conversations}
              selectedJid={selectedConv?.remote_jid || null}
              onSelect={handleSelectConversation}
            />
          </div>

          {/* Chat Window */}
          <div className={cn('h-full min-h-0 overflow-hidden flex flex-col bg-background/50 md:block', mobileView === 'list' ? 'hidden' : 'block')}>
            {selectedConv ? (
              <ChatWindow
                remoteJid={selectedConv.remote_jid}
                instanceName={selectedConv.instance_name || 'pyraai'}
                contactName={selectedConv.contact_name}
                leadId={selectedConv.lead_id}
                clientId={selectedConv.client_id}
                phone={selectedConv.phone || selectedConv.contact_phone}
                assignedTo={selectedConv.assigned_to}
                conversationId={(selectedConv as any).id}
                conversationStatus={(selectedConv as any).status}
                isAdmin={isAdmin}
                onBack={() => setMobileView('list')}
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
