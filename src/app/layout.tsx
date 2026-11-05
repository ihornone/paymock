import type { Metadata, Viewport } from 'next';
import './globals.css';

import { readRuntimeEnv } from '@/shared/config/runtime-env';

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
