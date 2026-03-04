# Portal Branding System

> Dynamic white-label branding for the Client Portal. Each client can have unique colors, logo, and favicon.

---

## Overview

The branding system allows admins to customize the visual identity of each client's portal experience. When a client logs in, the portal automatically applies their brand colors, logo, and favicon.

### What Can Be Customized

| Property | Description | Applied Where |
|----------|-------------|---------------|
| `primary_color` | Main accent color (buttons, links, active states) | All portal pages |
| `secondary_color` | Hover/dark accent color | Button hovers, gradients |
| `logo_url` | Company logo image | Sidebar header, mobile nav |
| `favicon_url` | Browser tab icon | Dynamic `<link>` injection |
| `company_name_display` | Company name shown in UI | Sidebar, footer |
| `login_background_url` | Login page background | *(reserved for future use)* |

---

## Architecture

```
Admin Dashboard                    Database                     Client Portal
┌─────────────────┐     ┌──────────────────────┐     ┌───────────────────────┐
│ BrandingEditor   │────>│ pyra_client_branding │<────│ PortalBrandingWrapper │
│ (upload, colors) │     │ (per-client row)     │     │ (fetches on mount)    │
└─────────────────┘     └──────────────────────┘     └──────────┬────────────┘
                                                                │
                                                     ┌──────────▼────────────┐
                                                     │  BrandingProvider     │
                                                     │  - useBranding() hook │
                                                     │  - CSS vars injection │
                                                     │  - Favicon injection  │
                                                     └──────────┬────────────┘
                                                                │
                                                     ┌──────────▼────────────┐
                                                     │  Tailwind `portal`    │
                                                     │  color class          │
                                                     │  bg-portal, text-portal│
                                                     │  bg-portal/10, etc.   │
                                                     └───────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/portal/branding.ts` | `ClientBranding` interface + `DEFAULT_BRANDING` constants |
| `components/portal/BrandingProvider.tsx` | React context provider, CSS variable injection, favicon |
| `components/portal/PortalBrandingWrapper.tsx` | Fetches branding from API, wraps children |
| `components/clients/BrandingEditor.tsx` | Admin UI for editing colors + uploading logo/favicon |
| `app/api/clients/[id]/branding/route.ts` | GET/PATCH branding data |
| `app/api/clients/[id]/branding/upload/route.ts` | POST file upload (logo/favicon) |
| `app/api/portal/branding/route.ts` | Portal-facing GET endpoint (by session) |
| `tailwind.config.ts` | `portal` color definition using CSS variables |

---

## How It Works

### 1. CSS Variable Injection

`BrandingProvider` injects RGB values into `document.documentElement`:

```
--portal-primary-rgb: 249 115 22    (from primary_color hex)
--portal-secondary-rgb: 234 88 12   (from secondary_color hex)
--portal-primary: #f97316            (raw hex for inline styles)
--portal-secondary: #ea580c          (raw hex for inline styles)
```

### 2. Tailwind Integration

In `tailwind.config.ts`, a `portal` color is defined:

```ts
portal: {
  DEFAULT: 'rgb(var(--portal-primary-rgb, 249 115 22) / <alpha-value>)',
  secondary: 'rgb(var(--portal-secondary-rgb, 234 88 12) / <alpha-value>)',
}
```

This enables full Tailwind usage with opacity modifiers:

```tsx
<div className="bg-portal text-white">        // Full color
<div className="bg-portal/10 text-portal">     // 10% opacity background
<div className="hover:bg-portal-secondary">    // Hover state
<div className="border-portal/30">             // 30% opacity border
```

### 3. Sidebar/Topbar (Inline Styles)

Navigation components use `useBranding()` directly for logo and company name:

```tsx
const branding = useBranding();
const primaryColor = branding.primary_color || '#f97316';
const displayName = branding.company_name_display || 'PYRAMEDIA X';
const logoUrl = branding.logo_url;
```

### 4. Favicon

`BrandingProvider` dynamically creates/updates a `<link rel="icon" data-portal>` element when `favicon_url` is set. It's cleaned up on unmount.

---

## Database Table

**`pyra_client_branding`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `client_id` | text | FK to `pyra_clients.id` (unique) |
| `primary_color` | text | Hex color (e.g., `#3B82F6`) |
| `secondary_color` | text | Hex color for hover states |
| `logo_url` | text | Public URL to logo image |
| `favicon_url` | text | Public URL to favicon |
| `company_name_display` | text | Display name override |
| `login_background_url` | text | Login page background image |
| `updated_at` | timestamptz | Last modification time |

---

## Default Behavior

When no branding is configured for a client:
- **Colors**: Orange (`#f97316` / `#ea580c`) — Pyramedia X brand
- **Logo**: First letter of company name in colored circle
- **Name**: "PYRAMEDIA X"
- **Favicon**: Default site favicon

---

## Admin Usage

1. Go to **Dashboard > Clients > [Client Name]**
2. Click the **"الهوية البصرية"** (Branding) tab
3. Set primary/secondary colors via color pickers
4. Upload logo and favicon via drag-drop zones
5. Set custom company display name
6. Click **"حفظ التغييرات"** (Save Changes)

Changes take effect immediately when the client refreshes their portal.

---

## Limitations

| Area | Status | Notes |
|------|--------|-------|
| Login page | Uses defaults | Client unknown before authentication |
| Email templates | Hardcoded | Uses "Pyra Workspace" branding (server-side) |
| PDF generators | Hardcoded | Uses orange accent color |
| Share page | Uses defaults | No branding context available |
