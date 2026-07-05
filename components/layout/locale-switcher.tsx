'use client';

import { useId } from 'react';
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { mutateAPI } from '@/hooks/api-helpers';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Locale } from '@/lib/i18n/config';

type LocaleEndpoint = '/api/profile' | '/api/portal/profile';

/**
 * Persists the new preference to the DB (the API also refreshes the
 * pyra_locale cookie on its response), clears the React Query cache
 * (cached payloads may embed locale-shaped strings), and re-renders the
 * RSC tree in the new locale.
 */
function useChangeLocale(endpoint: LocaleEndpoint) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations('common');

  return useMutation({
    mutationFn: (next: Locale) =>
      mutateAPI(endpoint, 'PATCH', { preferred_language: next }),
    onSuccess: () => {
      queryClient.clear();
      router.refresh();
    },
    onError: () => toast.error(t('language.updateFailed')),
  });
}

/** Topbar icon toggle — one click flips AR ⇄ EN. */
export function LocaleSwitcher({ endpoint }: { endpoint: LocaleEndpoint }) {
  const locale = useLocale();
  const t = useTranslations('common');
  const next: Locale = locale === 'ar' ? 'en' : 'ar';
  const mutation = useChangeLocale(endpoint);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => mutation.mutate(next)}
          disabled={mutation.isPending}
          aria-label={t('language.switchTo', { language: t(`language.${next}`) })}
        >
          <Languages className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {t('language.switchTo', { language: t(`language.${next}`) })}
      </TooltipContent>
    </Tooltip>
  );
}

/** Labeled select for profile/settings pages — saves immediately on change. */
export function LocaleSelect({ endpoint }: { endpoint: LocaleEndpoint }) {
  const locale = useLocale();
  const t = useTranslations('common');
  const mutation = useChangeLocale(endpoint);
  const id = useId();

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">{t('language.label')}</label>
      <Select
        value={locale}
        onValueChange={(v) => v !== locale && mutation.mutate(v as Locale)}
        disabled={mutation.isPending}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ar">{t('language.ar')}</SelectItem>
          <SelectItem value="en">{t('language.en')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
