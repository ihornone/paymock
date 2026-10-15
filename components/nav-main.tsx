'use client';

import * as React from 'react';
import Link from 'next/link';
import type { TablerIcon } from '@tabler/icons-react';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';

export interface NavMainItem {
  title: string;
  url: string;
  icon?: React.ComponentType<{ className?: string }> | TablerIcon;
  isActive?: boolean;
  badge?: string | number | null;
  separated?: boolean;
}

export function NavMain({ items }: { items: NavMainItem[] }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Панель керування</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <React.Fragment key={item.title}>
            {item.separated && (
              <SidebarSeparator className="my-1.5 opacity-60 mx-1" />
            )}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={item.isActive}
                tooltip={item.title}
              >
                <Link href={item.url}>
                  {item.icon && <item.icon className="size-4 shrink-0" />}
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
              {item.badge !== null && item.badge !== undefined && (
                <SidebarMenuBadge className="font-mono text-[10px]">
                  {item.badge}
                </SidebarMenuBadge>
              )}
            </SidebarMenuItem>
          </React.Fragment>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
