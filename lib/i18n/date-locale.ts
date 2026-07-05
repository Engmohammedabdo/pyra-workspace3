import { ar, enUS } from 'date-fns/locale';
import type { Locale as DateFnsLocale } from 'date-fns';
import type { Locale } from './config';

export function getDateFnsLocale(locale: Locale): DateFnsLocale {
  return locale === 'ar' ? ar : enUS;
}
