'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { useBoards, useCreateBoard } from '@/hooks/useBoards';
import { useQueryClient } from '@tanstack/react-query';
import { hasPermission } from '@/lib/auth/rbac';
import {
  Kanban, Plus, Briefcase, GitBranch, List, LayoutGrid, Star,
  Layout, FileText, Palette, Megaphone, Video, Share2,
} from 'lucide-react';
import { BOARD_TEMPLATES } from '@/lib/config/board-templates';
import type { AuthSession } from '@/lib/auth/guards';
import type { LucideIcon } from 'lucide-react';

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  Layout, FileText, Palette, Megaphone, Video, Share2,
};

interface Board {
  id: string;
  name: string;
  description: string | null;
  template: string | null;
  project_id: string | null;
  view_mode?: string;
  is_pipeline?: boolean;
  created_at: string;
  pyra_projects?: { name: string } | null;
  pyra_board_columns?: { id: string }[];
}

interface BoardsClientProps {
  session: AuthSession;
}

export default function BoardsClient({ session }: BoardsClientProps) {
  const queryClient = useQueryClient();
  const { data: boardsData, isLoading: loading } = useBoards();
  const boards: Board[] = (boardsData as Board[] | undefined) || [];
  const createBoardMutation = useCreateBoard();
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('general');
  const [viewMode, setViewMode] = useState<'kanban' | 'pipeline'>('kanban');
  const canManage = hasPermission(session.pyraUser.rolePermissions, 'boards.manage');

  const toggleStar = async (boardId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch(`/api/boards/${boardId}/star`, { method: 'POST' });
      const json = await res.json();
      if (json.data?.starred) {
        setStarredIds(prev => new Set([...prev, boardId]));
        toast.success('تم إضافة اللوحة للمفضلة');
      } else {
        setStarredIds(prev => { const n = new Set(prev); n.delete(boardId); return n; });
        toast.success('تم إزالة اللوحة من المفضلة');
      }
    } catch { toast.error('فشل'); }
  };


  // Sort: starred first
  const sortedBoards = [...boards].sort((a, b) => {
    const aS = starredIds.has(a.id) ? 0 : 1;
    const bS = starredIds.has(b.id) ? 0 : 1;
    return aS - bS;
  });

  const createBoard = async () => {
    if (!newName.trim()) return;
    try {
      await createBoardMutation.mutateAsync({
        name: newName,
        description: newDesc,
        template: selectedTemplate,
        view_mode: viewMode,
        is_pipeline: viewMode === 'pipeline',
      } as Parameters<typeof createBoardMutation.mutateAsync>[0]);
      toast.success('تم إنشاء اللوحة بنجاح');
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      setSelectedTemplate('general');
    } catch {
      toast.error('فشل إنشاء اللوحة');
    }
  };
  const creating = createBoardMutation.isPending;

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{'\u0644\u0648\u062D\u0627\u062A \u0627\u0644\u0639\u0645\u0644'}</h1>
          <p className="text-sm text-muted-foreground">{boards.length} {'\u0644\u0648\u062D\u0629'}</p>
        </div>
        {canManage && (
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="h-4 w-4 me-2" />
                {'\u0644\u0648\u062D\u0629 \u062C\u062F\u064A\u062F\u0629'}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{'\u0625\u0646\u0634\u0627\u0621 \u0644\u0648\u062D\u0629 \u0639\u0645\u0644 \u062C\u062F\u064A\u062F\u0629'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{'\u0627\u0633\u0645 \u0627\u0644\u0644\u0648\u062D\u0629'}</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={'\u0645\u062B\u0627\u0644: \u0645\u0647\u0627\u0645 \u0627\u0644\u062A\u0635\u0645\u064A\u0645'}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{'\u0627\u0644\u0648\u0635\u0641 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)'}</label>
                  <Input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder={'\u0648\u0635\u0641 \u0645\u062E\u062A\u0635\u0631...'}
                  />
                </div>
                {/* View Mode */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">نوع العرض</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setViewMode('kanban')}
                      className={`p-3 rounded-lg border text-start transition-colors flex items-center gap-2 ${
                        viewMode === 'kanban'
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-border hover:border-orange-300'
                      }`}
                    >
                      <LayoutGrid className="h-5 w-5 text-orange-500" />
                      <div>
                        <p className="text-sm font-medium">كانبان</p>
                        <p className="text-[10px] text-muted-foreground">أعمدة مرنة بسحب وإفلات</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setViewMode('pipeline')}
                      className={`p-3 rounded-lg border text-start transition-colors flex items-center gap-2 ${
                        viewMode === 'pipeline'
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-border hover:border-emerald-300'
                      }`}
                    >
                      <GitBranch className="h-5 w-5 text-emerald-500" />
                      <div>
                        <p className="text-sm font-medium">Pipeline</p>
                        <p className="text-[10px] text-muted-foreground">مراحل تسلسلية مع متابعة التقدم</p>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">{'\u0627\u062E\u062A\u0631 \u0642\u0627\u0644\u0628'}</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {BOARD_TEMPLATES.map((t) => {
                      const Icon = TEMPLATE_ICONS[t.icon] || Layout;
                      return (
                        <button
                          key={t.key}
                          onClick={() => setSelectedTemplate(t.key)}
                          className={`p-3 rounded-lg border text-start transition-colors ${
                            selectedTemplate === t.key
                              ? 'border-orange-500 bg-orange-500/10'
                              : 'border-border hover:border-orange-300'
                          }`}
                        >
                          <Icon className="h-5 w-5 mb-1 text-orange-500" />
                          <p className="text-sm font-medium">{t.nameAr}</p>
                          <p className="text-[10px] text-muted-foreground">{t.descriptionAr}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Button
                  onClick={createBoard}
                  disabled={creating || !newName.trim()}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {creating ? '\u062C\u0627\u0631\u064A \u0627\u0644\u0625\u0646\u0634\u0627\u0621...' : '\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0644\u0648\u062D\u0629'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {boards.length === 0 ? (
        <EmptyState
          icon={Kanban}
          title={'\u0644\u0627 \u062A\u0648\u062C\u062F \u0644\u0648\u062D\u0627\u062A \u0639\u0645\u0644'}
          description={'\u0623\u0646\u0634\u0626 \u0644\u0648\u062D\u0629 \u0639\u0645\u0644 \u062C\u062F\u064A\u062F\u0629 \u0644\u0628\u062F\u0621 \u062A\u0646\u0638\u064A\u0645 \u0627\u0644\u0645\u0647\u0627\u0645'}
          actionLabel={canManage ? '\u0644\u0648\u062D\u0629 \u062C\u062F\u064A\u062F\u0629' : undefined}
          onAction={canManage ? () => setShowCreate(true) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedBoards.map((board) => (
            <Link key={board.id} href={`/dashboard/boards/${board.id}`}>
              <Card className="hover:border-orange-300 dark:hover:border-orange-700 transition-all cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <button onClick={(e) => toggleStar(board.id, e)} className="shrink-0">
                        <Star className={`h-4 w-4 transition-colors ${starredIds.has(board.id) ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground/30 hover:text-yellow-400'}`} />
                      </button>
                      <CardTitle className="text-base truncate">{board.name}</CardTitle>
                    </div>
                    {board.is_pipeline ? (
                      <GitBranch className="h-5 w-5 text-emerald-500 shrink-0" />
                    ) : (
                      <Kanban className="h-5 w-5 text-orange-500 shrink-0" />
                    )}
                  </div>
                  {board.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{board.description}</p>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {board.pyra_projects && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Briefcase className="h-3 w-3 me-1" />
                        {board.pyra_projects.name}
                      </Badge>
                    )}
                    {board.is_pipeline && (
                      <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                        Pipeline
                      </Badge>
                    )}
                    {board.pyra_board_columns && (
                      <Badge variant="outline" className="text-[10px]">
                        {board.pyra_board_columns.length} {board.is_pipeline ? 'مراحل' : '\u0623\u0639\u0645\u062F\u0629'}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
