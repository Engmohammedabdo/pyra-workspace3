import type common from '../messages/ar/common.json';

// Phase 1 extends this intersection: typeof common & typeof nav & typeof auth & typeof statuses
type Messages = typeof common;

declare module 'next-intl' {
  interface AppConfig {
    // Keep in sync with LOCALES in lib/i18n/config.ts (literal union here —
    // a type-only import of the const can't be used in typeof reliably).
    Locale: 'ar' | 'en';
    Messages: Messages;
  }
}
