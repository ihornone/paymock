'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  IconChevronRight,
  IconChevronLeft,
  IconInfoCircle,
  IconKey,
} from '@tabler/icons-react';
import type { DocArticle } from '@/features/docs/articles';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';
import { AppShellFrame } from '@/shared/components/app-shell-frame';
import { DocsSidebar } from './docs-sidebar';

interface DocsShellProps {
  slug: string;
  categories: Record<string, DocArticle[]>;
  currentArticle?: DocArticle;
  prevArticle?: DocArticle | null;
  nextArticle?: DocArticle | null;
  isAuthenticated?: boolean;
  children: React.ReactNode;
}

export function DocsShell({
  slug,
  categories,
  currentArticle,
  prevArticle,
  nextArticle,
  isAuthenticated = false,
  children,
}: DocsShellProps) {
  const breadcrumb = (
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
  );

  return (
    <AppShellFrame
      sidebar={<DocsSidebar slug={slug} categories={categories} />}
      breadcrumb={breadcrumb}
    >
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-10 space-y-8">
          {!isAuthenticated && (
            <aside className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
              <IconInfoCircle className="size-5 shrink-0 text-amber-400" />
              <p className="flex-1 text-foreground/90 leading-relaxed">
                Ви переглядаєте документацію без авторизації — увесь контент відкритий.
                Щоб працювати з API, створіть персональний токен акаунта (
                <code className="rounded bg-amber-500/10 px-1 py-0.5 font-mono text-xs text-amber-300">
                  pmk_usr_…
                </code>
                ) або токен проєкту (
                <code className="rounded bg-amber-500/10 px-1 py-0.5 font-mono text-xs text-amber-300">
                  pmk_live_…
                </code>
                ) в особистому кабінеті.
              </p>
              <Link
                href="/profile"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <IconKey className="size-3.5" />
                <span>Отримати токен</span>
              </Link>
            </aside>
          )}

          {children}

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
      </div>
    </AppShellFrame>
  );
}
