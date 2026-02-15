'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const routeLabels: Record<string, string> = {
  dashboard: 'الرئيسية',
  files: 'الملفات',
  users: 'المستخدمون',
  teams: 'الفرق',
  permissions: 'الصلاحيات',
  quotes: 'عروض الأسعار',
  notifications: 'الإشعارات',
  activity: 'النشاط',
  trash: 'المحذوفات',
  settings: 'الإعدادات',
  clients: 'العملاء',
  projects: 'المشاريع',
  reviews: 'المراجعات',
  new: 'جديد',
};

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length <= 1) return null;

  return (
    <nav aria-label="التنقل" className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground">
      {segments.map((segment, index) => {
        const href = '/' + segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;
        const label = routeLabels[segment] || decodeURIComponent(segment);

        return (
          <span key={href} className="flex items-center gap-1">
            {index > 0 && <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />}
            {isLast ? (
              <span className="font-medium text-foreground">{label}</span>
            ) : (
              <Link
                href={href}
                className="hover:text-foreground transition-colors"
              >
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
