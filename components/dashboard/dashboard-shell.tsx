'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { SignInButton, UserButton } from '@clerk/nextjs';
import {
  BarChart3,
  Receipt,
  Building2,
  Activity,
  Settings,
  BookOpen,
  FileCode,
  Plus,
  Check,
  ChevronDown,
  ExternalLink,
  Menu,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDashboard } from './dashboard-context';

interface DashboardShellProps {
  children: React.ReactNode;
  pageTitle?: string;
}

export function DashboardShell({ children, pageTitle }: DashboardShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    projects,
    selectedProjectId,
    selectedProject,
    setSelectedProjectId,
    invoices,
    webhookLogs,
    isCreateOpen,
    setIsCreateOpen,
    handleCreateProject,
    hasProjects,
    isUserAuthenticated,
    isLoaded,
    loading,
    user,
  } = useDashboard();

  const [isMobileNavOpen, setIsMobileNavOpen] = React.useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Close mobile drawer on route changes
  React.useEffect(() => {
    setIsMobileNavOpen(false);
    setIsProjectDropdownOpen(false);
  }, [pathname, searchParams]);

  // Prevent background scroll when mobile drawer is open
  React.useEffect(() => {
    if (isMobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileNavOpen]);

  // Helper to preserve ?projectId in navigation
  const getNavHref = (targetPath: string) => {
    if (selectedProjectId) {
      return `${targetPath}?projectId=${selectedProjectId}`;
    }
    return targetPath;
  };

  const mainNavItems = [
    {
      title: 'Огляд',
      href: '/',
      icon: BarChart3,
      badge: null,
      isActive: pathname === '/',
    },
    {
      title: 'Рахунки (Invoices)',
      href: '/invoices',
      icon: Receipt,
      badge: invoices.length,
      isActive: pathname === '/invoices',
    },
    {
      title: 'Webhooks Monitor',
      href: '/webhooks',
      icon: Activity,
      badge: webhookLogs.length,
      isActive: pathname === '/webhooks',
    },
  ];

  const settingsNavItem = {
    title: 'Налаштування',
    href: '/settings',
    icon: Settings,
    badge: null,
    isActive: pathname === '/settings',
  };

  const onSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setIsSubmitting(true);
    try {
      await handleCreateProject(newProjectName.trim());
      setNewProjectName('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderNavBody = () => {
    if (!isLoaded || loading) {
      /* Loading State */
      return (
        <div className="space-y-4">
          <div className="space-y-2 p-1">
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-2 p-1">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      );
    }

    if (!isUserAuthenticated) {
      /* Signed Out */
      return (
        <div className="space-y-4">
          <div className="space-y-2 p-1">
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-2 p-1">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      );
    }

    if (!hasProjects) {
      /* Signed in with 0 projects */
      return (
        <div className="space-y-4">
          <div className="space-y-2 p-1">
            <Button
              size="sm"
              onClick={() => {
                setIsMobileNavOpen(false);
                setIsCreateOpen(true);
              }}
              className="w-full h-9 gap-1.5 text-xs cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Створити проєкт
            </Button>
          </div>
        </div>
      );
    }

    /* Signed in with projects: full project picker and navigation */
    return (
      <div className="space-y-4">
        {/* Project Switcher */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
            className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition"
          >
            <span className="flex items-center gap-2 truncate font-medium">
              <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
              <span className="truncate">{selectedProject ? selectedProject.name : 'Усі проєкти'}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>

          {isProjectDropdownOpen && (
            <div className="absolute top-full left-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">
                Проєкти
              </div>
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedProjectId(p.id);
                    setIsProjectDropdownOpen(false);
                    setIsMobileNavOpen(false);
                  }}
                  className={`relative flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-xs text-left hover:bg-accent transition ${
                    selectedProjectId === p.id ? 'bg-accent/60 font-medium text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  {selectedProjectId === p.id && <Check className="absolute right-2 h-3.5 w-3.5 text-primary" />}
                </button>
              ))}
              <div className="pt-1 mt-1 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setIsProjectDropdownOpen(false);
                    setIsMobileNavOpen(false);
                    setIsCreateOpen(true);
                  }}
                  className="flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-primary hover:bg-accent transition font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Створити проєкт</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <div className="space-y-1">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={getNavHref(item.href)}
                onClick={() => setIsMobileNavOpen(false)}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition ${
                  item.isActive
                    ? 'bg-secondary text-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className={`h-4 w-4 shrink-0 ${item.isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="truncate">{item.title}</span>
                </span>
                {item.badge !== null && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    );
  };

  const renderIntegrationLinks = () => {
    const SettingsIcon = settingsNavItem.icon;
    return (
      <div className="space-y-3">
        {/* Settings button located right above the documentation divider */}
        {hasProjects && isUserAuthenticated && (
          <div className="space-y-1">
            <Link
              href={getNavHref(settingsNavItem.href)}
              onClick={() => setIsMobileNavOpen(false)}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition ${
                settingsNavItem.isActive
                  ? 'bg-secondary text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <SettingsIcon
                  className={`h-4 w-4 shrink-0 ${settingsNavItem.isActive ? 'text-primary' : 'text-muted-foreground'}`}
                />
                <span className="truncate">{settingsNavItem.title}</span>
              </span>
            </Link>
          </div>
        )}

        {/* Documentation Divider */}
        <div className="space-y-1 border-t border-border/50 pt-3">
          <Link
            href="/docs"
            onClick={() => setIsMobileNavOpen(false)}
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition"
          >
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            Документація API
          </Link>
          <a
            href="/api/openapi.json"
            target="_blank"
            className="flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition"
          >
            <span className="flex items-center gap-2.5">
              <FileCode className="h-4 w-4" />
              OpenAPI JSON
            </span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    );
  };

  const renderUserProfile = () => {
    if (!isUserAuthenticated) {
      return (
        <div className="flex items-center gap-2.5 animate-pulse">
          <Skeleton className="h-7 w-7 rounded-full" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-2.5 w-28" />
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <UserButton />
          <div className="min-w-0">
            <div className="truncate text-[11px] font-medium text-foreground">
              {user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Мерчант'}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {user?.primaryEmailAddress?.emailAddress || ''}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* ==================== DESKTOP SIDEBAR ==================== */}
      <aside className="hidden md:flex sticky top-0 h-screen w-64 shrink-0 flex-col border-r border-border bg-card">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <Link href={getNavHref('/')} className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground hover:opacity-85 transition">
            Paymock
          </Link>
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
            Admin
          </span>
        </div>

        {/* Content Navigation */}
        <div className="flex flex-1 flex-col justify-between overflow-y-auto p-3 text-xs">
          {renderNavBody()}
          {renderIntegrationLinks()}
        </div>

        {/* Desktop Footer: User Profile */}
        <div className="border-t border-border p-4">
          {renderUserProfile()}
        </div>
      </aside>

      {/* ==================== MOBILE DRAWER / OVERLAY ==================== */}
      {isMobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-in fade-in-0 duration-200">
          {/* Backdrop blur */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileNavOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer content */}
          <div className="relative z-50 flex h-full w-[280px] max-w-[85vw] flex-col bg-card border-r border-border shadow-2xl animate-in slide-in-from-left duration-200">
            {/* Drawer Header */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
              <Link href={getNavHref('/')} onClick={() => setIsMobileNavOpen(false)} className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                Paymock
              </Link>
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                aria-label="Закрити меню"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation Body */}
            <div className="flex flex-1 flex-col justify-between overflow-y-auto p-3 text-xs">
              {renderNavBody()}
              {renderIntegrationLinks()}
            </div>

            {/* Mobile Footer: User Profile */}
            <div className="border-t border-border p-4">
              {renderUserProfile()}
            </div>
          </div>
        </div>
      )}

      {/* ==================== MAIN CONTENT AREA ==================== */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 sm:px-6 backdrop-blur">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Hamburger button for mobile */}
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(true)}
              className="md:hidden inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer -ml-1"
              aria-label="Відкрити меню"
            >
              <Menu className="h-5 w-5" />
            </button>

            {!isUserAuthenticated || !hasProjects ? (
              <Skeleton className="h-4 w-32 sm:w-40" />
            ) : (
              <div className="flex items-center text-xs font-medium text-muted-foreground truncate">
                <span className="hidden sm:inline">Панель керування</span>
                <span className="hidden sm:inline mx-1 text-border">/</span>
                <span className="text-foreground truncate max-w-[120px] sm:max-w-[200px]">
                  {selectedProject ? selectedProject.name : 'Усі проєкти'}
                </span>
                {pageTitle && (
                  <>
                    <span className="mx-1 text-border">/</span>
                    <span className="text-primary font-semibold truncate">{pageTitle}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isUserAuthenticated && hasProjects && (
              <Button
                size="sm"
                onClick={() => setIsCreateOpen(true)}
                className="h-8 px-2.5 sm:px-3 gap-1.5 text-xs cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden xs:inline sm:inline">Створити проєкт</span>
                <span className="xs:hidden sm:hidden">Проєкт</span>
              </Button>
            )}
          </div>
        </header>

        {/* Content Body */}
        <main className="flex flex-1 flex-col p-4 sm:p-6 space-y-6 max-w-full overflow-x-hidden">
          {!isUserAuthenticated ? (
            /* Signed-out state */
            <div className="my-auto flex flex-col items-center justify-center p-6 sm:p-8 min-h-[60vh] text-center space-y-4">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Потрібно увійти в акаунт
              </h2>
              <div>
                <SignInButton mode="modal">
                  <Button size="sm">
                    Увійти в акаунт через Clerk
                  </Button>
                </SignInButton>
              </div>
            </div>
          ) : !hasProjects ? (
            /* 0 projects state */
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
        </main>
      </div>

      {/* ==================== CREATE PROJECT MODAL ==================== */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <form onSubmit={onSubmitCreate}>
          <DialogHeader>
            <DialogTitle>Створити новий проєкт</DialogTitle>
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
    </div>
  );
}
