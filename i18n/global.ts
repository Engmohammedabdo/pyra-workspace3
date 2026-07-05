import type common from '../messages/ar/common.json';
import type nav from '../messages/ar/nav.json';
import type auth from '../messages/ar/auth.json';
import type statuses from '../messages/ar/statuses.json';

type Messages = typeof common & typeof nav & typeof auth & typeof statuses;

declare module 'next-intl' {
  interface AppConfig {
    // Keep in sync with LOCALES in lib/i18n/config.ts (literal union here —
    // a type-only import of the const can't be used in typeof reliably).
    Locale: 'ar' | 'en';
    Messages: Messages;
  }
}
