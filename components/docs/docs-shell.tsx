'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Menu, X, FileCode, ExternalLink } from 'lucide-react';
import type { DocArticle } from '@/src/features/docs/articles';

interface DocsShellProps {
  slug: string;
  categories: Record<string, DocArticle[]>;
  children: React.ReactNode;
}

export function DocsShell({ slug, categories, children }: DocsShellProps) {
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ==================== DESKTOP SIDEBAR ==================== */}
      <aside className="hidden md:flex sticky top-0 h-screen w-72 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight hover:opacity-80">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            Paymock
          </Link>
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
            Docs
          </span>
        </div>

        <nav className="flex flex-1 flex-col justify-between overflow-y-auto p-3 text-xs">
          <div className="space-y-6">
            {Object.entries(categories).map(([category, items]) => (
              <div key={category} className="space-y-1">
                <div className="px-2 text-[11px] font-medium text-muted-foreground">
                  {category}
                </div>
                {items.map((it) => {
                  const isActive = it.slug === slug;
                  return (
                    <Link
                      key={it.slug}
                      href={`/docs/${it.slug}`}
                      className={`flex items-center justify-between rounded-md px-3 py-1.5 transition ${
                        isActive
                          ? 'bg-accent font-medium text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                      }`}
                    >
                      <span className="truncate">{it.title}</span>
                      {it.badge && (
                        <span
                          className={`font-mono text-[10px] font-semibold text-${it.badgeColor || 'emerald'}-400`}
                        >
                          {it.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="border-t border-border/50 pt-4 space-y-1">
            <a
              href="/api/openapi.json"
              target="_blank"
              className="flex items-center justify-between rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <span className="flex items-center gap-2">
                <FileCode className="h-3.5 w-3.5" />
                OpenAPI JSON
              </span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </nav>
      </aside>

      {/* ==================== MOBILE DRAWER ==================== */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-50 flex h-full w-[310px] max-w-[85vw] flex-col bg-card border-r border-border shadow-2xl">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
              <Link
                href="/"
                onClick={() => setIsMobileOpen(false)}
                className="flex items-center gap-2 text-sm font-semibold tracking-tight"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                Paymock
              </Link>
              <button
                type="button"
                onClick={() => setIsMobileOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 text-xs space-y-6">
              {Object.entries(categories).map(([category, items]) => (
                <div key={category} className="space-y-1">
                  <div className="px-2 text-[11px] font-medium text-muted-foreground">
                    {category}
                  </div>
                  {items.map((it) => {
                    const isActive = it.slug === slug;
                    return (
                      <Link
                        key={it.slug}
                        href={`/docs/${it.slug}`}
                        onClick={() => setIsMobileOpen(false)}
                        className={`flex items-center justify-between rounded-md px-3 py-1.5 transition ${
                          isActive
                            ? 'bg-accent font-medium text-accent-foreground'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                        }`}
                      >
                        <span className="truncate">{it.title}</span>
                        {it.badge && (
                          <span
                            className={`font-mono text-[10px] font-semibold text-${it.badgeColor || 'emerald'}-400`}
                          >
                            {it.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className="border-t border-border/50 p-3">
              <a
                href="/api/openapi.json"
                target="_blank"
                className="flex items-center justify-between rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                <span className="flex items-center gap-2">
                  <FileCode className="h-3.5 w-3.5" />
                  OpenAPI JSON
                </span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ==================== CONTENT BODY ==================== */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile Header */}
        <header className="sticky top-0 z-40 flex h-14 shrink-0 md:hidden items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-xs font-semibold">Документація API</span>
          </div>
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            Панель
          </Link>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-4xl mx-auto pb-24 min-w-0 w-full overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
