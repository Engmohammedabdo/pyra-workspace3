import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-background p-6">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-500/20 to-orange-600/5 blur-xl scale-150" />
        <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-orange-500/15 to-orange-600/5 border border-orange-500/10 flex items-center justify-center">
          <FileQuestion className="h-11 w-11 text-orange-500" />
        </div>
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-6xl font-bold text-orange-500 font-mono">404</h1>
        <h2 className="text-xl font-bold">الصفحة غير موجودة</h2>
        <p className="text-muted-foreground text-center max-w-md text-sm">
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
        </p>
      </div>

      <div className="flex gap-3">
        <Button asChild variant="outline" className="gap-2">
          <Link href="/dashboard">لوحة التحكم</Link>
        </Button>
        <Button asChild className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
          <Link href="/portal">بوابة العملاء</Link>
        </Button>
      </div>
    </div>
  );
}
