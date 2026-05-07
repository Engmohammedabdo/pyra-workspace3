'use client';

/**
 * Single pending-approval card for the Closed-Won queue.
 *
 * Surfaces:
 *   - Lead name + company
 *   - Expected value (currency-formatted)
 *   - Assigned agent (initials avatar + display name)
 *   - Requested by + relative timestamp (from the closed_won_pending
 *     activity row's metadata, surfaced by /api/crm/approvals/pending)
 *   - Attachment label — clickable link if the caller has the perm to
 *     view the destination, plain text otherwise (per scope spec)
 *   - Approve button (one click → optimistic remove → toast)
 *   - Reject button (opens <ApprovalRejectModal>)
 *
 * Optimistic update pattern matches the Phase-6 mark-complete sidebar
 * button:
 *   1. cancelQueries on ['crm','approvals']
 *   2. snapshot every cached approvals entry
 *   3. setQueriesData mutator removes this lead from each cached list
 *   4. on error, walk snapshots and restore each verbatim
 *   5. onSettled in the mutation hook invalidates and reconciles
 *
 * Server may return 422 if the lead has already been decided by another
 * approver (race) — the row's optimistic disappearance is fine, the
 * onError refetch will reconcile.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, FileSignature, Receipt, ExternalLink, Loader2, Wallet, User } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { hasPermission } from '@/lib/auth/rbac';
import { formatCurrency, formatRelativeDate } from '@/lib/utils/format';
import {
  useApproveCloseLeadWin,
  useRejectCloseLeadWin,
  type PendingApproval,
} from '@/hooks/useApprovals';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { ApprovalRejectModal } from './approval-reject-modal';

interface ApprovalsResponse {
  approvals: PendingApproval[];
}

interface ApprovalCardProps {
  approval: PendingApproval;
}

interface PendingMetadata {
  from_stage?: string | null;
  from_stage_label?: string | null;
  to_stage?: string | null;
  to_stage_label?: string | null;
  changed_by?: string | null;
  requested_by?: string | null;
  attachment?: { type?: 'contract' | 'invoice'; id?: string };
  attachment_label?: string | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function ApprovalCard({ approval }: ApprovalCardProps) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const approve = useApproveCloseLeadWin();
  const reject = useRejectCloseLeadWin();

  const [rejectOpen, setRejectOpen] = useState(false);

  const meta: PendingMetadata =
    approval.pending_request?.metadata && typeof approval.pending_request.metadata === 'object'
      ? (approval.pending_request.metadata as PendingMetadata)
      : {};

  const requestedAt = approval.pending_request?.created_at ?? approval.updated_at;
  const requestedBy = meta.requested_by ?? meta.changed_by ?? approval.pending_request?.created_by ?? approval.assigned_to;

  const value = Number(approval.expected_value) || 0;
  const currency = approval.expected_value_currency || 'AED';

  // Attachment link gating — render as <Link> when the caller can view the
  // destination, plain text otherwise. Spec: clients.view for contracts,
  // invoices.view for invoices.
  const attachment = meta.attachment;
  const attachmentLabel = meta.attachment_label ?? (attachment?.id ?? null);
  const canViewAttachment = (() => {
    if (!attachment?.type || !me) return false;
    const perm = attachment.type === 'contract' ? 'clients.view' : 'invoices.view';
    return hasPermission(me.rolePermissions, perm);
  })();
  const attachmentHref =
    attachment?.id
      ? attachment.type === 'contract'
        ? `/dashboard/finance/contracts/${attachment.id}`
        : `/dashboard/invoices/${attachment.id}`
      : null;

  // ── Optimistic remove + restore-on-error (same shape as Phase-6 mark-complete)
  async function applyOptimistic() {
    await qc.cancelQueries({ queryKey: ['crm', 'approvals'] });
    const snapshots = qc.getQueriesData<ApprovalsResponse>({ queryKey: ['crm', 'approvals'] });
    qc.setQueriesData<ApprovalsResponse>({ queryKey: ['crm', 'approvals'] }, (old) => {
      if (!old || !Array.isArray(old.approvals)) return old;
      const next = old.approvals.filter((a) => a.id !== approval.id);
      if (next.length === old.approvals.length) return old;
      return { ...old, approvals: next };
    });
    return snapshots;
  }

  function rollback(snapshots: ReturnType<typeof qc.getQueriesData<ApprovalsResponse>>) {
    for (const [key, data] of snapshots) qc.setQueryData(key, data);
  }

  async function handleApprove() {
    const snapshots = await applyOptimistic();
    try {
      await approve.mutateAsync({ lead_id: approval.id });
      toast.success('تم اعتماد الصفقة');
    } catch (err) {
      console.error('Approve failed:', err);
      rollback(snapshots);
      toast.error('فشل الاعتماد');
    }
  }

  async function handleReject(reason: string) {
    setRejectOpen(false);
    const snapshots = await applyOptimistic();
    try {
      await reject.mutateAsync({ lead_id: approval.id, reason });
      toast.success('تم رفض الصفقة وإعادتها لمرحلة التفاوض');
    } catch (err) {
      console.error('Reject failed:', err);
      rollback(snapshots);
      toast.error('فشل الرفض');
    }
  }

  const submitting = approve.isPending || reject.isPending;
  const AttachmentIcon = attachment?.type === 'contract' ? FileSignature : Receipt;

  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        {/* Main column */}
        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className="text-base font-semibold leading-6">{approval.name}</h3>
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40"
            >
              بانتظار اعتمادك
            </Badge>
            {approval.deal_type && (
              <Badge variant="outline" className="bg-muted/50 capitalize">
                {approval.deal_type}
              </Badge>
            )}
          </div>

          {approval.company && (
            <p className="text-xs text-muted-foreground">{approval.company}</p>
          )}

          {/* Stat row */}
          <div className="flex items-center gap-4 flex-wrap text-sm">
            {value > 0 && (
              <div className="inline-flex items-center gap-1.5">
                <Wallet className="size-3.5 text-orange-500" />
                <span className="font-semibold tabular-nums">
                  {formatCurrency(value, currency)}
                </span>
              </div>
            )}
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="size-6 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center text-[10px] font-bold"
                title={approval.assigned_display_name ?? approval.assigned_to ?? ''}
                aria-hidden
              >
                {initials(approval.assigned_display_name ?? approval.assigned_to ?? '?')}
              </span>
              <span>المسؤول: {approval.assigned_display_name ?? approval.assigned_to}</span>
            </div>
          </div>

          {/* Attachment */}
          {attachment?.id && attachmentLabel && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
              <AttachmentIcon className="size-4 text-orange-500 shrink-0" />
              <span className="text-xs text-muted-foreground">المرفق:</span>
              {canViewAttachment && attachmentHref ? (
                <Link
                  href={attachmentHref}
                  className="font-medium hover:underline inline-flex items-center gap-1 text-orange-600 dark:text-orange-400"
                >
                  {attachmentLabel}
                  <ExternalLink className="size-3" />
                </Link>
              ) : (
                <span className="font-medium">{attachmentLabel}</span>
              )}
            </div>
          )}

          {/* Requestor + timestamp */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="size-3.5" />
            <span>طلب الاعتماد:</span>
            <span className="font-medium text-foreground">{requestedBy ?? 'غير معروف'}</span>
            <span>·</span>
            <span title={requestedAt}>{formatRelativeDate(requestedAt)}</span>
          </div>
        </div>

        {/* Action column — stacks below on mobile, sticks right on desktop */}
        <div className="flex md:flex-col gap-2 shrink-0 md:w-44">
          <Button
            onClick={() => void handleApprove()}
            disabled={submitting}
            className={cn(
              'flex-1 md:flex-none gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white',
              'min-w-[8rem]',
            )}
          >
            {approve.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            اعتماد
          </Button>
          <Button
            variant="outline"
            onClick={() => setRejectOpen(true)}
            disabled={submitting}
            className="flex-1 md:flex-none gap-1.5 text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300 border-red-200 dark:border-red-800/40"
          >
            <XCircle className="size-4" />
            رفض
          </Button>
        </div>
      </div>

      <ApprovalRejectModal
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        leadName={approval.name}
        submitting={reject.isPending}
        onConfirm={handleReject}
      />
    </Card>
  );
}
