import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 'standalone' for Docker self-hosted deployment (Node.js 22)
  // On Windows dev without admin/symlink permissions, set NEXT_STANDALONE=false
  output: process.env.NEXT_STANDALONE === 'false' ? undefined : 'standalone',

  // Security headers (PRD Section 11.2)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              `img-src 'self' data: blob: ${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pyraworkspacedb.pyramedia.cloud'}`,
              `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pyraworkspacedb.pyramedia.cloud'} wss://*.supabase.co wss://*.pyramedia.cloud`,
              "frame-src 'self'",
              "media-src 'self' blob:",
            ].join('; '),
          },
        ],
      },
    ];
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pyraworkspacedb.pyramedia.cloud',
      },
    ],
  },
};

export default nextConfig;
