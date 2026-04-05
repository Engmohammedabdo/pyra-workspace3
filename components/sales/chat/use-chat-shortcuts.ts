'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useChatStore } from './use-chat-store';
import type { Conversation } from '@/hooks/useWhatsApp';

/**
 * Keyboard shortcuts for the WhatsApp shared inbox.
 *
 * Shortcuts:
 *   Cmd/Ctrl + K  → Focus search input
 *   E             → Resolve selected conversation
 *   A             → Open assign dialog (triggers callback)
 *   Arrow Up/Down → Navigate conversation list
 *   Enter         → Select conversation
 *   Escape        → Close sidebar / deselect
 *   N             → Focus message input
 */
export function useChatShortcuts({
  conversations,
  onResolve,
  onOpenAssign,
}: {
  conversations: Conversation[];
  onResolve?: () => void;
  onOpenAssign?: () => void;
}) {
  const {
    selectedConversation,
    selectConversation,
    setSelectedConversation,
    showContactPanel,
    setShowContactPanel,
    setSearchOpen,
  } = useChatStore();

  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isInput = tagName === 'input' || tagName === 'textarea' || target.isContentEditable;

      // Cmd/Ctrl + K — always works, even in inputs
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        // Focus the search input in the conversation list
        setTimeout(() => {
          const searchInput = document.querySelector<HTMLInputElement>(
            '[data-chat-search]'
          );
          searchInput?.focus();
        }, 50);
        return;
      }

      // Escape — works in inputs too
      if (e.key === 'Escape') {
        if (isInput) {
          (target as HTMLInputElement).blur();
          return;
        }
        if (showContactPanel) {
          setShowContactPanel(false);
          return;
        }
        if (selectedConversation) {
          setSelectedConversation(null);
          return;
        }
        return;
      }

      // All other shortcuts should NOT fire when inside an input
      if (isInput) return;

      const convs = conversationsRef.current;
      const currentIndex = selectedConversation
        ? convs.findIndex(c => c.remote_jid === selectedConversation.remote_jid)
        : -1;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = Math.min(currentIndex + 1, convs.length - 1);
          if (convs[nextIndex]) selectConversation(convs[nextIndex]);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = Math.max(currentIndex - 1, 0);
          if (prevIndex !== currentIndex && convs[prevIndex]) selectConversation(convs[prevIndex]);
          break;
        }
        case 'Enter': {
          if (currentIndex >= 0 && convs[currentIndex]) {
            selectConversation(convs[currentIndex]);
          }
          break;
        }
        case 'e':
        case 'E': {
          if (selectedConversation && onResolve) {
            onResolve();
          }
          break;
        }
        case 'a':
        case 'A': {
          if (selectedConversation && onOpenAssign) {
            onOpenAssign();
          }
          break;
        }
        case 'n':
        case 'N': {
          e.preventDefault();
          // Focus the message textarea
          const textarea = document.querySelector<HTMLTextAreaElement>(
            '[data-chat-input]'
          );
          textarea?.focus();
          break;
        }
      }
    },
    [
      selectedConversation,
      selectConversation,
      setSelectedConversation,
      showContactPanel,
      setShowContactPanel,
      setSearchOpen,
      onResolve,
      onOpenAssign,
    ]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
