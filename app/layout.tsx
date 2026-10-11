import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

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
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#3b82f6',
          colorBackground: '#09090b',
        },
      }}
    >
      <html lang="uk" className="dark">
        <body className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
