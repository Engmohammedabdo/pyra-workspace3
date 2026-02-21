'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowRight, Save, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/* ───────────────────────── Types ───────────────────────── */

interface Category {
  id: string;
  name: string;
}

/* ───────────────────────── Component ──────────────────── */

export default function NewArticlePage() {
  const router = useRouter();

  /* ── categories ── */
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  /* ── form ── */
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  /* ── submit ── */
  const [saving, setSaving] = useState(false);

  /* ── fetch categories ── */
  useEffect(() => {
    fetch('/api/kb/categories')
      .then(r => r.json())
      .then(json => {
        if (json.data) setCategories(json.data);
      })
      .catch(() => toast.error('فشل في تحميل التصنيفات'))
      .finally(() => setLoadingCategories(false));
  }, []);

  /* ── save ── */
  const handleSave = async () => {
    if (!categoryId) {
      toast.error('يرجى اختيار التصنيف');
      return;
    }
    if (!title.trim()) {
      toast.error('عنوان المقالة مطلوب');
      return;
    }
    if (!content.trim()) {
      toast.error('محتوى المقالة مطلوب');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/kb/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: categoryId,
          title: title.trim(),
          content: content.trim(),
          excerpt: excerpt.trim() || null,
          is_public: isPublic,
        }),
      });
      const json = await res.json();

      if (json.error) {
        toast.error(json.error);
        return;
      }

      toast.success('تم إنشاء المقالة');
      router.push('/dashboard/knowledge-base');
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/knowledge-base">
          <Button variant="ghost" size="icon">
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">مقالة جديدة</h1>
          <p className="text-muted-foreground text-sm">إنشاء مقالة جديدة في قاعدة المعرفة</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">محتوى المقالة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>العنوان *</Label>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="عنوان المقالة"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>المحتوى * (Markdown)</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    {showPreview ? (
                      <><EyeOff className="h-3.5 w-3.5 me-1" /> تحرير</>
                    ) : (
                      <><Eye className="h-3.5 w-3.5 me-1" /> معاينة</>
                    )}
                  </Button>
                </div>
                {showPreview ? (
                  <Card className="min-h-[400px] p-4">
                    <div className="prose prose-sm dark:prose-invert max-w-none" dir="ltr">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {content || '*لا يوجد محتوى للمعاينة*'}
                      </ReactMarkdown>
                    </div>
                  </Card>
                ) : (
                  <Textarea
                    value={content}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
                    placeholder="اكتب المحتوى باستخدام Markdown..."
                    rows={20}
                    dir="ltr"
                    className="font-mono text-sm"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label>المقتطف</Label>
                <Textarea
                  value={excerpt}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setExcerpt(e.target.value)}
                  placeholder="وصف مختصر يظهر في قائمة المقالات..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">الإعدادات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>التصنيف *</Label>
                <Select value={categoryId} onValueChange={setCategoryId} disabled={loadingCategories}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingCategories ? 'جارٍ التحميل...' : 'اختر التصنيف'} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is-public"
                  checked={isPublic}
                  onChange={e => setIsPublic(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="is-public">عام (ظاهر في بوابة العملاء)</Label>
              </div>

              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-orange-500 hover:bg-orange-600"
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 me-2 animate-spin" /> جارٍ الحفظ...</>
                ) : (
                  <><Save className="h-4 w-4 me-2" /> حفظ المقالة</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
