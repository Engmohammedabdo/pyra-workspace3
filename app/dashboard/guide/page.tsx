'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  BookOpen,
  Target,
  Lightbulb,
  LayoutDashboard,
  FolderOpen,
  Briefcase,
  Wallet,
  Users,
  Settings,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { MODULE_GUIDES, searchModuleGuides } from '@/lib/config/module-guide';
import type { ModuleGuide } from '@/lib/config/module-guide';

/* ═══════════════════════════════════════════════
   Section config — maps to sidebar groups
   ═══════════════════════════════════════════════ */
const SECTIONS = [
  {
    key: 'general',
    title: 'عام',
    titleEn: 'General',
    icon: LayoutDashboard,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/10',
    hrefs: ['/dashboard', '/dashboard/notifications'],
  },
  {
    key: 'files',
    title: 'إدارة الملفات',
    titleEn: 'File Management',
    icon: FolderOpen,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-500/10',
    hrefs: ['/dashboard/files', '/dashboard/favorites', '/dashboard/reviews', '/dashboard/trash', '/dashboard/storage'],
  },
  {
    key: 'work',
    title: 'العمل',
    titleEn: 'Work',
    icon: Briefcase,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-500/10',
    hrefs: [
      '/dashboard/projects',
      '/dashboard/quotes',
      '/dashboard/invoices',
      '/dashboard/clients',
      '/dashboard/clients/[id]',
      '/dashboard/script-reviews',
    ],
  },
  {
    key: 'finance',
    title: 'المالية',
    titleEn: 'Finance',
    icon: Wallet,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/10',
    hrefs: [
      '/dashboard/finance',
      '/dashboard/finance/expenses',
      '/dashboard/finance/subscriptions',
      '/dashboard/finance/cards',
      '/dashboard/finance/contracts',
      '/dashboard/finance/recurring',
      '/dashboard/finance/reports',
      '/dashboard/finance/targets',
    ],
  },
  {
    key: 'team',
    title: 'الفريق',
    titleEn: 'Team',
    icon: Users,
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    hrefs: ['/dashboard/teams', '/dashboard/users', '/dashboard/roles'],
  },
  {
    key: 'system',
    title: 'النظام',
    titleEn: 'System',
    icon: Settings,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-500/10',
    hrefs: [
      '/dashboard/reports',
      '/dashboard/automations',
      '/dashboard/knowledge-base',
      '/dashboard/integrations',
      '/dashboard/activity',
      '/dashboard/login-history',
      '/dashboard/sessions',
      '/dashboard/settings',
    ],
  },
];

/* ═══════════════════════════════════════════════
   Module Card
   ═══════════════════════════════════════════════ */

function ModuleCard({ guide, color }: { guide: ModuleGuide; color: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card
      className="group hover:border-orange-300 dark:hover:border-orange-700 transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {guide.description}
              <Link
                href={guide.href}
                onClick={(e) => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-orange-500" />
              </Link>
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">{guide.descriptionEn}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        {/* Goal */}
        <div className="flex items-start gap-2 mb-2">
          <Target className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${color}`} />
          <p className="text-xs text-muted-foreground leading-relaxed">{guide.goal}</p>
        </div>

        {/* Tips — collapsible */}
        {expanded && guide.tips.length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-1.5 animate-in fade-in-0 slide-in-from-top-1 duration-200">
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${color}`}>
              <Lightbulb className="h-3.5 w-3.5" />
              <span>نصائح الاستخدام</span>
            </div>
            <ul className="space-y-1">
              {guide.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="text-[10px] font-bold text-orange-500 mt-px">{i + 1}.</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!expanded && guide.tips.length > 0 && (
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            انقر لعرض {guide.tips.length} نصائح استخدام
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════
   Main Guide Page
   ═══════════════════════════════════════════════ */

export default function GuidePage() {
  const [query, setQuery] = useState('');

  const filteredGuides = useMemo(() => {
    if (!query.trim()) return null; // null = show all sections
    return searchModuleGuides(query);
  }, [query]);

  const totalModules = Object.keys(MODULE_GUIDES).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
        >
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">دليل الاستخدام</h1>
            <p className="text-muted-foreground text-sm">
              شرح لجميع وحدات النظام وطريقة استخدامها — {totalModules} وحدة
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="ابحث في الوحدات... (مثال: فواتير، ملفات، تقارير)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ps-9"
        />
      </div>

      {/* Search Results */}
      {filteredGuides !== null ? (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            {filteredGuides.length > 0
              ? `تم العثور على ${filteredGuides.length} نتيجة`
              : 'لا توجد نتائج — جرّب كلمة بحث مختلفة'}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredGuides.map((guide) => (
              <ModuleCard key={guide.href} guide={guide} color="text-orange-600 dark:text-orange-400" />
            ))}
          </div>
        </div>
      ) : (
        /* All Sections */
        <div className="space-y-8">
          {SECTIONS.map((section) => {
            const sectionGuides = section.hrefs
              .map((href) => MODULE_GUIDES[href])
              .filter(Boolean);

            if (sectionGuides.length === 0) return null;

            const Icon = section.icon;

            return (
              <div key={section.key}>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-8 h-8 rounded-lg ${section.bgColor} flex items-center justify-center`}>
                    <Icon className={`h-4 w-4 ${section.color}`} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">{section.title}</h2>
                    <p className="text-xs text-muted-foreground">{section.titleEn}</p>
                  </div>
                  <Badge variant="outline" className="ms-2 text-[10px]">
                    {sectionGuides.length}
                  </Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sectionGuides.map((guide) => (
                    <ModuleCard key={guide.href} guide={guide} color={section.color} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
