import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { ukUA } from '@clerk/localizations';
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
      localization={ukUA}
      appearance={{
        ...dark,
        variables: {
          ...dark.variables,
          colorBackground: '#121214',
          colorPrimary: '#3b82f6',
          colorForeground: '#f4f4f5',
          colorMutedForeground: '#a1a1aa',
          colorNeutral: '#ffffff',
          borderRadius: '0.625rem',
        },
        elements: {
          ...dark.elements,
          card: 'bg-[#121214] border border-[#27272a] shadow-2xl text-[#f4f4f5]',
          navbar: 'bg-[#121214] border-r border-[#27272a]',
          userButtonPopoverCard: 'bg-[#121214] border border-[#27272a] shadow-2xl text-[#f4f4f5] rounded-xl overflow-hidden',
          userButtonPopoverActionButton: 'text-[#f4f4f5] hover:bg-[#27272a] hover:text-white transition-colors duration-150',
          userButtonPopoverActionButtonIcon: 'text-[#a1a1aa]',
          userButtonPopoverActionButtonText: 'text-[#f4f4f5] font-medium text-xs',
          userButtonPopoverCustomItemButton: 'text-[#f4f4f5] hover:bg-[#27272a]',
          userButtonPopoverFooter: 'border-t border-[#27272a] bg-[#0c0c0e]',
          userPreviewMainIdentifier: 'text-[#f4f4f5] font-semibold text-xs',
          userPreviewSecondaryIdentifier: 'text-[#a1a1aa] text-[11px]',
          userButtonAvatarBox: 'h-8 w-8 rounded-full ring-1 ring-[#27272a]',
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
