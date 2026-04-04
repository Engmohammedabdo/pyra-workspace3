'use client';

import { useState, useEffect } from 'react';
import { fetchAPI } from '@/hooks/api-helpers';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { GitBranch, CheckCircle } from 'lucide-react';

const PROGRESS_STAGE_COLORS: Record<string, { bg: string; dot: string }> = {
  gray: { bg: 'bg-gray-100 dark:bg-gray-800', dot: 'bg-gray-400' },
  blue: { bg: 'bg-blue-50 dark:bg-blue-950/30', dot: 'bg-blue-500' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-950/30', dot: 'bg-purple-500' },
  pink: { bg: 'bg-pink-50 dark:bg-pink-950/30', dot: 'bg-pink-500' },
  yellow: { bg: 'bg-yellow-50 dark:bg-yellow-950/30', dot: 'bg-yellow-500' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-950/30', dot: 'bg-orange-500' },
  green: { bg: 'bg-green-50 dark:bg-green-950/30', dot: 'bg-green-500' },
  red: { bg: 'bg-red-50 dark:bg-red-950/30', dot: 'bg-red-500' },
};

export function ProjectPipelineProgress({ projectId }: { projectId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAPI<any>(`/api/portal/projects/${projectId}/progress`)
      .then(result => setData(result))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-32 w-full rounded-xl" /></div>;

  if (!data?.has_pipeline || data.boards.length === 0) return <EmptyState icon={GitBranch} title="لا توجد مراحل متابعة" description="لم يتم إعداد خط إنتاج لهذا المشروع بعد" />;

  return (
    <div className="space-y-6">
      {data.boards.map((board: any) => (
        <Card key={board.board_id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-emerald-500" />
                {board.board_name}
              </CardTitle>
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 text-sm font-bold">
                {board.progress_percent}%
              </Badge>
            </div>
            <div className="w-full h-3 bg-muted rounded-full overflow-hidden mt-2">
              <div className="h-full bg-gradient-to-l from-emerald-500 to-emerald-400 rounded-full transition-all duration-700" style={{ width: `${board.progress_percent}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{board.completed_tasks} مهمة مكتملة من {board.total_tasks}</p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2 overflow-x-auto pb-1" dir="ltr">
              {board.stages.map((stage: any, idx: number) => {
                const colors = PROGRESS_STAGE_COLORS[stage.color] || PROGRESS_STAGE_COLORS.gray;
                return (
                  <div key={idx} className="flex items-center">
                    <div className={`px-3 py-2 rounded-lg ${colors.bg} min-w-[100px] text-center ${stage.is_current ? 'ring-2 ring-emerald-500/50' : ''} ${stage.is_done ? 'opacity-60' : ''}`}>
                      <div className="flex items-center justify-center gap-1.5 mb-0.5">
                        <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                        <span className="text-xs font-medium" dir="rtl">{stage.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{stage.task_count} مهام</span>
                      {stage.is_done && <CheckCircle className="h-3 w-3 text-green-500 mx-auto mt-0.5" />}
                    </div>
                    {idx !== board.stages.length - 1 && (
                      <div className="flex items-center px-1">
                        <div className="w-4 h-0.5 bg-border" />
                        <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-s-[5px] border-s-border" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
