import type { ReactNode } from 'react';
import { CrmThemeScope } from '@/components/crm/crm-theme-scope';

/**
 * CRM "Pyra Pro" theme wrapper.
 *
 * Scopes the warm-neutral (stone) palette override — see `.crm-theme` in
 * app/globals.css — to the CRM module content ONLY. The shared dashboard
 * Sidebar + Topbar live one level up in app/dashboard/layout.tsx and are
 * intentionally left on the app's default cool-neutral palette (locked
 * decision: retint CRM pages only, never the shared shell).
 *
 * The negative-margin breakout (`-m-4 lg:-m-6`) counteracts the parent
 * <main>'s `p-4 lg:p-6` so the warm canvas paints edge-to-edge, then the
 * same padding is re-applied inside. `min-h` keeps the canvas covering at
 * least the viewport when a page's content is short.
 *
 * <CrmThemeScope> extends the warm palette to CRM's portaled overlays
 * (Select/Dialog/Sheet/…) which render outside this wrapper — see its doc.
 */
export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="crm-theme bg-background text-foreground -m-4 lg:-m-6 p-4 lg:p-6 min-h-[calc(100dvh-4rem)]">
      <CrmThemeScope />
      {children}
    </div>
  );
}
