'use client';

import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';

export default function PaymentCancelPage() {
  const params = useParams();
  const router = useRouter();

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-8 pb-8 space-y-6">
          <div className="flex justify-center">
            <XCircle className="text-orange-500" size={64} />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-orange-700">
              تم إلغاء الدفع
            </h1>
            <p className="text-muted-foreground">
              لم يتم خصم أي مبلغ. يمكنك المحاولة مرة أخرى.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              onClick={() => router.push(`/portal/invoices/${params.id}`)}
              className="w-full"
            >
              المحاولة مرة أخرى
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
