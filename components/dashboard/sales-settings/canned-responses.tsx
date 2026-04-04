'use client';

import { useState } from 'react';
import { mutateAPI } from '@/hooks/api-helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Plus, Trash2, Save, MessageSquareText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Template {
  id: string;
  title: string;
  content: string;
  category: string;
  shortcut: string | null;
}

interface Props {
  templates: Template[];
  onRefresh: () => void;
}

export function CannedResponsesManager({ templates, onRefresh }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [shortcut, setShortcut] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd() {
    if (!title.trim() || !content.trim()) {
      toast.error('العنوان والمحتوى مطلوبين');
      return;
    }
    setSaving(true);
    try {
      await mutateAPI('/api/dashboard/sales/whatsapp/templates', 'POST', {
        title: title.trim(),
        content: content.trim(),
        category: category.trim() || 'general',
        shortcut: shortcut.trim() || null,
      });
      toast.success('تم إضافة الرد الجاهز');
      setTitle(''); setContent(''); setShortcut(''); setShowAdd(false);
      onRefresh();
    } catch {
      toast.error('فشل الإضافة');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await mutateAPI('/api/dashboard/sales/whatsapp/templates', 'DELETE', { id });
      toast.success('تم الحذف');
      onRefresh();
    } catch {
      toast.error('فشل الحذف');
    } finally {
      setDeletingId(null);
    }
  }

  const categories = [...new Set(templates.map(t => t.category))];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-orange-500" />
          الردود الجاهزة
        </CardTitle>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)} className="bg-orange-500 hover:bg-orange-600 text-white">
          <Plus className="h-4 w-4 me-1" />
          إضافة رد
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          الردود الجاهزة تظهر في الشات عند الضغط على أيقونة الردود السريعة أو كتابة <kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]">/</kbd> في مربع الرسائل
        </p>

        {/* Add Form */}
        {showAdd && (
          <div className="border rounded-xl p-4 space-y-3 bg-muted/20">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">العنوان</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="مثال: ترحيب" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">اختصار (اختياري)</Label>
                <Input value={shortcut} onChange={e => setShortcut(e.target.value)} placeholder="مثال: hi" dir="ltr" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">المحتوى</Label>
              <Textarea value={content} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)} placeholder="نص الرد الجاهز..." rows={3} />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={saving} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin me-1" /> : <Save className="h-3.5 w-3.5 me-1" />}
                حفظ
              </Button>
              <Button onClick={() => setShowAdd(false)} variant="outline" size="sm">إلغاء</Button>
            </div>
          </div>
        )}

        {/* Templates List */}
        {templates.length === 0 ? (
          <EmptyState
            icon={MessageSquareText}
            title="لا توجد ردود جاهزة"
            description="أضف ردود جاهزة لتسريع التواصل عبر الشات"
          />
        ) : (
          <div className="space-y-2">
            {categories.map(cat => (
              <div key={cat}>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">{cat === 'general' ? 'عام' : cat}</p>
                {templates.filter(t => t.category === cat).map(t => (
                  <div key={t.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm">{t.title}</span>
                        {t.shortcut && (
                          <Badge variant="secondary" className="text-[10px] font-mono">/{t.shortcut}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{t.content}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive shrink-0"
                      onClick={() => handleDelete(t.id)}
                      disabled={deletingId === t.id}
                      aria-label="حذف"
                    >
                      {deletingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
