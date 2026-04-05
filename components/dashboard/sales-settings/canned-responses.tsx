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

interface ButtonItem {
  buttonId: string;
  buttonText: string;
}

interface Template {
  id: string;
  title: string;
  content: string;
  category: string;
  shortcut: string | null;
  type?: 'text' | 'button';
  button_config?: {
    buttons: ButtonItem[];
    footerText?: string;
  } | null;
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
  const [templateType, setTemplateType] = useState<'text' | 'button'>('text');
  const [buttons, setButtons] = useState<ButtonItem[]>([{ buttonId: 'btn_1', buttonText: '' }]);
  const [footerText, setFooterText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd() {
    if (!title.trim() || !content.trim()) {
      toast.error('العنوان والمحتوى مطلوبين');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        content: content.trim(),
        category: category.trim() || 'general',
        shortcut: shortcut.trim() || null,
        type: templateType,
      };
      if (templateType === 'button') {
        const validButtons = buttons.filter(b => b.buttonText.trim());
        if (validButtons.length === 0) {
          toast.error('أضف زر واحد على الأقل');
          setSaving(false);
          return;
        }
        payload.button_config = {
          buttons: validButtons.map((b, i) => ({
            buttonId: b.buttonId || `btn_${i + 1}`,
            buttonText: b.buttonText.trim(),
          })),
          footerText: footerText.trim() || undefined,
        };
      }
      await mutateAPI('/api/dashboard/sales/whatsapp/templates', 'POST', payload);
      toast.success('تم إضافة الرد الجاهز');
      setTitle(''); setContent(''); setShortcut(''); setTemplateType('text');
      setButtons([{ buttonId: 'btn_1', buttonText: '' }]); setFooterText('');
      setShowAdd(false);
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
            {/* Type selector */}
            <div className="space-y-1">
              <Label className="text-xs">النوع</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTemplateType('text')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${templateType === 'text' ? 'bg-orange-500 text-white border-orange-500' : 'border-border hover:bg-muted/30'}`}
                >
                  نص
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateType('button')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${templateType === 'button' ? 'bg-orange-500 text-white border-orange-500' : 'border-border hover:bg-muted/30'}`}
                >
                  أزرار تفاعلية
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">المحتوى</Label>
              <Textarea value={content} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)} placeholder="نص الرد الجاهز..." rows={3} />
            </div>
            {/* Button editor — only shown for button type */}
            {templateType === 'button' && (
              <div className="space-y-2 p-3 rounded-lg border border-orange-200/50 dark:border-orange-800/30 bg-orange-50/30 dark:bg-orange-950/10">
                <Label className="text-xs font-semibold">الأزرار (حتى 3)</Label>
                {buttons.map((btn, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={btn.buttonText}
                      onChange={e => {
                        const updated = [...buttons];
                        updated[idx] = { ...btn, buttonText: e.target.value };
                        setButtons(updated);
                      }}
                      placeholder={`نص الزر ${idx + 1}`}
                      className="flex-1"
                    />
                    {buttons.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive shrink-0"
                        onClick={() => setButtons(buttons.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                {buttons.length < 3 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setButtons([...buttons, { buttonId: `btn_${buttons.length + 1}`, buttonText: '' }])}
                    className="text-xs"
                  >
                    <Plus className="h-3 w-3 me-1" />
                    إضافة زر
                  </Button>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">نص التذييل (اختياري)</Label>
                  <Input value={footerText} onChange={e => setFooterText(e.target.value)} placeholder="مثال: Pyramedia X" />
                </div>
              </div>
            )}
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
                        {t.type === 'button' && (
                          <Badge className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">أزرار</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{t.content}</p>
                      {t.type === 'button' && t.button_config?.buttons && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {t.button_config.buttons.map((btn, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/30">
                              {btn.buttonText}
                            </span>
                          ))}
                        </div>
                      )}
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
