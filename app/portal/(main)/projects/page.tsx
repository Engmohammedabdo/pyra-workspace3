'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FolderKanban,
  Search,
  FolderOpen,
} from 'lucide-react';

// ---------- Types ----------

interface PortalProject {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'in_progress' | 'review' | 'completed' | 'archived';
  filesCount: number;
  updated_at: string;
}

// ---------- Helpers ----------

const statusConfig: Record<string, { label: string; className: string }> = {
  active: {
    label: 'نشط',
    className: 'bg-green-500/10 text-green-600 border-green-500/20',
  },
  in_progress: {
    label: 'قيد التنفيذ',
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  },
  review: {
    label: 'قيد المراجعة',
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
  completed: {
    label: 'مكتمل',
    className: 'bg-green-500/10 text-green-600 border-green-500/20',
  },
  archived: {
    label: 'مؤرشف',
    className: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  },
};

const filterTabs = [
  { value: 'all', label: 'الكل' },
  { value: 'active', label: 'نشط' },
  { value: 'review', label: 'قيد المراجعة' },
  { value: 'completed', label: 'مكتمل' },
];

// ---------- Component ----------

export default function PortalProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch('/api/portal/projects');
        const json = await res.json();
        if (res.ok && json.data) {
          // API may not include filesCount — default to 0
          const mapped: PortalProject[] = (json.data as Array<Record<string, unknown>>).map((p) => ({
            id: p.id as string,
            name: p.name as string,
            description: (p.description ?? null) as string | null,
            status: (p.status || 'active') as PortalProject['status'],
            filesCount: (p.filesCount ?? p.files_count ?? 0) as number,
            updated_at: p.updated_at as string,
          }));
          setProjects(mapped);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchProjects();
  }, []);

  const filtered = useMemo(() => {
    let list = projects;
    if (filter !== 'all') {
      list = list.filter((p) => p.status === filter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [projects, filter, search]);

  // ---------- Loading ----------

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-10 w-full max-w-sm" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">المشاريع</h1>
        <p className="text-muted-foreground text-sm mt-1">
          تابع مشاريعك واطلع على آخر التحديثات
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            {filterTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-72">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث عن مشروع..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
      </div>

      {/* Projects Grid */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center mb-4">
              <FolderKanban className="h-7 w-7 text-orange-500" />
            </div>
            <h2 className="text-lg font-semibold mb-2">لا توجد مشاريع</h2>
            <p className="text-muted-foreground text-sm max-w-md">
              لا توجد مشاريع تطابق معايير البحث الحالية
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project) => {
            const status = statusConfig[project.status] ?? statusConfig.active;
            return (
              <Card
                key={project.id}
                className="cursor-pointer hover:border-orange-500/30 hover:shadow-md transition-all"
                onClick={() => router.push(`/portal/projects/${project.id}`)}
              >
                <CardContent className="pt-5 pb-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm line-clamp-1">
                      {project.name}
                    </h3>
                    <Badge className={cn('shrink-0', status.className)}>
                      {status.label}
                    </Badge>
                  </div>

                  {project.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {project.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span>{project.filesCount} ملف</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeDate(project.updated_at)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
