'use client';

import { useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  FileText,
  MessageSquare,
  CheckCircle,
  Clock,
  AlertTriangle,
  GripVertical,
} from 'lucide-react';
import { formatFileSize } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface Project {
  id: string;
  name: string;
  description: string | null;
  client_company: string;
  status: string;
  created_by: string;
  created_at: string;
  file_count?: number;
  comment_count?: number;
  approved_count?: number;
  pending_count?: number;
  revision_count?: number;
  total_file_size?: number;
  unread_team_comments?: number;
}

interface ProjectKanbanProps {
  projects: Project[];
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  onStatusChange: (projectId: string, newStatus: string) => void;
}

const COLUMNS = [
  { id: 'active', label: 'نشط', color: 'bg-green-500', textColor: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-950/20' },
  { id: 'in_progress', label: 'قيد التنفيذ', color: 'bg-blue-500', textColor: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-950/20' },
  { id: 'review', label: 'مراجعة', color: 'bg-yellow-500', textColor: 'text-yellow-700 dark:text-yellow-400', bgColor: 'bg-yellow-50 dark:bg-yellow-950/20' },
  { id: 'completed', label: 'مكتمل', color: 'bg-emerald-500', textColor: 'text-emerald-700 dark:text-emerald-400', bgColor: 'bg-emerald-50 dark:bg-emerald-950/20' },
  { id: 'archived', label: 'مؤرشف', color: 'bg-gray-500', textColor: 'text-gray-700 dark:text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-950/20' },
];

export function ProjectKanban({ projects, onEdit, onDelete, onStatusChange }: ProjectKanbanProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const projectId = active.id as string;
    const targetColumn = over.id as string;

    // Find the project
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    // Only update if status actually changed
    if (project.status !== targetColumn && COLUMNS.some((c) => c.id === targetColumn)) {
      onStatusChange(projectId, targetColumn);
    }
  }, [projects, onStatusChange]);

  const activeProject = activeId ? projects.find((p) => p.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
        {COLUMNS.map((column) => {
          const columnProjects = projects.filter((p) => p.status === column.id);
          return (
            <KanbanColumn
              key={column.id}
              column={column}
              projects={columnProjects}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeProject ? (
          <ProjectCard project={activeProject} onEdit={onEdit} onDelete={onDelete} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ── Kanban Column ──
function KanbanColumn({
  column,
  projects,
  onEdit,
  onDelete,
}: {
  column: (typeof COLUMNS)[number];
  projects: Project[];
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-[280px] rounded-xl border transition-colors',
        column.bgColor,
        isOver && 'ring-2 ring-primary/50 border-primary/30'
      )}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2 p-3 border-b">
        <div className={cn('w-2.5 h-2.5 rounded-full', column.color)} />
        <h3 className={cn('text-sm font-semibold', column.textColor)}>{column.label}</h3>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ms-auto">
          {projects.length}
        </Badge>
      </div>

      {/* Cards */}
      <div className="p-2 space-y-2 min-h-[200px]">
        {projects.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            اسحب مشروعاً هنا
          </div>
        ) : (
          projects.map((project) => (
            <DraggableProjectCard
              key={project.id}
              project={project}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Draggable Wrapper ──
function DraggableProjectCard({
  project,
  onEdit,
  onDelete,
}: {
  project: Project;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.id,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && 'opacity-30')}
    >
      <ProjectCard
        project={project}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// ── Project Card ──
function ProjectCard({
  project,
  onEdit,
  onDelete,
  isDragging,
  dragHandleProps,
}: {
  project: Project;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
}) {
  return (
    <Card
      className={cn(
        'p-3 bg-card shadow-sm hover:shadow-md transition-shadow cursor-default',
        isDragging && 'shadow-xl rotate-2 scale-105'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        {dragHandleProps && (
          <button
            {...dragHandleProps}
            className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold truncate">{project.name}</h4>
          {project.client_company && (
            <p className="text-[11px] text-muted-foreground truncate">{project.client_company}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(project)}>
              <Pencil className="h-4 w-4 me-2" /> تعديل
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(project)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 me-2" /> حذف
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1.5">{project.description}</p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        {(project.file_count ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <FileText className="h-3 w-3" /> {project.file_count}
          </span>
        )}
        {(project.comment_count ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <MessageSquare className="h-3 w-3" /> {project.comment_count}
            {(project.unread_team_comments ?? 0) > 0 && (
              <Badge className="text-[8px] px-1 py-0 bg-orange-100 text-orange-600 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-900/30">
                {project.unread_team_comments}
              </Badge>
            )}
          </span>
        )}
        {(project.total_file_size ?? 0) > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {formatFileSize(project.total_file_size || 0)}
          </span>
        )}
      </div>

      {/* Approval Stats */}
      {((project.approved_count ?? 0) > 0 ||
        (project.pending_count ?? 0) > 0 ||
        (project.revision_count ?? 0) > 0) && (
        <div className="flex items-center gap-1.5 mt-2">
          {(project.approved_count ?? 0) > 0 && (
            <Badge className="text-[9px] px-1 py-0 bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle className="h-2.5 w-2.5 me-0.5" /> {project.approved_count}
            </Badge>
          )}
          {(project.pending_count ?? 0) > 0 && (
            <Badge className="text-[9px] px-1 py-0 bg-yellow-100 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400">
              <Clock className="h-2.5 w-2.5 me-0.5" /> {project.pending_count}
            </Badge>
          )}
          {(project.revision_count ?? 0) > 0 && (
            <Badge className="text-[9px] px-1 py-0 bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400">
              <AlertTriangle className="h-2.5 w-2.5 me-0.5" /> {project.revision_count}
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
}
