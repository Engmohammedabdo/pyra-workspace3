'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from '@/lib/i18n/config';

/**
 * Pre-auth language toggle — cookie only (no user/session yet; after login
 * the DB preference wins via login-cookie / LocaleSync). Shows the OTHER
 * language's endonym as the label.
 */
export function LocaleToggleAnon({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const next: Locale = locale === 'ar' ? 'en' : 'ar';

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => {
        const secure = window.location.protocol === 'https:' ? '; secure' : '';
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
        router.refresh();
      }}
    >
      <Languages className="h-4 w-4 me-1.5" />
      {next === 'en' ? 'English' : 'العربية'}{/* i18n-exempt: language endonym label, not translatable content */}
    </Button>
  );
}
