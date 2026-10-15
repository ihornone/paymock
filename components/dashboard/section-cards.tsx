'use client';

import * as React from 'react';
import { TrendingDownIcon, TrendingUpIcon, Activity, Receipt, CreditCard, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useDashboard } from './dashboard-context';
import { formatCurrencyAmount } from '@/lib/utils';

export function SectionCards() {
  const { stats } = useDashboard();

  const successRate = stats.totalCount > 0 
    ? Math.round((stats.successCount / stats.totalCount) * 100) 
    : 0;

  const failureRate = stats.totalCount > 0 
    ? Math.round((stats.failureCount / stats.totalCount) * 100) 
    : 0;

  return (
    <div className="*:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-card dark:*:data-[slot=card]:bg-card lg:px-6">
      {/* 1. Total Turnover */}
      <Card className="@container/card relative overflow-hidden border-border/60 bg-card">
        <CardHeader className="relative pb-2">
          <CardDescription className="text-xs font-medium">Успішний обіг</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-bold tracking-tight tabular-nums text-foreground mt-1">
            {formatCurrencyAmount(stats.totalAmount)}
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex items-center gap-1 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              <TrendingUpIcon className="size-3" />
              Оборот
            </Badge>
          </div>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-xs pt-1">
          <div className="line-clamp-1 flex items-center gap-1.5 font-medium text-foreground">
            Сума сплачених рахунків
            <CreditCard className="size-3.5 text-muted-foreground" />
          </div>
          <div className="text-muted-foreground text-[11px]">
            За весь період обраного проєкту
          </div>
        </CardFooter>
      </Card>

      {/* 2. Total Invoices */}
      <Card className="@container/card relative overflow-hidden border-border/60 bg-card">
        <CardHeader className="relative pb-2">
          <CardDescription className="text-xs font-medium">Всього рахунків</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-bold tracking-tight tabular-nums text-foreground mt-1">
            {stats.totalCount}
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex items-center gap-1 rounded-md text-[11px] font-medium bg-primary/10 text-primary border-primary/20">
              <Receipt className="size-3" />
              Інвойси
            </Badge>
          </div>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-xs pt-1">
          <div className="line-clamp-1 flex items-center gap-1.5 font-medium text-foreground">
            {stats.totalCount > 0 ? `${stats.totalCount} платіжних сесій` : 'Немає рахунків'}
          </div>
          <div className="text-muted-foreground text-[11px]">
            Створені через API мерчанта
          </div>
        </CardFooter>
      </Card>

      {/* 3. Conversion / Success Rate */}
      <Card className="@container/card relative overflow-hidden border-border/60 bg-card">
        <CardHeader className="relative pb-2">
          <CardDescription className="text-xs font-medium">Конверсія платежів</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-bold tracking-tight tabular-nums text-emerald-400 mt-1">
            {successRate}%
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex items-center gap-1 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              <TrendingUpIcon className="size-3" />
              {stats.successCount} успішних
            </Badge>
          </div>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-xs pt-1">
          <div className="line-clamp-1 flex items-center gap-1.5 font-medium text-foreground">
            Стабільна конверсія <Activity className="size-3.5 text-emerald-400" />
          </div>
          <div className="text-muted-foreground text-[11px]">
            Успішно підтверджені оплати
          </div>
        </CardFooter>
      </Card>

      {/* 4. Failed / Expired */}
      <Card className="@container/card relative overflow-hidden border-border/60 bg-card">
        <CardHeader className="relative pb-2">
          <CardDescription className="text-xs font-medium">Відхилені / Expired</CardDescription>
          <CardTitle className="@[250px]/card:text-3xl text-2xl font-bold tracking-tight tabular-nums text-rose-400 mt-1">
            {stats.failureCount}
          </CardTitle>
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="flex items-center gap-1 rounded-md text-[11px] font-medium bg-rose-500/10 text-rose-400 border-rose-500/20">
              {stats.failureCount > 0 ? (
                <TrendingDownIcon className="size-3" />
              ) : (
                <ShieldAlert className="size-3" />
              )}
              {failureRate}% відмов
            </Badge>
          </div>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-xs pt-1">
          <div className="line-clamp-1 flex items-center gap-1.5 font-medium text-foreground">
            {stats.failureCount > 0 ? `${stats.failureCount} анульовано / збій` : '0 помилок'}
          </div>
          <div className="text-muted-foreground text-[11px]">
            Помилки симуляції або тайм-аут
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
