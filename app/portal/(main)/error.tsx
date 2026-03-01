'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Portal Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-500/20 to-orange-600/5 blur-xl scale-150" />
        <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-orange-500/15 to-orange-600/5 border border-orange-500/10 flex items-center justify-center">
          <AlertTriangle className="h-9 w-9 text-orange-500" />
        </div>
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold">حدث خطأ غير متوقع</h2>
        <p className="text-muted-foreground text-center max-w-md text-sm">
          نعتذر عن هذا الخطأ. يمكنك إعادة المحاولة أو العودة للصفحة الرئيسية.
        </p>
      </div>

      <div className="flex gap-3">
        <Button onClick={reset} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          إعادة المحاولة
        </Button>
        <Button
          onClick={() => (window.location.href = '/portal')}
          className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Home className="h-4 w-4" />
          الرئيسية
        </Button>
      </div>
    </div>
  );
}
