import {
  LayoutDashboard,
  FolderKanban,
  FolderOpen,
  FileText,
  FileSignature,
  Receipt,
  ReceiptText,
  RefreshCw,
  Wallet,
  ScrollText,
  HelpCircle,
  Bell,
  User,
} from 'lucide-react';

import type nav from '@/messages/ar/nav.json';

export type PortalNavItemKey = keyof typeof nav.nav.portal.items;

export interface PortalNavItemConfig {
  key: PortalNavItemKey; // nav.portal.items.<key>
  href: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  badgeKey?: 'notifications' | null;
}

export const PORTAL_NAV_ITEMS: PortalNavItemConfig[] = [
  { key: 'home', href: '/portal', icon: LayoutDashboard },
  { key: 'projects', href: '/portal/projects', icon: FolderKanban },
  { key: 'files', href: '/portal/files', icon: FolderOpen },
  { key: 'quotes', href: '/portal/quotes', icon: FileText },
  { key: 'contracts', href: '/portal/contracts', icon: FileSignature },
  { key: 'invoices', href: '/portal/invoices', icon: Receipt },
  { key: 'creditNotes', href: '/portal/credit-notes', icon: ReceiptText },
  { key: 'recurring', href: '/portal/recurring', icon: RefreshCw },
  { key: 'statement', href: '/portal/statement', icon: Wallet },
  { key: 'scripts', href: '/portal/scripts', icon: ScrollText },
  { key: 'help', href: '/portal/help', icon: HelpCircle },
  { key: 'notifications', href: '/portal/notifications', icon: Bell, badgeKey: 'notifications' },
  { key: 'profile', href: '/portal/profile', icon: User },
];
