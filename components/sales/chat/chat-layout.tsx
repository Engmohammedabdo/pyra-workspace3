'use client';

import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Wifi, RefreshCw, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { motion } from 'framer-motion';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { isSuperAdmin } from '@/lib/auth/rbac';
import { useConversations, usePollWhatsApp, useCheckSla, useUpdateConversation, useSyncGroups, type Conversation } from '@/hooks/useWhatsApp';
import { toast } from 'sonner';
import { needsReply, waitingMinutes, splitInbox, LATE_THRESHOLD_MINUTES, type InboxConversationLike } from '@/lib/whatsapp/inbox';
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

  // CR-T4 — needs-reply/rest sectioning is skipped entirely on flat tabs
  // (resolved/snoozed keep the API's own order, no headers).
  const sectioned = activeTab !== 'resolved' && activeTab !== 'snoozed';

  // Conversation-list's own contact search box — lifted up here (rather than
  // kept as local state inside conversation-list.tsx) so the ordering it
  // produces can also feed use-chat-shortcuts below. See displayConversations.
  const [listSearch, setListSearch] = useState('');
  const searchedConversations = useMemo(() => {
    if (!listSearch) return filteredConversations;
    const q = listSearch.toLowerCase();
    return filteredConversations.filter(c => {
      const name = c.contact_name?.toLowerCase() || '';
      const phone = c.contact_phone || c.phone || c.remote_jid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
      return name.includes(q) || phone.includes(q);
    });
  }, [filteredConversations, listSearch]);

  // I3 (whole-wave review) — the ONE display-order computation. Previously
  // conversation-list.tsx recomputed this split internally while
  // use-chat-shortcuts walked the pre-split `filteredConversations`, so
  // ArrowUp/ArrowDown moved through a different order than what was on
  // screen. Computing it once here and handing the EXACT same array to both
  // ConversationList (render) and useChatShortcuts (navigation) makes
  // rendered order === navigation order by construction.
  //
  // Conversation types id/status as optional so callers without a real row
  // can still build one, but every row that actually reaches this list comes
  // from WA_CONVERSATION_FIELDS (lib/supabase/fields.ts) and always carries
  // them — this cast is a type-level widening only, never a runtime default.
  // splitInbox() itself only filters/sorts (new arrays, same row references),
  // so unchanged rows stay referentially equal across polls and
  // ConversationItem's memo keeps bailing out.
  const { displayConversations, needsCount } = useMemo(() => {
    const sectionable = searchedConversations as (Conversation & InboxConversationLike)[];
    if (!sectioned) {
      return { displayConversations: sectionable, needsCount: 0 };
    }
    const { needs, rest } = splitInbox(sectionable, Date.now());
    return { displayConversations: [...needs, ...rest], needsCount: needs.length };
  }, [searchedConversations, sectioned]);

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

  // Keyboard shortcuts — navigate over the EXACT rendered order (I3: same
  // array the list below renders, not the pre-split/pre-search one).
  useChatShortcuts({
    conversations: displayConversations,
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
        <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] border border-border rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 170px)' }}>
          <div className="border-e border-border p-3 space-y-2 hidden md:block">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
          <Skeleton className="h-full" />
        </div>
      </div>
    );
  }

  // CR-T9 — the tabs + type/tools controls now render INSIDE the
  // conversation-list column (under its search box), not as separate
  // full-width rows at the page level. State/handlers all still live here;
  // this node is just handed down as a slot so ConversationList doesn't need
  // its own copy of any of this.
  const toolbarNode = (
    <div className="border-b border-border bg-card">
      {/* Compact status tabs -- small horizontally-scrollable pills */}
      <div role="tablist" aria-label="تصفية المحادثات" className="flex items-center gap-1 overflow-x-auto px-2 pt-2 pb-1 scrollbar-none">
        {visibleTabs.map(tab => {
          const count = tab.key === 'unassigned' ? counts.unassigned
            : tab.key === 'pending' ? counts.pending
            : tab.key === 'resolved' ? counts.resolved
            : tab.key === 'snoozed' ? counts.snoozed
            : tab.key === 'all' ? counts.open
            : undefined;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => { setActiveTab(tab.key); setSelectedConversation(null); }}
              className={cn(
                'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-orange-500/10 text-orange-700 dark:text-orange-300 font-semibold'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {tab.label}
              {count !== undefined && count > 0 && (
                <Badge variant="secondary" className="h-3.5 min-w-[14px] px-1 text-[9px] leading-none">
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Conversation-type filter + tools -- compact second line */}
      <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
        <div className="flex items-center gap-1">
          {(['all', 'individual', 'group'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setConversationType(t)}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] transition-colors',
                conversationType === t
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              )}
            >
              {t === 'all' ? 'الكل' : t === 'individual' ? 'فردي' : 'مجموعات'}
              {t === 'group' && (counts as Record<string, number>).groups ? ` (${(counts as Record<string, number>).groups})` : ''}
            </button>
          ))}
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1 ms-auto">
            <FilterBar />
            <SortSelector value={sortBy} onChange={setSortBy} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
                  aria-label="خيارات إضافية"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={() => syncGroupsMutation.mutate()}
                  disabled={syncGroupsMutation.isPending}
                  className="gap-2 text-xs"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', syncGroupsMutation.isPending && 'animate-spin')} />
                  مزامنة
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setBulkMode(!bulkMode)} className="gap-2 text-xs">
                  {bulkMode ? 'إلغاء التحديد' : 'تحديد متعدد'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="crm-theme space-y-3">
      <CrmThemeScope />

      {/* Top bar (CR-T3): title + counter-chip quick filters + line switcher + Ctrl+K */}
      <TopBar counts={counts} isAdmin={isAdmin} />

      {/* Main Chat Container */}
      <div
        className="border border-border overflow-hidden bg-card rounded-lg"
        style={{ height: 'calc(100vh - 170px)' }}
      >
        <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] h-full">
          {/* Conversation List */}
          <div className={cn('h-full min-h-0 overflow-hidden border-e border-border md:block', mobileView === 'chat' ? 'hidden' : 'block')}>
            <ConversationList
              conversations={displayConversations}
              needsCount={needsCount}
              search={listSearch}
              onSearchChange={setListSearch}
              selectedJid={selectedConversation?.remote_jid || null}
              onSelect={selectConversation}
              bulkMode={bulkMode}
              selectedIds={selectedIds}
              onToggleCheck={toggleSelectedId}
              onSelectAll={() => selectAllIds(displayConversations.map(c => c.id).filter(Boolean) as string[])}
              sectioned={sectioned}
              isAdmin={isAdmin}
              onQuickAssign={handleQuickAssign}
              onQuickResolve={handleQuickResolve}
              toolbar={toolbarNode}
            />
          </div>

          {/* Chat Window */}
          <div className={cn('h-full min-h-0 overflow-hidden flex flex-col bg-background md:block', mobileView === 'list' ? 'hidden' : 'block')}>
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
                isMuted={selectedConversation.is_muted}
                labels={selectedConversation.labels}
                customAttributes={selectedConversation.custom_attributes}
                groupDescription={selectedConversation.group_description}
                csatRating={selectedConversation.csat_rating}
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
              <div className="flex-1 h-full flex items-center justify-center bg-muted">
                <div className="text-center px-6">
                  <div className="w-20 h-20 rounded-full bg-card flex items-center justify-center mx-auto mb-5">
                    <Wifi className="h-9 w-9 text-muted-foreground" />
                  </div>
                  <p className="font-normal text-foreground text-base">اختر محادثة</p>
                  <p className="text-sm text-muted-foreground mt-1.5 max-w-[240px] mx-auto leading-relaxed">
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
          instanceName={quickAssignConv.instance_name}
          currentAgent={quickAssignConv.assigned_to || null}
          onAssigned={() => setQuickAssignConv(null)}
          onClose={() => setQuickAssignConv(null)}
        />
      )}
    </motion.div>
  );
}
