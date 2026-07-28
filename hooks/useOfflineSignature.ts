'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';

export interface AttestOfflineSignatureInput {
  quoteId: string;
  file: File;
  signedBy: string;
  /** 'YYYY-MM-DD' — the date the CUSTOMER signed, typed by the admin. */
  signedAt: string;
}

export interface OfflineSignatureResult {
  id: string;
  quote_number: string;
  status: string;
  signed_by: string;
  signed_at: string;
  signed_offline_by: string;
  signed_offline_at: string;
}

/**
 * Record a signature obtained outside the system (the customer signed the
 * PDF quote we emailed or handed over on paper) and upload the counter-signed
 * file as evidence.
 *
 * Raw `fetch()` is the sanctioned FormData exemption (matches
 * useUploadEmployeeDocument in hooks/useEmployeeDocuments.ts) — every other
 * quote mutation goes through mutateAPI.
 */
export function useAttestOfflineSignature() {
  const qc = useQueryClient();
  return useMutation<OfflineSignatureResult, Error, AttestOfflineSignatureInput>({
    mutationFn: async ({ quoteId, file, signedBy, signedAt }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('signed_by', signedBy);
      form.append('signed_at', signedAt);
      const res = await fetch(`/api/quotes/${quoteId}/offline-signature`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        let message = `Upload failed (${res.status})`;
        try {
          const body = await res.json();
          if (typeof body?.error === 'string') message = body.error;
        } catch {
          // response body wasn't JSON — keep the generic message
        }
        throw new Error(message);
      }
      return (await res.json()).data as OfflineSignatureResult;
    },
    onSuccess: (_data, { quoteId }) => {
      qc.invalidateQueries({ queryKey: ['quote-offline-evidence', quoteId] });
    },
  });
}

/**
 * On-demand signed URL for the stored evidence file. Disabled by default —
 * call `.refetch()` from a "view evidence" action rather than minting a URL
 * nobody asked for (the short TTL exists precisely so unused URLs expire fast).
 */
export function useQuoteOfflineEvidence(quoteId: string | undefined) {
  return useQuery<{ signed_url: string }>({
    queryKey: ['quote-offline-evidence', quoteId],
    queryFn: () => fetchAPI(`/api/quotes/${quoteId}/offline-signature/evidence`),
    enabled: false,
  });
}
