'use client';

import * as React from 'react';

import { SiteHeader } from '@/features/dashboard/components/site-header';
import { SiteFooter } from '@/shared/components/site-footer';
import { SidebarInset, SidebarProvider } from '@/shared/components/ui/sidebar';

interface AppShellFrameProps {
  sidebar: React.ReactNode;
  pageTitle?: string;
  projectName?: string | null;
  breadcrumb?: React.ReactNode;
  children: React.ReactNode;
}

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
