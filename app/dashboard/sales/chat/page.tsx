'use client';

import { ChatStoreProvider } from '@/components/sales/chat/use-chat-store';
import { ChatLayout } from '@/components/sales/chat/chat-layout';

export default function ChatInboxPage() {
  return (
    <ChatStoreProvider>
      <ChatLayout />
    </ChatStoreProvider>
  );
}
