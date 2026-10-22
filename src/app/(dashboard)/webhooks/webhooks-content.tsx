'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useDashboard } from '@/features/dashboard/components/dashboard-context';
import { DashboardShell } from '@/features/dashboard/components/dashboard-shell';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/shared/components/ui/table';
import { PageHeader } from '@/features/dashboard/components/page-header';
import { StatusBadge } from '@/shared/components/ui/status-badge';
import { CopyButton } from '@/shared/components/ui/copy-button';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { Activity } from 'lucide-react';
import { DashboardRuntime } from '@/features/dashboard/components/dashboard-runtime';

function WebhooksContent() {
  const { webhookLogs, selectedProject } = useDashboard();

  return (
    <div className="px-4 lg:px-6 py-4 md:py-6 space-y-6">
      <PageHeader
        title="Webhooks Monitor"
        description={`Журнал та статус доставки сповіщень мерчанта ${selectedProject?.name || ''}`}
        icon={<Activity className="h-5 w-5 text-primary" />}
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32 min-w-[120px]">Статус</TableHead>
                <TableHead className="w-40">Invoice ID</TableHead>
                <TableHead>Target URL</TableHead>
                <TableHead className="w-28">Затримка</TableHead>
                <TableHead className="text-right w-44">Час відправки</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhookLogs.length === 0 ? (
                <EmptyState
                  isTableRow
                  colSpan={5}
                  icon={<Activity className="h-5 w-5" />}
                  title="Вебхуки ще не відправлялися"
                  description="Вони з'являться тут автоматично при зміні статусу будь-якого рахунку (наприклад, після оплати на чекауті)."
                />
              ) : (
                webhookLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <StatusBadge
                        status={log.status_code ?? 0}
                        type="webhook"
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs font-medium text-foreground">
                      <div className="flex items-center gap-1">
                        <span>{log.invoice_id}</span>
                        <CopyButton
                          value={log.invoice_id}
                          size="icon"
                          className="h-5 w-5 opacity-60 hover:opacity-100"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-md truncate">
                      <div className="flex items-center gap-1 truncate">
                        <span title={log.url} className="select-all truncate">
                          {log.url}
                        </span>
                        <CopyButton
                          value={log.url}
                          size="icon"
                          className="h-5 w-5 shrink-0 opacity-60 hover:opacity-100"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.duration_ms !== null ? `${log.duration_ms} ms` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString('uk-UA')}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function PageContent() {
  return (
    <DashboardRuntime>

      <Suspense fallback={<div className="p-8 text-xs text-muted-foreground">Завантаження вебхуків...</div>}>
          <DashboardShell pageTitle="Webhooks Monitor">
            <WebhooksContent />
          </DashboardShell>
      </Suspense>

    </DashboardRuntime>
  );
}
