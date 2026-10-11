'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { DashboardProvider, useDashboard } from '@/components/dashboard/dashboard-context';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Activity, Clock, Globe } from 'lucide-react';

function WebhooksContent() {
  const { webhookLogs, selectedProject } = useDashboard();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Webhooks Monitor
        </h1>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32 min-w-[120px]">Статус</TableHead>
                <TableHead className="w-36">Invoice ID</TableHead>
                <TableHead>Target URL</TableHead>
                <TableHead className="w-28">Затримка</TableHead>
                <TableHead className="text-right w-44">Час відправки</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhookLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-xs text-muted-foreground">
                    Вебхуки ще не відправлялися. Вони з&apos;являться тут автоматично при зміні статусу будь-якого рахунку (наприклад, після оплати на чекауті).
                  </TableCell>
                </TableRow>
              ) : (
                webhookLogs.map((log) => {
                  const isSuccess = log.status_code && log.status_code >= 200 && log.status_code < 300;
                  return (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge
                          variant={isSuccess ? 'success' : 'destructive'}
                          className="font-mono text-[10px] whitespace-nowrap shrink-0"
                        >
                          {log.status_code ? `HTTP ${log.status_code}` : 'FAILED'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium text-foreground">
                        {log.invoice_id}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground max-w-md truncate">
                        <span title={log.url} className="select-all">{log.url}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.duration_ms !== null ? `${log.duration_ms} ms` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString('uk-UA')}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function WebhooksPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-muted-foreground">Завантаження вебхуків...</div>}>
      <DashboardProvider>
        <DashboardShell pageTitle="Webhooks Monitor">
          <WebhooksContent />
        </DashboardShell>
      </DashboardProvider>
    </Suspense>
  );
}
