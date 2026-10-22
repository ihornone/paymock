'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useDashboard } from '@/features/dashboard/components/dashboard-context';
import { DashboardShell } from '@/features/dashboard/components/dashboard-shell';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/shared/components/ui/table';
import { Button } from '@/shared/components/ui/button';
import { PageHeader } from '@/features/dashboard/components/page-header';
import { StatusBadge } from '@/shared/components/ui/status-badge';
import { CopyButton } from '@/shared/components/ui/copy-button';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { formatCurrencyAmount } from '@/shared/utils/cn';
import { ExternalLink, Receipt } from 'lucide-react';
import type { InvoiceStatus } from '@/shared/types/acquiring';
import { DashboardRuntime } from '@/features/dashboard/components/dashboard-runtime';

function InvoicesContent() {
  const { invoices, selectedProject } = useDashboard();
  const [filterStatus, setFilterStatus] = React.useState<string>('all');

  const counts = React.useMemo(() => {
    let success = 0;
    let created = 0;
    let failure = 0;
    for (const inv of invoices) {
      if (inv.status === 'success') success++;
      else if (inv.status === 'created') created++;
      else if (inv.status === 'failure' || inv.status === 'expired') failure++;
    }
    return { all: invoices.length, success, created, failure };
  }, [invoices]);

  const filteredInvoices = React.useMemo(() => {
    if (filterStatus === 'all') return invoices;
    if (filterStatus === 'failure') {
      return invoices.filter((inv) => inv.status === 'failure' || inv.status === 'expired');
    }
    return invoices.filter((inv) => inv.status === filterStatus);
  }, [invoices, filterStatus]);

  return (
    <div className="px-4 lg:px-6 py-4 md:py-6 space-y-6">
      <PageHeader
        title="Рахунки (Invoices)"
        description={`Історія транзакцій та платежів мерчанта ${selectedProject?.name || ''}`}
        icon={<Receipt className="h-5 w-5 text-primary" />}
      >
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <Button
            variant={filterStatus === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterStatus('all')}
            className="h-7 text-xs"
          >
            Всі ({counts.all})
          </Button>
          <Button
            variant={filterStatus === 'success' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterStatus('success')}
            className="h-7 text-xs text-emerald-400"
          >
            Успішні ({counts.success})
          </Button>
          <Button
            variant={filterStatus === 'created' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterStatus('created')}
            className="h-7 text-xs text-amber-400"
          >
            Очікують ({counts.created})
          </Button>
          <Button
            variant={filterStatus === 'failure' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterStatus('failure')}
            className="h-7 text-xs text-rose-400"
          >
            Відхилені ({counts.failure})
          </Button>
        </div>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">Invoice ID</TableHead>
                <TableHead>Призначення та деталі</TableHead>
                <TableHead>Сума</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Створено</TableHead>
                <TableHead className="text-right">Чекаут</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.length === 0 ? (
                <EmptyState
                  isTableRow
                  colSpan={6}
                  icon={<Receipt className="h-5 w-5" />}
                  title="Рахунків не знайдено"
                  description="За вказаним фільтром операцій не виявлено."
                />
              ) : (
                filteredInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      <div className="flex items-center gap-1">
                        <span className="text-foreground">{inv.id}</span>
                        <CopyButton
                          value={inv.id}
                          size="icon"
                          className="h-5 w-5 opacity-60 hover:opacity-100"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium text-foreground">{inv.destination || 'Оплата замовлення'}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground font-mono">
                        {inv.reference && <span>Ref: {inv.reference}</span>}
                        {inv.payment_type && <span>Type: {inv.payment_type}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold text-xs text-foreground">
                      {formatCurrencyAmount(inv.amount, inv.ccy)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={inv.status} type="invoice" />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {new Date(inv.created_date).toLocaleString('uk-UA')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1">
                        <Link href={`/pay/${inv.id}`} target="_blank">
                          Чекаут
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </Button>
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

      <Suspense fallback={<div className="p-8 text-xs text-muted-foreground">Завантаження рахунків...</div>}>
          <DashboardShell pageTitle="Рахунки">
            <InvoicesContent />
          </DashboardShell>
      </Suspense>

    </DashboardRuntime>
  );
}
