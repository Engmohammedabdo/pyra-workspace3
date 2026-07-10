'use client';

/**
 * Today strip — the Pyra Pro "what do I do today?" banner that anchors the
 * top of the Sales Dashboard. Surfaces three daily-priority counts:
 *   - follow-ups due   → useSidebarBadges().follow_ups_pending
 *   - pending approvals → useSidebarBadges().crm_pending_approvals (managers)
 *   - new WhatsApp      → useMyWork().data.counts.conversations_unread
 *
 * Reuses the SAME hooks as <DashboardActionCards> — zero extra HTTP, no new
 * endpoints. Destinations + the approvals permission gate mirror the action
 * cards so the two surfaces stay consistent. The WhatsApp square pulses only
 * while there are genuinely unread conversations.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarClock, BadgeCheck, MessageCircle, type LucideIcon } from 'lucide-react';
import { useSidebarBadges } from '@/hooks/useSidebarBadges';
import { useMyWork } from '@/hooks/useMyWork';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { hasPermission } from '@/lib/auth/rbac';
import { cn } from '@/lib/utils/cn';

interface TodayItem {
  key: string;
  href: string;
  icon: LucideIcon;
  /** solid square background — matches the Pyra Pro palette exactly. */
  square: string;
  label: string;
  count: number;
  pulse?: boolean;
}

export function DashboardTodayStrip() {
  const t = useTranslations('crm.dashboard.today');
  const { data: user } = useCurrentUser();
  const badges = useSidebarBadges();
  const { data: myWork } = useMyWork();

  const canApprove = user
    ? hasPermission(user.rolePermissions, 'leads.approve') ||
      hasPermission(user.rolePermissions, '*')
    : false;

  const waUnread = myWork?.counts.conversations_unread ?? 0;

  const items: TodayItem[] = [
    {
      key: 'followUps',
      href: '/dashboard/crm/follow-ups',
      icon: CalendarClock,
      square: 'bg-orange-500',
      label: t('followUps'),
      count: badges.follow_ups_pending,
    },
  ];
  if (canApprove) {
    items.push({
      key: 'approvals',
      href: '/dashboard/crm/approvals',
      icon: BadgeCheck,
      square: 'bg-[#D4A017]',
      label: t('approvals'),
      count: badges.crm_pending_approvals,
    });
  }
  items.push({
    key: 'whatsapp',
    href: '/dashboard/sales/chat',
    icon: MessageCircle,
    square: 'bg-emerald-600',
    label: t('whatsapp'),
    count: waUnread,
    pulse: waUnread > 0,
  });

  // Timestamp is client-only to avoid a hydration mismatch, and refreshes
  // once a minute to track the 60s badge/my-work polling cadence.
  const [updated, setUpdated] = useState('');
  useEffect(() => {
    const fmt = () =>
      setUpdated(
        new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
      );
    fmt();
    const id = setInterval(fmt, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="crm-fade-up rounded-2xl border border-orange-200/70 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/20 dark:to-transparent px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="text-[13px] font-bold text-orange-800 dark:text-orange-300 shrink-0">
          {t('label')}
        </span>
        <span className="hidden sm:block h-4 w-px bg-orange-200/80 dark:bg-orange-900/50 shrink-0" aria-hidden />

        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label={t('aria')}>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="group inline-flex items-center gap-2 rounded-lg -mx-1 px-1 py-0.5 transition-colors hover:bg-orange-500/5 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                >
                  <span
                    className={cn(
                      'size-[22px] rounded-[7px] flex items-center justify-center text-white shrink-0',
                      item.square,
                      item.pulse && 'crm-badge-pulse',
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="font-mono text-sm font-bold tabular-nums text-orange-900 dark:text-orange-100">
                    {item.count.toLocaleString('en-US')}
                  </span>
                  <span className="text-[12.5px] font-semibold text-orange-800/90 dark:text-orange-300/90">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {updated && (
          <span className="ms-auto text-[11.5px] font-medium tabular-nums text-orange-700/70 dark:text-orange-400/70">
            {t('updated', { time: updated })}
          </span>
        )}
      </div>
    </div>
  );
}
