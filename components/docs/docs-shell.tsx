'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  IconFileCode,
  IconExternalLink,
  IconChevronRight,
  IconChevronLeft,
  IconLayoutDashboard,
} from '@tabler/icons-react';
import type { DocArticle } from '@/src/features/docs/articles';
import {
  SidebarProvider,
  Sidebar,
  SidebarInset,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

interface DocsShellProps {
  slug: string;
  categories: Record<string, DocArticle[]>;
  currentArticle?: DocArticle;
  prevArticle?: DocArticle | null;
  nextArticle?: DocArticle | null;
  children: React.ReactNode;
}

export function DocsShell({
  slug,
  categories,
  currentArticle,
  prevArticle,
  nextArticle,
  children,
}: DocsShellProps) {
  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        {/* 1. Header: Paymock Docs Branding */}
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <Link href="/docs/overview" className="px-2 py-1.5">
                  <span className="text-base font-semibold tracking-tight text-foreground">
                    Paymock Docs
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        {/* 2. Content: Documentation Articles Navigation */}
        <SidebarContent>
          {Object.entries(categories).map(([category, items]) => (
            <SidebarGroup key={category}>
              <SidebarGroupLabel className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground/80">
                {category}
              </SidebarGroupLabel>
              <SidebarMenu>
                {items.map((it) => {
                  const isActive = it.slug === slug;
                  return (
                    <SidebarMenuItem key={it.slug}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={it.title}
                        className="text-xs"
                      >
                        <Link
                          href={`/docs/${it.slug}`}
                          className="flex items-center justify-between gap-2 w-full min-w-0"
                        >
                          <span className="truncate min-w-0 flex-1">{it.title}</span>
                          {it.badge && (
                            <span
                              className={cn(
                                'shrink-0 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded leading-none select-none',
                                it.badge === 'GET'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : it.badge === 'POST'
                                  ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                                  : 'bg-primary/10 text-primary border border-primary/20'
                              )}
                            >
                              {it.badge}
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>

        {/* 3. Footer: External links & Return to dashboard */}
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="OpenAPI Specification">
                <a href="/api/openapi.json" target="_blank" rel="noreferrer">
                  <IconFileCode className="size-4 shrink-0" />
                  <span>OpenAPI JSON</span>
                  <IconExternalLink className="ml-auto size-3 opacity-60" />
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Повернутися в дашборд">
                <Link href="/">
                  <IconLayoutDashboard className="size-4 shrink-0" />
                  <span>Панель керування</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* ==================== MAIN CONTENT AREA ==================== */}
      <SidebarInset>
        {/* Top Header */}
        <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/95 px-4 backdrop-blur transition-[width,height] ease-linear lg:px-6">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
            <Separator orientation="vertical" className="mx-1 h-4 bg-border/80" />
            <Breadcrumb>
              <BreadcrumbList className="text-xs">
                <BreadcrumbItem className="hidden sm:inline-flex">
                  <BreadcrumbLink asChild>
                    <Link href="/" className="text-muted-foreground hover:text-foreground">
                      Панель керування
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:inline-flex text-muted-foreground/40" />
                <BreadcrumbItem className="hidden sm:inline-flex">
                  <BreadcrumbLink asChild>
                    <Link href="/docs/overview" className="text-muted-foreground hover:text-foreground">
                      Документація
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {currentArticle && (
                  <>
                    <BreadcrumbSeparator className="hidden md:inline-flex text-muted-foreground/40" />
                    <BreadcrumbItem className="hidden md:inline-flex">
                      <span className="text-muted-foreground/80 font-normal">
                        {currentArticle.category}
                      </span>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="text-muted-foreground/40" />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="font-semibold text-primary truncate max-w-[200px] sm:max-w-[300px]">
                        {currentArticle.title}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        {/* Article Content Container */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-10 space-y-8">
            {children}

            {/* Prev / Next Article Navigation Footer */}
            {(prevArticle || nextArticle) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-8 mt-12 border-t border-border/60">
                {prevArticle ? (
                  <Link
                    href={`/docs/${prevArticle.slug}`}
                    className="group flex flex-col gap-1 p-4 rounded-xl border border-border/60 bg-card hover:border-primary/50 hover:bg-card/80 transition-all text-left shadow-xs"
                  >
                    <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                      <IconChevronLeft className="size-3.5" />
                      <span>Попередня стаття</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      {prevArticle.title}
                    </span>
                  </Link>
                ) : (
                  <div />
                )}

                {nextArticle ? (
                  <Link
                    href={`/docs/${nextArticle.slug}`}
                    className="group flex flex-col gap-1 p-4 rounded-xl border border-border/60 bg-card hover:border-primary/50 hover:bg-card/80 transition-all text-right shadow-xs sm:col-start-2"
                  >
                    <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                      <span>Наступна стаття</span>
                      <IconChevronRight className="size-3.5" />
                    </div>
                    <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      {nextArticle.title}
                    </span>
                  </Link>
                ) : null}
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
