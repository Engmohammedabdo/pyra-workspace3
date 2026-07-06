'use client';

/**
 * Reassign Lead modal (Commit 1 / Option A — per-lead owner change).
 *
 * Restores the single-lead reassignment capability removed in the Phase 12
 * sunset. The CRM had no in-UI way to change a lead's owner; this fills that
 * gap with the minimal, auditable path:
 *
 *   picker (active users only) → parent's useUpdateLead({ assigned_to })
 *     → PATCH /api/crm/leads/[id]
 *       → logs `assignment_changed` activity + notifies the new owner
 *         (backend already wired — zero backend change for this control).
 *
 * Parent owns the mutation (mirrors LinkClientModal); this component is the
 * presentational picker. It self-resolves the user list from the shared
 * ['users','lite'] query so the sidebar + this modal share one fetch.
 *
 * INVARIANT (locked): only `status === 'active'` users are selectable. An
 * inactive / banned user (e.g. a departed agent like Sayed) can NEVER be a
 * reassignment target — that would re-orphan the lead under a locked-out
 * account. The current owner is also excluded (reassigning to self is a
 * no-op).
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, UserCog } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useLeadCapableUsers } from '@/hooks/useLeadCapableUsers';
import { cn } from '@/lib/utils/cn';

export interface ReassignLeadModalProps {
  /** Current owner username — shown as "current" + excluded from the picker. */
  currentAssignee: string | null;
  /** Dialog visibility — controlled by the parent. */
  open: boolean;
  /** Called when the dialog should close (cancel / backdrop / ESC / success). */
  onClose: () => void;
  /** Called with the chosen username. Parent owns the useUpdateLead mutation. */
  onConfirm: (username: string) => Promise<void> | void;
  /** Whether the parent's mutation is pending — disables the confirm button. */
  confirming: boolean;
}

export default function ReassignLeadModal({
  currentAssignee,
  open,
  onClose,
  onConfirm,
  confirming,
}: ReassignLeadModalProps) {
  const t = useTranslations('crm.modals.reassignLead');
  const tCommon = useTranslations('common.actions');
  const [selected, setSelected] = useState<string | null>(null);

  // Reset selection whenever the modal re-opens so a stale pick doesn't linger.
  useEffect(() => {
    if (open) setSelected(null);
  }, [open]);

  // Shared security filter (active + lead-capable) — the SAME source the
  // pipeline bulk-assign bar uses, so the "who can own a lead" rule never
  // drifts. `all` resolves the current owner's name even when inactive (e.g. a
  // departed agent whose leads haven't been reassigned yet). The modal is
  // conditionally mounted (only when open), so the query fires on open.
  const { all, leadCapable, isLoading } = useLeadCapableUsers();

  const options = leadCapable.filter((u) => u.username !== currentAssignee);

  const currentName =
    all.find((u) => u.username === currentAssignee)?.display_name ??
    currentAssignee ??
    t('currentFallback');

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelected(null);
      onClose();
    }
  };

  const handleConfirm = async () => {
    if (!selected || confirming) return;
    await onConfirm(selected);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t.rich('description', {
              currentName,
              name: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto -mx-1 px-1">
          {isLoading ? (
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              <Skeleton className="h-11 rounded-md" />
              <Skeleton className="h-11 rounded-md" />
              <Skeleton className="h-11 rounded-md" />
            </div>
          ) : options.length === 0 ? (
            <EmptyState
              icon={UserCog}
              title={t('emptyTitle')}
              description={t('emptyDescription')}
              className="py-8"
            />
          ) : (
            <ul className="space-y-1" role="listbox" aria-label={t('listAria')}>
              {options.map((u) => {
                const isSel = selected === u.username;
                return (
                  <li key={u.username}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSel}
                      onClick={() => setSelected(u.username)}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 rounded-lg border px-3 h-11 text-start transition-colors',
                        isSel
                          ? 'border-orange-300 dark:border-orange-700/60 bg-orange-500/10'
                          : 'border-border hover:bg-muted/50',
                      )}
                    >
                      <span className="text-sm font-medium truncate">{u.display_name}</span>
                      {isSel && (
                        <Check
                          className="size-4 text-orange-600 dark:text-orange-400 shrink-0"
                          aria-hidden
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={onClose} disabled={confirming}>
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || confirming}
            aria-label={t('confirmAria')}
          >
            {confirming ? t('confirming') : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
