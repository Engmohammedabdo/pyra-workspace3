'use client';

/**
 * Active Customer Page header — name, company, status badges, action buttons.
 *
 * Per Phase 9 Q-C2: solid `bg-card` + `border-b` for v1 (gradient cover
 * banner deferred to Phase 13 visual polish). The visual hierarchy is:
 *
 *   [Customer name (h1)]                      [Edit] [Convert] [Portal]
 *   [Company · @assigned_to · Closed Won badge]
 *
 * Action buttons:
 *   - "تعديل" — links to /dashboard/crm/leads/[id] (the existing lead
 *     detail route remains the source of truth for inline lead editing
 *     in v1; the customer page is the read-mostly relationship view)
 *   - "تحويل لعميل" — admin only, hidden once lead.is_converted = true.
 *     Step C: button is a placeholder that opens a "TODO Step E" modal.
 *     Step E will wire to /api/crm/leads/[id]/convert-to-customer.
 *   - Portal indicator — admin only, shows current portal_active status
 *     (read-only text in Step C). Step E adds the actual toggle PATCH.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Edit2, UserPlus, Shield, ShieldOff } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { hasPermission } from '@/lib/auth/rbac';
import { cn } from '@/lib/utils/cn';
import { CustomerConvertModal } from './customer-convert-modal';
import type { DossierCustomer } from '@/hooks/useCustomerDossier';

interface Props {
  customer?: DossierCustomer;
  isLoading?: boolean;
}

export function CustomerHeader({ customer, isLoading = false }: Props) {
  const { data: user } = useCurrentUser();
  const canManageLead = !!user && hasPermission(user.rolePermissions, 'leads.manage');
  const [convertOpen, setConvertOpen] = useState(false);

  if (isLoading || !customer) {
    return (
      <Card className="p-5 border-b border-border">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-2 min-w-0 flex-1">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex gap-2 shrink-0">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
      </Card>
    );
  }

  const showConvertButton = canManageLead && !customer.is_converted;
  const showPortalIndicator = canManageLead && !!customer.client_id;

  return (
    // Phase 13 Q-002c — light warm gradient overlay. Closes the Phase 9
    // Q-C2 deferral. Subtle orange→amber→transparent gradient (low
    // opacity to avoid competing with KPI cards + health ring below).
    // Absolute layer keeps the Card's bg-card semantic + dark-mode
    // adaptation intact while overlaying the brand-warm wash on top.
    <Card className="p-5 border-b border-border relative overflow-hidden">
      <div
        className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-amber-500/[0.03] to-transparent pointer-events-none"
        aria-hidden
      />
      <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        {/* Left: name + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold truncate">{customer.name}</h1>
            {customer.is_converted && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border border-yellow-500/20 dark:border-yellow-500/30">
                ✓ فائز ومُعتمد
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {customer.company && <span className="truncate">{customer.company}</span>}
            {customer.company && customer.assigned_to && <span>·</span>}
            {customer.assigned_to && (
              <span className="text-xs">
                مسؤول: <span className="text-foreground">@{customer.assigned_to}</span>
              </span>
            )}
            {showPortalIndicator && (
              <>
                <span>·</span>
                <PortalIndicator portalActive={customer.portal_active} />
              </>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/crm/leads/${customer.id}`}>
              <Edit2 className="size-4 me-1.5" />
              تعديل
            </Link>
          </Button>
          {showConvertButton && (
            <Button
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => setConvertOpen(true)}
            >
              <UserPlus className="size-4 me-1.5" />
              تحويل لعميل
            </Button>
          )}
        </div>
      </div>

      {/* Convert-to-customer modal — opens when admin clicks the
          "تحويل لعميل" button. The modal itself enforces the form-level
          requirements; the server enforces stage_id + is_converted state
          gates and will return 422 with an Arabic message if violated. */}
      {showConvertButton && (
        <CustomerConvertModal
          customer={customer}
          open={convertOpen}
          onOpenChange={setConvertOpen}
        />
      )}
    </Card>
  );
}

function PortalIndicator({ portalActive }: { portalActive: boolean | null }) {
  if (portalActive == null) {
    // Lead has no client_id linked yet — caller hides this anyway via
    // `showPortalIndicator`. Defensive null-render.
    return null;
  }
  if (portalActive) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md',
        'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
      )}>
        <Shield className="size-3" />
        البورتال نشط
      </span>
    );
  }
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md',
      'bg-muted text-muted-foreground',
    )}>
      <ShieldOff className="size-3" />
      البورتال معطل
    </span>
  );
}
