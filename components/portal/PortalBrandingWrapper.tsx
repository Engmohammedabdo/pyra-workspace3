'use client';

import { useState, useEffect } from 'react';
import { fetchAPI } from '@/hooks/api-helpers';
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
        const data = await fetchAPI<Record<string, string | null>>('/api/portal/branding');
        setBranding({
          primary_color: data.primary_color || DEFAULT_BRANDING.primary_color,
          secondary_color: data.secondary_color || DEFAULT_BRANDING.secondary_color,
          logo_url: data.logo_url || null,
          favicon_url: data.favicon_url || null,
          company_name_display: data.company_name_display || null,
          login_background_url: data.login_background_url || null,
        });
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
