'use client';

import { useEffect } from 'react';

/**
 * Flags the document body (`data-crm`) while a CRM route is mounted, so the
 * warm CRM palette can also reach Radix/shadcn overlays — Select, Dropdown,
 * Popover, Dialog, Sheet, AlertDialog — which portal to `document.body`,
 * OUTSIDE the `.crm-theme` wrapper and would otherwise fall back to the app's
 * cool-neutral palette (visibly mismatched against the warm CRM cards in dark
 * mode).
 *
 * The paired CSS in globals.css targets ONLY the portaled overlay containers
 * (`body[data-crm] [data-radix-popper-content-wrapper]`, `[role="dialog"]`,
 * `[role="alertdialog"]`) — never the persistent shared sidebar/topbar, which
 * are plain `<nav>`/`<header>` and stay on the app's default palette. Cleared
 * on unmount so leaving CRM restores the neutral overlay palette immediately.
 */
export function CrmThemeScope() {
  useEffect(() => {
    document.body.dataset.crm = '1';
    return () => {
      delete document.body.dataset.crm;
    };
  }, []);
  return null;
}
