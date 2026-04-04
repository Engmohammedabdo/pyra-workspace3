'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/format';

interface ArticleSidebarProps {
  article: any;
  categories: any[];
  categoryId: string;
  setCategoryId: (v: string) => void;
  sortOrder: number;
  setSortOrder: (v: number) => void;
  isPublic: boolean;
  setIsPublic: (v: boolean) => void;
  loadingCategories: boolean;
  saving: boolean;
  onSave: () => void;
}

export function ArticleSidebar({ article, categories, categoryId, setCategoryId, sortOrder, setSortOrder, isPublic, setIsPublic, loadingCategories, saving, onSave }: ArticleSidebarProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-lg">الإعدادات</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>التصنيف *</Label>
            <Select value={categoryId} onValueChange={setCategoryId} disabled={loadingCategories}>
              <SelectTrigger>
                <SelectValue placeholder={loadingCategories ? 'جارٍ التحميل...' : 'اختر التصنيف'} />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>الترتيب</Label>
            <Input type="number" value={sortOrder} onChange={e => setSortOrder(parseInt(e.target.value) || 0)} min={0} dir="ltr" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is-public" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="rounded border-gray-300" />
            <Label htmlFor="is-public">عام (ظاهر في بوابة العملاء)</Label>
          </div>
          <Button onClick={onSave} disabled={saving} className="w-full bg-orange-500 hover:bg-orange-600">
            {saving ? <><Loader2 className="h-4 w-4 me-2 animate-spin" /> جارٍ الحفظ...</> : <><Save className="h-4 w-4 me-2" /> حفظ التعديلات</>}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-lg">معلومات</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">الكاتب</span><span>{article.author_display_name || article.author || '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">المشاهدات</span><Badge variant="secondary">{article.view_count}</Badge></div>
          <div className="flex justify-between"><span className="text-muted-foreground">تاريخ الإنشاء</span><span>{formatDate(article.created_at)}</span></div>
          {article.updated_at && <div className="flex justify-between"><span className="text-muted-foreground">آخر تحديث</span><span>{formatDate(article.updated_at)}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Slug</span><span className="font-mono text-xs text-muted-foreground" dir="ltr">{article.slug}</span></div>
        </CardContent>
      </Card>
    </div>
  );
}
