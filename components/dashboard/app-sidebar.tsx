'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import {
  IconDashboard,
  IconReceipt,
  IconActivity,
  IconSettings,
  IconBook,
  IconFileCode,
  IconPlus,
  IconCheck,
  IconSelector,
  IconCreditCard,
  IconInnerShadowTop,
} from '@tabler/icons-react';

import { NavMain, type NavMainItem } from '@/components/nav-main';
import { NavSecondary, type SecondaryItem } from '@/components/nav-secondary';
import { NavUser } from '@/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard } from './dashboard-context';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const {
    projects,
    selectedProjectId,
    selectedProject,
    setSelectedProjectId,
    invoices,
    webhookLogs,
    setIsCreateOpen,
    isUserAuthenticated,
    isLoaded,
    loading,
    hasProjects,
    user,
  } = useDashboard();

  const getNavHref = (targetPath: string) => {
    if (selectedProjectId) {
      return `${targetPath}?projectId=${selectedProjectId}`;
    }
    return targetPath;
  };

  const navMain: NavMainItem[] = [
    {
      title: 'Огляд',
      url: getNavHref('/'),
      icon: IconDashboard,
      isActive: pathname === '/',
      badge: null,
    },
    {
      title: 'Рахунки (Invoices)',
      url: getNavHref('/invoices'),
      icon: IconReceipt,
      isActive: pathname === '/invoices',
      badge: invoices.length > 0 ? invoices.length : null,
    },
    {
      title: 'Webhooks Monitor',
      url: getNavHref('/webhooks'),
      icon: IconActivity,
      isActive: pathname === '/webhooks',
      badge: webhookLogs.length > 0 ? webhookLogs.length : null,
    },
    ...(hasProjects && isUserAuthenticated
      ? [
          {
            title: 'Налаштування проєкту',
            url: getNavHref('/settings'),
            icon: IconSettings,
            isActive: pathname === '/settings',
            badge: null,
            separated: true,
          },
        ]
      : []),
  ];

  const navSecondary: SecondaryItem[] = [
    {
      title: 'Документація API',
      url: '/docs',
      icon: IconBook,
      isActive: pathname.startsWith('/docs'),
      external: false,
    },
    {
      title: 'OpenAPI JSON',
      url: '/api/openapi.json',
      icon: IconFileCode,
      external: true,
    },
  ];

  const userData = user
    ? {
        name: user.fullName || user.primaryEmailAddress?.emailAddress || 'Мерчант',
        email: user.primaryEmailAddress?.emailAddress || '',
        avatar: user.imageUrl,
      }
    : null;

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* 1. Header: Brand & Project Switcher */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {!isLoaded || (loading && !hasProjects) ? (
              <div className="flex items-center gap-2 p-1.5">
                <Skeleton className="size-8 rounded-lg" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              </div>
            ) : !hasProjects ? (
              <SidebarMenuButton
                size="lg"
                onClick={() => setIsCreateOpen(true)}
                className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <IconPlus className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Створити проєкт</span>
                  <span className="truncate text-xs text-muted-foreground">Paymock Platform</span>
                </div>
              </SidebarMenuButton>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground cursor-pointer"
                  >
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <IconInnerShadowTop className="size-5" />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold text-foreground">
                        {selectedProject?.name || 'Оберіть проєкт'}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground font-mono">
                        {selectedProject ? `ID: ${selectedProject.id}` : 'Paymock Acquiring'}
                      </span>
                    </div>
                    <IconSelector className="ml-auto size-4 opacity-70" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                  align="start"
                  side="bottom"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                    Мерчант-проєкти
                  </DropdownMenuLabel>
                  {projects.map((project) => (
                    <DropdownMenuItem
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                      className="gap-2 p-2 cursor-pointer text-xs"
                    >
                      <div className="flex size-6 items-center justify-center rounded-sm border bg-background">
                        <IconCreditCard className="size-3.5 shrink-0 text-primary" />
                      </div>
                      <span className="truncate font-medium flex-1">{project.name}</span>
                      {selectedProjectId === project.id && (
                        <IconCheck className="size-3.5 text-primary ml-auto" />
                      )}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setIsCreateOpen(true)}
                    className="gap-2 p-2 cursor-pointer text-xs font-medium text-primary"
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border border-dashed bg-background">
                      <IconPlus className="size-3.5" />
                    </div>
                    <span>Створити новий проєкт</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* 2. Content: NavMain and NavSecondary */}
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>

      {/* 3. Footer: NavUser */}
      <SidebarFooter>
        <NavUser user={userData} isAuthenticated={isUserAuthenticated} />
      </SidebarFooter>
    </Sidebar>
  );
}
