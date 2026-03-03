'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FolderInput,
  Copy,
  Tags,
  Download,
  Trash2,
  X,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

interface BulkActionsBarProps {
  selectedCount: number;
  selectedPaths: string[];
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  onBatchDownload: () => void;
  onMoveSelected: (destination: string) => void;
  isBatchDownloading?: boolean;
  currentPath: string;
}

const TAG_COLORS = [
  { value: '#f97316', label: 'برتقالي' },
  { value: '#ef4444', label: 'أحمر' },
  { value: '#22c55e', label: 'أخضر' },
  { value: '#3b82f6', label: 'أزرق' },
  { value: '#8b5cf6', label: 'بنفسجي' },
  { value: '#ec4899', label: 'وردي' },
  { value: '#6b7280', label: 'رمادي' },
];

export function BulkActionsBar({
  selectedCount,
  selectedPaths,
  onClearSelection,
  onDeleteSelected,
  onBatchDownload,
  onMoveSelected,
  isBatchDownloading,
  currentPath,
}: BulkActionsBarProps) {
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [destination, setDestination] = useState('');
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#f97316');
  const [processing, setProcessing] = useState(false);

  if (selectedCount < 2) return null;

  const handleMove = () => {
    if (!destination.trim()) return;
    onMoveSelected(destination.trim());
    setShowMoveDialog(false);
    setDestination('');
  };

  const handleCopy = async () => {
    if (!destination.trim()) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/files/copy-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paths: selectedPaths,
          destination: destination.trim(),
        }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success(`تم نسخ ${json.data?.copied || selectedPaths.length} ملف`);
        onClearSelection();
      }
      setShowCopyDialog(false);
      setDestination('');
    } catch {
      toast.error('حدث خطأ أثناء النسخ');
    } finally {
      setProcessing(false);
    }
  };

  const handleTag = async () => {
    if (!tagName.trim()) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/files/tag-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paths: selectedPaths,
          tag_name: tagName.trim(),
          color: tagColor,
        }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success(`تم إضافة وسم "${tagName.trim()}" إلى ${json.data?.tagged || selectedPaths.length} ملف`);
      }
      setShowTagDialog(false);
      setTagName('');
    } catch {
      toast.error('حدث خطأ أثناء إضافة الوسوم');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      {/* Floating bar */}
      <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center pointer-events-none animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-card/95 backdrop-blur-md border shadow-xl rounded-2xl px-4 py-3 flex items-center gap-3 pointer-events-auto">
          {/* Count */}
          <div className="flex items-center gap-2 pe-3 border-e">
            <span className="text-sm font-bold text-orange-500 tabular-nums">{selectedCount}</span>
            <span className="text-sm text-muted-foreground">محدد</span>
          </div>

          {/* Actions */}
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => { setDestination(currentPath); setShowMoveDialog(true); }}
          >
            <FolderInput className="h-4 w-4" />
            <span className="hidden sm:inline">نقل</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => { setDestination(currentPath); setShowCopyDialog(true); }}
          >
            <Copy className="h-4 w-4" />
            <span className="hidden sm:inline">نسخ</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setShowTagDialog(true)}
          >
            <Tags className="h-4 w-4" />
            <span className="hidden sm:inline">وسم</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5"
            onClick={onBatchDownload}
            disabled={isBatchDownloading}
          >
            {isBatchDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">تحميل</span>
          </Button>

          <div className="border-s ps-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 text-destructive hover:text-destructive"
              onClick={onDeleteSelected}
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">حذف</span>
            </Button>
          </div>

          {/* Clear */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onClearSelection}
            title="إلغاء التحديد"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Move Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>نقل {selectedCount} ملف</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>المجلد الوجهة</Label>
            <Input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="مثال: projects/folder-name"
              dir="ltr"
              onKeyDown={(e) => { if (e.key === 'Enter') handleMove(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMoveDialog(false)}>إلغاء</Button>
            <Button onClick={handleMove} disabled={!destination.trim()}>نقل</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy Dialog */}
      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>نسخ {selectedCount} ملف</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>المجلد الوجهة</Label>
            <Input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="مثال: projects/folder-name"
              dir="ltr"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCopy(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCopyDialog(false)}>إلغاء</Button>
            <Button onClick={handleCopy} disabled={!destination.trim() || processing}>
              {processing ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : null}
              نسخ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tag Dialog */}
      <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة وسم لـ {selectedCount} ملف</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>اسم الوسم</Label>
              <Input
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="مثال: مهم"
                onKeyDown={(e) => { if (e.key === 'Enter') handleTag(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>اللون</Label>
              <div className="flex items-center gap-2">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setTagColor(c.value)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      tagColor === c.value ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTagDialog(false)}>إلغاء</Button>
            <Button onClick={handleTag} disabled={!tagName.trim() || processing}>
              {processing ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : null}
              إضافة وسم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
