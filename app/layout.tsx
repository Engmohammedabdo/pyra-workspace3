import type { Metadata, Viewport } from 'next';
import { Cairo, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import { Toaster } from 'sonner';
import './globals.css';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pyra Workspace',
  description: 'PYRAMEDIA X Digital Workspace — File Management & Client Portal',
  manifest: '/manifest.json',
  // Phase 10 Commit 3 — point apple-touch-icon at a proper PNG (iOS Safari
  // does not honour SVG apple-touch-icons). The PNG asset is supplied by
  // Abdou; until it lands the link 404s gracefully (browser falls back to
  // the manifest icons).
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
  // Phase 10 Commit 3 — Apple PWA meta tags. statusBarStyle="black-translucent"
  // makes the iOS status bar overlap the web app content with translucency
  // (matches our orange theme + the brand's edge-to-edge feel). title="Pyra"
  // is what shows under the home-screen icon on iOS install.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Pyra',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

// Phase 10 Commit 3 — viewport-fit=cover is REQUIRED when pairing with
// appleWebApp.statusBarStyle='black-translucent' (set in metadata above).
// Without it, the translucent iOS status bar overlaps the web app content
// without the proper safe-area inset, clipping the header on notch /
// Dynamic Island devices (iPhone X+).
//
// Next.js 15 prefers the standalone `viewport` export over inlining inside
// `metadata` (which is the older deprecated pattern). themeColor still
// also exists as a <meta> tag in the <head> below for redundancy.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#f97316" />
      </head>
      <body
        className={`${cairo.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            {children}
          </QueryProvider>
          <Toaster
            position="top-center"
            richColors
            closeButton
            dir="rtl"
          />
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
