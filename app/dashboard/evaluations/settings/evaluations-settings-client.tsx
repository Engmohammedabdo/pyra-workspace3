'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { dirFor, type Locale } from '@/lib/i18n/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Settings,
  Plus,
  CheckCircle,
  XCircle,
  ListOrdered,
} from 'lucide-react';
import type { AuthSession } from '@/lib/auth/guards';

// ============================================================
// Types
// ============================================================

interface Criterion {
  id: string;
  name: string;
  name_ar: string;
  description: string | null;
  weight: number;
  category: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

// ============================================================
// Category constants
// ============================================================

// DB enum keys (pyra_evaluation_criteria.category) — labels resolve via
// useStatusLabels('evaluationCriteriaCategory') at render time.
const CATEGORY_VALUES = [
  'technical', 'communication', 'leadership', 'productivity',
  'teamwork', 'creativity', 'other',
] as const;

// ============================================================
// Main Component
// ============================================================

export default function EvaluationsSettingsClient({ session: _session }: { session: AuthSession }) {
  const t = useTranslations('hr.evaluations.settings');
  const locale = useLocale() as Locale;
  const categoryLabelFor = useStatusLabels('evaluationCriteriaCategory');
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    name_ar: '',
    description: '',
    weight: '1',
    category: '',
  });

  const { data: criteria = [], isLoading: loading } = useQuery<Criterion[]>({
    queryKey: ['evaluation-criteria'],
    queryFn: () => fetchAPI('/api/dashboard/evaluations/criteria'),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => mutateAPI('/api/dashboard/evaluations/criteria', 'POST', data),
    onSuccess: () => {
      toast.success(t('toasts.createSuccess'));
      setCreateOpen(false);
      setFormData({ name: '', name_ar: '', description: '', weight: '1', category: '' });
      queryClient.invalidateQueries({ queryKey: ['evaluation-criteria'] });
    },
    onError: () => toast.error(t('toasts.createFailed')),
  });

  const handleCreate = () => {
    if (!formData.name || !formData.name_ar) { toast.error(t('toasts.validationError')); return; }
    createMutation.mutate({
      name: formData.name, name_ar: formData.name_ar,
      description: formData.description || null,
      weight: parseFloat(formData.weight) || 1, category: formData.category || null,
    });
  };

  // Group criteria by category
  const grouped = criteria.reduce<Record<string, Criterion[]>>((acc, c) => {
    const key = c.category || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-4"
      >
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-semibold">{t('title')}</h2>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          size="sm"
          className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="h-4 w-4" />
          {t('createButton')}
        </Button>
      </div>

      {/* Criteria List */}
      {criteria.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title={t('empty.title')}
          description={t('empty.description')}
          actionLabel={t('empty.actionLabel')}
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <Card key={category}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {categoryLabelFor(category)}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {t('criteriaCount', {
                    count: items.length,
                    label: items.length === 1 ? t('criteriaCountSingular') : t('criteriaCountPlural'),
                  })}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {items.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {locale === 'ar' ? c.name_ar : (c.name || c.name_ar)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({locale === 'ar' ? (c.name || c.name_ar) : c.name_ar})
                        </span>
                        {c.is_active ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-500" />
                        )}
                      </div>
                      {c.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-end">
                        <span className="text-xs text-muted-foreground">{t('weightLabel')}</span>
                        <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
                          {c.weight}
                        </p>
                      </div>
                      <div className="text-end">
                        <span className="text-xs text-muted-foreground">{t('sortOrderLabel')}</span>
                        <p className="text-sm font-medium">{c.sort_order}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Create Criterion Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" dir={dirFor(locale)}>
          <DialogHeader>
            <DialogTitle>{t('createDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('createDialog.nameEnLabel')}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="Technical Skills"
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t('createDialog.nameArLabel')}</Label>
              <Input
                value={formData.name_ar}
                onChange={(e) => setFormData((p) => ({ ...p, name_ar: e.target.value }))}
                placeholder="المهارات التقنية"
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t('createDialog.descriptionLabel')}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder={t('createDialog.descriptionPlaceholder')}
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label>{t('createDialog.weightLabel')}</Label>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                value={formData.weight}
                onChange={(e) => setFormData((p) => ({ ...p, weight: e.target.value }))}
                className="mt-1"
                dir="ltr"
              />
            </div>
            <div>
              <Label>{t('createDialog.categoryLabel')}</Label>
              <Select
                value={formData.category}
                onValueChange={(v) => setFormData((p) => ({ ...p, category: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t('createDialog.categoryPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_VALUES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {categoryLabelFor(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('createDialog.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {createMutation.isPending ? t('createDialog.creating') : t('createDialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
