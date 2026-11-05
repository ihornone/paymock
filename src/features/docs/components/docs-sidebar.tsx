'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  IconFileCode,
  IconExternalLink,
  IconBook,
} from '@tabler/icons-react';

import type { DocArticle } from '@/features/docs/articles';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/shared/components/ui/sidebar';
import { cn } from '@/shared/utils/cn';

interface DocsSidebarProps {
  slug: string;
  categories: Record<string, DocArticle[]>;
}

export function DocsSidebar({ slug, categories }: DocsSidebarProps) {

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Документація Paymock"
              className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Link href="/docs/overview" className="px-2 py-1.5">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <IconBook className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold tracking-tight text-foreground">
                    Paymock Docs
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    Документація API
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

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
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
