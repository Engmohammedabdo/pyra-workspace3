import type { NextConfig } from 'next';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pyraworkspacedb.pyramedia.cloud';
const appUrl =
  process.env.NEXT_PUBLIC_APP_URL || 'https://workspace.pyramedia.cloud';

const nextConfig: NextConfig = {
  // Always use standalone for containerised deployment (Coolify / Nixpacks)
  output: 'standalone',

  // External packages that need native modules
  serverExternalPackages: ['bcryptjs'],

  // Security headers (PRD Section 11.2)
  async headers() {
    const commonHeaders = [
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'X-XSS-Protection',
        value: '1; mode=block',
      },
      {
        key: 'X-DNS-Prefetch-Control',
        value: 'on',
      },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          `img-src 'self' data: blob: ${supabaseUrl} ${appUrl}`,
          `connect-src 'self' blob: ${supabaseUrl} ${appUrl} https://cdn.jsdelivr.net wss://*.supabase.co wss://*.pyramedia.cloud`,
          `frame-src 'self' ${supabaseUrl} blob: https://view.officeapps.live.com`,
          `media-src 'self' blob: ${supabaseUrl}`,
          "worker-src 'self' blob:",
        ].join('; '),
      },
    ];

    return [
      // Default: DENY framing for all routes (catch-all FIRST so specific overrides win)
      {
        source: '/(.*)',
        headers: [
          ...commonHeaders,
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
        ],
      },
      // File download API routes — allow same-origin embedding (for PDF preview via iframe)
      {
        source: '/api/files/download/:path*',
        headers: [
          ...commonHeaders,
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
        ],
      },
      // Portal file view route — allow same-origin embedding (for PDF preview via iframe)
      {
        source: '/api/portal/files/:id/view',
        headers: [
          ...commonHeaders,
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
        ],
      },
    ];
  },

  // Webpack: handle pdfjs-dist worker & canvas
  webpack: (config) => {
    // Alias for pdfjs-dist worker (resolves to build/ in v5)
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pyraworkspacedb.pyramedia.cloud',
      },
      {
        protocol: 'https',
        hostname: 'workspace.pyramedia.cloud',
      },
    ],
  },
};

export default nextConfig;
