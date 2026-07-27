'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { mutateAPI, ApiError } from '@/hooks/api-helpers';
import { QuoteDetailView } from '@/components/quotes/QuoteDetailView';
import { Card, CardContent } from '@/components/ui/card';
import type { PublicQuotePayload } from '@/lib/quotes/public-payload';
import type { SignBlockReason } from '@/lib/quotes/signability';
import { QUOTE_STATUS } from '@/lib/constants/statuses';

/** `content_changed` is a sentinel the page adds on top of the three reasons
 *  canSignQuote() itself can return (Task 1) — the link's content_hash no
 *  longer matches the quote, which canSignQuote has no way to know about. */
type BlockReason = SignBlockReason | 'content_changed';

interface PublicDocCopy {
  alreadySignedTitle: string;
  alreadySignedBody: string;
  quoteExpiredTitle: string;
  quoteExpiredBody: string;
  changedTitle: string;
  changedBody: string;
  unavailableTitle: string;
  unavailableBody: string;
  signError: string;
  downloadError: string;
  rateLimited: string;
}

interface PublicQuoteViewProps {
  token: string;
  quote: PublicQuotePayload;
  canSign: boolean;
  blockReason: BlockReason | null;
  copy: PublicDocCopy;
}

/**
 * Task 6's contract: `{ data: { signed: true } }` on a fresh signature, or
 * `alreadySigned: true` for the race path — "two concurrent submits produce
 * one signature and one friendly already-signed response" (plan Task 6 Step 5),
 * a 200 with a marker, never an error. Not exercised by this task — the route
 * does not exist yet — but the shape is fixed here so Task 6 has a contract
 * to implement against instead of inventing its own.
 */
interface SignResponse {
  signed: boolean;
  alreadySigned?: boolean;
}

const BANNER_COPY: Record<
  BlockReason,
  {
    titleKey: keyof PublicDocCopy;
    bodyKey: keyof PublicDocCopy;
    Icon: typeof AlertTriangle;
    className: string;
  }
> = {
  already_signed: {
    titleKey: 'alreadySignedTitle',
    bodyKey: 'alreadySignedBody',
    Icon: CheckCircle2,
    className:
      'border-green-200 bg-green-50 text-green-800 dark:border-green-800/40 dark:bg-green-950/30 dark:text-green-300',
  },
  quote_expired: {
    titleKey: 'quoteExpiredTitle',
    bodyKey: 'quoteExpiredBody',
    Icon: AlertTriangle,
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300',
  },
  content_changed: {
    titleKey: 'changedTitle',
    bodyKey: 'changedBody',
    Icon: AlertTriangle,
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300',
  },
  wrong_status: {
    titleKey: 'unavailableTitle',
    bodyKey: 'unavailableBody',
    Icon: AlertTriangle,
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300',
  },
};

export function PublicQuoteView({ token, quote, canSign, blockReason, copy }: PublicQuoteViewProps) {
  // Local mirror so a successful sign — or a race-detected already-signed
  // response — can flip the view to read-only without a full page reload.
  const [localQuote, setLocalQuote] = useState<PublicQuotePayload>(quote);
  const [readOnlyReason, setReadOnlyReason] = useState<BlockReason | null>(blockReason);
  const [downloading, setDownloading] = useState(false);

  const signMutation = useMutation({
    mutationFn: (vars: { signature_data: string; signed_by: string }) =>
      mutateAPI<SignResponse>(`/api/public/quotes/${token}/sign`, 'POST', vars),
    onSuccess: (res, vars) => {
      if (res.alreadySigned) {
        // The race path (plan Task 6 Step 5): someone else's concurrent
        // submit won. Not an error — re-render read-only, same as landing
        // on an already-signed quote on first load.
        setReadOnlyReason('already_signed');
        toast.info(copy.alreadySignedTitle);
        return;
      }
      setLocalQuote((prev) => ({
        ...prev,
        status: QUOTE_STATUS.SIGNED,
        signed_by: vars.signed_by,
        signed_at: new Date().toISOString(),
      }));
      setReadOnlyReason('already_signed');
      toast.success(copy.alreadySignedTitle);
    },
    onError: (err) => {
      // checkRateLimit() returns { success, error } while apiSuccess/apiError
      // return { data, error, meta } — divergent envelopes, but both carry a
      // top-level `error` string, so mutateAPI's ApiError.message already
      // reads correctly either way. Only the 429 case needs its own copy
      // (translated, rather than the rate limiter's hardcoded Arabic).
      if (err instanceof ApiError && err.status === 429) {
        toast.error(copy.rateLimited);
        return;
      }
      toast.error(copy.signError);
    },
  });

  const handleSign = async (signatureData: string, signedBy: string) => {
    await signMutation.mutateAsync({ signature_data: signatureData, signed_by: signedBy });
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { generateQuotePDF } = await import('@/lib/pdf/quote-pdf');
      const q = localQuote as Record<string, unknown>;
      await generateQuotePDF({
        quote_number: String(q.quote_number ?? ''),
        estimate_date: String(q.estimate_date ?? ''),
        expiry_date: (q.expiry_date as string | null) ?? null,
        status: String(q.status ?? ''),
        currency: String(q.currency ?? 'AED'),
        subtotal: Number(q.subtotal ?? 0),
        tax_rate: Number(q.tax_rate ?? 0),
        tax_amount: Number(q.tax_amount ?? 0),
        total: Number(q.total ?? 0),
        discount_type: (q.discount_type as 'percentage' | 'fixed' | null) ?? null,
        discount_value: Number(q.discount_value ?? 0),
        discount_amount: Number(q.discount_amount ?? 0),
        notes: (q.notes as string | null) ?? null,
        terms_conditions: (q.terms_conditions as Array<{ text: string }> | null) ?? [],
        // D-1 (owner decision): bank details are omitted from the public
        // payload entirely (lib/quotes/public-payload.ts PUBLIC_QUOTE_FIELDS)
        // — an unauthenticated, forwardable URL must never publish the
        // company IBAN. The PDF template just renders nothing for this block
        // when `bank.bank` is empty.
        bank_details: { bank: '', account_name: '', account_no: '', iban: '' },
        company_name: (q.company_name as string | null) ?? null,
        company_logo: (q.company_logo as string | null) ?? null,
        client_name: (q.client_name as string | null) ?? null,
        client_company: (q.client_company as string | null) ?? null,
        // Not in the public payload either — same allowlist, same reason.
        client_email: null,
        client_phone: null,
        client_address: null,
        project_name: null,
        // The public payload never carries the signature image (S-15
        // allowlist) — only signed_by/signed_at, enough to label the PDF.
        signature_data: null,
        signed_by: (q.signed_by as string | null) ?? null,
        signed_at: (q.signed_at as string | null) ?? null,
        items: localQuote.items,
      });
    } catch {
      toast.error(copy.downloadError);
    } finally {
      setDownloading(false);
    }
  };

  const banner = readOnlyReason ? BANNER_COPY[readOnlyReason] : null;

  return (
    <div className="mx-auto max-w-[800px] space-y-4 py-6">
      {banner && (
        <Card className={banner.className}>
          <CardContent className="flex items-start gap-3 p-4">
            <banner.Icon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{copy[banner.titleKey]}</p>
              <p className="text-sm opacity-90">{copy[banner.bodyKey]}</p>
            </div>
          </CardContent>
        </Card>
      )}
      <QuoteDetailView
        detail={localQuote}
        onBack={() => {}}
        onDownload={handleDownload}
        onSign={handleSign}
        downloading={downloading}
        signing={signMutation.isPending}
        showBack={false}
        canSign={canSign && !readOnlyReason}
      />
    </div>
  );
}
