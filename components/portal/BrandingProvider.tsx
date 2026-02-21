'use client';

import { createContext, useContext, useEffect } from 'react';
import type { ClientBranding } from '@/lib/portal/branding';
import { DEFAULT_BRANDING } from '@/lib/portal/branding';

const BrandingContext = createContext<ClientBranding>(DEFAULT_BRANDING);

export function useBranding() {
  return useContext(BrandingContext);
}

export function BrandingProvider({
  branding,
  children,
}: {
  branding: ClientBranding;
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Inject CSS custom properties for the portal theme
    const root = document.documentElement;
    root.style.setProperty('--portal-primary', branding.primary_color);
    root.style.setProperty('--portal-secondary', branding.secondary_color);

    return () => {
      root.style.removeProperty('--portal-primary');
      root.style.removeProperty('--portal-secondary');
    };
  }, [branding.primary_color, branding.secondary_color]);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}
