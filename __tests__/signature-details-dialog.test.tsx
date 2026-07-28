import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import financeMessages from '@/messages/en/finance.json';

/**
 * Evidence-viewer report (see .superpowers/sdd/evidence-viewer-report.md) —
 * component-level proof for the three real data shapes verified live against
 * production during this task:
 *
 *   - qt_ev_offline (throwaway, deleted after verification): signature_source
 *     'offline' + a real signed_evidence_* triple. Evidence was uploaded to
 *     the pyra-private bucket and downloaded back byte-identical through a
 *     real short-TTL signed URL minted the same way the evidence route does.
 *   - qt_ev_public (throwaway, deleted after verification): signature_source
 *     'public_link' + a signature_data image.
 *   - QT-0003 (real production quote, read-only — never modified): signed
 *     before this feature existed, so signature_source is null while
 *     signed_by/signed_at/signature_data are all populated. That is the
 *     exact "unknown source, but still show the image" case.
 *
 * Login-gated interactive click-through wasn't available to this task (no
 * test credentials), so this test exercises the same component tree React
 * Query would mount, seeded with the literal API-shaped data pulled from the
 * live checks above.
 */

const mocks = vi.hoisted(() => ({
  quote: { data: undefined as unknown, isLoading: false, isError: false },
  evidence: { refetch: vi.fn(), isFetching: false },
  toastError: vi.fn(),
}));

vi.mock('@/hooks/useQuotes', () => ({
  useQuote: () => mocks.quote,
}));

vi.mock('@/hooks/useOfflineSignature', () => ({
  useQuoteOfflineEvidence: () => mocks.evidence,
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError },
}));

import { SignatureDetailsDialog } from '@/components/quotes/SignatureDetailsDialog';

function renderDialog(quoteId: string | null = 'some-id') {
  return render(
    <NextIntlClientProvider locale="en" messages={financeMessages}>
      <SignatureDetailsDialog quoteId={quoteId} onOpenChange={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe('SignatureDetailsDialog', () => {
  beforeEach(() => {
    mocks.quote = { data: undefined, isLoading: false, isError: false };
    mocks.evidence = { refetch: vi.fn(), isFetching: false };
    mocks.toastError.mockReset();
  });

  afterEach(() => cleanup());

  it('shows the attester, the attestation date, and opens the evidence via a real signed URL (qt_ev_offline shape)', async () => {
    mocks.quote.data = {
      quote_number: 'QT-EV-TEST-OFFLINE',
      status: 'invoiced',
      signature_data: null,
      signed_by: 'Offline Test Customer',
      signed_at: '2026-07-28T12:02:37.829Z',
      signature_source: 'offline',
      signed_offline_by: 'elharm',
      signed_offline_at: '2026-07-28T12:02:37.829Z',
      signed_evidence_mime: 'application/pdf',
      signed_evidence_size: 114,
    };
    mocks.evidence.refetch = vi.fn().mockResolvedValue({
      data: { signed_url: 'https://pyraworkspacedb.pyramedia.cloud/storage/v1/object/sign/pyra-private/quotes-evidence/qt_ev_offline/test-evidence.pdf?token=real-token' },
      error: null,
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderDialog();

    expect(screen.getByText('Offline (Paper) Signature')).toBeInTheDocument();
    expect(screen.getByText('Offline Test Customer')).toBeInTheDocument();
    expect(screen.getByText('elharm')).toBeInTheDocument();
    // formatFileSize prefixes an invisible LTR mark (U+200E) for RTL contexts.
    expect(screen.getByText('PDF — ‎114 B')).toBeInTheDocument();
    // No signature_data on the offline path — nothing pretends there's a drawn signature.
    expect(screen.queryByAltText('Signature Image')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'View Evidence File' }));

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('/quotes-evidence/qt_ev_offline/test-evidence.pdf'),
      '_blank',
      'noopener,noreferrer',
    ));

    openSpy.mockRestore();
  });

  it('surfaces a real error, not a silent no-op, when the evidence URL fails to mint', async () => {
    mocks.quote.data = {
      quote_number: 'QT-EV-TEST-OFFLINE',
      status: 'invoiced',
      signature_data: null,
      signed_by: 'Offline Test Customer',
      signed_at: '2026-07-28T12:02:37.829Z',
      signature_source: 'offline',
      signed_offline_by: 'elharm',
      signed_offline_at: '2026-07-28T12:02:37.829Z',
      signed_evidence_mime: 'application/pdf',
      signed_evidence_size: 114,
    };
    mocks.evidence.refetch = vi.fn().mockResolvedValue({ data: undefined, error: new Error('boom') });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'View Evidence File' }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Failed to open the evidence file'));
    expect(openSpy).not.toHaveBeenCalled();

    openSpy.mockRestore();
  });

  it('labels a public-signing-link signature and shows its signature image (qt_ev_public shape)', () => {
    mocks.quote.data = {
      quote_number: 'QT-EV-TEST-PUBLIC',
      status: 'signed',
      signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      signed_by: 'Public Link Test Customer',
      signed_at: '2026-07-28T12:02:37.829Z',
      signature_source: 'public_link',
      signed_offline_by: null,
      signed_offline_at: null,
      signed_evidence_mime: null,
      signed_evidence_size: null,
    };

    renderDialog();

    expect(screen.getByText('Public Signing Link')).toBeInTheDocument();
    expect(screen.getByText('Public Link Test Customer')).toBeInTheDocument();
    const img = screen.getByAltText('Signature Image') as HTMLImageElement;
    expect(img.src).toContain('data:image/png;base64,');
    // No offline attester block for a signature that never came from paper.
    expect(screen.queryByText('Internal Attestation')).toBeNull();
  });

  it('renders the honest unknown-source label for a quote signed before source tracking existed, but still shows its signature image (QT-0003 shape)', () => {
    mocks.quote.data = {
      quote_number: 'QT-0003',
      status: 'signed',
      signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      signed_by: 'Test Customer',
      signed_at: '2026-03-18T20:00:09.798Z',
      signature_source: null,
      signed_offline_by: null,
      signed_offline_at: null,
      signed_evidence_mime: null,
      signed_evidence_size: null,
    };

    renderDialog();

    // Honest — not blank, not a guess.
    expect(screen.getByText('Unknown — signed before signing-method tracking existed')).toBeInTheDocument();
    expect(screen.queryByText('Client Portal')).toBeNull();
    expect(screen.queryByText('Public Signing Link')).toBeNull();
    expect(screen.queryByText('Offline (Paper) Signature')).toBeNull();
    // The signature image is independent of signature_source — it's still evidence.
    expect(screen.getByAltText('Signature Image')).toBeInTheDocument();
  });

  it('is closed when quoteId is null and shows a loading skeleton while the quote query is in flight', () => {
    const { container } = renderDialog(null);
    expect(screen.queryByText('Signature Details')).toBeNull();
    container.remove();

    mocks.quote = { data: undefined, isLoading: true, isError: false };
    renderDialog('some-id');
    expect(document.querySelector('.animate-pulse')).not.toBeNull();
  });
});
