'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useRegenerateDocument,
  type OnboardingDetail,
} from '@/hooks/useOnboarding';

// ────────────────────────────────────────────────────────────────────────────
// Label mapping for document type IDs
// ────────────────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  dt_offer_letter: 'عرض العمل',
  dt_nda: 'اتفاقية السرية (NDA)',
  dt_asset_handover: 'نموذج تسليم العهدة',
};

const DOC_ROUTE_SEGMENT: Record<
  string,
  'offer_letter' | 'nda' | 'asset_handover'
> = {
  dt_offer_letter: 'offer_letter',
  dt_nda: 'nda',
  dt_asset_handover: 'asset_handover',
};

// ────────────────────────────────────────────────────────────────────────────
// Document row
// ────────────────────────────────────────────────────────────────────────────

function DocRow({
  typeId,
  label,
  signedUrl,
  onboardingId,
}: {
  typeId: string;
  label: string;
  signedUrl: string;
  onboardingId: string;
}) {
  const regenerate = useRegenerateDocument();
  const [regenerating, setRegenerating] = useState(false);

  const routeSegment = DOC_ROUTE_SEGMENT[typeId];
  const displayLabel = DOC_TYPE_LABELS[typeId] ?? label;

  async function handleRegenerate() {
    if (!routeSegment) {
      toast.error('نوع المستند غير معروف');
      return;
    }
    setRegenerating(true);
    try {
      await regenerate.mutateAsync({
        onboardingId,
        docType: routeSegment,
      });
      toast.success(`تم إعادة توليد ${displayLabel}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'فشل إعادة التوليد';
      toast.error(msg);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
      <FileText className="h-5 w-5 shrink-0 text-orange-500" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{displayLabel}</p>
        <p className="text-xs text-muted-foreground truncate">{label}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {signedUrl ? (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            asChild
          >
            <a href={signedUrl} target="_blank" rel="noopener noreferrer" download>
              <Download className="h-3.5 w-3.5" />
              تحميل
            </a>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">غير متاح</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={handleRegenerate}
          disabled={regenerating || regenerate.isPending}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`}
          />
          إعادة توليد
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Placeholder row when a document type is missing
// ────────────────────────────────────────────────────────────────────────────

function MissingDocRow({
  typeId,
  onboardingId,
}: {
  typeId: string;
  onboardingId: string;
}) {
  const regenerate = useRegenerateDocument();
  const [regenerating, setRegenerating] = useState(false);

  const routeSegment = DOC_ROUTE_SEGMENT[typeId];
  const displayLabel = DOC_TYPE_LABELS[typeId] ?? typeId;

  async function handleGenerate() {
    if (!routeSegment) return;
    setRegenerating(true);
    try {
      await regenerate.mutateAsync({ onboardingId, docType: routeSegment });
      toast.success(`تم توليد ${displayLabel}`);
    } catch {
      toast.error('فشل توليد المستند');
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 opacity-60">
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{displayLabel}</p>
        <p className="text-xs text-muted-foreground">لم يُولَّد بعد</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-1.5 shrink-0"
        onClick={handleGenerate}
        disabled={regenerating}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
        توليد
      </Button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

const EXPECTED_DOC_TYPES = [
  'dt_offer_letter',
  'dt_nda',
  'dt_asset_handover',
] as const;

interface Props {
  onboarding: OnboardingDetail;
}

export function OnboardingDocuments({ onboarding }: Props) {
  const docs = onboarding.documents ?? [];
  const docsByType = new Map(docs.map((d) => [d.type_id, d]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">مستندات التعيين</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {EXPECTED_DOC_TYPES.map((typeId) => {
          const doc = docsByType.get(typeId);
          if (doc) {
            return (
              <DocRow
                key={typeId}
                typeId={typeId}
                label={doc.label}
                signedUrl={doc.signed_url}
                onboardingId={onboarding.id}
              />
            );
          }
          return (
            <MissingDocRow
              key={typeId}
              typeId={typeId}
              onboardingId={onboarding.id}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}
