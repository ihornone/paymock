import type { Metadata, Viewport } from 'next';
import './globals.css';

import { readRuntimeEnv } from '@/shared/config/runtime-env';

/**
 * Per-request rendering for the shell.
 *
 * The publishable Clerk key is read from the Worker's runtime variables, so
 * the meta tag must be rendered per request: a statically prerendered shell
 * would freeze whatever value existed in the build environment (empty, or
 * worse — a stale build variable) and the dashboard would inherit it.
 * The layout is a handful of tags — per-request rendering costs nothing and
 * the Clerk SDK still never enters the server bundle.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Paymock — Панель керування',
  description: 'Acquiring Mock Service for Multi-Project Integration & Sandbox Testing',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

/**
 * Root layout.
 *
 * The Clerk provider deliberately does *not* live here: it is mounted by the
 * dashboard pages, client-side only. Keeping it in the root layout pulled the
 * 915 KB Clerk SDK into the Worker bundle, where it was evaluated on every
 * cold start — including for pure API requests that never touch it.
 *
 * The publishable key is published through a meta tag instead of being
 * inlined at build time: `NEXT_PUBLIC_*` variables are substituted into the
 * client bundle while building, but the key only exists in the Worker's
 * runtime variables. A build-time inline would leave the client without a key
 * and the dashboard would fail to render.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk" className="dark">
      <head>
        <meta
          name="paymock-clerk-publishable-key"
          content={readRuntimeEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') ?? ''}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20">
        {children}
      </body>
    </html>
  );
}
