'use client';

/**
 * React Query hooks for lead attachments (Phase 15.2 Commit 1).
 *
 * Backing routes:
 *   GET    /api/crm/leads/[id]/attachments              → useLeadAttachments(leadId)
 *   POST   /api/crm/leads/[id]/attachments              → useUploadAttachment(leadId)
 *   DELETE /api/crm/leads/[id]/attachments/[attId]      → useDeleteAttachment(leadId)
 *
 * Permission gates are server-side:
 *   - GET    requires leads.view + canAccessLead
 *   - POST   requires leads.update + canAccessLead
 *   - DELETE requires leads.update + canAccessLead + (admin OR uploader)
 *
 * The mutations include the leadId in their queryKey so cache invalidation
 * works without re-fetching every lead's attachments globally.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';
import type { PyraLeadAttachment } from '@/types/database';

export interface LeadAttachmentsResponse {
  attachments: PyraLeadAttachment[];
}

// ── List ──────────────────────────────────────────────────

/**
 * List all attachments for a lead, newest first.
 * Server enforces canAccessLead (sales agents see only their own).
 */
export function useLeadAttachments(leadId: string | undefined) {
  return useQuery<LeadAttachmentsResponse>({
    queryKey: ['crm', 'lead-attachments', leadId],
    queryFn: () => fetchAPI(`/api/crm/leads/${leadId}/attachments`),
    enabled: !!leadId,
    staleTime: 60_000,
  });
}

// ── Upload ────────────────────────────────────────────────

export interface UploadResult {
  attachment: PyraLeadAttachment;
  public_url: string;
}

/**
 * Upload one image to a lead's attachments.
 *
 * Caller resizes the image client-side (lib/utils/image-resize) BEFORE
 * passing the File here. This hook is a thin wrapper around fetch() with
 * cache invalidation — it does NOT do its own resize.
 *
 * Note: we use raw fetch() here (not mutateAPI) because FormData uploads
 * need to set their own Content-Type with boundary. mutateAPI assumes
 * JSON.
 */
export function useUploadAttachment(leadId: string) {
  const qc = useQueryClient();
  return useMutation<UploadResult, Error, File>({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/crm/leads/${leadId}/attachments`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        // Surface the server's Arabic error message instead of a generic
        // "Upload failed" string. apiError responses are { error, ... }.
        let message = `Upload failed (${res.status})`;
        try {
          const body = await res.json();
          if (typeof body?.error === 'string') message = body.error;
        } catch {
          /* Body wasn't JSON — keep generic */
        }
        throw new Error(message);
      }
      const json = await res.json();
      return json.data as UploadResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'lead-attachments', leadId] });
      // Activity tab + lead detail (pyra_lead_activities row was inserted server-side)
      qc.invalidateQueries({ queryKey: ['crm', 'leads', leadId] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', leadId, 'activities'] });
    },
  });
}

// ── Delete ────────────────────────────────────────────────

export function useDeleteAttachment(leadId: string) {
  const qc = useQueryClient();
  return useMutation<{ deleted: string }, Error, string>({
    // CLAUDE.md mandates `mutateAPI` for all POST/PUT/PATCH/DELETE. The
    // upload hook above is exempted because FormData multipart needs the
    // browser-set Content-Type boundary which mutateAPI's hardcoded JSON
    // Content-Type would clobber. DELETE has no body — mutateAPI handles
    // it cleanly, and ApiError thrown by mutateAPI carries the server's
    // Arabic error message via pickServerMessage().
    mutationFn: (attachmentId: string) =>
      mutateAPI<{ deleted: string }>(
        `/api/crm/leads/${leadId}/attachments/${attachmentId}`,
        'DELETE',
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'lead-attachments', leadId] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', leadId] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', leadId, 'activities'] });
    },
  });
}
