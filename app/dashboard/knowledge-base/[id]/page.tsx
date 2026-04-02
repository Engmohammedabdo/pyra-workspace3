'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowRight, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ArticleEditor } from '@/components/dashboard/knowledge-base-detail/ArticleEditor';
import { ArticleSidebar } from '@/components/dashboard/knowledge-base-detail/ArticleSidebar';

export default function EditArticlePage() {
  const router = useRouter();
  const params = useParams();
  const articleId = params.id as string;
  const [article, setArticle] = useState<any | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!articleId) return;
    fetch(`/api/kb/articles/${articleId}`)
      .then(r => r.json())
      .then(json => {
        if (json.data) {
          const a = json.data;
          setArticle(a);
          setCategoryId(a.category_id);
          setTitle(a.title);
          setContent(a.content);
          setExcerpt(a.excerpt || '');
          setIsPublic(a.is_public);
          setSortOrder(a.sort_order);
        } else { router.push('/dashboard/knowledge-base'); }
      }).finally(() => setLoading(false));
    fetch('/api/kb/categories').then(r => r.json()).then(json => { if (json.data) setCategories(json.data); }).finally(() => setLoadingCategories(false));
  }, [articleId, router]);

  const handleSave = async () => {
    if (!categoryId || !title.trim() || !content.trim()) { toast.error('بيانات مطلوبة مفقودة'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/kb/articles/${articleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: categoryId, title: title.trim(), content: content.trim(), excerpt: excerpt.trim() || null, is_public: isPublic, sort_order: sortOrder }),
      });
      if ((await res.json()).error) toast.error('فشل الحفظ');
      else { toast.success('تم تحديث المقالة'); router.push('/dashboard/knowledge-base'); }
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    await fetch(`/api/kb/articles/${articleId}`, { method: 'DELETE' });
    toast.success('تم حذف المقالة');
    router.push('/dashboard/knowledge-base');
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-2"><Skeleton className="h-[500px]" /></div><Skeleton className="h-[300px]" /></div></div>;
  if (!article) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/knowledge-base"><Button variant="ghost" size="icon"><ArrowRight className="h-4 w-4" /></Button></Link>
          <div><h1 className="text-2xl font-bold">تعديل المقالة</h1><p className="text-muted-foreground text-sm">{article.title}</p></div>
        </div>
        <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowDelete(true)}><Trash2 className="h-4 w-4 me-2" /> حذف</Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <ArticleEditor {...{ title, setTitle, content, setContent, excerpt, setExcerpt, showPreview, setShowPreview }} />
        </div>
        <ArticleSidebar {...{ article, categories, categoryId, setCategoryId, sortOrder, setSortOrder, isPublic, setIsPublic, loadingCategories, saving, onSave: handleSave }} />
      </div>
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>حذف المقالة</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف {article.title}؟</p>
          <DialogFooter><Button variant="outline" onClick={() => setShowDelete(false)}>إلغاء</Button><Button variant="destructive" onClick={handleDelete} disabled={deleting}>حذف</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
