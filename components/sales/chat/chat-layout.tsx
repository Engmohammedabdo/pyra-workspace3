'use client';

import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wifi, Inbox, User, MessageCircle, Clock, CheckCircle2, AlarmClock, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { motion } from 'framer-motion';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { isSuperAdmin } from '@/lib/auth/rbac';
import { useConversations, usePollWhatsApp, useCheckSla, useUpdateConversation, useSyncGroups, type Conversation } from '@/hooks/useWhatsApp';
import { toast } from 'sonner';
import { needsReply, waitingMinutes, LATE_THRESHOLD_MINUTES } from '@/lib/whatsapp/inbox';
import { CrmThemeScope } from '@/components/crm/crm-theme-scope';
import { ConversationList } from './conversation-list';
import { ChatPanel } from './chat-panel';
import { BulkActionsBar } from './bulk-actions-bar';
import { FilterBar } from './filters/filter-bar';
import { SortSelector } from './filters/sort-selector';
import { AssignDialog } from './dialogs/assign-dialog';
import { TopBar } from './top-bar';
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
    quickFilter,
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
    if (filters.instance) params.instance = filters.instance;
    return params;
  }, [currentTab, sortBy, filters, conversationType]);

  // Fetch conversations via React Query with auto-refresh
  const { data: conversationsResponse, isLoading } = useConversations(queryParams);
  const conversations = conversationsResponse?.data || [];
  const counts = conversationsResponse?.meta?.counts || {};

  // CR-T3 — top-bar counter chip applied client-side to the already-fetched
  // page. The chip COUNTS themselves come from meta.counts (server-computed,
  // scope-wide) — this filter only narrows what the list shows for the
  // current fetch; it never re-derives the counts shown on the chips.
  const filteredConversations = useMemo(() => {
    if (!quickFilter) return conversations;
    const nowMs = Date.now();
    return conversations.filter(c => {
      if (quickFilter === 'needs_reply') {
        return needsReply({
          id: c.id ?? '',
          status: c.status ?? '',
          last_customer_message_at: c.last_customer_message_at ?? null,
          last_agent_message_at: c.last_agent_message_at ?? null,
          last_message_at: c.last_message_at ?? null,
        });
      }
      if (quickFilter === 'unassigned') return !c.assigned_to;
      if (quickFilter === 'late') {
        const mins = waitingMinutes({
          id: c.id ?? '',
          status: c.status ?? '',
          last_customer_message_at: c.last_customer_message_at ?? null,
          last_agent_message_at: c.last_agent_message_at ?? null,
          last_message_at: c.last_message_at ?? null,
        }, nowMs);
        return mins !== null && mins >= LATE_THRESHOLD_MINUTES;
      }
      return true;
    });
  }, [conversations, quickFilter]);

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

  // Resolve mutation for keyboard shortcut (E) and row-level quick actions
  const updateConversation = useUpdateConversation();
  const [shortcutAssignOpen, setShortcutAssignOpen] = useState(false);
  // CR-T4 — row-level "إسناد": a conversation override so the ONE AssignDialog
  // instance below can open prefilled for whichever row was hovered, without
  // requiring that row to be selected first.
  const [quickAssignConv, setQuickAssignConv] = useState<Conversation | null>(null);

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

  const handleQuickAssign = useCallback((conv: Conversation) => {
    setQuickAssignConv(conv);
  }, []);

  const handleQuickResolve = useCallback((conv: Conversation) => {
    if (!conv.id) return;
    updateConversation.mutate(
      { conversationId: conv.id, data: { status: 'resolved' } },
      {
        onSuccess: () => {
          toast.success('تم حل المحادثة');
          // Mirror handleShortcutResolve — if the row just resolved from the
          // list is also the open thread, clear it too, otherwise the panel
          // keeps showing a conversation that no longer belongs on this tab.
          if (selectedConversation?.id === conv.id) {
            setSelectedConversation(null);
          }
        },
        onError: () => toast.error('فشل في حل المحادثة'),
      }
    );
  }, [updateConversation, selectedConversation, setSelectedConversation]);

  // Keyboard shortcuts — navigate over what's actually visible (quickFilter-narrowed)
  useChatShortcuts({
    conversations: filteredConversations,
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
        <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] border border-[#e9edef] dark:border-[#313d45] rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
          <div className="border-e border-[#e9edef] dark:border-[#313d45] p-3 space-y-2 hidden md:block">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
          <Skeleton className="h-full" />
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="crm-theme space-y-3">
      <CrmThemeScope />

      {/* Top bar (CR-T3): title + counter-chip quick filters + line switcher + Ctrl+K */}
      <TopBar counts={counts} />

      {/* Tabs -- WhatsApp-style underline tabs */}
      <div role="tablist" aria-label="تصفية المحادثات" className="flex bg-[#f0f2f5] dark:bg-[#202c33] rounded-lg overflow-x-auto">
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
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all whitespace-nowrap border-b-2',
                activeTab === tab.key
                  ? 'border-[#00a884] text-[#00a884]'
                  : 'border-transparent text-[#54656f] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-[#e9edef]'
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

      {/* Conversation Type Filter + Toolbar -- compact bar */}
      <div className="flex items-center gap-2 bg-[#f0f2f5] dark:bg-[#202c33] rounded-lg px-3 py-1.5">
        <div className="flex items-center gap-1">
          {(['all', 'individual', 'group'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setConversationType(t)}
              className={cn(
                'px-3 py-1 text-xs rounded-full transition-colors',
                conversationType === t
                  ? 'bg-[#00a884] text-white'
                  : 'bg-white/60 dark:bg-[#313d45] text-[#54656f] dark:text-[#8696a0] hover:bg-white dark:hover:bg-[#3b4a54]'
              )}
            >
              {t === 'all' ? 'الكل' : t === 'individual' ? 'فردي' : 'مجموعات'}
              {t === 'group' && (counts as Record<string, number>).groups ? ` (${(counts as Record<string, number>).groups})` : ''}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {isAdmin && (
          <>
            <FilterBar />
            <SortSelector value={sortBy} onChange={setSortBy} />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-[#54656f] dark:text-[#8696a0] hover:bg-white/60 dark:hover:bg-[#313d45]"
              onClick={() => syncGroupsMutation.mutate()}
              disabled={syncGroupsMutation.isPending}
            >
              <RefreshCw className={cn('h-3 w-3', syncGroupsMutation.isPending && 'animate-spin')} />
              مزامنة
            </Button>
            <Button
              variant={bulkMode ? 'outline' : 'ghost'}
              size="sm"
              className={cn(
                'h-7 text-xs',
                bulkMode
                  ? 'border-[#00a884] text-[#00a884]'
                  : 'text-[#54656f] dark:text-[#8696a0] hover:bg-white/60 dark:hover:bg-[#313d45]'
              )}
              onClick={() => setBulkMode(!bulkMode)}
            >
              {bulkMode ? 'إلغاء التحديد' : 'تحديد متعدد'}
            </Button>
          </>
        )}
      </div>

      {/* Main Chat Container */}
      <div
        className="border border-[#e9edef] dark:border-[#313d45] overflow-hidden bg-white dark:bg-[#111b21] rounded-lg"
        style={{ height: isAdmin ? 'calc(100vh - 250px)' : 'calc(100vh - 210px)' }}
      >
        <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] h-full">
          {/* Conversation List */}
          <div className={cn('h-full min-h-0 overflow-hidden border-e border-[#e9edef] dark:border-[#313d45] md:block', mobileView === 'chat' ? 'hidden' : 'block')}>
            <ConversationList
              conversations={filteredConversations}
              selectedJid={selectedConversation?.remote_jid || null}
              onSelect={selectConversation}
              bulkMode={bulkMode}
              selectedIds={selectedIds}
              onToggleCheck={toggleSelectedId}
              onSelectAll={() => selectAllIds(filteredConversations.map(c => c.id).filter(Boolean) as string[])}
              sectioned={activeTab !== 'resolved' && activeTab !== 'snoozed'}
              isAdmin={isAdmin}
              onQuickAssign={handleQuickAssign}
              onQuickResolve={handleQuickResolve}
            />
          </div>

          {/* Chat Window */}
          <div className={cn('h-full min-h-0 overflow-hidden flex flex-col bg-[#efeae2] dark:bg-[#0b141a] md:block', mobileView === 'list' ? 'hidden' : 'block')}>
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
              <div className="flex-1 h-full flex items-center justify-center bg-[#f0f2f5] dark:bg-[#222e35]">
                <div className="text-center px-6">
                  <div className="w-20 h-20 rounded-full bg-[#e9edef] dark:bg-[#313d45] flex items-center justify-center mx-auto mb-5">
                    <Wifi className="h-9 w-9 text-[#667781] dark:text-[#8696a0]" />
                  </div>
                  <p className="font-normal text-[#41525d] dark:text-[#e9edef] text-base">اختر محادثة</p>
                  <p className="text-sm text-[#667781] dark:text-[#8696a0] mt-1.5 max-w-[240px] mx-auto leading-relaxed">
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

      {/* Assign Dialog triggered by a row's hover-revealed «إسناد» quick action (CR-T4) */}
      {quickAssignConv && (
        <AssignDialog
          open
          conversationId={quickAssignConv.id}
          remoteJid={quickAssignConv.remote_jid}
          instanceName={quickAssignConv.instance_name || 'pyraai'}
          currentAgent={quickAssignConv.assigned_to || null}
          onAssigned={() => setQuickAssignConv(null)}
          onClose={() => setQuickAssignConv(null)}
        />
      )}
    </motion.div>
  );
}
