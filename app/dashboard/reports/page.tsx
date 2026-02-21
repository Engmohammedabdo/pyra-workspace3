'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, Users, HardDrive, DollarSign, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatNumber } from '@/lib/utils/format';

interface OverviewData {
  projects?: { total?: number; active?: number };
  clients?: { total?: number; active?: number };
  storage?: { total_files?: number; total_size?: number };
  revenue?: { total?: number; outstanding?: number };
  team?: { total_members?: number };
}

const reportCards = [
  {
    key: 'projects' as const,
    title: 'المشاريع',
    description: 'تحليل أداء المشاريع والإنجاز',
    href: '/dashboard/reports/projects',
    icon: BarChart3,
    getStat: (d: OverviewData) =>
      d.projects ? `${formatNumber(d.projects.total ?? 0)} مشروع` : null,
  },
  {
    key: 'clients' as const,
    title: 'العملاء',
    description: 'تحليلات العملاء والإيرادات حسب العميل',
    href: '/dashboard/reports/clients',
    icon: Users,
    getStat: (d: OverviewData) =>
      d.clients ? `${formatNumber(d.clients.total ?? 0)} عميل` : null,
  },
  {
    key: 'storage' as const,
    title: 'التخزين',
    description: 'تحليل استخدام التخزين وأنواع الملفات',
    href: '/dashboard/reports/storage',
    icon: HardDrive,
    getStat: (d: OverviewData) =>
      d.storage ? `${formatNumber(d.storage.total_files ?? 0)} ملف` : null,
  },
  {
    key: 'revenue' as const,
    title: 'الإيرادات',
    description: 'تقارير الإيرادات والفواتير والمدفوعات',
    href: '/dashboard/reports/revenue',
    icon: DollarSign,
    getStat: (d: OverviewData) =>
      d.revenue ? formatCurrency(d.revenue.total ?? 0) : null,
  },
  {
    key: 'team' as const,
    title: 'الفريق',
    description: 'إنتاجية الفريق والنشاط',
    href: '/dashboard/reports/team',
    icon: UserCheck,
    getStat: (d: OverviewData) =>
      d.team ? `${formatNumber(d.team.total_members ?? 0)} عضو` : null,
  },
];

export default function ReportsPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reports')
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setOverview(json.data);
      })
      .catch(() => {
        toast.error('فشل في تحميل ملخص التقارير');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          التقارير
        </h1>
        <p className="text-muted-foreground">تقارير وتحليلات شاملة للنظام</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportCards.map((card) => (
          <Link key={card.key} href={card.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <card.icon className="h-5 w-5 text-primary" />
                  {card.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  {card.description}
                </p>
                {loading ? (
                  <Skeleton className="h-6 w-24" />
                ) : overview ? (
                  <span className="text-lg font-semibold text-primary">
                    {card.getStat(overview) ?? '—'}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
