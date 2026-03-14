'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';
import { Palette, Loader2, Save, Upload, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  clientId: string;
}

interface UploadDropzoneProps {
  label: string;
  currentUrl: string;
  onUrlChange: (url: string) => void;
  accept?: string;
  previewHeight?: string;
  clientId: string;
  field: string;
}

function UploadDropzone({
  label,
  currentUrl,
  onUrlChange,
  accept = 'image/*',
  previewHeight = 'h-12',
  clientId,
  field,
}: UploadDropzoneProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('الرجاء اختيار ملف صورة');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الملف يجب أن يكون أقل من 5 ميجابايت');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('field', field);

      const res = await fetch(`/api/clients/${clientId}/branding/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error || 'فشل في رفع الملف');
        return;
      }

      const json = await res.json();
      if (json.data?.url) {
        onUrlChange(json.data.url);
        toast.success('تم رفع الملف بنجاح');
      }
    } catch {
      toast.error('فشل في رفع الملف');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {currentUrl ? (
        <div className="relative group">
          <div className="border rounded-lg p-3 bg-muted/30">
            <img
              src={currentUrl}
              alt={label}
              className={cn('object-contain rounded', previewHeight)}
            />
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 me-1.5" />
              )}
              تغيير
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onUrlChange('')}
              className="text-destructive hover:text-destructive"
            >
              <X className="h-3.5 w-3.5 me-1.5" />
              حذف
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
            dragOver
              ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
              : 'border-muted-foreground/25 hover:border-orange-400 hover:bg-muted/30',
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin text-muted-foreground" />
          ) : (
            <ImageIcon className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
          )}
          <p className="text-xs text-muted-foreground">
            {uploading ? 'جارٍ الرفع...' : 'اسحب الملف هنا أو انقر للاختيار'}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG, SVG — حد أقصى 5 MB</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
      />
      {/* Fallback: manual URL input */}
      <Input
        value={currentUrl}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUrlChange(e.target.value)}
        placeholder="أو أدخل رابط الصورة مباشرة"
        dir="ltr"
        className="text-xs"
      />
    </div>
  );
}

export function BrandingEditor({ clientId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [primaryColor, setPrimaryColor] = useState('#f97316');
  const [secondaryColor, setSecondaryColor] = useState('#ea580c');
  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [loginBg, setLoginBg] = useState('');

  const fetchBranding = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/branding`);
      const json = await res.json();
      if (json.data) {
        setPrimaryColor(json.data.primary_color || '#f97316');
        setSecondaryColor(json.data.secondary_color || '#ea580c');
        setLogoUrl(json.data.logo_url || '');
        setFaviconUrl(json.data.favicon_url || '');
        setCompanyName(json.data.company_name_display || '');
        setLoginBg(json.data.login_background_url || '');
      }
    } catch (err) {
      console.error('Failed to fetch branding:', err);
      toast.error('فشل في تحميل إعدادات العلامة التجارية');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/branding`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          logo_url: logoUrl || null,
          favicon_url: faviconUrl || null,
          company_name_display: companyName || null,
          login_background_url: loginBg || null,
        }),
      });
      if (res.ok) {
        toast.success('تم حفظ إعدادات العلامة التجارية');
      } else {
        const json = await res.json().catch(() => null);
        toast.error(json?.error || 'فشل في الحفظ');
      }
    } catch {
      toast.error('فشل في الحفظ');
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          جارٍ التحميل...
        </CardContent>
      </Card>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          العلامة التجارية
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Colors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>اللون الأساسي</Label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={primaryColor}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPrimaryColor(e.target.value)
                }
                className="h-10 w-14 rounded border cursor-pointer"
              />
              <Input
                value={primaryColor}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPrimaryColor(e.target.value)
                }
                className="font-mono"
                dir="ltr"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>اللون الثانوي</Label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={secondaryColor}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSecondaryColor(e.target.value)
                }
                className="h-10 w-14 rounded border cursor-pointer"
              />
              <Input
                value={secondaryColor}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSecondaryColor(e.target.value)
                }
                className="font-mono"
                dir="ltr"
              />
            </div>
          </div>
        </div>

        {/* Company Name */}
        <div className="space-y-2">
          <Label>اسم الشركة (العرض)</Label>
          <Input
            value={companyName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCompanyName(e.target.value)
            }
            placeholder="اسم الشركة المعروض في البورتال"
          />
        </div>

        {/* File Uploads */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <UploadDropzone
            label="الشعار (Logo)"
            currentUrl={logoUrl}
            onUrlChange={setLogoUrl}
            clientId={clientId}
            field="logo"
            previewHeight="h-12"
          />
          <UploadDropzone
            label="الأيقونة (Favicon)"
            currentUrl={faviconUrl}
            onUrlChange={setFaviconUrl}
            clientId={clientId}
            field="favicon"
            previewHeight="h-8"
            accept="image/png,image/x-icon,image/svg+xml"
          />
        </div>

        <UploadDropzone
          label="خلفية صفحة الدخول"
          currentUrl={loginBg}
          onUrlChange={setLoginBg}
          clientId={clientId}
          field="login_background"
          previewHeight="h-24"
        />

        {/* Live Preview Box */}
        <div className="border rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">معاينة</p>
          <div
            className="flex items-center gap-3 p-3 rounded"
            style={{ backgroundColor: primaryColor + '15' }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-8 object-contain" />
            ) : (
              <div
                className="h-8 w-8 rounded"
                style={{ backgroundColor: primaryColor }}
              />
            )}
            <span className="font-bold" style={{ color: primaryColor }}>
              {companyName || 'اسم الشركة'}
            </span>
          </div>
          <div className="flex gap-2">
            <div
              className="h-8 w-20 rounded text-white text-xs flex items-center justify-center"
              style={{ backgroundColor: primaryColor }}
            >
              زر أساسي
            </div>
            <div
              className="h-8 w-20 rounded text-white text-xs flex items-center justify-center"
              style={{ backgroundColor: secondaryColor }}
            >
              زر ثانوي
            </div>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-orange-500 hover:bg-orange-600"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin me-1" />
          ) : (
            <Save className="h-4 w-4 me-1" />
          )}
          حفظ التغييرات
        </Button>
      </CardContent>
    </Card>
  );
}
