'use client';

import * as React from 'react';
import Link from 'next/link';
import { Separator } from '@/shared/components/ui/separator';
import { SidebarTrigger } from '@/shared/components/ui/sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';

interface SiteHeaderProps {
  /** Final crumb label when the caller needs a plain page title. */
  pageTitle?: string;
  /** Project name shown between the root and the page title (dashboard). */
  projectName?: string | null;
  /**
   * A fully custom breadcrumb tree (docs articles). When given it replaces
   * the default crumbs entirely — the sidebar trigger is still rendered.
   */
  breadcrumb?: React.ReactNode;
}

/**
 * Shared top bar of the app frame.
 *
 * Deliberately context-free: the dashboard shell passes project data as
 * props from `useDashboard`, while the docs shell renders public pages
 * without the Clerk-backed provider and passes its own breadcrumb node.
 */
export function SiteHeader({ pageTitle, projectName, breadcrumb }: SiteHeaderProps) {
  return (
    <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/95 px-4 backdrop-blur transition-[width,height] ease-linear lg:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
        <Separator
          orientation="vertical"
          className="mx-1 h-4 bg-border/80"
        />
        {breadcrumb ? (
          breadcrumb
        ) : (
          <Breadcrumb>
            <BreadcrumbList className="text-xs">
              <BreadcrumbItem className="hidden sm:inline-flex">
                <BreadcrumbLink asChild>
                  <Link href="/" className="text-muted-foreground hover:text-foreground">
                    Панель керування
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>

              {projectName && (
                <>
                  <BreadcrumbSeparator className="hidden sm:inline-flex text-muted-foreground/40" />
                  <BreadcrumbItem>
                    <span className="max-w-[140px] sm:max-w-[180px] truncate font-medium text-foreground">
                      {projectName}
                    </span>
                  </BreadcrumbItem>
                </>
              )}

              {pageTitle && (
                <>
                  <BreadcrumbSeparator className="text-muted-foreground/40" />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-semibold text-primary truncate">
                      {pageTitle}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>
    </header>
  );
}
