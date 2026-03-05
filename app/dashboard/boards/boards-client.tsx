'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { hasPermission } from '@/lib/auth/rbac';
import {
  Kanban, Plus, Briefcase,
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
  created_at: string;
  pyra_projects?: { name: string } | null;
  pyra_board_columns?: { id: string }[];
}

interface BoardsClientProps {
  session: AuthSession;
}

export default function BoardsClient({ session }: BoardsClientProps) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('general');
  const canManage = hasPermission(session.pyraUser.rolePermissions, 'boards.manage');

  const fetchBoards = useCallback(async () => {
    try {
      const res = await fetch('/api/boards');
      if (res.ok) {
        const { data } = await res.json();
        setBoards(data || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBoards(); }, [fetchBoards]);

  const createBoard = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, description: newDesc, template: selectedTemplate }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0644\u0648\u062D\u0629 \u0628\u0646\u062C\u0627\u062D');
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      setSelectedTemplate('general');
      fetchBoards();
    } catch {
      toast.error('\u0641\u0634\u0644 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0644\u0648\u062D\u0629');
    } finally {
      setCreating(false);
    }
  };

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
                <div className="space-y-2">
                  <label className="text-sm font-medium">{'\u0627\u062E\u062A\u0631 \u0642\u0627\u0644\u0628'}</label>
                  <div className="grid grid-cols-2 gap-2">
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
          {boards.map((board) => (
            <Link key={board.id} href={`/dashboard/boards/${board.id}`}>
              <Card className="hover:border-orange-300 dark:hover:border-orange-700 transition-all cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{board.name}</CardTitle>
                    <Kanban className="h-5 w-5 text-orange-500" />
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
                    {board.pyra_board_columns && (
                      <Badge variant="outline" className="text-[10px]">
                        {board.pyra_board_columns.length} {'\u0623\u0639\u0645\u062F\u0629'}
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
