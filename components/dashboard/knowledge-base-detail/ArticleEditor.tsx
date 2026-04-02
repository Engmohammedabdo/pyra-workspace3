'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, EyeOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ArticleEditorProps {
  title: string;
  setTitle: (val: string) => void;
  content: string;
  setContent: (val: string) => void;
  excerpt: string;
  setExcerpt: (val: string) => void;
  showPreview: boolean;
  setShowPreview: (val: boolean) => void;
}

export function ArticleEditor({ title, setTitle, content, setContent, excerpt, setExcerpt, showPreview, setShowPreview }: ArticleEditorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">محتوى المقالة</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>العنوان *</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="عنوان المقالة" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>المحتوى * (Markdown)</Label>
            <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)}>
              {showPreview ? <><EyeOff className="h-3.5 w-3.5 me-1" /> تحرير</> : <><Eye className="h-3.5 w-3.5 me-1" /> معاينة</>}
            </Button>
          </div>
          {showPreview ? (
            <Card className="min-h-[400px] p-4">
              <div className="prose prose-sm dark:prose-invert max-w-none" dir="ltr">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || '*لا يوجد محتوى للمعاينة*'}</ReactMarkdown>
              </div>
            </Card>
          ) : (
            <Textarea value={content} onChange={(e: any) => setContent(e.target.value)} placeholder="اكتب المحتوى باستخدام Markdown..." rows={20} dir="ltr" className="font-mono text-sm" />
          )}
        </div>
        <div className="space-y-2">
          <Label>المقتطف</Label>
          <Textarea value={excerpt} onChange={(e: any) => setExcerpt(e.target.value)} placeholder="وصف مختصر يظهر في قائمة المقالات..." rows={3} />
        </div>
      </CardContent>
    </Card>
  );
}
