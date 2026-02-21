'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ArrowRight, Save, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils/format';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/* ───────────────────────── Types ───────────────────────── */

interface Category {
  id: string;
  name: string;
}

interface ArticleFull {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  is_public: boolean;
  sort_order: number;
  view_count: number;
  author: string | null;
  author_display_name: string | null;
  created_at: string;
  updated_at: string | null;
}

/* ───────────────────────── Component ──────────────────── */

export default function EditArticlePage() {
  const router = useRouter();
  const params = useParams();
  const articleId = params.id as string;

  /* ── data ── */
  const [article, setArticle] = useState<ArticleFull | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);

  /* ── form ── */
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  /* ── submit ── */
  const [saving, setSaving] = useState(false);

  /* ── delete ── */
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* ── fetch article ── */
  useEffect(() => {
    if (!articleId) return;
    setLoading(true);
    fetch(`/api/kb/articles/${articleId}`)
      .then(r => r.json())
      .then(json => {
        if (json.data) {
          const a = json.data as ArticleFull;
          setArticle(a);
          setCategoryId(a.category_id);
          setTitle(a.title);
          setContent(a.content);
          setExcerpt(a.excerpt || '');
          setIsPublic(a.is_public);
          setSortOrder(a.sort_order);
        } else {
          toast.error('المقالة غير موجودة');
          router.push('/dashboard/knowledge-base');
        }
      })
      .catch(() => toast.error('فشل في تحميل المقالة'))
      .finally(() => setLoading(false));
  }, [articleId, router]);

  /* ── fetch categories ── */
  useEffect(() => {
    fetch('/api/kb/categories')
      .then(r => r.json())
      .then(json => {
        if (json.data) setCategories(json.data);
      })
      .catch(() => {})
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
      const res = await fetch(`/api/kb/articles/${articleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: categoryId,
          title: title.trim(),
          content: content.trim(),
          excerpt: excerpt.trim() || null,
          is_public: isPublic,
          sort_order: sortOrder,
        }),
      });
      const json = await res.json();

      if (json.error) {
        toast.error(json.error);
        return;
      }

      toast.success('تم تحديث المقالة');
      router.push('/dashboard/knowledge-base');
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  /* ── delete ── */
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/kb/articles/${articleId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        return;
      }
      toast.success('تم حذف المقالة');
      router.push('/dashboard/knowledge-base');
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setDeleting(false);
    }
  };

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Skeleton className="h-[500px]" />
          </div>
          <Skeleton className="h-[300px]" />
        </div>
      </div>
    );
  }

  if (!article) return null;

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/knowledge-base">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">تعديل المقالة</h1>
            <p className="text-muted-foreground text-sm">{article.title}</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={() => setShowDelete(true)}
        >
          <Trash2 className="h-4 w-4 me-2" /> حذف
        </Button>
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

              <div className="space-y-2">
                <Label>الترتيب</Label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={e => setSortOrder(parseInt(e.target.value) || 0)}
                  min={0}
                />
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
                  <><Save className="h-4 w-4 me-2" /> حفظ التعديلات</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">معلومات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الكاتب</span>
                <span>{article.author_display_name || article.author || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المشاهدات</span>
                <Badge variant="secondary">{article.view_count}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">تاريخ الإنشاء</span>
                <span>{formatDate(article.created_at)}</span>
              </div>
              {article.updated_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">آخر تحديث</span>
                  <span>{formatDate(article.updated_at)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Slug</span>
                <span className="font-mono text-xs text-muted-foreground" dir="ltr">{article.slug}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>حذف المقالة</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            هل أنت متأكد من حذف المقالة <strong>{article.title}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'جارٍ الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
