'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useClients, type Client } from '@/hooks/useClients';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils/cn';

export interface LinkClientModalProps {
  /** The lead being linked — used for context display only; the parent owns the mutation. */
  leadId: string;
  /** Dialog visibility — controlled by parent. */
  open: boolean;
  /** Called when dialog should close (cancel button, backdrop click, ESC, after successful submit). */
  onClose: () => void;
  /** Called when user clicks "تأكيد الربط" with a selected client. Parent handles the mutation. */
  onConfirm: (clientId: string) => Promise<void> | void;
  /** Whether the parent's mutation is currently pending. Disables the confirm button. */
  confirming: boolean;
}

export default function LinkClientModal({
  leadId: _leadId,
  open,
  onClose,
  onConfirm,
  confirming,
}: LinkClientModalProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Client | null>(null);
  // Debounce 350ms — matches the pattern from app/dashboard/clients/clients-client.tsx:121
  const debouncedQuery = useDebounce(query, 350);

  // Reset state whenever the modal re-opens so stale results don't linger.
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(null);
    }
  }, [open]);

  // useClients accepts Record<string, string | undefined>; pass `search` only when non-empty.
  const { data: clients = [], isLoading } = useClients({
    search: debouncedQuery.trim() || undefined,
    pageSize: '20',
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery('');
      setSelected(null);
      onClose();
    }
  };

  const handleConfirm = async () => {
    if (!selected || confirming) return;
    await onConfirm(selected.id);
  };

  const canConfirm = !!selected && !confirming;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        <DialogHeader className="p-4 sm:p-6 pb-2">
          <DialogTitle>ربط بعميل موجود</DialogTitle>
          <DialogDescription>
            اختر العميل الموجود لربط هذا الـ Lead به. سيظل الـ Lead في مرحلته الحالية — هذا ليس تحويل.
          </DialogDescription>
        </DialogHeader>

        <Command
          // shouldFilter=false: filtering happens server-side via the debounced query param.
          shouldFilter={false}
          className="border-t border-b rounded-none"
        >
          <CommandInput
            placeholder="ابحث بالاسم أو الهاتف..."
            value={query}
            onValueChange={setQuery}
            aria-label="بحث عن عميل"
          />
          <CommandList className="max-h-72 overflow-y-auto">
            {isLoading ? (
              <div className="p-2 space-y-2" aria-busy="true" aria-live="polite">
                <Skeleton className="h-14 rounded-md" />
                <Skeleton className="h-14 rounded-md" />
                <Skeleton className="h-14 rounded-md" />
              </div>
            ) : clients.length === 0 ? (
              <CommandEmpty>لا توجد نتائج — جرب البحث باسم أو رقم آخر</CommandEmpty>
            ) : (
              <div className="p-1">
                {clients.map((client) => {
                  const isSelected = selected?.id === client.id;
                  return (
                    <CommandItem
                      key={client.id}
                      value={client.id}
                      onSelect={() => setSelected(client)}
                      // No aria-selected here: cmdk uses data-[selected] for its
                      // keyboard-cursor semantic; conflating it with our chosen-row
                      // semantic confuses screen readers. Visual cue is the
                      // border + Check icon below (Reviewer finding 3).
                      className={cn(
                        'flex flex-col items-start gap-0.5 py-2.5 cursor-pointer',
                        isSelected &&
                          'border border-primary bg-primary/5 dark:bg-primary/10',
                      )}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{client.name}</span>
                        {isSelected && (
                          <Check
                            className="h-4 w-4 text-primary shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      {client.company && (
                        <span className="text-xs text-muted-foreground truncate w-full">
                          {client.company}
                        </span>
                      )}
                      {client.phone && (
                        <span
                          className="text-xs text-muted-foreground font-mono truncate w-full"
                          dir="ltr"
                        >
                          {client.phone}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </div>
            )}
          </CommandList>
        </Command>

        <DialogFooter className="p-4 sm:p-6 pt-3 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={confirming}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            aria-label="تأكيد الربط بالعميل المختار"
          >
            {confirming ? 'جارٍ الربط...' : 'تأكيد الربط'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
