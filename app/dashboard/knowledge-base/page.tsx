'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  BookOpen, Plus, Search, Pencil, Trash2, Eye, EyeOff,
  FolderOpen, FileText, GripVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils/format';

/* ───────────────────────── Types ───────────────────────── */

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

interface Article {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  is_public: boolean;
  sort_order: number;
  view_count: number;
  author: string | null;
  author_display_name: string | null;
  created_at: string;
  updated_at: string | null;
}

/* ───────────────────────── Icon options ──────────────────── */

const ICON_OPTIONS = [
  { value: 'book', label: 'كتاب' },
  { value: 'file-text', label: 'مستند' },
  { value: 'help-circle', label: 'مساعدة' },
  { value: 'settings', label: 'إعدادات' },
  { value: 'zap', label: 'سريع' },
  { value: 'shield', label: 'أمان' },
  { value: 'credit-card', label: 'دفع' },
  { value: 'users', label: 'مستخدمون' },
  { value: 'globe', label: 'عام' },
  { value: 'code', label: 'تقنية' },
];

/* ───────────────────────── Component ──────────────────── */

export default function KnowledgeBasePage() {
  const router = useRouter();

  /* ── Tab state ── */
  const [activeTab, setActiveTab] = useState<'categories' | 'articles'>('categories');

  /* ── Categories state ── */
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [articleCounts, setArticleCounts] = useState<Record<string, number>>({});

  /* ── Category dialog ── */
  const [showCatDialog, setShowCatDialog] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catIcon, setCatIcon] = useState('');
  const [catSortOrder, setCatSortOrder] = useState(0);
  const [catIsPublic, setCatIsPublic] = useState(true);
  const [savingCat, setSavingCat] = useState(false);

  /* ── Delete category dialog ── */
  const [showDeleteCat, setShowDeleteCat] = useState(false);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const [deletingCat, setDeletingCat] = useState(false);

  /* ── Articles state ── */
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [articleCategoryFilter, setArticleCategoryFilter] = useState('all');
  const [articleSearch, setArticleSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  /* ── Debounce search ── */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(articleSearch), 400);
    return () => clearTimeout(timer);
  }, [articleSearch]);

  /* ── Fetch categories ── */
  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const res = await fetch('/api/kb/categories');
      const json = await res.json();
      if (json.data) setCategories(json.data);
    } catch {
      toast.error('حدث خطأ في تحميل التصنيفات');
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  /* ── Fetch articles ── */
  const fetchArticles = useCallback(async () => {
    setLoadingArticles(true);
    try {
      const params = new URLSearchParams();
      if (articleCategoryFilter !== 'all') params.set('category_id', articleCategoryFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      params.set('limit', '100');

      const res = await fetch(`/api/kb/articles?${params}`);
      const json = await res.json();
      if (json.data) setArticles(json.data);
    } catch {
      toast.error('حدث خطأ في تحميل المقالات');
    } finally {
      setLoadingArticles(false);
    }
  }, [articleCategoryFilter, debouncedSearch]);

  /* ── Count articles per category ── */
  useEffect(() => {
    if (articles.length > 0) {
      const counts: Record<string, number> = {};
      articles.forEach(a => {
        counts[a.category_id] = (counts[a.category_id] || 0) + 1;
      });
      setArticleCounts(counts);
    }
  }, [articles]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  /* ── Open category dialog ── */
  const openCatDialog = (cat?: Category) => {
    if (cat) {
      setEditingCat(cat);
      setCatName(cat.name);
      setCatDescription(cat.description || '');
      setCatIcon(cat.icon || '');
      setCatSortOrder(cat.sort_order);
      setCatIsPublic(cat.is_public);
    } else {
      setEditingCat(null);
      setCatName('');
      setCatDescription('');
      setCatIcon('');
      setCatSortOrder(0);
      setCatIsPublic(true);
    }
    setShowCatDialog(true);
  };

  /* ── Save category ── */
  const handleSaveCat = async () => {
    if (!catName.trim()) {
      toast.error('اسم التصنيف مطلوب');
      return;
    }
    setSavingCat(true);
    try {
      const payload = {
        name: catName.trim(),
        description: catDescription.trim() || null,
        icon: catIcon || null,
        sort_order: catSortOrder,
        is_public: catIsPublic,
      };

      const url = editingCat ? `/api/kb/categories/${editingCat.id}` : '/api/kb/categories';
      const method = editingCat ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json.error) {
        toast.error(json.error);
        return;
      }

      toast.success(editingCat ? 'تم تحديث التصنيف' : 'تم إنشاء التصنيف');
      setShowCatDialog(false);
      fetchCategories();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setSavingCat(false);
    }
  };

  /* ── Delete category ── */
  const handleDeleteCat = async () => {
    if (!deletingCatId) return;
    setDeletingCat(true);
    try {
      const res = await fetch(`/api/kb/categories/${deletingCatId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        return;
      }
      toast.success('تم حذف التصنيف');
      setShowDeleteCat(false);
      setDeletingCatId(null);
      fetchCategories();
      fetchArticles();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setDeletingCat(false);
    }
  };

  /* ── Get category name by id ── */
  const getCategoryName = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    return cat?.name || '—';
  };

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" /> قاعدة المعرفة
          </h1>
          <p className="text-muted-foreground">إدارة التصنيفات والمقالات</p>
        </div>
        {activeTab === 'articles' && (
          <Link href="/dashboard/knowledge-base/new">
            <Button className="bg-orange-500 hover:bg-orange-600">
              <Plus className="h-4 w-4 me-2" /> مقالة جديدة
            </Button>
          </Link>
        )}
        {activeTab === 'categories' && (
          <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => openCatDialog()}>
            <Plus className="h-4 w-4 me-2" /> تصنيف جديد
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'categories'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('categories')}
        >
          <FolderOpen className="h-4 w-4 inline-block me-1.5" />
          التصنيفات
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'articles'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('articles')}
        >
          <FileText className="h-4 w-4 inline-block me-1.5" />
          المقالات
        </button>
      </div>

      {/* ── Categories Tab ── */}
      {activeTab === 'categories' && (
        <div>
          {loadingCategories ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">لا توجد تصنيفات</p>
                <p className="text-xs text-muted-foreground mt-1">أضف تصنيفًا جديدًا للبدء</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map(cat => (
                <Card key={cat.id} className="hover:border-orange-300 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                        <h3 className="font-semibold">{cat.name}</h3>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant={cat.is_public ? 'default' : 'secondary'} className="text-[10px]">
                          {cat.is_public ? 'عام' : 'خاص'}
                        </Badge>
                      </div>
                    </div>
                    {cat.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{cat.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-muted-foreground">
                        {articleCounts[cat.id] || 0} مقالة
                      </span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCatDialog(cat)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => { setDeletingCatId(cat.id); setShowDeleteCat(true); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Articles Tab ── */}
      {activeTab === 'articles' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث في المقالات..."
                value={articleSearch}
                onChange={e => setArticleSearch(e.target.value)}
                className="ps-9"
              />
            </div>
            <Select value={articleCategoryFilter} onValueChange={setArticleCategoryFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="جميع التصنيفات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع التصنيفات</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-start p-3 font-medium">العنوان</th>
                      <th className="text-start p-3 font-medium">التصنيف</th>
                      <th className="text-start p-3 font-medium">الكاتب</th>
                      <th className="text-start p-3 font-medium">المشاهدات</th>
                      <th className="text-start p-3 font-medium">الحالة</th>
                      <th className="text-start p-3 font-medium">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingArticles ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 6 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>
                          ))}
                        </tr>
                      ))
                    ) : articles.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-muted-foreground">
                          <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                          <p>لا توجد مقالات</p>
                          <p className="text-xs mt-1">أنشئ مقالة جديدة للبدء</p>
                        </td>
                      </tr>
                    ) : (
                      articles.map(article => (
                        <tr
                          key={article.id}
                          className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => router.push(`/dashboard/knowledge-base/${article.id}`)}
                        >
                          <td className="p-3 font-medium">{article.title}</td>
                          <td className="p-3 text-muted-foreground">{getCategoryName(article.category_id)}</td>
                          <td className="p-3 text-muted-foreground">{article.author_display_name || article.author || '—'}</td>
                          <td className="p-3">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Eye className="h-3.5 w-3.5" /> {article.view_count}
                            </span>
                          </td>
                          <td className="p-3">
                            <Badge variant={article.is_public ? 'default' : 'secondary'} className="text-[10px]">
                              {article.is_public ? (
                                <><Eye className="h-3 w-3 me-1" /> عام</>
                              ) : (
                                <><EyeOff className="h-3 w-3 me-1" /> خاص</>
                              )}
                            </Badge>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">
                            {formatDate(article.created_at)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Category Add/Edit Dialog ── */}
      <Dialog open={showCatDialog} onOpenChange={setShowCatDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingCat ? 'تعديل التصنيف' : 'تصنيف جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>اسم التصنيف *</Label>
              <Input
                value={catName}
                onChange={e => setCatName(e.target.value)}
                placeholder="مثال: الأسئلة الشائعة"
              />
            </div>
            <div className="space-y-2">
              <Label>الوصف</Label>
              <Textarea
                value={catDescription}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCatDescription(e.target.value)}
                placeholder="وصف مختصر للتصنيف..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الأيقونة</Label>
                <Select value={catIcon} onValueChange={setCatIcon}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر أيقونة" />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>الترتيب</Label>
                <Input
                  type="number"
                  value={catSortOrder}
                  onChange={e => setCatSortOrder(parseInt(e.target.value) || 0)}
                  min={0}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="cat-is-public"
                checked={catIsPublic}
                onChange={e => setCatIsPublic(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="cat-is-public">عام (ظاهر في بوابة العملاء)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCatDialog(false)}>إلغاء</Button>
            <Button onClick={handleSaveCat} disabled={savingCat} className="bg-orange-500 hover:bg-orange-600">
              {savingCat ? 'جارٍ الحفظ...' : editingCat ? 'تحديث' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Category Confirmation ── */}
      <Dialog open={showDeleteCat} onOpenChange={setShowDeleteCat}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>حذف التصنيف</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            هل أنت متأكد من حذف هذا التصنيف؟ سيتم حذف جميع المقالات المرتبطة به. لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteCat(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDeleteCat} disabled={deletingCat}>
              {deletingCat ? 'جارٍ الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
