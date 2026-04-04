'use client';

import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TrendingUp, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useRouter } from 'next/navigation';

interface Project {
  id: string;
  name: string;
  status?: string;
  totalFiles: number;
  approvedFiles: number;
  progress: number;
}

export function ProjectProgress({ projects }: { projects: Project[] }) {
  const router = useRouter();

  return (
    <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-portal" />
            تقدم المشاريع
          </CardTitle>
          <button
            onClick={() => router.push('/portal/projects')}
            className="text-xs text-portal hover:text-portal-secondary flex items-center gap-1 transition-colors"
          >
            عرض الكل
            <ChevronLeft className="h-3 w-3" />
          </button>
        </CardHeader>
        <CardContent>
          {projects.length > 0 ? (
            <div className="space-y-5">
              {projects.map((project) => {
                const isCompleted = project.status === 'completed';
                const progressColor = isCompleted
                  ? 'from-emerald-500 to-emerald-400'
                  : project.progress >= 70
                    ? 'from-portal to-portal'
                    : project.progress >= 30
                      ? 'from-amber-500 to-amber-400'
                      : 'from-portal to-portal';
                return (
                  <div key={project.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate max-w-[50%]">{project.name}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        {isCompleted && (
                          <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                            مكتمل
                          </Badge>
                        )}
                        <Badge variant="outline" className={cn('text-xs tabular-nums', isCompleted && 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400')}>
                          {project.progress}%
                        </Badge>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <motion.div
                        className={cn('h-full rounded-full bg-gradient-to-l', progressColor)}
                        initial={{ width: 0 }}
                        animate={{ width: `${project.progress}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{project.approvedFiles} من {project.totalFiles} ملف مكتمل</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={TrendingUp} title="لا توجد بيانات تقدم" className="py-8" />
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
