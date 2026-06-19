'use client';

/**
 * Bulk-assign action bar for the pipeline (Option B / Commit 2).
 *
 * Renders while the board is in selection mode AND ≥1 card is selected. Lets an
 * admin pick a target owner from ACTIVE + lead-capable users and bulk-reassign
 * the selected leads via /api/dashboard/sales/leads/bulk (≤50/request).
 *
 * The picker source is `useLeadCapableUsers` — the SAME shared security filter
 * the per-lead reassign modal uses (no inactive/banned, no non-lead-capable
 * targets). Parent owns the mutation + selection state.
 */

import { useState } from 'react';
import { Users, X, Loader2, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLeadCapableUsers } from '@/hooks/useLeadCapableUsers';

/** Matches the /api/dashboard/sales/leads/bulk server cap. */
const MAX_BULK = 50;

export interface BulkActionBarProps {
  /** Number of currently-selected leads. */
  count: number;
  /** Whether the bulk mutation is in flight. */
  busy: boolean;
  /** Assign the current selection to this username. */
  onAssign: (username: string) => void;
  /** Cancel: clear the selection AND exit selection mode (no stranded state). */
  onCancel: () => void;
}

export function BulkActionBar({ count, busy, onAssign, onCancel }: BulkActionBarProps) {
  const { leadCapable, isLoading } = useLeadCapableUsers();
  const [target, setTarget] = useState<string>('');

  const overCap = count > MAX_BULK;
  const canAssign = count > 0 && !overCap && !!target && !busy;

  return (
    <div className="sticky bottom-3 z-20 mx-auto w-full max-w-2xl px-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-lg">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Users className="size-4 text-orange-500" aria-hidden />
          محدد: <span className="tabular-nums">{count}</span>
        </span>

        {overCap ? (
          <span className="text-xs text-destructive ms-auto">
            الحد الأقصى {MAX_BULK} صفقة في المرة — قلّل التحديد
          </span>
        ) : (
          <div className="flex items-center gap-2 ms-auto">
            <Select value={target} onValueChange={setTarget} disabled={busy || isLoading}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="تعيين لـ..." />
              </SelectTrigger>
              <SelectContent>
                {leadCapable.map((u) => (
                  <SelectItem key={u.username} value={u.username}>
                    {u.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              onClick={() => target && onAssign(target)}
              disabled={!canAssign}
              className="h-9"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin me-1.5" />
              ) : (
                <UserCog className="size-4 me-1.5" />
              )}
              تعيين
            </Button>
          </div>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={busy}
          className="h-9"
        >
          <X className="size-4 me-1" /> إلغاء التحديد
        </Button>
      </div>
    </div>
  );
}
