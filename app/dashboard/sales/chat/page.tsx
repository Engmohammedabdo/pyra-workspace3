'use client';

import { useState, useEffect, useCallback } from 'react';
import { ConversationList, type Conversation } from '@/components/sales/chat/conversation-list';
import { ChatWindow } from '@/components/sales/chat/chat-window';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { MessageCircle } from 'lucide-react';

export default function ChatInboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    fetchConversations();
    // Poll for new conversations every 10 seconds
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">محادثات واتساب</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
          <div className="border-e p-4 space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
          <div className="col-span-2 p-4">
            <Skeleton className="h-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">محادثات واتساب</h1>

      <div
        className="grid grid-cols-1 md:grid-cols-3 border rounded-xl overflow-hidden bg-background"
        style={{ height: 'calc(100vh - 180px)' }}
      >
        {/* Conversation List */}
        <ConversationList
          conversations={conversations}
          selectedJid={selectedConv?.remote_jid || null}
          onSelect={setSelectedConv}
        />

        {/* Chat Window */}
        <div className="col-span-2 flex flex-col">
          {selectedConv ? (
            <ChatWindow
              remoteJid={selectedConv.remote_jid}
              instanceName={selectedConv.instance_name}
              contactName={selectedConv.contact_name}
              leadId={selectedConv.lead_id}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={MessageCircle}
                title="اختر محادثة"
                description="اختر محادثة من القائمة لعرض الرسائل"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
