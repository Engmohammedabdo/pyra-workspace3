'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Eye, Calendar, User } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/* ───────────────────────── Types ───────────────────────── */

interface ArticleDetail {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  view_count: number;
  author_display_name: string | null;
  created_at: string;
  updated_at: string | null;
}

/* ───────────────────────── Component ──────────────────── */

export default function HelpArticlePage() {
  const router = useRouter();
  const params = useParams();
  const articleId = params.id as string;

  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!articleId) return;
    setLoading(true);
    fetch(`/api/portal/kb/articles/${articleId}`)
      .then(r => r.json())
      .then(json => {
        if (json.data) {
          setArticle(json.data);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [articleId]);

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  /* ── Not found ── */
  if (notFound || !article) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-xl font-semibold mb-2">المقالة غير موجودة</p>
        <p className="text-muted-foreground text-sm mb-4">قد تكون المقالة محذوفة أو غير متاحة</p>
        <Link href="/portal/help">
          <Button variant="outline">
            <ArrowRight className="h-4 w-4 me-2" /> العودة لمركز المساعدة
          </Button>
        </Link>
      </div>
    );
  }

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <Link href="/portal/help">
        <Button variant="ghost" size="sm">
          <ArrowRight className="h-4 w-4 me-1" /> العودة لمركز المساعدة
        </Button>
      </Link>

      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold mb-3">{article.title}</h1>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {article.author_display_name && (
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" /> {article.author_display_name}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> {formatDate(article.created_at)}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> {article.view_count} مشاهدة
          </span>
        </div>
      </div>

      {/* Content */}
      <Card>
        <CardContent className="p-6 md:p-8">
          <div className="prose prose-sm dark:prose-invert max-w-none" dir="ltr">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {article.content}
            </ReactMarkdown>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
