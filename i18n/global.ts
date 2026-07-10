import type common from '../messages/ar/common.json';
import type nav from '../messages/ar/nav.json';
import type auth from '../messages/ar/auth.json';
import type statuses from '../messages/ar/statuses.json';
import type mywork from '../messages/ar/mywork.json';
import type boards from '../messages/ar/boards.json';
import type calendar from '../messages/ar/calendar.json';
import type api from '../messages/ar/api.json';
import type crm from '../messages/ar/crm.json';
import type finance from '../messages/ar/finance.json';
import type hr from '../messages/ar/hr.json';
import type settings from '../messages/ar/settings.json';
import type admin from '../messages/ar/admin.json';
import type users from '../messages/ar/users.json';
import type rbac from '../messages/ar/rbac.json';
import type guide from '../messages/ar/guide.json';
import type clients from '../messages/ar/clients.json';
import type projects from '../messages/ar/projects.json';
import type files from '../messages/ar/files.json';
import type teams from '../messages/ar/teams.json';
import type calls from '../messages/ar/calls.json';

type Messages = typeof common & typeof nav & typeof auth & typeof statuses
  & typeof mywork & typeof boards & typeof calendar & typeof api
  & typeof crm & typeof finance & typeof hr
  & typeof settings & typeof admin & typeof users & typeof rbac
  & typeof guide
  & typeof clients & typeof projects & typeof files & typeof teams
  & typeof calls;

declare module 'next-intl' {
  interface AppConfig {
    // Keep in sync with LOCALES in lib/i18n/config.ts (literal union here —
    // a type-only import of the const can't be used in typeof reliably).
    Locale: 'ar' | 'en';
    Messages: Messages;
  }
}
