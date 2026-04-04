'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import React from 'react';
import type { Conversation } from '@/hooks/useWhatsApp';

// ============================================================
// Types
// ============================================================

type TabKey = 'all' | 'mine' | 'unassigned' | 'pending' | 'resolved';
type SortBy = 'newest' | 'oldest' | 'priority' | 'waiting_longest';
type MobileView = 'list' | 'chat';

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

  // Panels
  showContactPanel: boolean;
  toggleContactPanel: () => void;
  setShowContactPanel: (show: boolean) => void;

  // Mobile responsiveness
  mobileView: MobileView;
  setMobileView: (view: MobileView) => void;

  // Select conversation + switch to chat on mobile
  selectConversation: (conv: Conversation) => void;

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
  iconName: 'Inbox' | 'User' | 'MessageCircle' | 'Clock' | 'CheckCircle2';
  status?: string;
  assigned?: string;
}

export const TABS: TabDef[] = [
  { key: 'all', label: 'الكل', iconName: 'Inbox', status: 'all', assigned: 'all' },
  { key: 'mine', label: 'لي', iconName: 'User', status: 'open', assigned: 'me' },
  { key: 'unassigned', label: 'غير مسند', iconName: 'MessageCircle', status: 'open', assigned: 'unassigned' },
  { key: 'pending', label: 'معلّق', iconName: 'Clock', status: 'pending', assigned: 'all' },
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
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>('list');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputMode, setInputMode] = useState<'message' | 'note'>('message');
  const [activeDialog, setActiveDialog] = useState<'quote' | 'invoice' | 'lead' | 'note' | 'followup' | null>(null);

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

  const value: ChatState = {
    selectedConversation,
    setSelectedConversation,
    activeTab,
    setActiveTab,
    sortBy,
    setSortBy,
    showContactPanel,
    toggleContactPanel,
    setShowContactPanel,
    mobileView,
    setMobileView,
    selectConversation,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    inputMode,
    setInputMode,
    activeDialog,
    setActiveDialog,
  };

  return React.createElement(ChatStoreContext.Provider, { value }, children);
}

export function useChatStore(): ChatState {
  const ctx = useContext(ChatStoreContext);
  if (!ctx) throw new Error('useChatStore must be used within ChatStoreProvider');
  return ctx;
}

export type { TabKey, MobileView, SortBy };
