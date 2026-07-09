'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Calendar, Pencil, Trash2 } from 'lucide-react';
import type { PyraDocumentType } from '@/types/database';

interface DocTypeRowProps {
  docType: PyraDocumentType;
  onEdit: (dt: PyraDocumentType) => void;
  onDelete: (id: string) => void;
}

export function DocTypeRow({ docType: dt, onEdit, onDelete }: DocTypeRowProps) {
  const t = useTranslations('hr.documents.docTypeRow');
  return (
    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
          <FileText className="h-4 w-4 text-orange-500" />
        </div>
        <div>
          {/* Dual display (name_ar + (name)) is intentional regardless of
              locale — admin catalog-management UX exemption (locked). */}
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{dt.name_ar}</p>
            <span className="text-xs text-muted-foreground">({dt.name})</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {dt.requires_expiry ? (
              <Badge
                variant="outline"
                className="text-[10px] border-amber-400 text-amber-600 dark:text-amber-400"
              >
                <Calendar className="h-2.5 w-2.5 me-1" />
                {t('requiresExpiryBadge')}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                {t('noExpiryBadge')}
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">
              {t('sortOrderLabel', { order: dt.sort_order })}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onEdit(dt)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
          onClick={() => onDelete(dt.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
