'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Palette, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  clientId: string;
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
    } catch {
      /* ignore */
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
      if (res.ok) toast.success('\u062a\u0645 \u062d\u0641\u0638 \u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0627\u0644\u0639\u0644\u0627\u0645\u0629 \u0627\u0644\u062a\u062c\u0627\u0631\u064a\u0629');
      else toast.error('\u0641\u0634\u0644 \u0641\u064a \u0627\u0644\u062d\u0641\u0638');
    } catch {
      toast.error('\u0641\u0634\u0644 \u0641\u064a \u0627\u0644\u062d\u0641\u0638');
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <Card>
        <CardContent className="p-6">{'\u062c\u0627\u0631\u064d \u0627\u0644\u062a\u062d\u0645\u064a\u0644...'}</CardContent>
      </Card>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          {'\u0627\u0644\u0639\u0644\u0627\u0645\u0629 \u0627\u0644\u062a\u062c\u0627\u0631\u064a\u0629'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{'\u0627\u0644\u0644\u0648\u0646 \u0627\u0644\u0623\u0633\u0627\u0633\u064a'}</Label>
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
            <Label>{'\u0627\u0644\u0644\u0648\u0646 \u0627\u0644\u062b\u0627\u0646\u0648\u064a'}</Label>
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

        <div className="space-y-2">
          <Label>{'\u0627\u0633\u0645 \u0627\u0644\u0634\u0631\u0643\u0629 (\u0627\u0644\u0639\u0631\u0636)'}</Label>
          <Input
            value={companyName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCompanyName(e.target.value)
            }
            placeholder={'\u0627\u0633\u0645 \u0627\u0644\u0634\u0631\u0643\u0629 \u0627\u0644\u0645\u0639\u0631\u0648\u0636 \u0641\u064a \u0627\u0644\u0628\u0648\u0631\u062a\u0627\u0644'}
          />
        </div>

        <div className="space-y-2">
          <Label>{'\u0631\u0627\u0628\u0637 \u0627\u0644\u0634\u0639\u0627\u0631 (Logo URL)'}</Label>
          <Input
            value={logoUrl}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setLogoUrl(e.target.value)
            }
            placeholder="https://..."
            dir="ltr"
          />
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Logo preview"
              className="h-12 mt-1 object-contain"
            />
          )}
        </div>

        <div className="space-y-2">
          <Label>{'\u0631\u0627\u0628\u0637 \u0627\u0644\u0623\u064a\u0642\u0648\u0646\u0629 (Favicon URL)'}</Label>
          <Input
            value={faviconUrl}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFaviconUrl(e.target.value)
            }
            placeholder="https://..."
            dir="ltr"
          />
        </div>

        <div className="space-y-2">
          <Label>{'\u062e\u0644\u0641\u064a\u0629 \u0635\u0641\u062d\u0629 \u0627\u0644\u062f\u062e\u0648\u0644 (URL)'}</Label>
          <Input
            value={loginBg}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setLoginBg(e.target.value)
            }
            placeholder="https://..."
            dir="ltr"
          />
          {loginBg && (
            <img
              src={loginBg}
              alt="Background preview"
              className="h-24 mt-1 rounded object-cover"
            />
          )}
        </div>

        {/* Live Preview Box */}
        <div className="border rounded-lg p-4 space-y-2">
          <p className="text-sm text-muted-foreground">{'\u0645\u0639\u0627\u064a\u0646\u0629'}</p>
          <div
            className="flex items-center gap-3 p-3 rounded"
            style={{ backgroundColor: primaryColor + '15' }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-8" />
            ) : (
              <div
                className="h-8 w-8 rounded"
                style={{ backgroundColor: primaryColor }}
              />
            )}
            <span className="font-bold" style={{ color: primaryColor }}>
              {companyName || '\u0627\u0633\u0645 \u0627\u0644\u0634\u0631\u0643\u0629'}
            </span>
          </div>
          <div className="flex gap-2">
            <div
              className="h-8 w-20 rounded text-white text-xs flex items-center justify-center"
              style={{ backgroundColor: primaryColor }}
            >
              {'\u0632\u0631 \u0623\u0633\u0627\u0633\u064a'}
            </div>
            <div
              className="h-8 w-20 rounded text-white text-xs flex items-center justify-center"
              style={{ backgroundColor: secondaryColor }}
            >
              {'\u0632\u0631 \u062b\u0627\u0646\u0648\u064a'}
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
          {'\u062d\u0641\u0638 \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a'}
        </Button>
      </CardContent>
    </Card>
  );
}
