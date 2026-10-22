'use client';

import * as React from 'react';
import Link from 'next/link';
import { IconExternalLink, type TablerIcon } from '@tabler/icons-react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/shared/components/ui/sidebar';
import { cn } from '@/shared/utils/cn';

export interface SecondaryItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }> | TablerIcon;
  external?: boolean;
  isActive?: boolean;
}

export function NavSecondary({
  items,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SidebarGroup> & {
  items: SecondaryItem[];
}) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <SidebarGroup className={cn("mt-auto", className)} {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                isActive={item.isActive}
                tooltip={item.title}
              >
                {item.external ? (
                  <a href={item.url} target="_blank" rel="noreferrer">
                    <item.icon className="size-4 shrink-0" />
                    <span>{item.title}</span>
                    <IconExternalLink className="ml-auto size-3 opacity-60" />
                  </a>
                ) : (
                  <Link href={item.url}>
                    <item.icon className="size-4 shrink-0" />
                    <span>{item.title}</span>
                  </Link>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
