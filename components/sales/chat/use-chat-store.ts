'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import type { Conversation } from '@/hooks/useWhatsApp';

// ============================================================
// Types
// ============================================================

type TabKey = 'all' | 'mine' | 'unassigned' | 'pending' | 'resolved' | 'snoozed';
type SortBy = 'newest' | 'oldest' | 'priority' | 'waiting_longest';
type MobileView = 'list' | 'chat';

export interface FilterState {
  priority: string[];     // multi-select: low, normal, high, urgent
  assignedTo: string[];   // multi-select: agent usernames
  team: string;           // single select team ID
  label: string;          // single select label ID
}

const EMPTY_FILTERS: FilterState = {
  priority: [],
  assignedTo: [],
  team: '',
  label: '',
};

interface ChatState {
  // Selected conversation
  selectedConversation: Conversation | null;
  setSelectedConversation: (conv: Conversation | null) => void;

  // Tab & filtering
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;

  // Sort
  sortBy: SortBy;
  setSortBy: (sort: SortBy) => void;

  // Advanced filters
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  resetFilters: () => void;
  activeFilterCount: number;

  // Panels
  showContactPanel: boolean;
  toggleContactPanel: () => void;
  setShowContactPanel: (show: boolean) => void;

  // Mobile responsiveness
  mobileView: MobileView;
  setMobileView: (view: MobileView) => void;

  // Select conversation + switch to chat on mobile
  selectConversation: (conv: Conversation) => void;

  // Bulk mode
  bulkMode: boolean;
  setBulkMode: (mode: boolean) => void;
  selectedIds: Set<string>;
  toggleSelectedId: (id: string) => void;
  selectAllIds: (ids: string[]) => void;
  clearSelectedIds: () => void;

  // Chat-window internal state
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  inputMode: 'message' | 'note';
  setInputMode: (mode: 'message' | 'note') => void;
  activeDialog: 'quote' | 'invoice' | 'lead' | 'note' | 'followup' | null;
  setActiveDialog: (dialog: 'quote' | 'invoice' | 'lead' | 'note' | 'followup' | null) => void;
}

// ============================================================
// Tab definitions (exported for use in chat-layout)
// ============================================================

export interface TabDef {
  key: TabKey;
  label: string;
  iconName: 'Inbox' | 'User' | 'MessageCircle' | 'Clock' | 'CheckCircle2' | 'AlarmClock';
  status?: string;
  assigned?: string;
}

export const TABS: TabDef[] = [
  { key: 'all', label: 'الكل', iconName: 'Inbox', status: 'all', assigned: 'all' },
  { key: 'mine', label: 'لي', iconName: 'User', status: 'open', assigned: 'me' },
  { key: 'unassigned', label: 'غير مسند', iconName: 'MessageCircle', status: 'open', assigned: 'unassigned' },
  { key: 'pending', label: 'معلّق', iconName: 'Clock', status: 'pending', assigned: 'all' },
  { key: 'snoozed', label: 'مؤجل', iconName: 'AlarmClock', status: 'snoozed', assigned: 'all' },
  { key: 'resolved', label: 'محلول', iconName: 'CheckCircle2', status: 'resolved', assigned: 'all' },
];

// ============================================================
// Context
// ============================================================

const ChatStoreContext = createContext<ChatState | null>(null);

export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [activeTab, setActiveTabState] = useState<TabKey>('all');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>('list');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputMode, setInputMode] = useState<'message' | 'note'>('message');
  const [activeDialog, setActiveDialog] = useState<'quote' | 'invoice' | 'lead' | 'note' | 'followup' | null>(null);

  // Bulk selection
  const [bulkMode, setBulkModeState] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleContactPanel = useCallback(() => {
    setShowContactPanel(prev => !prev);
  }, []);

  const selectConversation = useCallback((conv: Conversation) => {
    setSelectedConversation(conv);
    setMobileView('chat');
    // Reset chat-window state on conversation switch
    setSearchOpen(false);
    setSearchQuery('');
    setInputMode('message');
  }, []);

  const setActiveTab = useCallback((tab: TabKey) => {
    setActiveTabState(tab);
    setSelectedConversation(null);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
  }, []);

  const activeFilterCount =
    filters.priority.length +
    filters.assignedTo.length +
    (filters.team ? 1 : 0) +
    (filters.label ? 1 : 0);

  const setBulkMode = useCallback((mode: boolean) => {
    setBulkModeState(mode);
    if (!mode) setSelectedIds(new Set());
  }, []);

  const toggleSelectedId = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllIds = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelectedIds = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const value: ChatState = useMemo(() => ({
    selectedConversation,
    setSelectedConversation,
    activeTab,
    setActiveTab,
    sortBy,
    setSortBy,
    filters,
    setFilters,
    resetFilters,
    activeFilterCount,
    showContactPanel,
    toggleContactPanel,
    setShowContactPanel,
    mobileView,
    setMobileView,
    selectConversation,
    bulkMode,
    setBulkMode,
    selectedIds,
    toggleSelectedId,
    selectAllIds,
    clearSelectedIds,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    inputMode,
    setInputMode,
    activeDialog,
    setActiveDialog,
  }), [
    selectedConversation,
    activeTab,
    sortBy,
    filters,
    activeFilterCount,
    showContactPanel,
    mobileView,
    bulkMode,
    selectedIds,
    searchOpen,
    searchQuery,
    inputMode,
    activeDialog,
    setSelectedConversation,
    setActiveTab,
    setSortBy,
    setFilters,
    resetFilters,
    toggleContactPanel,
    setShowContactPanel,
    setMobileView,
    selectConversation,
    setBulkMode,
    toggleSelectedId,
    selectAllIds,
    clearSelectedIds,
    setSearchOpen,
    setSearchQuery,
    setInputMode,
    setActiveDialog,
  ]);

  // This file uses .ts (not .tsx), so we use createElement instead of JSX
  return React.createElement(ChatStoreContext.Provider, { value }, children);
}

export function useChatStore(): ChatState {
  const ctx = useContext(ChatStoreContext);
  if (!ctx) throw new Error('useChatStore must be used within ChatStoreProvider');
  return ctx;
}

export type { TabKey, MobileView, SortBy };
