'use client';

// Context drawer (CR-T5) — replaces the old always-visible contact-panel
// column. Hosts the EXISTING ContactPanel content inside a shadcn Sheet,
// sliding from the logical end side (full-width on mobile). Open state is
// the chat store's `showContactPanel` — already wired to the Escape
// shortcut (use-chat-shortcuts.ts) and left untouched here so existing
// toggles keep working.

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ContactPanel } from './contact-panel';
import type { Conversation } from '@/hooks/useWhatsApp';

interface ContextDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName: string | null;
  phone: string | null;
  leadId?: string | null;
  conversationId?: string | null;
  conversation?: Conversation | null;
  isAdmin?: boolean;
  onConversationUpdated?: () => void;
}

export function ContextDrawer({
  open,
  onOpenChange,
  contactName,
  phone,
  leadId,
  conversationId,
  conversation,
  isAdmin,
  onConversationUpdated,
}: ContextDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-sm" aria-describedby={undefined}>
        {/* Visually hidden — ContactPanel renders its own title bar; this
            satisfies Radix's required accessible name for the dialog. */}
        <SheetHeader className="sr-only">
          <SheetTitle>معلومات جهة الاتصال</SheetTitle>
        </SheetHeader>
        <ContactPanel
          contactName={contactName}
          phone={phone}
          leadId={leadId}
          conversationId={conversationId}
          conversation={conversation}
          isAdmin={isAdmin}
          onConversationUpdated={onConversationUpdated}
        />
      </SheetContent>
    </Sheet>
  );
}
