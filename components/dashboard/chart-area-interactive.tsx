'use client';

import * as React from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { useIsMobile } from '@/lib/hooks/use-mobile';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import { useDashboard } from './dashboard-context';
import { formatCurrencyAmount } from '@/lib/utils';

const chartConfig = {
  turnover: {
    label: 'Обіг (грн)',
    color: 'hsl(var(--chart-1))',
  },
  invoices: {
    label: 'Кількість рахунків',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig;

export function ChartAreaInteractive() {
  const { invoices } = useDashboard();
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState<'7d' | '30d' | '90d'>('30d');

  // Compute aggregated daily chart data based on invoices
  const chartData = React.useMemo(() => {
    const days = timeRange === '7d' ? 7 : timeRange === '90d' ? 90 : 30;
    const now = new Date();
    
    // Generate dates map for the period
    const dateMap = new Map<string, { date: string; turnover: number; invoices: number }>();
    
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dateMap.set(key, { date: key, turnover: 0, invoices: 0 });
    }

    // Populate with real invoice data
    invoices.forEach((inv) => {
      const dateKey = inv.created_date ? inv.created_date.slice(0, 10) : '';
      if (dateMap.has(dateKey)) {
        const item = dateMap.get(dateKey)!;
        item.invoices += 1;
        if (inv.status === 'success') {
          item.turnover += Math.round(inv.amount / 100);
        }
      }
    });

    return Array.from(dateMap.values());
  }, [invoices, timeRange]);

  const totalPeriodTurnover = React.useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.turnover, 0);
  }, [chartData]);

  const totalPeriodInvoices = React.useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.invoices, 0);
  }, [chartData]);

  return (
    <Card className="border-border/60 bg-card">
      <CardHeader className="flex flex-col items-stretch space-y-0 border-b border-border/60 p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
          <CardTitle className="text-base font-semibold tracking-tight text-foreground">
            Динаміка обігу та платежів
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Показники успішних транзакцій та згенерованих інвойсів за обраний період
          </CardDescription>
        </div>

        <div className="flex items-center gap-2 border-t border-border/60 px-6 py-4 sm:border-l sm:border-t-0 sm:px-6">
          {isMobile ? (
            <Select value={timeRange} onValueChange={(val: '7d' | '30d' | '90d') => setTimeRange(val)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Оберіть період" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d" className="text-xs">Останні 7 днів</SelectItem>
                <SelectItem value="30d" className="text-xs">Останні 30 днів</SelectItem>
                <SelectItem value="90d" className="text-xs">Останні 90 днів</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <ToggleGroup
              type="single"
              value={timeRange}
              onValueChange={(val) => {
                if (val) setTimeRange(val as '7d' | '30d' | '90d');
              }}
              className="border border-border/60 rounded-lg p-0.5"
            >
              <ToggleGroupItem value="7d" className="h-7 text-xs px-2.5 data-[state=on]:bg-accent">
                7 днів
              </ToggleGroupItem>
              <ToggleGroupItem value="30d" className="h-7 text-xs px-2.5 data-[state=on]:bg-accent">
                30 днів
              </ToggleGroupItem>
              <ToggleGroupItem value="90d" className="h-7 text-xs px-2.5 data-[state=on]:bg-accent">
                90 днів
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[260px] w-full"
        >
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="fillTurnover" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-turnover)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-turnover)"
                  stopOpacity={0.05}
                />
              </linearGradient>
              <linearGradient id="fillInvoices" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-invoices)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-invoices)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.25} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('uk-UA', {
                  month: 'short',
                  day: 'numeric',
                });
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value: any) => {
                    if (!value) return '';
                    return new Date(String(value)).toLocaleDateString('uk-UA', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    });
                  }}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="turnover"
              type="natural"
              fill="url(#fillTurnover)"
              stroke="var(--color-turnover)"
              strokeWidth={2}
              stackId="a"
            />
            <Area
              dataKey="invoices"
              type="natural"
              fill="url(#fillInvoices)"
              stroke="var(--color-invoices)"
              strokeWidth={2}
              stackId="b"
            />
            <ChartLegend content={(props: any) => <ChartLegendContent {...props} />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
