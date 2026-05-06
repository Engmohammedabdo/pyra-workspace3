'use client';

import { EmptyState } from '@/components/ui/empty-state';
import { FolderOpen } from 'lucide-react';

/**
 * Files tab — placeholder for v1.
 *
 * Files are surfaced via:
 *   - file_attached activities in the timeline (Phase 5 timeline shows them)
 *   - the existing /dashboard/files surface, scoped per project/client
 *
 * A dedicated lead-files index lives in v1.1; for now we direct the user
 * back to where files actually exist so they don't think the system is
 * missing the feature.
 */

export function LeadFilesTab() {
  return (
    <EmptyState
      icon={FolderOpen}
      title="إدارة الملفات قيد البناء"
      description="حالياً، الملفات المرتبطة بالـ Lead بتظهر في تايم لاين النشاط (file_attached). فهرس مخصص للملفات هييجي في الإصدار 1.1."
    />
  );
}
