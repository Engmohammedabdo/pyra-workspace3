'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';

/**
 * Public quote-signing link state, as returned by GET /api/quotes/[id]/link.
 *
 * `token`/`url` are deliberately absent here — migration 054's table comment
 * is explicit that the token must never appear in a list/GET response (S-5).
 * They only ever exist on the QuoteLinkCreated shape below, which is what
 * useCreateQuoteLink() resolves with right after a successful mint.
 */
export interface QuoteLinkInfo {
  exists: boolean;
  id?: string;
  expires_at?: string | null;
  created_at?: string;
  view_count?: number;
  last_viewed_at?: string | null;
}

/**
 * Response shape for the create call. `token`/`url` are `null` in the rare
 * case this request lost a concurrent-mint race — the link exists (some
 * other request's insert won) but this caller never gets to see its token.
 */
export interface QuoteLinkCreated extends QuoteLinkInfo {
  token: string | null;
  url: string | null;
}

export function useQuoteLink(quoteId: string | undefined) {
  return useQuery<QuoteLinkInfo>({
    queryKey: ['quote-link', quoteId],
    queryFn: () => fetchAPI(`/api/quotes/${quoteId}/link`),
    enabled: !!quoteId,
    staleTime: 15_000,
  });
}

export function useCreateQuoteLink() {
  const queryClient = useQueryClient();
  return useMutation<QuoteLinkCreated, Error, string>({
    mutationFn: (quoteId) => mutateAPI(`/api/quotes/${quoteId}/link`, 'POST'),
    onSuccess: (_data, quoteId) => {
      queryClient.invalidateQueries({ queryKey: ['quote-link', quoteId] });
    },
  });
}

export function useRevokeQuoteLink() {
  const queryClient = useQueryClient();
  return useMutation<{ revoked: boolean }, Error, string>({
    mutationFn: (quoteId) => mutateAPI(`/api/quotes/${quoteId}/link`, 'DELETE'),
    onSuccess: (_data, quoteId) => {
      queryClient.invalidateQueries({ queryKey: ['quote-link', quoteId] });
    },
  });
}
