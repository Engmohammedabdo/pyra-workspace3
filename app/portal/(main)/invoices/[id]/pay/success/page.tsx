'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

export default function PaymentSuccessPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const sid = searchParams.get('session_id');
    if (sid) {
      setSessionId(sid);
    }
  }, [searchParams]);

  const truncatedSessionId = sessionId
    ? `${sessionId.substring(0, 20)}...`
    : null;

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-8 pb-8 space-y-6">
          <div className="flex justify-center">
            <CheckCircle className="text-green-500" size={64} />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-green-700">
              تم الدفع بنجاح
            </h1>
            <p className="text-muted-foreground">
              شكراً لك! تم استلام الدفعة بنجاح وسيتم تحديث حالة الفاتورة.
            </p>
          </div>

          {truncatedSessionId && (
            <p className="text-xs text-muted-foreground direction-ltr">
              معرف الجلسة: {truncatedSessionId}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <Button
              onClick={() => router.push(`/portal/invoices/${params.id}`)}
              className="w-full"
            >
              العودة للفاتورة
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push('/portal/invoices')}
              className="w-full"
            >
              العودة للفواتير
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
