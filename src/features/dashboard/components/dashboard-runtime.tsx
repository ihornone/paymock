'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { ukUA } from '@clerk/localizations';
import { DashboardProvider } from './dashboard-context';

const CLERK_KEY_META = 'paymock-clerk-publishable-key';

function readClerkPublishableKey(): string {
  if (typeof document === 'undefined') return '';
  const meta = document.querySelector(`meta[name="${CLERK_KEY_META}"]`);
  return meta?.getAttribute('content')?.trim() ?? '';
}

export function DashboardRuntime({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={readClerkPublishableKey()}
      localization={ukUA}
      appearance={{
        ...dark,
        variables: {
          ...dark.variables,
          colorBackground: '#1d1d1d',
          colorPrimary: '#3b82f6',
          colorForeground: '#f4f4f5',
          colorMutedForeground: '#a1a1aa',
          colorNeutral: '#ffffff',
          borderRadius: '0.625rem',
        },
        elements: {
          ...dark.elements,
          card: 'bg-[#1d1d1d] border border-[#2e2e2e] shadow-2xl text-[#f4f4f5]',
          navbar: 'bg-[#1d1d1d] border-b border-[#2e2e2e]',
          userButtonPopoverCard: 'bg-[#1d1d1d] border border-[#2e2e2e] shadow-2xl text-[#f4f4f5] rounded-xl overflow-hidden',
          userButtonPopoverActionButton: 'text-[#f4f4f5] hover:bg-[#292929] transition-colors duration-150',
          userButtonPopoverActionButtonIcon: 'text-[#a1a1aa]',
          userButtonPopoverActionButtonText: 'text-[#f4f4f5] font-medium text-xs',
          userButtonPopoverCustomItemButton: 'text-[#f4f4f5] hover:bg-[#292929]',
          userButtonPopoverFooter: 'border-t border-[#2e2e2e] bg-[#151515]',
          userPreviewMainIdentifier: 'text-[#f4f4f5] font-semibold text-xs',
          userPreviewSecondaryIdentifier: 'text-[#a1a1aa] text-[11px]',
          userButtonAvatarBox: 'h-8 w-8 rounded-full ring-1 ring-[#2e2e2e]',
        },
      }}
    >
      <DashboardProvider>{children}</DashboardProvider>
    </ClerkProvider>
  );
}
