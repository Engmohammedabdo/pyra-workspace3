'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Briefcase } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectBoardEmbed } from './project-board-embed';
import { FileItem } from '@/components/dashboard/project-detail/file-item';
import { CommentsSection } from '@/components/dashboard/project-detail/comments-section';
import { useProject } from '@/hooks/useProjects';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.id as string;

  const { data: project, isLoading: loading } = useProject(projectId);

  const { data: files = [], isLoading: filesLoading, refetch: refetchFiles } = useQuery<any[]>({
    queryKey: ['project-files', projectId],
    queryFn: () => fetchAPI(`/api/projects/${projectId}/files`),
    enabled: !!projectId,
  });

  const { data: comments = [], isLoading: commentsLoading, refetch: refetchComments } = useQuery<any[]>({
    queryKey: ['project-comments', projectId],
    queryFn: () => fetchAPI(`/api/comments?project_id=${projectId}`),
    enabled: !!projectId,
  });

  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [visibilityUpdating, setVisibilityUpdating] = useState<Set<string>>(new Set());

  const toggleVisibility = async (fileIds: string[], newVisible: boolean) => {
    setVisibilityUpdating(prev => new Set([...prev, ...fileIds]));
    queryClient.setQueryData(['project-files', projectId], (prev: any[]) =>
      (prev || []).map((f: any) => fileIds.includes(f.id) ? { ...f, client_visible: newVisible } : f)
    );
    try {
      await mutateAPI(`/api/projects/${projectId}/files/visibility`, 'PATCH', { file_ids: fileIds, client_visible: newVisible });
    } catch { toast.error('فشل في التحديث'); }
    setVisibilityUpdating(prev => { const n = new Set(prev); fileIds.forEach((id: string) => n.delete(id)); return n; });
  };

  const handleSubmitComment = async () => {
    setCommentLoading(true);
    await mutateAPI('/api/comments', 'POST', { project_id: projectId, text: newComment.trim() });
    setNewComment('');
    refetchComments();
    setCommentLoading(false);
  };

  if (loading) return <Skeleton className="h-[400px] w-full" />;
  if (!project) return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Briefcase className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h2 className="text-lg font-semibold">المشروع غير موجود</h2>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/dashboard/projects')}>
          <ArrowRight className="h-4 w-4 me-2" /> الرجوع للمشاريع
        </Button>
      </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/projects')}><ArrowRight className="h-5 w-5" /></Button>
        <h1 className="text-2xl font-bold">{(project as any).name}</h1>
      </div>

      <Tabs defaultValue="tasks" dir="rtl">
        <TabsList className="mb-4">
          <TabsTrigger value="tasks">المهام</TabsTrigger>
          <TabsTrigger value="files">الملفات</TabsTrigger>
          <TabsTrigger value="comments">التعليقات</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks"><ProjectBoardEmbed projectId={(project as any).id} /></TabsContent>
        <TabsContent value="files">
            <div className="grid lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3">
                    {files.map((file: any) => <FileItem key={file.id} file={file} onToggleVisibility={(f: any) => toggleVisibility([f.id], !f.client_visible)} isUpdating={visibilityUpdating.has(file.id)} onDownload={() => {}} />)}
                </div>
                <div className="lg:col-span-2">
                    <CommentsSection comments={comments} projectId={projectId} onAdd={handleSubmitComment} loading={commentsLoading} newComment={newComment} setNewComment={setNewComment} commentLoading={commentLoading} />
                </div>
            </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
