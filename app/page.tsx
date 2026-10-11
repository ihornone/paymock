'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { DashboardProvider, useDashboard } from '@/components/dashboard/dashboard-context';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrencyAmount } from '@/lib/utils';
import {
  ArrowUpRight,
  ExternalLink,
  Receipt,
  Activity,
} from 'lucide-react';

function OverviewContent() {
  const {
    selectedProject,
    selectedProjectId,
    stats,
    invoices,
    webhookLogs,
  } = useDashboard();

  const recentInvoices = invoices.slice(0, 5);
  const recentWebhooks = webhookLogs.slice(0, 5);

  return (
    <div className="space-y-6 w-full">
      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Recent Invoices Preview */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Останні виставлені рахунки
            </h3>
          </div>
          <Link href={`/invoices?projectId=${selectedProjectId}`}>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              Переглянути всі
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        <Card className="p-0 overflow-hidden">
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
              {recentInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-xs text-muted-foreground">
                    Рахунків ще немає. Створіть перший інвойс через API або перегляньте документацію.
                  </TableCell>
                </TableRow>
              ) : (
                recentInvoices.map((inv) => (
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
        </Card>
      </div>

      {/* Recent Webhooks Preview */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Останні виклики Webhooks
            </h3>
          </div>
          <Link href={`/webhooks?projectId=${selectedProjectId}`}>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              Усі логи
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32 min-w-[120px]">Статус</TableHead>
                <TableHead className="w-32">Invoice ID</TableHead>
                <TableHead>Target URL</TableHead>
                <TableHead className="w-24">Час відповіді</TableHead>
                <TableHead className="text-right w-36">Час</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentWebhooks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-xs text-muted-foreground">
                    Вебхуки ще не надсилалися. Вони з&apos;являться після дій покупця на чекауті.
                  </TableCell>
                </TableRow>
              ) : (
                recentWebhooks.map((log) => {
                  const isSuccess = log.status_code && log.status_code >= 200 && log.status_code < 300;
                  return (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge
                          variant={isSuccess ? 'success' : 'destructive'}
                          className="font-mono text-[10px] whitespace-nowrap shrink-0"
                        >
                          {log.status_code ? `HTTP ${log.status_code}` : 'FAIL'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.invoice_id}</TableCell>
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
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-muted-foreground">Завантаження панелі керування...</div>}>
      <DashboardProvider>
        <DashboardShell pageTitle="Огляд">
          <OverviewContent />
        </DashboardShell>
      </DashboardProvider>
    </Suspense>
  );
}
