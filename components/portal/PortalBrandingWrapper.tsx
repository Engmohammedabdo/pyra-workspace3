'use client';

import { useState, useEffect } from 'react';
import { BrandingProvider } from '@/components/portal/BrandingProvider';
import { DEFAULT_BRANDING } from '@/lib/portal/branding';
import type { ClientBranding } from '@/lib/portal/branding';

export function PortalBrandingWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [branding, setBranding] = useState<ClientBranding>(DEFAULT_BRANDING);

  useEffect(() => {
    async function fetchBranding() {
      try {
        const res = await fetch('/api/portal/branding');
        const json = await res.json();
        if (json.data) {
          setBranding({
            primary_color: json.data.primary_color || DEFAULT_BRANDING.primary_color,
            secondary_color: json.data.secondary_color || DEFAULT_BRANDING.secondary_color,
            logo_url: json.data.logo_url || null,
            favicon_url: json.data.favicon_url || null,
            company_name_display: json.data.company_name_display || null,
            login_background_url: json.data.login_background_url || null,
          });
        }
      } catch {
        /* use defaults on error */
      }
    }

    fetchBranding();
  }, []);

  return (
    <BrandingProvider branding={branding}>
      {children}
    </BrandingProvider>
  );
}
