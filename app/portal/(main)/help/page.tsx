'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput } from '@/components/ui/search-input';
import {
  HelpCircle, Search, ArrowRight, BookOpen, Eye, ChevronLeft,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { StaggerContainer, StaggerItem } from '@/components/ui/stagger-list';
import { toast } from 'sonner';

/* ───────────────────────── Types ───────────────────────── */

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
}

interface Article {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  view_count: number;
  author_display_name: string | null;
  created_at: string;
}

/* ───────────────────────── Component ──────────────────── */

export default function HelpCenterPage() {
  const router = useRouter();

  /* ── state ── */
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);

  /* ── search ── */
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Article[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  /* ── fetch categories ── */
  useEffect(() => {
    fetch('/api/portal/kb/categories')
      .then(r => r.json())
      .then(json => {
        if (json.data) setCategories(json.data);
      })
      .catch(() => { toast.error('فشل في تحميل التصنيفات'); })
      .finally(() => setLoadingCategories(false));
  }, []);

  /* ── fetch articles for category ── */
  const fetchCategoryArticles = useCallback(async (categoryId: string) => {
    setLoadingArticles(true);
    try {
      const res = await fetch(`/api/portal/kb/articles?category_id=${categoryId}`);
      const json = await res.json();
      if (json.data) setArticles(json.data);
    } catch {
      setArticles([]);
      toast.error('فشل في تحميل المقالات');
    } finally {
      setLoadingArticles(false);
    }
  }, []);

  /* ── search ── */
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setHasSearched(true);
    setSelectedCategory(null);
    try {
      const res = await fetch(`/api/portal/kb/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const json = await res.json();
      if (json.data) setSearchResults(json.data);
    } catch {
      setSearchResults([]);
      toast.error('فشل في البحث');
    } finally {
      setSearching(false);
    }
  };

  /* ── select category ── */
  const handleSelectCategory = (cat: Category) => {
    setSelectedCategory(cat);
    setHasSearched(false);
    setSearchQuery('');
    setSearchResults([]);
    fetchCategoryArticles(cat.id);
  };

  /* ── back to categories ── */
  const handleBackToCategories = () => {
    setSelectedCategory(null);
    setArticles([]);
    setHasSearched(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HelpCircle className="h-6 w-6" /> مركز المساعدة
        </h1>
        <p className="text-muted-foreground text-sm mt-1">ابحث في قاعدة المعرفة أو تصفّح حسب التصنيف</p>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-2" onKeyDown={e => e.key === 'Enter' && handleSearch()}>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="ابحث في المقالات..."
          className="flex-1"
        />
        <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
          {searching ? 'جارٍ البحث...' : 'بحث'}
        </Button>
      </div>

      {/* Search results */}
      {hasSearched && !selectedCategory && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">نتائج البحث</h2>
            <Button variant="ghost" size="sm" onClick={handleBackToCategories}>
              عودة للتصنيفات
            </Button>
          </div>
          {searching ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : searchResults.length === 0 ? (
            <EmptyState icon={Search} title="لا توجد نتائج" description="جرّب كلمات بحث مختلفة" />
          ) : (
            <div className="space-y-2">
              {searchResults.map(article => (
                <Card
                  key={article.id}
                  className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-portal/30 hover:-translate-y-0.5"
                  onClick={() => router.push(`/portal/help/${article.id}`)}
                >
                  <CardContent className="p-4">
                    <h3 className="font-medium mb-1">{article.title}</h3>
                    {article.excerpt && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{article.excerpt}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {article.view_count}
                      </span>
                      {article.author_display_name && (
                        <span>{article.author_display_name}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Category view (articles list) */}
      {selectedCategory && !hasSearched && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleBackToCategories}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold">{selectedCategory.name}</h2>
          </div>
          {selectedCategory.description && (
            <p className="text-sm text-muted-foreground">{selectedCategory.description}</p>
          )}

          {loadingArticles ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : articles.length === 0 ? (
            <EmptyState icon={BookOpen} title="لا توجد مقالات" description="لا توجد مقالات في هذا التصنيف" />
          ) : (
            <div className="space-y-2">
              {articles.map(article => (
                <Card
                  key={article.id}
                  className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-portal/30 hover:-translate-y-0.5"
                  onClick={() => router.push(`/portal/help/${article.id}`)}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium mb-1">{article.title}</h3>
                      {article.excerpt && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{article.excerpt}</p>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 ms-3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Categories grid */}
      {!selectedCategory && !hasSearched && (
        <div>
          {loadingCategories ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <EmptyState icon={HelpCircle} title="لا توجد مقالات بعد" description="سيتم إضافة مقالات المساعدة قريبًا" />
          ) : (
            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map(cat => (
                <StaggerItem key={cat.id}>
                  <Card
                    className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-portal/30 hover:-translate-y-0.5"
                    onClick={() => handleSelectCategory(cat)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-lg bg-portal/10 flex items-center justify-center">
                          <BookOpen className="h-5 w-5 text-portal" />
                        </div>
                        <h3 className="font-semibold">{cat.name}</h3>
                      </div>
                      {cat.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{cat.description}</p>
                      )}
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </StaggerContainer>
          )}
        </div>
      )}
    </div>
  );
}
