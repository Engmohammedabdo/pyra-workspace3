'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useBreadcrumbExtra } from './breadcrumb-context';
import { Button } from '@/components/ui/button';

const routeLabels: Record<string, string> = {
  // Dashboard routes
  dashboard: 'الرئيسية',
  files: 'الملفات',
  users: 'المستخدمون',
  teams: 'الفرق',
  permissions: 'الصلاحيات',
  quotes: 'عروض الأسعار',
  invoices: 'الفواتير',
  notifications: 'الإشعارات',
  activity: 'النشاط',
  trash: 'المحذوفات',
  settings: 'الإعدادات',
  clients: 'العملاء',
  projects: 'المشاريع',
  reviews: 'المراجعات',
  finance: 'الإدارة المالية',
  expenses: 'المصاريف',
  contracts: 'العقود',
  subscriptions: 'الاشتراكات',
  cards: 'البطاقات',
  recurring: 'الفواتير المتكررة',
  targets: 'أهداف الإيرادات',
  statements: 'البيانات المالية',
  favorites: 'المفضلة',
  'script-reviews': 'مراجعات السكريبتات',
  'knowledge-base': 'قاعدة المعرفة',
  'login-history': 'سجل الدخول',
  sessions: 'الجلسات',
  integrations: 'التكاملات',
  reports: 'التقارير',
  new: 'جديد',
  boards: 'لوحات العمل',
  roles: 'الأدوار',
  automations: 'الأتمتة',
  attendance: 'الحضور',
  leave: 'الإجازات',
  payroll: 'الرواتب',
  evaluations: 'التقييمات',
  directory: 'الدليل',
  announcements: 'الإعلانات',
  timesheet: 'ساعات العمل',
  'org-chart': 'الهيكل التنظيمي',
  'content-pipeline': 'خط الإنتاج',
  'my-payslips': 'كشف الراتب',
  'my-tasks': 'مهامي',
  storage: 'التخزين',
  guide: 'الدليل الإرشادي',
  // Portal routes
  portal: 'البوابة',
  help: 'مركز المساعدة',
  scripts: 'السكريبتات',
  profile: 'الملف الشخصي',
};

export function Breadcrumb() {
  const pathname = usePathname();
  const router = useRouter();
  const { extra } = useBreadcrumbExtra();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length <= 1) return null;

  return (
    <nav aria-label="التنقل" className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground">
      {/* Back button for deep pages */}
      {segments.length > 2 && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 me-1 shrink-0"
          onClick={() => router.back()}
          aria-label="رجوع"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      )}

      {segments.map((segment, index) => {
        const href = '/' + segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;
        const label = routeLabels[segment] || decodeURIComponent(segment);

        return (
          <span key={href} className="flex items-center gap-1">
            {index > 0 && <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />}
            {isLast ? (
              <span className="font-medium text-foreground flex items-center gap-1.5">
                {label}
                {extra.resultCount !== undefined && extra.resultCount > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground min-w-[20px]">
                    {extra.resultCount}
                  </span>
                )}
              </span>
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
