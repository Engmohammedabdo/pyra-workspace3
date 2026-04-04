'use client';

import { AlertCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ErrorCardProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  isNetworkError?: boolean;
  className?: string;
}

export function ErrorCard({
  title = 'فشل في تحميل البيانات',
  message = 'حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مرة أخرى.',
  onRetry,
  isNetworkError = false,
  className = '',
}: ErrorCardProps) {
  const Icon = isNetworkError ? WifiOff : AlertCircle;

  return (
    <Card className={`border-dashed ${className}`}>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center mb-4">
          <Icon className="h-6 w-6 text-red-500" />
        </div>
        <h3 className="text-base font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">{message}</p>
        {isNetworkError && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
            <Wifi className="h-3 w-3" />
            <span>تحقق من اتصال الإنترنت</span>
          </div>
        )}
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            إعادة المحاولة
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
