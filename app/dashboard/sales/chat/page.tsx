'use client';

import { useState, useEffect, useCallback } from 'react';
import { ConversationList, type Conversation } from '@/components/sales/chat/conversation-list';
import { ChatWindow } from '@/components/sales/chat/chat-window';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';

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
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-7 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-border/60 rounded-2xl overflow-hidden shadow-xl shadow-black/5 dark:shadow-black/20" style={{ height: 'calc(100vh - 180px)' }}>
          <div className="border-e border-border/60 p-4 space-y-3 bg-card/50">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
          <div className="col-span-2 p-4">
            <Skeleton className="h-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <MessageCircle className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">محادثات واتساب</h1>
          <p className="text-xs text-muted-foreground/60">{conversations.length} محادثة</p>
        </div>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-3 border border-border/60 rounded-2xl overflow-hidden bg-card/30 backdrop-blur shadow-xl shadow-black/5 dark:shadow-black/20"
        style={{ height: 'calc(100vh - 180px)' }}
      >
        {/* Conversation List */}
        <ConversationList
          conversations={conversations}
          selectedJid={selectedConv?.remote_jid || null}
          onSelect={setSelectedConv}
        />

        {/* Chat Window */}
        <div className="col-span-2 flex flex-col bg-background/50">
          {selectedConv ? (
            <ChatWindow
              remoteJid={selectedConv.remote_jid}
              instanceName={selectedConv.instance_name}
              contactName={selectedConv.contact_name}
              leadId={selectedConv.lead_id}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-muted/60 to-muted/30 flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="h-10 w-10 text-muted-foreground/30" />
                </div>
                <p className="font-medium text-muted-foreground/60">اختر محادثة</p>
                <p className="text-xs text-muted-foreground/40 mt-1">اختر محادثة من القائمة لعرض الرسائل</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
