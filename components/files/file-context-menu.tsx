'use client';

import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Eye,
  Download,
  Pencil,
  Trash2,
  FolderInput,
  Copy,
  MoreVertical,
  Shield,
} from 'lucide-react';
import type { FileListItem } from '@/types/database';

interface FileContextMenuProps {
  file: FileListItem;
  children: React.ReactNode;
  onPreview: (file: FileListItem) => void;
  onDownload: (file: FileListItem) => void;
  onRename: (file: FileListItem, newName: string) => void;
  onDelete: (file: FileListItem) => void;
  onCopyPath: (file: FileListItem) => void;
  onPermissions?: (file: FileListItem) => void;
  isAdmin?: boolean;
}

export function FileContextMenu({
  file,
  children,
  onPreview,
  onDownload,
  onRename,
  onDelete,
  onCopyPath,
  onPermissions,
  isAdmin,
}: FileContextMenuProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const decodedName = decodeURIComponent(file.name);

  const handleRenameOpen = () => {
    setNewName(decodedName);
    setRenameOpen(true);
  };

  const handleRenameConfirm = () => {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== decodedName) {
      onRename(file, trimmed);
    }
    setRenameOpen(false);
  };

  const handleDeleteConfirm = () => {
    onDelete(file);
    setDeleteOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {!file.isFolder && (
            <DropdownMenuItem onClick={() => onPreview(file)}>
              <Eye className="me-2 h-4 w-4" />
              معاينة
            </DropdownMenuItem>
          )}
          {!file.isFolder && (
            <DropdownMenuItem onClick={() => onDownload(file)}>
              <Download className="me-2 h-4 w-4" />
              تحميل
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleRenameOpen}>
            <Pencil className="me-2 h-4 w-4" />
            إعادة تسمية
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCopyPath(file)}>
            <Copy className="me-2 h-4 w-4" />
            نسخ المسار
          </DropdownMenuItem>
          {isAdmin && onPermissions && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onPermissions(file)}>
                <Shield className="me-2 h-4 w-4" />
                صلاحيات
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="me-2 h-4 w-4" />
            حذف
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إعادة تسمية</DialogTitle>
            <DialogDescription>
              أدخل الاسم الجديد لـ &quot;{decodedName}&quot;
            </DialogDescription>
          </DialogHeader>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameConfirm();
            }}
            autoFocus
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleRenameConfirm} disabled={!newName.trim()}>
              تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف &quot;{decodedName}&quot;؟ سيتم نقله إلى سلة المحذوفات.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Inline action button for grid/list views
export function FileActionButton({
  file,
  onPreview,
  onDownload,
  onRename,
  onDelete,
  onCopyPath,
  onPermissions,
  isAdmin,
}: Omit<FileContextMenuProps, 'children'>) {
  return (
    <FileContextMenu
      file={file}
      onPreview={onPreview}
      onDownload={onDownload}
      onRename={onRename}
      onDelete={onDelete}
      onCopyPath={onCopyPath}
      onPermissions={onPermissions}
      isAdmin={isAdmin}
    >
      <button
        onClick={(e) => e.stopPropagation()}
        className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent"
      >
        <MoreVertical className="h-4 w-4 text-muted-foreground" />
      </button>
    </FileContextMenu>
  );
}
