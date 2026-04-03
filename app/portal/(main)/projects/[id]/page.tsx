'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { MentionTextarea } from '@/components/ui/mention-textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight } from 'lucide-react';

import { ProjectHeader } from '@/components/portal/project-detail/project-header';
import { ProjectFilesList } from '@/components/portal/project-detail/project-files-list';
import { ProjectComments } from '@/components/portal/project-detail/project-comments';
import { ActivityTimeline } from '@/components/portal/project-detail/activity-timeline';
import { ProjectPipelineProgress } from '@/components/portal/project-detail/project-pipeline-progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FilePreview } from '@/components/files/file-preview';
import { Card, CardContent } from '@/components/ui/card';
import { renderTextWithMentions } from '@/lib/utils/mentions';
import { SearchInput } from '@/components/ui/search-input';
import { FileImage, FileVideo, FileAudio, FileArchive, File as FileIcon, FileText, FileSpreadsheet, FileCode } from 'lucide-react';

// Status & Icon Helpers
const statusConfig = {
  active: { label: 'نشط', className: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' },
  in_progress: { label: 'قيد التنفيذ', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  review: { label: 'قيد المراجعة', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  completed: { label: 'مكتمل', className: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' },
  archived: { label: 'مؤرشف', className: 'bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20' },
};

const approvalStatusConfig = {
  pending: { label: 'بانتظار المراجعة', className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20' },
  approved: { label: 'تمت الموافقة', className: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' },
  revision_requested: { label: 'مطلوب تعديل', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
};

function getFileIcon(fileType: string) {
  const type = fileType.toLowerCase();
  if (type.startsWith('image/')) return FileImage;
  if (type.startsWith('video/')) return FileVideo;
  if (type.startsWith('audio/')) return FileAudio;
  if (type.includes('zip') || type.includes('rar')) return FileArchive;
  if (type.includes('pdf') || type.includes('document')) return FileText;
  if (type.includes('sheet')) return FileSpreadsheet;
  if (type.includes('html') || type.includes('js')) return FileCode;
  return FileIcon;
}

export default function PortalProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('files');
  const [previewFile, setPreviewFile] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/projects/${projectId}`);
      const json = await res.json();
      if (res.ok && json.data) {
        const d = json.data;
        const approvalMap = new Map((d.file_approvals || []).map((a: any) => [a.file_id, { id: a.id, status: a.status, comment: a.comment, reviewed_at: a.reviewed_at }]));
        setProject({
          ...d.project,
          files: (d.project_files || []).map((f: any) => ({ ...f, file_type: f.mime_type, added_at: f.created_at, approval: approvalMap.get(f.id) })),
          comments: d.comments || [],
          linked_contract: d.linked_contract || null,
        });
      }
    } catch { toast.error('فشل في تحميل تفاصيل المشروع'); } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  if (loading) return <Skeleton className="h-full w-full" />;
  if (!project) return <div>لا يوجد مشروع</div>;

  return (
    <div className="space-y-6">
      <ProjectHeader name={project.name} description={project.description} status={project.status} statusConfig={statusConfig} linkedContract={project.linked_contract} />
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="files">الملفات</TabsTrigger>
          <TabsTrigger value="comments">التعليقات</TabsTrigger>
          <TabsTrigger value="progress">التقدم</TabsTrigger>
          <TabsTrigger value="activity">النشاط</TabsTrigger>
        </TabsList>
        <TabsContent value="files">
          <ProjectFilesList 
            files={project.files} 
            isNewFile={(d) => Date.now() - new Date(d).getTime() < 172800000}
            getFileIcon={getFileIcon}
            approvalStatusConfig={approvalStatusConfig}
            onComment={() => {}} onPreview={(f) => { setPreviewFile(f); setPreviewOpen(true); }}
            onDownload={(id) => window.open(`/api/portal/files/${id}/download`)}
            onApprove={() => {}} onRevision={() => {}}
          />
        </TabsContent>
        <TabsContent value="comments">
          <ProjectComments comments={project.comments} files={project.files} search="" authorFilter="all" fileFilter="all" renderTextWithMentions={(t) => renderTextWithMentions(t, 'portal')} />
        </TabsContent>
        <TabsContent value="progress"><ProjectPipelineProgress projectId={projectId} /></TabsContent>
        <TabsContent value="activity"><ActivityTimeline project={project} /></TabsContent>
      </Tabs>
      <FilePreview mode="portal" portalFile={previewFile} open={previewOpen} onOpenChange={setPreviewOpen} />
    </div>
  );
}
