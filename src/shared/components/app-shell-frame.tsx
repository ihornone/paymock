'use client';

import * as React from 'react';

import { SiteHeader } from '@/features/dashboard/components/site-header';
import { SiteFooter } from '@/shared/components/site-footer';
import { SidebarInset, SidebarProvider } from '@/shared/components/ui/sidebar';

interface AppShellFrameProps {
  /** The sidebar element — dashboard or docs variant of the same frame. */
  sidebar: React.ReactNode;
  /** Props forwarded to the shared header when no custom breadcrumb. */
  pageTitle?: string;
  projectName?: string | null;
  breadcrumb?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The one skeleton shared by every Paymock surface: the same SidebarProvider
 * + inset frame + header + gray-zone footer, with only the sidebar sections
 * and the content differing between the dashboard and the public docs.
 *
 * The frame itself never touches Clerk: pages that mount it without the
 * dashboard provider (public docs) must not pull the Clerk SDK.
 */
export function AppShellFrame({
  sidebar,
  pageTitle,
  projectName,
  breadcrumb,
  children,
}: AppShellFrameProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full flex-col">
        <div className="flex flex-1">
          {sidebar}
          <SidebarInset>
            <SiteHeader
              pageTitle={pageTitle}
              projectName={projectName}
              breadcrumb={breadcrumb}
            />
            {/* The named container the dashboard cards' @container queries
                (@xl/main, @5xl/main) measure against. */}
            <div className="@container/main flex flex-1 flex-col gap-2">
              {children}
            </div>
          </SidebarInset>
        </div>
        <SiteFooter />
      </div>
    </SidebarProvider>
  );
}
