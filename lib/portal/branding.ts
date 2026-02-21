export interface ClientBranding {
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  favicon_url: string | null;
  company_name_display: string | null;
  login_background_url: string | null;
}

export const DEFAULT_BRANDING: ClientBranding = {
  primary_color: '#f97316',
  secondary_color: '#ea580c',
  logo_url: null,
  favicon_url: null,
  company_name_display: null,
  login_background_url: null,
};
