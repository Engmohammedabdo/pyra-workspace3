'use client';

import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageCircle, Wifi, Inbox, User, Clock, CheckCircle2, AlarmClock, BarChart3, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { isSuperAdmin } from '@/lib/auth/rbac';
import { useConversations, usePollWhatsApp, useCheckSla, useUpdateConversation, useSyncGroups } from '@/hooks/useWhatsApp';
import { toast } from 'sonner';
import { ConversationList } from './conversation-list';
import { ChatPanel } from './chat-panel';
import { BulkActionsBar } from './bulk-actions-bar';
import { FilterBar } from './filters/filter-bar';
import { SortSelector } from './filters/sort-selector';
import { AssignDialog } from './dialogs/assign-dialog';
import { useChatStore, TABS } from './use-chat-store';
import { useChatShortcuts } from './use-chat-shortcuts';
import {
  playNotificationSound,
  showDesktopNotification,
  requestDesktopPermission,
} from '@/lib/whatsapp/notifications';

const TAB_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Inbox,
  User,
  MessageCircle,
  Clock,
  CheckCircle2,
  AlarmClock,
};

export function ChatLayout() {
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser ? isSuperAdmin(currentUser.rolePermissions) : false;

  const store = useChatStore();
  const {
    selectedConversation,
    setSelectedConversation,
    activeTab,
    setActiveTab,
    sortBy,
    setSortBy,
    filters,
    mobileView,
    setMobileView,
    selectConversation,
    bulkMode,
    setBulkMode,
    selectedIds,
    toggleSelectedId,
    selectAllIds,
    clearSelectedIds,
  } = store;

  // Group type filter (with safety fallback)
  const conversationType = store.conversationType || 'all';
  const setConversationType = store.setConversationType || (() => {});

  // Get current tab definition for API params
  const currentTab = useMemo(
    () => TABS.find(t => t.key === activeTab) || TABS[1],
    [activeTab]
  );

  // Build query params for the conversations hook
  const queryParams = useMemo(() => {
    const params: Record<string, string | undefined> = {
      status: currentTab.status || 'open',
      assigned: currentTab.assigned || 'all',
      sort: sortBy,
      ...(conversationType !== 'all' ? { type: conversationType } : {}),
    };
    if (filters.label) params.label = filters.label;
    if (filters.team) params.team = filters.team;
    if (filters.priority.length > 0) params.priority = filters.priority.join(',');
    if (filters.assignedTo.length > 0) params.assigned_agents = filters.assignedTo.join(',');
    return params;
  }, [currentTab, sortBy, filters, conversationType]);

  // Fetch conversations via React Query with auto-refresh
  const { data: conversationsResponse, isLoading } = useConversations(queryParams);
  const conversations = conversationsResponse?.data || [];
  const counts = conversationsResponse?.meta?.counts || {};

  // Sync groups mutation
  const syncGroupsMutation = useSyncGroups();

  // Poll Evolution API on mount and every 15s
  const pollMutation = usePollWhatsApp();
  const pollRef = useRef(pollMutation.mutate);
  pollRef.current = pollMutation.mutate;

  useEffect(() => {
    pollRef.current(); // Poll on mount
    const interval = setInterval(() => pollRef.current(), 15_000);
    return () => clearInterval(interval);
  }, []);

  // SLA breach check — runs every 60s
  const slaCheckMutation = useCheckSla();
  const slaCheckRef = useRef(slaCheckMutation.mutate);
  slaCheckRef.current = slaCheckMutation.mutate;

  useEffect(() => {
    // Initial check after 10s (give conversations time to load first)
    const timeout = setTimeout(() => slaCheckRef.current(), 10_000);
    const interval = setInterval(() => slaCheckRef.current(), 60_000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, []);

  // Resolve mutation for keyboard shortcut (E)
  const updateConversation = useUpdateConversation();
  const [shortcutAssignOpen, setShortcutAssignOpen] = useState(false);

  const handleShortcutResolve = useCallback(() => {
    if (!selectedConversation?.id) return;
    updateConversation.mutate(
      { conversationId: selectedConversation.id, data: { status: 'resolved' } },
      {
        onSuccess: () => {
          toast.success('تم حل المحادثة');
          setSelectedConversation(null);
        },
        onError: () => toast.error('فشل في حل المحادثة'),
      }
    );
  }, [selectedConversation, updateConversation, setSelectedConversation]);

  const handleShortcutAssign = useCallback(() => {
    if (!selectedConversation?.id) return;
    setShortcutAssignOpen(true);
  }, [selectedConversation]);

  // Keyboard shortcuts
  useChatShortcuts({
    conversations,
    onResolve: handleShortcutResolve,
    onOpenAssign: handleShortcutAssign,
  });

  // Request desktop notification permission on mount
  useEffect(() => {
    requestDesktopPermission();
  }, []);

  // Track total unread to detect new incoming messages
  const prevUnreadRef = useRef<number>(0);
  useEffect(() => {
    const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
    if (prevUnreadRef.current > 0 && totalUnread > prevUnreadRef.current) {
      // New messages arrived — find which conversation
      const newMsgConv = conversations.find(
        c => (c.unread_count || 0) > 0 && !c.is_muted
      );
      if (newMsgConv) {
        playNotificationSound();
        showDesktopNotification(
          `رسالة من ${newMsgConv.contact_name || newMsgConv.contact_phone || 'جهة اتصال'}`,
          newMsgConv.last_message || 'رسالة جديدة'
        );
      }
    }
    prevUnreadRef.current = totalUnread;
  }, [conversations]);

  // Agent sees ONLY "mine" tab — unassigned is admin's job to distribute
  const visibleTabs = isAdmin ? TABS : TABS.filter(t => t.key === 'mine');

  if (isLoading && conversations.length === 0) {
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
        <div className="flex-1" />
        {isAdmin && (
          <Link href="/dashboard/sales/whatsapp-analytics">
            <Button variant="outline" size="sm" className="rounded-lg text-xs h-8 gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              عرض التحليلات
            </Button>
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="تصفية المحادثات" className="flex gap-1 bg-muted/50 rounded-xl p-1 overflow-x-auto">
        {visibleTabs.map(tab => {
          const count = tab.key === 'unassigned' ? counts.unassigned
            : tab.key === 'pending' ? counts.pending
            : tab.key === 'resolved' ? counts.resolved
            : tab.key === 'snoozed' ? counts.snoozed
            : tab.key === 'all' ? counts.open
            : undefined;
          const Icon = TAB_ICONS[tab.iconName];
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => { setActiveTab(tab.key); setSelectedConversation(null); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                activeTab === tab.key
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
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

      {/* Conversation Type Filter */}
      <div className="flex items-center gap-1 px-1">
        {(['all', 'individual', 'group'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setConversationType(t)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-full transition-colors',
              conversationType === t
                ? 'bg-orange-500 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {t === 'all' ? 'الكل' : t === 'individual' ? 'فردي' : 'مجموعات'}
            {t === 'group' && (counts as Record<string, number>).groups ? ` (${(counts as Record<string, number>).groups})` : ''}
          </button>
        ))}
        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 ms-auto"
            onClick={() => syncGroupsMutation.mutate()}
            disabled={syncGroupsMutation.isPending}
          >
            <RefreshCw className={cn('h-3 w-3', syncGroupsMutation.isPending && 'animate-spin')} />
            مزامنة
          </Button>
        )}
      </div>

      {/* Toolbar: Filters + Sort + Bulk Mode */}
      {isAdmin && (
        <div className="flex items-center gap-2 flex-wrap">
          <FilterBar />
          <SortSelector value={sortBy} onChange={setSortBy} />
          <div className="flex-1" />
          <Button
            variant={bulkMode ? 'outline' : 'ghost'}
            size="sm"
            className={cn(
              'rounded-lg text-xs h-7',
              bulkMode && 'border-orange-300 dark:border-orange-700 text-orange-600'
            )}
            onClick={() => setBulkMode(!bulkMode)}
          >
            {bulkMode ? 'إلغاء التحديد' : 'تحديد متعدد'}
          </Button>
        </div>
      )}

      {/* Main Chat Container */}
      <div
        className="border border-border/60 rounded-2xl overflow-hidden bg-card/30 backdrop-blur shadow-xl shadow-black/5 dark:shadow-black/20"
        style={{ height: isAdmin ? 'calc(100vh - 250px)' : 'calc(100vh - 210px)' }}
      >
        <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] h-full">
          {/* Conversation List */}
          <div className={cn('h-full min-h-0 overflow-hidden md:block', mobileView === 'chat' ? 'hidden' : 'block')}>
            <ConversationList
              conversations={conversations}
              selectedJid={selectedConversation?.remote_jid || null}
              onSelect={selectConversation}
              bulkMode={bulkMode}
              selectedIds={selectedIds}
              onToggleCheck={toggleSelectedId}
              onSelectAll={() => selectAllIds(conversations.map(c => c.id).filter(Boolean) as string[])}
            />
          </div>

          {/* Chat Window */}
          <div className={cn('h-full min-h-0 overflow-hidden flex flex-col bg-background/50 md:block', mobileView === 'list' ? 'hidden' : 'block')}>
            {selectedConversation ? (
              <ChatPanel
                remoteJid={selectedConversation.remote_jid}
                instanceName={selectedConversation.instance_name || 'pyraai'}
                contactName={selectedConversation.contact_name}
                leadId={selectedConversation.lead_id}
                clientId={selectedConversation.client_id}
                phone={selectedConversation.phone || selectedConversation.contact_phone}
                assignedTo={selectedConversation.assigned_to}
                conversationId={selectedConversation.id}
                conversationStatus={selectedConversation.status}
                snoozedUntil={selectedConversation.snoozed_until}
                isMuted={selectedConversation.is_muted}
                labels={selectedConversation.labels}
                slaData={selectedConversation.sla_policy_id ? {
                  sla_policy_id: selectedConversation.sla_policy_id,
                  sla_first_response_due: selectedConversation.sla_first_response_due,
                  sla_resolution_due: selectedConversation.sla_resolution_due,
                  sla_first_response_breached: selectedConversation.sla_first_response_breached,
                  sla_resolution_breached: selectedConversation.sla_resolution_breached,
                  first_reply_at: selectedConversation.first_reply_at,
                  resolved_at: selectedConversation.resolved_at,
                  status: selectedConversation.status,
                } : null}
                isAdmin={isAdmin}
                isContactTyping={selectedConversation.is_typing}
                isGroup={selectedConversation.is_group}
                groupSubject={selectedConversation.group_subject}
                participantCount={selectedConversation.participant_count}
                groupPictureUrl={selectedConversation.group_picture_url}
                onBack={() => setMobileView('list')}
                onConversationUpdated={() => {
                  // Conversations will auto-refresh via React Query
                }}
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

      {/* Bulk Actions Bar */}
      {bulkMode && (
        <BulkActionsBar
          selectedIds={selectedIds}
          onClear={clearSelectedIds}
          onDone={() => {
            clearSelectedIds();
            setBulkMode(false);
          }}
        />
      )}

      {/* Assign Dialog triggered by keyboard shortcut (A) */}
      {selectedConversation && (
        <AssignDialog
          open={shortcutAssignOpen}
          conversationId={selectedConversation.id}
          remoteJid={selectedConversation.remote_jid}
          instanceName={selectedConversation.instance_name || 'pyraai'}
          currentAgent={selectedConversation.assigned_to || null}
          onAssigned={() => setShortcutAssignOpen(false)}
          onClose={() => setShortcutAssignOpen(false)}
        />
      )}
    </motion.div>
  );
}
