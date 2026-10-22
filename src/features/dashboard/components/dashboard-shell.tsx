'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { SignInButton } from '@clerk/nextjs';
import { Building2, Plus } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { SidebarProvider, SidebarInset } from '@/shared/components/ui/sidebar';
import { AppSidebar } from './app-sidebar';
import { SiteHeader } from './site-header';
import { useDashboard } from './dashboard-context';

interface DashboardShellProps {
  children: React.ReactNode;
  pageTitle?: string;
}

export function DashboardShell({ children, pageTitle }: DashboardShellProps) {
  const pathname = usePathname();
  const {
    isCreateOpen,
    setIsCreateOpen,
    handleCreateProject,
    hasProjects,
    isUserAuthenticated,
    isLoaded,
    loading,
  } = useDashboard();

  const [newProjectName, setNewProjectName] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const onSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setIsSubmitting(true);
    try {
      await handleCreateProject(newProjectName.trim());
      setNewProjectName('');
      setIsCreateOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader pageTitle={pageTitle} />

        {/* Content Container matching dashboard-01 container layout */}
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            {!isLoaded || (loading && !hasProjects) ? (
              <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6 animate-pulse">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Skeleton className="h-28 w-full rounded-xl" />
                  <Skeleton className="h-28 w-full rounded-xl" />
                  <Skeleton className="h-28 w-full rounded-xl" />
                  <Skeleton className="h-28 w-full rounded-xl" />
                </div>
                <Skeleton className="h-72 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
              </div>
            ) : !isUserAuthenticated ? (
              <div className="my-auto flex flex-col items-center justify-center p-6 sm:p-8 min-h-[60vh] text-center space-y-4">
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  Потрібно увійти в акаунт
                </h2>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Увійдіть через Clerk, щоб керувати платіжними проєктами, інвойсами та вебхуками.
                </p>
                <div>
                  <SignInButton mode="modal">
                    <Button size="sm">
                      Увійти в акаунт через Clerk
                    </Button>
                  </SignInButton>
                </div>
              </div>
            ) : !hasProjects && pathname !== '/profile' ? (
              <div className="my-auto flex flex-col items-center justify-center p-6 sm:p-8 min-h-[60vh] text-center space-y-4">
                <div className="rounded-full bg-secondary p-4">
                  <Building2 className="h-8 w-8 text-primary" />
                </div>
                <div className="max-w-md space-y-1">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">
                    У вас ще немає створених проєктів
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Створіть свій перший мерчант-проєкт, щоб згенерувати X-Token та почати приймати тестові платежі.
                  </p>
                </div>
                <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Створити перший проєкт
                </Button>
              </div>
            ) : (
              children
            )}
          </div>
        </div>
      </SidebarInset>

      {/* ==================== CREATE PROJECT MODAL ==================== */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <form onSubmit={onSubmitCreate}>
          <DialogHeader>
            <DialogTitle>Створити новий проєкт</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Вкажіть назву мерчант-проєкту для тестування еквайрингу та інтеграції API.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="pname" className="text-xs font-medium text-foreground">
                Назва проєкту
              </label>
              <Input
                id="pname"
                placeholder="Наприклад: My Online Store"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                required
                autoFocus
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>
                Скасувати
              </Button>
            </DialogClose>
            <Button type="submit" size="sm" disabled={isSubmitting || !newProjectName.trim()}>
              {isSubmitting ? 'Створення...' : 'Створити проєкт'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </SidebarProvider>
  );
}
