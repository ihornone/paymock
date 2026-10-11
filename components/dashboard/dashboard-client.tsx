'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { SignInButton, UserButton, useUser } from '@clerk/nextjs';
import {
  Layers,
  BarChart3,
  Receipt,
  Building2,
  Activity,
  BookOpen,
  FileCode,
  Plus,
  Check,
  ChevronDown,
  ExternalLink,
  Copy,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { formatCurrencyAmount } from '@/lib/utils';
import type { Project, InvoiceRecord, WebhookLogRecord, InvoiceStats } from '@/src/types/models';

export function DashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedProjectId = searchParams.get('projectId') || '';
  const { user, isLoaded, isSignedIn } = useUser();

  const [projects, setProjects] = React.useState<Project[]>([]);
  const [invoices, setInvoices] = React.useState<InvoiceRecord[]>([]);
  const [webhookLogs, setWebhookLogs] = React.useState<WebhookLogRecord[]>([]);
  const [stats, setStats] = React.useState<InvoiceStats>({
    totalCount: 0,
    totalAmount: 0,
    successCount: 0,
    failureCount: 0,
    createdCount: 0,
  });
  const [loading, setLoading] = React.useState(true);

  // Dialog & UI State
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  // Fetch projects and dashboard data (with silent background polling option)
  const fetchData = React.useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const url = selectedProjectId ? `/api/admin/projects?projectId=${selectedProjectId}` : '/api/admin/projects';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
        setInvoices(data.invoices || []);
        setWebhookLogs(data.webhooks || []);
        setStats(data.stats || {
          totalCount: 0,
          totalAmount: 0,
          successCount: 0,
          failureCount: 0,
          createdCount: 0,
        });
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedProjectId]);

  React.useEffect(() => {
    fetchData();

    // Auto-refresh when user switches back to this tab
    const handleFocus = () => fetchData(true);
    window.addEventListener('focus', handleFocus);

    // Live polling every 3 seconds so payments and webhooks appear immediately
    const pollInterval = setInterval(() => {
      fetchData(true);
    }, 3000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(pollInterval);
    };
  }, [fetchData]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/admin/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsCreateOpen(false);
        setNewProjectName('');
        await fetchData();
        if (data?.id) {
          router.push(`/?projectId=${data.id}`);
        }
      } else {
        alert('Не вдалося створити проєкт');
      }
    } catch (err: any) {
      alert('Помилка: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProject = async (id: string, name: string) => {
    if (!confirm(`Видалити проєкт "${name}"? Усі пов'язані інвойси також буде видалено.`)) return;

    try {
      const res = await fetch(`/api/admin/projects?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchData();
        router.push('/');
      }
    } catch (err: any) {
      alert('Помилка: ' + err.message);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const hasProjects = projects.length > 0;
  const isUserAuthenticated = isLoaded && !!isSignedIn;

  return (
    <div className="flex min-h-screen bg-background">
      {/* ==================== SIDEBAR ==================== */}
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
            Paymock
          </Link>
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
            Admin
          </span>
        </div>

        {/* Content Navigation / States */}
        <div className="flex flex-1 flex-col justify-between overflow-y-auto p-3 text-xs">
          {!isUserAuthenticated ? (
            /* Skeletons when signed out or loading */
            <div className="space-y-6">
              <div className="space-y-2 p-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="space-y-3 p-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
              <div className="space-y-3 p-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          ) : !hasProjects ? (
            /* Signed in with 0 projects: show skeletons in navigation */
            <div className="space-y-6">
              <div className="space-y-2 p-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="space-y-3 p-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          ) : (
            /* Signed in with projects: full project picker and navigation */
            <div className="space-y-6">
              {/* Project Switcher */}
              <div className="relative">
                <label className="mb-1.5 block px-1 text-[11px] font-medium text-muted-foreground">
                  Поточний проєкт
                </label>
                <button
                  type="button"
                  onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
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
                    <Link
                      href="/"
                      onClick={() => setIsProjectDropdownOpen(false)}
                      className={`relative flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent ${
                        !selectedProjectId ? 'bg-accent/50 font-medium' : ''
                      }`}
                    >
                      <span className="truncate">Усі проєкти (Глобально)</span>
                      {!selectedProjectId && <Check className="absolute right-2 h-3.5 w-3.5 text-primary" />}
                    </Link>
                    {projects.map((p) => (
                      <Link
                        key={p.id}
                        href={`/?projectId=${p.id}`}
                        onClick={() => setIsProjectDropdownOpen(false)}
                        className={`relative flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent ${
                          selectedProjectId === p.id ? 'bg-accent/50 font-medium' : ''
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        {selectedProjectId === p.id && <Check className="absolute right-2 h-3.5 w-3.5 text-primary" />}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Nav Links */}
              <div className="space-y-1">
                <div className="px-2 text-[11px] font-medium text-muted-foreground">Огляд</div>
                <a
                  href="#stats"
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Аналітика та обіг
                </a>
                <a
                  href="#invoices"
                  className="flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <span className="flex items-center gap-2.5">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    Рахунки (Invoices)
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {invoices.length}
                  </Badge>
                </a>
              </div>

              <div className="space-y-1">
                <div className="px-2 text-[11px] font-medium text-muted-foreground">Керування</div>
                <a
                  href="#projects"
                  className="flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <span className="flex items-center gap-2.5">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    Проєкти мерчантів
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {projects.length}
                  </Badge>
                </a>
                <a
                  href="#webhooks"
                  className="flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <span className="flex items-center gap-2.5">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    Webhooks Monitor
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {webhookLogs.length}
                  </Badge>
                </a>
              </div>
            </div>
          )}

          {/* Bottom Integration Links */}
          <div className="space-y-1 border-t border-border/50 pt-4">
            <div className="px-2 text-[11px] font-medium text-muted-foreground">Інтеграція</div>
            <Link
              href="/docs"
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
            >
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              Документація API
            </Link>
            <a
              href="/api/openapi.json"
              target="_blank"
              className="flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <span className="flex items-center gap-2.5">
                <FileCode className="h-4 w-4" />
                OpenAPI JSON
              </span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {/* Footer: User profile or Skeleton */}
        <div className="border-t border-border p-4">
          {!isUserAuthenticated ? (
            <div className="flex items-center gap-2.5 animate-pulse">
              <Skeleton className="h-7 w-7 rounded-full" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-2.5 w-28" />
              </div>
            </div>
          ) : (
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
          )}
        </div>
      </aside>

      {/* ==================== MAIN AREA ==================== */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur">
          <div className="flex items-center gap-3">
            {!isUserAuthenticated || !hasProjects ? (
              <Skeleton className="h-4 w-40" />
            ) : (
              <span className="text-xs font-medium text-muted-foreground">
                Панель керування <span className="mx-1 text-border">/</span>
                <span className="text-foreground">{selectedProject ? selectedProject.name : 'Огляд усіх проєктів'}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isUserAuthenticated && hasProjects && (
              <Button size="sm" onClick={() => setIsCreateOpen(true)} className="h-8 gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Створити проєкт
              </Button>
            )}
          </div>
        </header>

        {/* Content Body */}
        <main className="flex flex-1 flex-col p-6 space-y-6">
          {!isUserAuthenticated ? (
            /* ==================== SIGNED-OUT STATE ==================== */
            <div className="my-auto flex flex-col items-center justify-center p-8 min-h-[60vh] text-center space-y-4">
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
            /* ==================== 0 PROJECTS STATE ==================== */
            <div className="my-auto flex flex-col items-center justify-center p-8 min-h-[60vh] text-center space-y-4">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Створіть перший проєкт
              </h2>
              <div>
                <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Створити проєкт
                </Button>
              </div>
            </div>
          ) : (
            /* ==================== FULL DASHBOARD ==================== */
            <div className="space-y-6 w-full">
              {/* Integration Credentials Card */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Параметри інтеграції API</CardTitle>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      Drop-in Replacement
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Замініть базовий URL та токен у конфігурації вашого сайту або платіжного модуля CMS
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                    <div className="rounded-lg border border-input bg-secondary/50 p-3 flex justify-between items-center">
                      <div className="min-w-0 flex-1 pr-2">
                        <span className="text-[10px] text-muted-foreground uppercase font-sans font-bold block mb-1">
                          Base API URL
                        </span>
                        <div className="text-foreground select-all truncate font-medium">
                          {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787'}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => copyToClipboard(typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787', 'baseurl')}
                      >
                        {copiedKey === 'baseurl' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>

                    <div className="rounded-lg border border-input bg-secondary/50 p-3 flex justify-between items-center">
                      <div className="min-w-0 flex-1 pr-2">
                        <span className="text-[10px] text-muted-foreground uppercase font-sans font-bold block mb-1">
                          X-Token ({selectedProject?.name})
                        </span>
                        <div className="text-foreground select-all truncate font-medium">
                          {selectedProject?.token || 'pmk_live_xxxxxxxx'}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => copyToClipboard(selectedProject?.token || '', 'token')}
                      >
                        {copiedKey === 'token' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* KPI Metrics */}
              <div id="stats" className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <span className="text-xs text-muted-foreground font-medium">Успішний обіг</span>
                    <div className="text-xl font-bold tracking-tight text-foreground mt-1">
                      {formatCurrencyAmount(stats.totalAmount)}
                    </div>
                    <span className="text-[11px] text-muted-foreground mt-0.5 block">За весь час</span>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <span className="text-xs text-muted-foreground font-medium">Всього рахунків</span>
                    <div className="text-xl font-bold tracking-tight text-foreground mt-1">
                      {stats.totalCount}
                    </div>
                    <span className="text-[11px] text-muted-foreground mt-0.5 block">Усі створені інвойси</span>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <span className="text-xs text-muted-foreground font-medium">Успішні платежі</span>
                    <div className="text-xl font-bold tracking-tight text-emerald-400 mt-1">
                      {stats.successCount}
                    </div>
                    <span className="text-[11px] text-muted-foreground mt-0.5 block">
                      {stats.totalCount > 0 ? `${Math.round((stats.successCount / stats.totalCount) * 100)}% успішності` : 'Немає даних'}
                    </span>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <span className="text-xs text-muted-foreground font-medium">Відхилені / Expired</span>
                    <div className="text-xl font-bold tracking-tight text-rose-400 mt-1">
                      {stats.failureCount}
                    </div>
                    <span className="text-[11px] text-muted-foreground mt-0.5 block">Помилки або анулювання</span>
                  </CardContent>
                </Card>
              </div>

              {/* Invoices Table */}
              <div id="invoices">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">Останні виставлені рахунки</CardTitle>
                        <CardDescription className="text-xs">
                          {selectedProject ? `Проєкт: ${selectedProject.name}` : 'Усі рахунки системи'}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-28">Invoice ID</TableHead>
                          <TableHead>Призначення</TableHead>
                          <TableHead>Сума</TableHead>
                          <TableHead>Статус</TableHead>
                          <TableHead>Створено</TableHead>
                          <TableHead className="text-right">Чекаут</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="h-28 text-center text-xs text-muted-foreground">
                              Рахунків ще немає. Створіть перший інвойс через API або протестуйте в документації.
                            </TableCell>
                          </TableRow>
                        ) : (
                          invoices.map((inv) => (
                            <TableRow key={inv.id}>
                              <TableCell className="font-mono text-xs font-medium">{inv.id}</TableCell>
                              <TableCell className="text-xs">
                                <div>{inv.destination || 'Оплата рахунку'}</div>
                                {inv.reference && (
                                  <div className="text-[10px] text-muted-foreground font-mono">Ref: {inv.reference}</div>
                                )}
                              </TableCell>
                              <TableCell className="font-semibold text-xs">
                                {formatCurrencyAmount(inv.amount, inv.ccy)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    inv.status === 'success'
                                      ? 'success'
                                      : inv.status === 'failure' || inv.status === 'expired'
                                      ? 'destructive'
                                      : 'outline'
                                  }
                                  className="text-[10px]"
                                >
                                  {inv.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {new Date(inv.created_date).toLocaleString('uk-UA')}
                              </TableCell>
                              <TableCell className="text-right">
                                <Link href={`/pay/${inv.id}`} target="_blank">
                                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                                    Оплатити
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                </Link>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              {/* Webhook Monitor */}
              <div id="webhooks">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Webhooks Monitor</CardTitle>
                    <CardDescription className="text-xs">
                      Історія викликів зворотного зв&apos;язку при зміні статусів рахунків
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-32 min-w-[120px]">Статус</TableHead>
                          <TableHead>Invoice ID</TableHead>
                          <TableHead>URL</TableHead>
                          <TableHead>Тривалість</TableHead>
                          <TableHead className="text-right">Час</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {webhookLogs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center text-xs text-muted-foreground">
                              Вебхуки ще не надсилалися. Вони з&apos;являться тут щойно користувач здійснить дію на чекауті.
                            </TableCell>
                          </TableRow>
                        ) : (
                          webhookLogs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell>
                                <Badge
                                  variant={log.status_code && log.status_code >= 200 && log.status_code < 300 ? 'success' : 'destructive'}
                                  className="font-mono text-[10px] whitespace-nowrap shrink-0"
                                >
                                  {log.status_code ? `HTTP ${log.status_code}` : 'FAIL'}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{log.invoice_id}</TableCell>
                              <TableCell className="font-mono text-xs max-w-xs truncate text-muted-foreground">
                                {log.url}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {log.duration_ms ? `${log.duration_ms} ms` : '—'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                {new Date(log.created_at).toLocaleTimeString('uk-UA')}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              {/* Projects List Card */}
              <div id="projects">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">Усі проєкти мерчантів</CardTitle>
                        <CardDescription className="text-xs">
                          Керуйте ізольованими магазинами та їхніми секретними токенами
                        </CardDescription>
                      </div>
                      <Button size="sm" onClick={() => setIsCreateOpen(true)} className="h-8 gap-1.5 text-xs">
                        <Plus className="h-3.5 w-3.5" />
                        Додати проєкт
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Назва проєкту</TableHead>
                          <TableHead>Project ID</TableHead>
                          <TableHead>X-Token</TableHead>
                          <TableHead>Створено</TableHead>
                          <TableHead className="text-right">Дії</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {projects.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium text-xs">
                              <Link href={`/?projectId=${p.id}`} className="hover:underline">
                                {p.name}
                              </Link>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{p.id}</TableCell>
                            <TableCell className="font-mono text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground select-all">{p.token.slice(0, 12)}...</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => copyToClipboard(p.token, p.id)}
                                >
                                  {copiedKey === p.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {new Date(p.created_at).toLocaleDateString('uk-UA')}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-rose-400"
                                onClick={() => handleDeleteProject(p.id, p.name)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ==================== CREATE PROJECT DIALOG ==================== */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <form onSubmit={handleCreateProject}>
          <DialogHeader>
            <DialogTitle>Створити новий проєкт</DialogTitle>
            <DialogDescription>
              Створює ізольований мерчант-акаунт із власним X-Token для тестування платежів.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-medium text-foreground">Назва проєкту</label>
              <Input
                placeholder="наприклад, Мій Інтернет-Магазин"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                autoFocus
                required
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                Скасувати
              </Button>
            </DialogClose>
            <Button type="submit" size="sm" disabled={isSubmitting || !newProjectName.trim()}>
              {isSubmitting ? 'Створення...' : 'Створити'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
