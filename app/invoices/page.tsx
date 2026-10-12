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
import { ExternalLink, Receipt, Filter } from 'lucide-react';
import type { InvoiceStatus } from '@/src/types/acquiring';

function InvoicesContent() {
  const { invoices, selectedProject } = useDashboard();
  const [filterStatus, setFilterStatus] = React.useState<string>('all');

  const filteredInvoices = React.useMemo(() => {
    if (filterStatus === 'all') return invoices;
    return invoices.filter((inv) => inv.status === filterStatus);
  }, [invoices, filterStatus]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Рахунки (Invoices)
          </h1>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <Button
            variant={filterStatus === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterStatus('all')}
            className="h-7 text-xs"
          >
            Всі ({invoices.length})
          </Button>
          <Button
            variant={filterStatus === 'success' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterStatus('success')}
            className="h-7 text-xs text-emerald-400"
          >
            Успішні ({invoices.filter((i) => i.status === 'success').length})
          </Button>
          <Button
            variant={filterStatus === 'created' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterStatus('created')}
            className="h-7 text-xs text-amber-400"
          >
            Очікують ({invoices.filter((i) => i.status === 'created').length})
          </Button>
          <Button
            variant={filterStatus === 'failure' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterStatus('failure')}
            className="h-7 text-xs text-rose-400"
          >
            Відхилені ({invoices.filter((i) => i.status === 'failure' || i.status === 'expired').length})
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Invoice ID</TableHead>
                <TableHead>Призначення та деталі</TableHead>
                <TableHead>Сума</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Створено</TableHead>
                <TableHead className="text-right">Чекаут</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground">
                    Рахунків із вибраним фільтром не знайдено.
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      <span className="text-foreground">{inv.id}</span>
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
                          Чекаут
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
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-muted-foreground">Завантаження рахунків...</div>}>
      <DashboardProvider>
        <DashboardShell pageTitle="Рахунки">
          <InvoicesContent />
        </DashboardShell>
      </DashboardProvider>
    </Suspense>
  );
}
