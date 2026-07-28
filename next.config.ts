import { execSync } from 'node:child_process';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/**
 * The commit this bundle was built from, resolved at BUILD time and inlined.
 *
 * Exists so a deploy can be verified from outside without logging in. Before
 * this, `/api/health` returned a hardcoded "3.0.0" that never changed, so the
 * only way to tell whether a push had actually rolled out was to find some
 * user-visible string unique to the new build — and twice that guesswork
 * reported a deploy as live while the old container was still serving.
 *
 * Coolify exposes the commit under one of several names depending on how the
 * app was created, so all the known ones are tried before falling back to git
 * (which works for a local `pnpm build` but not inside a source-only container).
 * `unknown` is a legitimate answer — better than a stale or invented value.
 */
function resolveBuildCommit(): string {
  const fromEnv =
    process.env.SOURCE_COMMIT ||
    process.env.COOLIFY_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.GIT_SHA;
  if (fromEnv) return fromEnv.trim().slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pyraworkspacedb.pyramedia.cloud';
const appUrl =
  process.env.NEXT_PUBLIC_APP_URL || 'https://workspace.pyramedia.cloud';

const nextConfig: NextConfig = {
  // Always use standalone for containerised deployment (Coolify / Nixpacks)
  output: 'standalone',

  // Inlined at build time so /api/health can report which commit is actually
  // running. NOT NEXT_PUBLIC_* — these are read only by the server-side health
  // route and must not be bundled into client JS.
  env: {
    BUILD_COMMIT: resolveBuildCommit(),
    BUILD_TIME: new Date().toISOString(),
  },

  // Skip ESLint during production builds — run in CI/dev only, saves ~2min per deploy
  eslint: { ignoreDuringBuilds: true },

  // Skip TypeScript errors during production builds — already checked via `pnpm run check`
  typescript: { ignoreBuildErrors: true },

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
          `img-src 'self' data: blob: ${supabaseUrl} ${appUrl} https://pps.whatsapp.net https://*.whatsapp.net`,
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
      // Public quote-signing link (/d/<token>) — the token is a bearer
      // credential living in the URL path, so it must never leak via the
      // Referer header when a customer clicks through to a third-party site
      // from this page (the site-wide default is the weaker
      // strict-origin-when-cross-origin). Also excluded from search
      // indexing — a leaked/crawled token would let anyone view (though not
      // sign) the quote. Last entry wins per key for a path matched by
      // multiple blocks (Next.js headers() semantics), so this overrides the
      // catch-all's Referrer-Policy for this one route.
      {
        source: '/d/:token',
        headers: [
          ...commonHeaders,
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
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

export default withNextIntl(nextConfig);
