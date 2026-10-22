'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  ExternalLink,
  Receipt,
  Activity,
  Search,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/shared/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/shared/components/ui/table';
import { Button } from '@/shared/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/components/ui/tabs';
import { Input } from '@/shared/components/ui/input';
import { StatusBadge } from '@/shared/components/ui/status-badge';
import { CopyButton } from '@/shared/components/ui/copy-button';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { formatCurrencyAmount } from '@/shared/utils/cn';
import { useDashboard } from './dashboard-context';

export function RecentActivityTable() {
  const { invoices, webhookLogs, selectedProjectId } = useDashboard();
  const [searchQuery, setSearchQuery] = React.useState('');

  const recentInvoices = React.useMemo(() => {
    const list = searchQuery.trim()
      ? invoices.filter(
          (inv) =>
            inv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (inv.destination && inv.destination.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (inv.reference && inv.reference.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : invoices;
    return list.slice(0, 7);
  }, [invoices, searchQuery]);

  const recentWebhooks = React.useMemo(() => {
    const list = searchQuery.trim()
      ? webhookLogs.filter(
          (log) =>
            log.invoice_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.url.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : webhookLogs;
    return list.slice(0, 7);
  }, [webhookLogs, searchQuery]);

  return (
    <div className="px-4 lg:px-6">
      <Card className="border-border/60 bg-card">
        <Tabs defaultValue="invoices" className="w-full">
          <CardHeader className="flex flex-col gap-4 border-b border-border/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base font-semibold tracking-tight text-foreground">
                Останні операції
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Моніторинг створених платіжних рахунків та відправлених вебхуків
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-48 md:w-56">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Пошук за ID, призначенням..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs bg-background/50"
                />
              </div>

              <TabsList className="h-8">
                <TabsTrigger value="invoices" className="text-xs h-7 gap-1.5">
                  <Receipt className="size-3.5" />
                  <span>Рахунки</span>
                  <span className="text-[10px] text-muted-foreground font-mono">({invoices.length})</span>
                </TabsTrigger>
                <TabsTrigger value="webhooks" className="text-xs h-7 gap-1.5">
                  <Activity className="size-3.5" />
                  <span>Вебхуки</span>
                  <span className="text-[10px] text-muted-foreground font-mono">({webhookLogs.length})</span>
                </TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>

          {/* INVOICES TAB */}
          <TabsContent value="invoices" className="m-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-32 text-xs">Invoice ID</TableHead>
                  <TableHead className="text-xs">Призначення & Референс</TableHead>
                  <TableHead className="text-xs">Сума</TableHead>
                  <TableHead className="text-xs">Статус</TableHead>
                  <TableHead className="text-xs">Створено</TableHead>
                  <TableHead className="text-right text-xs">Чекаут</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentInvoices.length === 0 ? (
                  <EmptyState
                    isTableRow
                    colSpan={6}
                    icon={<Receipt className="size-5" />}
                    title="Рахунків не знайдено"
                    description={
                      searchQuery
                        ? 'За вашим пошуковим запитом рахунків не знайдено.'
                        : 'Рахунків ще немає. Створіть перший інвойс через API або перегляньте документацію.'
                    }
                  />
                ) : (
                  recentInvoices.map((inv) => (
                    <TableRow key={inv.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="font-mono text-xs font-medium">
                        <div className="flex items-center gap-1.5">
                          <span className="text-foreground">{inv.id}</span>
                          <CopyButton
                            value={inv.id}
                            size="icon"
                            className="h-5 w-5 opacity-60 hover:opacity-100"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium text-foreground">{inv.destination || 'Оплата рахунку'}</div>
                        {inv.reference && (
                          <div className="text-[10px] text-muted-foreground font-mono">
                            Ref: {inv.reference}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold text-xs font-mono">
                        {formatCurrencyAmount(inv.amount, inv.ccy)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={inv.status} type="invoice" />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {new Date(inv.created_date).toLocaleString('uk-UA')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 hover:bg-primary hover:text-primary-foreground transition"
                        >
                          <Link href={`/pay/${inv.id}`} target="_blank">
                            Оплатити
                            <ExternalLink className="size-3" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border/60 p-3 px-6">
              <span className="text-xs text-muted-foreground">
                Показано {recentInvoices.length} з {invoices.length} рахунків
              </span>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary">
                <Link href={`/invoices?projectId=${selectedProjectId}`}>
                  Переглянути всі рахунки
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </TabsContent>

          {/* WEBHOOKS TAB */}
          <TabsContent value="webhooks" className="m-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-32 text-xs">Статус</TableHead>
                  <TableHead className="w-32 text-xs">Invoice ID</TableHead>
                  <TableHead className="text-xs">Target URL</TableHead>
                  <TableHead className="w-28 text-xs">Час відповіді</TableHead>
                  <TableHead className="text-right w-40 text-xs">Час надсилання</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentWebhooks.length === 0 ? (
                  <EmptyState
                    isTableRow
                    colSpan={5}
                    icon={<Activity className="size-5" />}
                    title="Вебхуків не знайдено"
                    description={
                      searchQuery
                        ? 'Вебхуків за цим запитом не знайдено.'
                        : 'Вебхуки ще не надсилалися. Вони зʼявляться автоматично після дій покупця на чекауті.'
                    }
                  />
                ) : (
                  recentWebhooks.map((log) => (
                    <TableRow key={log.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell>
                        <StatusBadge
                          status={log.status_code ?? 0}
                          type="webhook"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground">
                        <div className="flex items-center gap-1.5">
                          <span>{log.invoice_id}</span>
                          <CopyButton
                            value={log.invoice_id}
                            size="icon"
                            className="h-5 w-5 opacity-60 hover:opacity-100"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono truncate max-w-xs text-muted-foreground">
                        {log.url}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {log.duration_ms ? `${log.duration_ms} ms` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono text-right">
                        {new Date(log.created_at).toLocaleString('uk-UA')}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border/60 p-3 px-6">
              <span className="text-xs text-muted-foreground">
                Показано {recentWebhooks.length} з {webhookLogs.length} викликів
              </span>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary">
                <Link href={`/webhooks?projectId=${selectedProjectId}`}>
                  Відкрити повний журнал
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
