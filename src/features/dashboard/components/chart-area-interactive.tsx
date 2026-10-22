'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/shared/components/ui/skeleton';

/**
 * The chart is loaded on the client only.
 *
 * `recharts` is a large library, and a client component is still server-side
 * rendered by the App Router — which pulled the whole library into the Worker
 * bundle and made it part of every cold start. Measuring the module
 * evaluation of the bundle showed `recharts` as one of the most expensive
 * dependencies to evaluate.
 *
 * `ssr: false` keeps it out of the server bundle entirely; the chart renders
 * after hydration, behind a skeleton.
 */
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
