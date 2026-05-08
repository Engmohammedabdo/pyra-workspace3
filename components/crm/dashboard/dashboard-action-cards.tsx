'use client';

/**
 * Three quick-action cards: pending approvals · follow-ups due · WhatsApp unread.
 *
 * Per CRM Phase 8 spec (Cluster 3): "Reuse existing hooks; don't duplicate."
 *
 * Sources of counts:
 *   - approvals     → `useSidebarBadges().crm_pending_approvals` (already
 *                     polls every 60s for the sidebar badge — same data)
 *   - follow-ups    → `useSidebarBadges().follow_ups_pending`
 *   - WhatsApp unread → `useMyWork().counts.conversations_unread` (the
 *                     unified inbox aggregator already returns this)
 *
 * Both hooks are aggregator-style and used elsewhere in the app — reusing
 * them here means zero extra HTTP per dashboard load. No new endpoints.
 *
 * The Approvals card hides when the user lacks `leads.approve` (sales agents
 * see only follow-ups + WhatsApp). The other two surface for everyone.
 */

import Link from 'next/link';
import { useSidebarBadges } from '@/hooks/useSidebarBadges';
import { useMyWork } from '@/hooks/useMyWork';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckSquare, ClipboardCheck, MessageSquare, ArrowLeft } from 'lucide-react';
import { hasPermission } from '@/lib/auth/rbac';
import { cn } from '@/lib/utils/cn';

interface ActionCardSpec {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  tone: 'orange' | 'amber' | 'emerald';
  countLabel: string;
}

const TONE_CLASSES: Record<ActionCardSpec['tone'], string> = {
  orange:  'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  amber:   'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

export function DashboardActionCards() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const badges = useSidebarBadges();
  const { data: myWork, isLoading: myWorkLoading } = useMyWork();

  // Approvals visible only when the user can approve closed_won. Sales
  // agents lack leads.approve and would see permanently-zero counts.
  const canApprove = user
    ? hasPermission(user.rolePermissions, 'leads.approve') || hasPermission(user.rolePermissions, '*')
    : false;

  const approvalsCount = badges.crm_pending_approvals;
  const followUpsCount = badges.follow_ups_pending;
  const waUnreadCount = myWork?.counts.conversations_unread ?? 0;

  const cards: ActionCardSpec[] = [];
  if (canApprove) {
    cards.push({
      href: '/dashboard/crm/approvals',
      icon: CheckSquare,
      label: 'اعتمادات بانتظارك',
      count: approvalsCount,
      tone: 'orange',
      countLabel: approvalsCount === 1 ? 'صفقة' : 'صفقات',
    });
  }
  cards.push({
    href: '/dashboard/crm/follow-ups',
    icon: ClipboardCheck,
    label: 'متابعات معلقة',
    count: followUpsCount,
    tone: 'amber',
    countLabel: followUpsCount === 1 ? 'متابعة' : 'متابعات',
  });
  cards.push({
    href: '/dashboard/sales/chat',
    icon: MessageSquare,
    label: 'محادثات غير مقروءة',
    count: waUnreadCount,
    tone: 'emerald',
    countLabel: waUnreadCount === 1 ? 'محادثة' : 'محادثات',
  });

  // While we don't yet know which cards to render (still loading user
  // permission), render skeletons for the maximum-3 layout. After load
  // we re-render with the right number (1 or 2 of the cards may vanish
  // for sales_agent — acceptable layout shift, only happens once).
  if (userLoading || myWorkLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-4', cards.length === 3 && 'lg:grid-cols-3')}>
      {cards.map((c) => (
        <ActionCard key={c.href} spec={c} />
      ))}
    </div>
  );
}

function ActionCard({ spec }: { spec: ActionCardSpec }) {
  const Icon = spec.icon;
  return (
    <Link
      href={spec.href}
      className="block group focus:outline-none focus:ring-2 focus:ring-orange-500/40 rounded-xl"
    >
      <Card className="p-4 hover:border-orange-300/60 dark:hover:border-orange-700/40 hover:shadow-sm transition-all">
        <div className="flex items-start justify-between gap-2">
          <div className={cn('size-9 rounded-lg flex items-center justify-center shrink-0', TONE_CLASSES[spec.tone])}>
            <Icon className="size-5" />
          </div>
          <ArrowLeft className="size-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors mt-1" aria-hidden />
        </div>
        <div className="mt-3 text-xs text-muted-foreground">{spec.label}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tracking-tight tabular-nums">
            {spec.count.toLocaleString('en-US')}
          </span>
          {spec.count > 0 && (
            <span className="text-xs text-muted-foreground">{spec.countLabel}</span>
          )}
        </div>
      </Card>
    </Link>
  );
}
