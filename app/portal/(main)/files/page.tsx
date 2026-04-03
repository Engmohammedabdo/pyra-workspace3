'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { RefreshCw, LayoutGrid, List, PackageCheck, Loader2, FolderOpen, Home, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput } from '@/components/ui/search-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { usePortalFavorites } from '@/hooks/usePortalFavorites';
import { FilePreview } from '@/components/files/file-preview';
import { resolveMimeType } from '@/lib/utils/mime';

import { FileWithProject, FileTag } from '@/components/portal/files/types';
import { FileCard } from '@/components/portal/files/FileCard';
import { FileRow } from '@/components/portal/files/FileRow';
import { FolderCard } from '@/components/portal/files/FolderCard';
import { getItemsAtLevel, formatSegmentName } from '@/components/portal/files/utils';

// Filter options
const approvalFilterOptions = [
  { value: 'all', label: 'جميع الحالات' },
  { value: 'pending', label: 'بانتظار المراجعة' },
  { value: 'approved', label: 'تمت الموافقة' },
  { value: 'revision_requested', label: 'مطلوب تعديل' },
];

export default function PortalFilesPage() {
  const [files, setFiles] = useState<FileWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPath, setCurrentPath] = useState<string[]>([]);

  // Revision dialog
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [revisionFileId, setRevisionFileId] = useState<string | null>(null);
  const [revisionComment, setRevisionComment] = useState('');
  const [revisionLoading, setRevisionLoading] = useState(false);

  // Approve loading
  const [approveLoading, setApproveLoading] = useState<string | null>(null);

  // File preview
  const [previewFile, setPreviewFile] = useState<FileWithProject | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Favorites & bulk download
  const { toggleFavorite, isFavorite } = usePortalFavorites();
  const [bulkDownloading, setBulkDownloading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('portal-files-view');
    if (saved === 'list' || saved === 'grid') setViewMode(saved);
  }, []);

  const toggleViewMode = useCallback((mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('portal-files-view', mode);
  }, []);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/files');
      const json = await res.json();
      if (res.ok && json.data) {
        const mapped: FileWithProject[] = (json.data as Array<Record<string, unknown>>).map((f) => {
          const fileName = f.file_name as string;
          const storedMime = (f.mime_type || f.file_type || null) as string | null;
          return {
            id: f.id as string,
            file_name: fileName,
            file_type: resolveMimeType(fileName, storedMime),
            file_path: (f.file_path || '') as string,
            file_size: f.file_size as number | undefined,
            added_at: (f.created_at || f.added_at) as string,
            project_id: f.project_id as string,
            project_name: f.project_name as string,
            approval: f.approval as FileWithProject['approval'],
            tags: (f.tags as FileTag[] | undefined) || [],
          };
        });
        setFiles(mapped);
      }
    } catch {
      toast.error('فشل في تحميل الملفات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of files) {
      if (!map.has(f.project_id)) map.set(f.project_id, f.project_name);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [files]);

  const filteredFiles = useMemo(() => {
    let list = files;
    if (projectFilter !== 'all') list = list.filter((f) => f.project_id === projectFilter);
    if (statusFilter !== 'all') {
      list = list.filter((f) => {
        if (statusFilter === 'pending') return !f.approval || f.approval.status === 'pending';
        return f.approval?.status === statusFilter;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => f.file_name.toLowerCase().includes(q));
    }
    return list;
  }, [files, projectFilter, statusFilter, search]);

  const levelContents = useMemo(
    () => getItemsAtLevel(filteredFiles, currentPath),
    [filteredFiles, currentPath]
  );

  async function handleApprove(fileId: string) {
    setApproveLoading(fileId);
    try {
      const res = await fetch(`/api/portal/files/${fileId}/approve`, { method: 'POST' });
      if (res.ok) {
        toast.success('تمت الموافقة على الملف بنجاح');
        await fetchFiles();
      } else {
        toast.error('حدث خطأ أثناء الموافقة على الملف');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setApproveLoading(null);
    }
  }

  async function handleRevisionSubmit() {
    if (!revisionFileId || !revisionComment.trim()) return;
    setRevisionLoading(true);
    try {
      const res = await fetch(`/api/portal/files/${revisionFileId}/revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: revisionComment.trim() }),
      });
      if (res.ok) {
        toast.success('تم إرسال طلب التعديل بنجاح');
        setRevisionDialogOpen(false);
        setRevisionComment('');
        setRevisionFileId(null);
        await fetchFiles();
      } else {
        toast.error('حدث خطأ أثناء إرسال طلب التعديل');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setRevisionLoading(false);
    }
  }

  function handleDownload(fileId: string) {
    window.open(`/api/portal/files/${fileId}/download`, '_blank');
  }

  async function handleBulkDownload() {
    const itemsAtLevel = getItemsAtLevel(files, currentPath);
    if (itemsAtLevel.files.length === 0 && itemsAtLevel.folders.length === 0) {
      toast.error('لا توجد ملفات للتحميل');
      return;
    }

    setBulkDownloading(true);
    try {
      const res = await fetch('/api/portal/files/bulk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: currentPath }),
      });

      if (!res.ok) {
        toast.error('فشل في التحميل');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentPath.length > 0 ? currentPath[currentPath.length - 1] : 'files'}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('تم تحميل الملفات بنجاح');
    } catch {
      toast.error('حدث خطأ أثناء التحميل');
    } finally {
      setBulkDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56 mt-2" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in-0 duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold">الملفات</h1>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchFiles} aria-label="تحديث">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleBulkDownload} disabled={bulkDownloading} className="gap-2">
            {bulkDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            <span className="hidden sm:inline">تحميل الكل</span>
          </Button>
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
            <button onClick={() => toggleViewMode('grid')} className={cn('p-2 rounded-md', viewMode === 'grid' ? 'bg-background shadow-sm' : '')}><LayoutGrid className="h-4 w-4" /></button>
            <button onClick={() => toggleViewMode('list')} className={cn('p-2 rounded-md', viewMode === 'list' ? 'bg-background shadow-sm' : '')}><List className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end flex-wrap">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">المشروع</Label>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع المشاريع</SelectItem>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">الحالة</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {approvalFilterOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="ابحث..." className="w-full sm:w-64 sm:ms-auto" />
      </div>

      {currentPath.length > 0 && (
        <div className="flex items-center gap-1.5 text-sm flex-wrap">
          <button onClick={() => setCurrentPath([])} className="flex items-center gap-1 text-portal hover:text-portal-secondary"><Home className="h-3.5 w-3.5" /> الكل</button>
          {currentPath.map((segment, idx) => (
            <span key={idx} className="flex items-center gap-1.5">
              <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
              {idx === currentPath.length - 1 ? <span className="font-semibold">{formatSegmentName(segment)}</span> : <button onClick={() => setCurrentPath(currentPath.slice(0, idx + 1))} className="text-portal">{formatSegmentName(segment)}</button>}
            </span>
          ))}
        </div>
      )}

      {filteredFiles.length === 0 ? (
        <EmptyState icon={FolderOpen} title="لا توجد ملفات" />
      ) : levelContents.folders.length === 0 && levelContents.files.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-12"><FolderOpen className="h-10 w-10 text-muted-foreground/40" /></CardContent></Card>
      ) : (
        <div className="space-y-6">
          {levelContents.folders.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {levelContents.folders.map((folder) => <FolderCard key={folder.name} folder={folder} onClick={() => setCurrentPath([...currentPath, folder.name])} />)}
            </div>
          )}
          {levelContents.files.length > 0 && (
            viewMode === 'grid' 
              ? <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">{levelContents.files.map((file) => <FileCard key={file.id} file={file} onPreview={() => { setPreviewFile(file); setPreviewOpen(true); }} onDownload={() => handleDownload(file.id)} onApprove={() => handleApprove(file.id)} onRevision={() => { setRevisionFileId(file.id); setRevisionDialogOpen(true); }} approveLoading={approveLoading === file.id} onToggleFavorite={() => toggleFavorite({ id: file.id, type: 'file', name: file.file_name })} favorited={isFavorite(file.id, 'file')} />)}</div>
              : <Card className="overflow-hidden">{levelContents.files.map((file) => <FileRow key={file.id} file={file} onPreview={() => { setPreviewFile(file); setPreviewOpen(true); }} onDownload={() => handleDownload(file.id)} onApprove={() => handleApprove(file.id)} onRevision={() => { setRevisionFileId(file.id); setRevisionDialogOpen(true); }} approveLoading={approveLoading === file.id} />)}</Card>
          )}
        </div>
      )}

      <Dialog open={revisionDialogOpen} onOpenChange={setRevisionDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>طلب تعديل</DialogTitle></DialogHeader>
          <textarea value={revisionComment} onChange={(e) => setRevisionComment(e.target.value)} className="w-full h-32 border p-2 rounded" placeholder="الملاحظات..." />
          <DialogFooter><Button onClick={handleRevisionSubmit} disabled={revisionLoading}>إرسال</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <FilePreview mode="portal" portalFile={previewFile ? { id: previewFile.id, file_name: previewFile.file_name, file_type: previewFile.file_type, file_size: previewFile.file_size } : null} open={previewOpen} onOpenChange={setPreviewOpen} />
    </div>
  );
}
