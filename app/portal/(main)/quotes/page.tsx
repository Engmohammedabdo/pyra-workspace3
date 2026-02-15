import { Card, CardContent } from '@/components/ui/card';
import { FileText } from 'lucide-react';

export default function PortalQuotesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">عروض الأسعار</h1>
        <p className="text-muted-foreground text-sm mt-1">
          استعرض عروض الأسعار المرسلة إليك
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center mb-4">
            <FileText className="h-7 w-7 text-orange-500" />
          </div>
          <h2 className="text-lg font-semibold mb-2">عروض الأسعار</h2>
          <p className="text-muted-foreground text-sm max-w-md">
            قريباً — ستتمكن من استعراض عروض الأسعار والموافقة عليها وتوقيعها
            إلكترونياً من هنا.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
