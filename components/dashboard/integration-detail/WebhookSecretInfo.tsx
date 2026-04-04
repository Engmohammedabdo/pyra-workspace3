'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { KeyRound, RefreshCw, Eye, EyeOff, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export function WebhookSecretInfo({
  webhook,
  onRegenerate,
  regenerating
}: {
  webhook: any;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const [showSecret, setShowSecret] = useState(false);
  const [showRegenDialog, setShowRegenDialog] = useState(false);

  const maskedSecret = webhook?.secret
    ? webhook.secret.slice(0, 8) + '••••••••••••••••••••'
    : '';

  const copySecret = () => {
    if (webhook?.secret) {
      navigator.clipboard.writeText(webhook.secret);
      toast.success('تم نسخ المفتاح السري');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> المفتاح السري
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          onClick={() => setShowRegenDialog(true)}
        >
          <RefreshCw className="h-3.5 w-3.5 me-1" /> إعادة توليد
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Input
              value={showSecret ? webhook.secret : maskedSecret}
              readOnly
              dir="ltr"
              className="font-mono text-sm pe-20"
            />
            <div className="absolute inset-y-0 end-0 flex items-center gap-1 pe-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowSecret(!showSecret)}
                aria-label={showSecret ? 'إخفاء' : 'عرض'}
              >
                {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={copySecret}
                aria-label="نسخ"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          استخدم هذا المفتاح للتحقق من توقيع HMAC-SHA256 في الهيدر X-Pyra-Signature
        </p>
      </CardContent>

      <Dialog open={showRegenDialog} onOpenChange={setShowRegenDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>إعادة توليد المفتاح السري</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            سيتم استبدال المفتاح السري الحالي بمفتاح جديد. ستحتاج إلى تحديث المفتاح في جميع الأنظمة المتكاملة. لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenDialog(false)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => { onRegenerate(); setShowRegenDialog(false); }}
              disabled={regenerating}
            >
              {regenerating ? 'جارٍ التوليد...' : 'إعادة توليد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
