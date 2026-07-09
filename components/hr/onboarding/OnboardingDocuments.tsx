'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { FileText, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useRegenerateDocument,
  type OnboardingDetail,
} from '@/hooks/useOnboarding';

// ────────────────────────────────────────────────────────────────────────────
// Doc-type-ID → hr.onboarding.docNames.* catalog key. i18n Phase 5.8: the
// display label is resolved via `t(DOC_TYPE_NAME_KEYS[typeId])` — replaces
// the old local Arabic DOC_TYPE_LABELS map (this was the majority phrasing
// that WIZARD_DOC_LABELS in wizard-helpers.ts converged onto).
// ────────────────────────────────────────────────────────────────────────────

const DOC_TYPE_NAME_KEYS: Record<string, 'offerLetter' | 'nda' | 'assetHandover'> = {
  dt_offer_letter: 'offerLetter',
  dt_nda: 'nda',
  dt_asset_handover: 'assetHandover',
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
  const t = useTranslations('hr.onboarding.documents');
  const tDocNames = useTranslations('hr.onboarding.docNames');
  const regenerate = useRegenerateDocument();
  const [regenerating, setRegenerating] = useState(false);

  const routeSegment = DOC_ROUTE_SEGMENT[typeId];
  const nameKey = DOC_TYPE_NAME_KEYS[typeId];
  const displayLabel = nameKey ? tDocNames(nameKey) : label;

  async function handleRegenerate() {
    if (!routeSegment) {
      toast.error(t('toasts.unknownDocType'));
      return;
    }
    setRegenerating(true);
    try {
      await regenerate.mutateAsync({
        onboardingId,
        docType: routeSegment,
      });
      toast.success(t('toasts.regenerateSuccess', { label: displayLabel }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('toasts.regenerateFailedFallback');
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
              {t('download')}
            </a>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">{t('notAvailable')}</span>
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
          {t('regenerate')}
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
  const t = useTranslations('hr.onboarding.documents');
  const tDocNames = useTranslations('hr.onboarding.docNames');
  const regenerate = useRegenerateDocument();
  const [regenerating, setRegenerating] = useState(false);

  const routeSegment = DOC_ROUTE_SEGMENT[typeId];
  const nameKey = DOC_TYPE_NAME_KEYS[typeId];
  const displayLabel = nameKey ? tDocNames(nameKey) : typeId;

  async function handleGenerate() {
    if (!routeSegment) return;
    setRegenerating(true);
    try {
      await regenerate.mutateAsync({ onboardingId, docType: routeSegment });
      toast.success(t('toasts.generateSuccess', { label: displayLabel }));
    } catch {
      toast.error(t('toasts.generateFailed'));
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 opacity-60">
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{displayLabel}</p>
        <p className="text-xs text-muted-foreground">{t('notGeneratedYet')}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-1.5 shrink-0"
        onClick={handleGenerate}
        disabled={regenerating}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
        {t('generate')}
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
  const t = useTranslations('hr.onboarding.documents');
  const docs = onboarding.documents ?? [];
  const docsByType = new Map(docs.map((d) => [d.type_id, d]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('title')}</CardTitle>
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
