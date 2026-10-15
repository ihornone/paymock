'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useDashboard } from './dashboard-context';

export function SiteHeader({ pageTitle }: { pageTitle?: string }) {
  const pathname = usePathname();
  const { selectedProject, selectedProjectId } = useDashboard();

  const getNavHref = (targetPath: string) => {
    if (selectedProjectId) {
      return `${targetPath}?projectId=${selectedProjectId}`;
    }
    return targetPath;
  };

  return (
    <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/95 px-4 backdrop-blur transition-[width,height] ease-linear lg:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
        <Separator
          orientation="vertical"
          className="mx-1 h-4 bg-border/80"
        />
        <Breadcrumb>
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem className="hidden sm:inline-flex">
              <BreadcrumbLink asChild>
                <Link href={getNavHref('/')} className="text-muted-foreground hover:text-foreground">
                  Панель керування
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>

            {selectedProject && (
              <>
                <BreadcrumbSeparator className="hidden sm:inline-flex text-muted-foreground/40" />
                <BreadcrumbItem>
                  <span className="max-w-[140px] sm:max-w-[180px] truncate font-medium text-foreground">
                    {selectedProject.name}
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
      </div>
    </header>
  );
}
