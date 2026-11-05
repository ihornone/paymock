'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/shared/components/ui/skeleton';

const ChartAreaInteractive = dynamic(
  () =>
    import('./chart-area-interactive-impl').then((mod) => mod.ChartAreaInteractiveImpl),
  {
    ssr: false,
    loading: () => (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-72 w-full rounded-xl animate-pulse" />
      </div>
    ),
  }
);

export { ChartAreaInteractive };
