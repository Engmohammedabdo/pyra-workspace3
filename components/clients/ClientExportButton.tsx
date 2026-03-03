'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ClientExportButtonProps {
  search?: string;
  active?: string;
  tag?: string;
}

export function ClientExportButton({ search, active, tag }: ClientExportButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (active) params.set('active', active);
      if (tag) params.set('tag', tag);

      const res = await fetch(`/api/clients/export?${params}`);
      if (!res.ok) {
        toast.error('فشل في تصدير البيانات');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clients-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('تم تصدير البيانات بنجاح');
    } catch {
      toast.error('فشل في تصدير البيانات');
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
      تصدير CSV
    </Button>
  );
}
