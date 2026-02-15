'use client';

import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mb-5">
            <FileText className="h-8 w-8 text-orange-500" />
          </div>
          <h2 className="text-xl font-semibold mb-3">عروض الأسعار</h2>
          <p className="text-muted-foreground text-sm max-w-md leading-relaxed mb-4">
            قريباً — ستتمكن من استعراض عروض الأسعار والموافقة عليها وتوقيعها
            إلكترونياً
          </p>
          <Badge
            variant="secondary"
            className="text-xs px-3 py-1 bg-orange-500/10 text-orange-600 border-orange-500/20"
          >
            Phase 6
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
