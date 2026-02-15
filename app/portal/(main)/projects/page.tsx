import { Card, CardContent } from '@/components/ui/card';
import { FolderKanban } from 'lucide-react';

export default function PortalProjectsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">المشاريع</h1>
        <p className="text-muted-foreground text-sm mt-1">
          تابع مشاريعك واطلع على آخر التحديثات
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center mb-4">
            <FolderKanban className="h-7 w-7 text-orange-500" />
          </div>
          <h2 className="text-lg font-semibold mb-2">المشاريع</h2>
          <p className="text-muted-foreground text-sm max-w-md">
            قريباً — ستتمكن من متابعة جميع مشاريعك واستعراض الملفات والموافقة
            عليها من هنا.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
