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
 * Upload payload — supports both images (Commit 1) and voice notes
 * (Commit 2). For voice notes, durationSeconds is required (server
 * rejects with 422 if missing).
 */
export interface UploadInput {
  file: File;
  fileType?: 'image' | 'voice_note';
  durationSeconds?: number;
}

/**
 * Upload one image or voice note to a lead's attachments.
 *
 * Caller responsibility:
 *   - Images: client-side resize via lib/utils/image-resize BEFORE invoking
 *     this hook (EXIF strip + downscale + JPEG re-encode).
 *   - Voice notes: client-side recording via hooks/useVoiceRecorder; pass
 *     the resulting Blob (wrapped as File) plus durationSeconds.
 *
 * Note: we use raw fetch() here (not mutateAPI) because FormData uploads
 * need browser-set Content-Type with multipart boundary. mutateAPI hardcodes
 * application/json which would corrupt the upload.
 */
export function useUploadAttachment(leadId: string) {
  const qc = useQueryClient();
  return useMutation<UploadResult, Error, UploadInput>({
    mutationFn: async ({ file, fileType = 'image', durationSeconds }) => {
      const form = new FormData();
      form.append('file', file);
      // file_type defaults to 'image' server-side too (Commit 1 backwards
      // compat), but we send it explicitly when uploading voice notes so
      // the server's duration validation kicks in.
      if (fileType !== 'image') form.append('file_type', fileType);
      if (typeof durationSeconds === 'number' && durationSeconds > 0) {
        form.append('duration_seconds', String(Math.floor(durationSeconds)));
      }
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
