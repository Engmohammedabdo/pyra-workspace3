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
import { useQuery } from '@tanstack/react-query';
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
import { fetchAPI } from '@/hooks/api-helpers';
import { cn } from '@/lib/utils/cn';

interface UserLiteRow {
  username: string;
  display_name: string;
  status?: string;
  role?: string;
}

// Roles that can OWN a lead (have leads.view → can actually see/work it once
// assigned). Assigning to anyone else (e.g. a plain `employee`) would re-orphan
// the lead under someone who can't open it. v1 uses a role proxy; v1.1 could
// filter by computed leads.view capability for custom roles.
const LEAD_CAPABLE_ROLES = new Set(['sales_agent', 'admin']);

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
  const [selected, setSelected] = useState<string | null>(null);

  // Reset selection whenever the modal re-opens so a stale pick doesn't linger.
  useEffect(() => {
    if (open) setSelected(null);
  }, [open]);

  // Shared cache key with useUsersLite — React Query dedupes, so the sidebar's
  // owner-name lookup and this picker hit the network once. enabled:open keeps
  // it from firing on every lead-detail render.
  const { data: users = [], isLoading } = useQuery<UserLiteRow[]>({
    queryKey: ['users', 'lite'],
    queryFn: () => fetchAPI('/api/users/lite'),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  // Active + lead-capable, current-owner excluded. The active filter is the
  // security-relevant invariant (no inactive/banned target); the role filter
  // prevents re-orphaning the lead under a user who can't open it.
  const options = users
    .filter(
      (u) =>
        u.status === 'active' &&
        LEAD_CAPABLE_ROLES.has(u.role ?? '') &&
        u.username !== currentAssignee,
    )
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'ar'));

  const currentName =
    users.find((u) => u.username === currentAssignee)?.display_name ??
    currentAssignee ??
    '—';

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
          <DialogTitle>تغيير المسؤول عن الـ Lead</DialogTitle>
          <DialogDescription>
            المسؤول الحالي:{' '}
            <span className="font-medium text-foreground">{currentName}</span>.
            اختر الموظف الجديد — سيُسجَّل التغيير في سجل النشاط ويصل إشعار للموظف الجديد.
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
              title="لا يوجد موظفون متاحون"
              description="لا يوجد مستخدمون نشطون يمكن إسناد الـ Lead إليهم."
              className="py-8"
            />
          ) : (
            <ul className="space-y-1" role="listbox" aria-label="اختر المسؤول الجديد">
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
            إلغاء
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || confirming}
            aria-label="تأكيد تغيير المسؤول"
          >
            {confirming ? 'جارٍ التغيير...' : 'تأكيد التغيير'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
