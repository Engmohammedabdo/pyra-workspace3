'use client';

/**
 * Sticky bulk-action bar for the clients table.
 *
 * Appears only while ≥1 client is selected. Mirrors the pipeline's
 * BulkActionBar layout (sticky bottom, count on the start side, actions on the
 * end side) so both multi-select surfaces in the app behave the same way.
 *
 * Deletion itself is confirmed by the parent — this bar only raises the intent.
 */

import { Trash2, X, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Matches MAX_BULK in app/api/clients/bulk-delete/route.ts. */
const MAX_BULK = 50;

export interface ClientsBulkBarProps {
  /** Number of currently-selected clients. */
  count: number;
  /** Whether the bulk mutation is in flight. */
  busy: boolean;
  /** Whether the current user may delete clients. */
  canDelete: boolean;
  /** Ask the parent to open the delete confirmation. */
  onDelete: () => void;
  /** Clear the selection. */
  onClear: () => void;
}

export function ClientsBulkBar({ count, busy, canDelete, onDelete, onClear }: ClientsBulkBarProps) {
  if (count === 0) return null;

  const overCap = count > MAX_BULK;

  return (
    <div className="sticky bottom-3 z-20 mx-auto w-full max-w-2xl px-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Users className="size-4 text-orange-500" aria-hidden />
          تم تحديد <span className="tabular-nums">{count}</span> عميل
        </span>

        <div className="flex items-center gap-2 ms-auto">
          {overCap && (
            <span className="whitespace-nowrap text-[11px] text-muted-foreground">
              سيتم الحذف على دفعات من {MAX_BULK}
            </span>
          )}
          {canDelete && (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={onDelete}
              disabled={busy}
              className="h-9"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin me-1.5" />
              ) : (
                <Trash2 className="size-4 me-1.5" />
              )}
              حذف المحدد
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={busy}
            className="h-9"
          >
            <X className="size-4 me-1" /> إلغاء التحديد
          </Button>
        </div>
      </div>
    </div>
  );
}
