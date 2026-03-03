'use client';

import { createContext, useContext, useEffect } from 'react';
import type { ClientBranding } from '@/lib/portal/branding';
import { DEFAULT_BRANDING } from '@/lib/portal/branding';

const BrandingContext = createContext<ClientBranding>(DEFAULT_BRANDING);

export function useBranding() {
  return useContext(BrandingContext);
}

/**
 * Convert hex color to RGB string for use with Tailwind opacity modifiers.
 * e.g. "#f97316" → "249 115 22"
 */
function hexToRgb(hex: string): string {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '249 115 22'; // fallback orange
  return `${r} ${g} ${b}`;
}

export function BrandingProvider({
  branding,
  children,
}: {
  branding: ClientBranding;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const root = document.documentElement;

    // Inject RGB values for Tailwind opacity modifier support
    // Usage: bg-portal / text-portal / bg-portal/10 etc.
    root.style.setProperty('--portal-primary-rgb', hexToRgb(branding.primary_color));
    root.style.setProperty('--portal-secondary-rgb', hexToRgb(branding.secondary_color));

    // Also keep raw hex for inline style usage
    root.style.setProperty('--portal-primary', branding.primary_color);
    root.style.setProperty('--portal-secondary', branding.secondary_color);

    // Dynamic favicon
    if (branding.favicon_url) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-portal]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.setAttribute('data-portal', 'true');
        document.head.appendChild(link);
      }
      link.href = branding.favicon_url;
    }

    return () => {
      root.style.removeProperty('--portal-primary-rgb');
      root.style.removeProperty('--portal-secondary-rgb');
      root.style.removeProperty('--portal-primary');
      root.style.removeProperty('--portal-secondary');
      // Remove dynamic favicon
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-portal]');
      if (link) link.remove();
    };
  }, [branding.primary_color, branding.secondary_color, branding.favicon_url]);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}
