'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  type: string;
  from: string;
  to: string;
}

export function ExportButton({ type, from, to }: Props) {
  const t = useTranslations('finance.reports.export');
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line no-restricted-globals -- blob download requires raw fetch
      const res = await fetch(
        `/api/reports/export?type=${encodeURIComponent(type)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (!res.ok) {
        toast.error(t('exportFailed'));
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-report-${from}-${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(t('exportSuccess'));
    } catch {
      toast.error(t('exportFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
      {loading ? (
        <Loader2 className="h-4 w-4 me-2 animate-spin" />
      ) : (
        <Download className="h-4 w-4 me-2" />
      )}
      {t('button')}
    </Button>
  );
}
