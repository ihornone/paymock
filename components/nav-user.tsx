'use client';

import * as React from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { IconKey } from '@tabler/icons-react';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

export interface NavUserProps {
  user?: {
    name?: string | null;
    email?: string | null;
    avatar?: string | null;
  } | null;
  isAuthenticated?: boolean;
}

export function NavUser({ user, isAuthenticated = true }: NavUserProps) {
  if (!isAuthenticated) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Гість
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          asChild
          className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5 min-w-0">
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: 'size-8',
                  },
                }}
              />
              <div className="grid flex-1 text-left text-xs leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium text-foreground">
                  {user?.name || user?.email || 'Мерчант'}
                </span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {user?.email || ''}
                </span>
              </div>
            </div>

            <Link
              href="/profile"
              title="Профіль та API токени"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors shrink-0 group-data-[collapsible=icon]:hidden"
            >
              <IconKey className="size-4" />
            </Link>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
