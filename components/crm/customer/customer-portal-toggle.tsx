'use client';

/**
 * Admin-only switch to enable/disable the linked client's portal access.
 *
 * Renders nothing if:
 *   - User lacks `leads.manage` permission
 *   - Customer has no `client_id` (must be converted first via
 *     <CustomerConvertModal> — the convert flow CREATES the
 *     pyra_clients row + sets `portal_active` per the request body)
 *
 * Per Phase 9 Q9-2 (δ), this toggle ONLY flips the boolean — it never
 * creates or destroys the pyra_clients row. That keeps history intact
 * (notifications, activity log references that point at client_id stay
 * valid even when portal is "disabled" temporarily).
 *
 * Wraps PATCH /api/crm/customers/[lead_id]/portal-access via the
 * `useUpdatePortalAccess` mutation hook (idempotent server-side; same-
 * value PATCH is a no-op).
 */

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Shield, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { hasPermission } from '@/lib/auth/rbac';
import { useUpdatePortalAccess } from '@/hooks/useCustomerDossier';
import { cn } from '@/lib/utils/cn';
import type { DossierCustomer } from '@/hooks/useCustomerDossier';

interface Props {
  customer: DossierCustomer;
}

export function CustomerPortalToggle({ customer }: Props) {
  const { data: user } = useCurrentUser();
  const canManage = !!user && hasPermission(user.rolePermissions, 'leads.manage');
  const mutation = useUpdatePortalAccess(customer.id);

  // Optimistic local state so the switch responds instantly while the
  // PATCH is in flight. On error we revert and toast.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const checked = optimistic ?? customer.portal_active ?? false;

  // Hide entirely for users without leads.manage OR before conversion.
  if (!canManage || !customer.client_id) return null;

  const handleChange = (next: boolean) => {
    setOptimistic(next);
    mutation.mutate(
      { enabled: next },
      {
        onSuccess: () => {
          toast.success(
            next
              ? 'تم تفعيل وصول البورتال'
              : 'تم إيقاف وصول البورتال',
          );
          setOptimistic(null); // Server response will land via dossier refetch
        },
        onError: (err) => {
          setOptimistic(null); // revert
          toast.error(err.message || 'فشل تحديث وصول البورتال');
        },
      },
    );
  };

  return (
    <Card className={cn(
      'p-4 flex items-center justify-between gap-4',
      'border-amber-200/60 dark:border-amber-800/40',
      'bg-amber-50/50 dark:bg-amber-950/20',
    )}>
      <div className="flex items-start gap-3 min-w-0">
        <div className={cn(
          'size-9 rounded-md flex items-center justify-center shrink-0',
          checked
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-muted text-muted-foreground',
        )}>
          {checked ? <Shield className="size-5" /> : <ShieldOff className="size-5" />}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">وصول بوابة العميل</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {checked
              ? 'العميل يمكنه الدخول للبوابة ومتابعة مشاريعه وفواتيره.'
              : 'العميل لا يستطيع الدخول للبوابة حاليًا.'}
          </p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={handleChange}
        disabled={mutation.isPending}
        aria-label="تفعيل وصول البورتال"
      />
    </Card>
  );
}
